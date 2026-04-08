param(
  [Parameter(Mandatory = $true)]
  [string]$PromptPath,

  [Parameter(Mandatory = $true)]
  [string]$ResponsePath,

  [string]$Session = "kimi-default",
  [int]$TimeoutSec = 90,
  [int]$PollSec = 4,
  [switch]$NewChat = $true
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding

$agentBrowser = "C:\Users\Lux\AppData\Roaming\npm\agent-browser.cmd"
$promptPathResolved = (Resolve-Path $PromptPath).Path
$responseDir = Split-Path -Parent $ResponsePath
if (-not (Test-Path $responseDir)) {
  New-Item -ItemType Directory -Path $responseDir -Force | Out-Null
}

$promptText = Get-Content -LiteralPath $promptPathResolved -Raw
if ([string]::IsNullOrWhiteSpace($promptText)) {
  throw "Prompt file is empty: $promptPathResolved"
}
$promptText = (($promptText -split "(`r`n|`n|`r)") | Where-Object { $_ -ne "`r`n" -and $_ -ne "`n" -and $_ -ne "`r" }) -join " "
$promptText = ($promptText -replace '\s+', ' ').Trim()

$expectedItems = $null
$batchJsonPath = [System.IO.Path]::ChangeExtension($promptPathResolved, ".json")
if (Test-Path $batchJsonPath) {
  try {
    $batchJson = Get-Content -LiteralPath $batchJsonPath -Raw | ConvertFrom-Json
    if ($batchJson.items -and $batchJson.items.Count -gt 0) {
      $expectedItems = [int]$batchJson.items.Count
    }
  } catch {
  }
}

function Invoke-AgentBrowser {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
  )

  & $agentBrowser @Args
}

function Get-JsonState {
  $wrapped = Invoke-AgentBrowser --session $Session eval "(() => { const codes = Array.from(document.querySelectorAll('code.language-json, pre.language-json, .language-json')); const texts = codes.map((code) => code.textContent || ''); return { count: texts.length, last: texts.length ? texts[texts.length - 1] : '' }; })()"
  return ($wrapped | ConvertFrom-Json)
}

function Repair-Mojibake {
  param([string]$Text)

  if ([string]::IsNullOrEmpty($Text)) {
    return $Text
  }

  if ($Text -notmatch 'à¸|à¹|àº|ã') {
    return $Text
  }

  $latin1 = [System.Text.Encoding]::GetEncoding(28591)
  $bytes = $latin1.GetBytes($Text)
  return [System.Text.Encoding]::UTF8.GetString($bytes)
}

function Open-NewChat {
  Invoke-AgentBrowser --session $Session open "https://www.kimi.com/?chat_enter_method=new_chat" | Out-Null
  Invoke-AgentBrowser --session $Session wait --load networkidle | Out-Null
  Start-Sleep -Seconds 1
}

function Ensure-AgentModel {
  $wrapped = Invoke-AgentBrowser --session $Session eval "(() => { const current = document.querySelector('.current-model, .model-name'); return current ? (current.innerText || '').trim() : ''; })()"
  $currentModel = (($wrapped | ConvertFrom-Json) | Out-String).Trim()
  if ($currentModel -eq "K2.5 Agent") {
    return
  }

  Invoke-AgentBrowser --session $Session eval "(() => { const trigger = document.querySelector('.current-model'); if (!trigger) { throw new Error('Model trigger not found'); } trigger.click(); return 'opened'; })()" | Out-Null
  Start-Sleep -Seconds 1
  $snapshot = & $agentBrowser --session $Session snapshot -i
  $match = [regex]::Match($snapshot, 'generic "K2\.5 Agent[^"]*" \[ref=(e\d+)\]')
  if (-not $match.Success) {
    throw "K2.5 Agent option not found in snapshot."
  }
  Invoke-AgentBrowser --session $Session click "@$($match.Groups[1].Value)" | Out-Null
  Start-Sleep -Seconds 1
}

function Get-TextboxRef {
  $snapshot = & $agentBrowser --session $Session snapshot -i
  $match = [regex]::Match($snapshot, 'textbox \[ref=(e\d+)\]')
  if (-not $match.Success) {
    throw "Could not find Kimi textbox ref in snapshot."
  }
  return "@$($match.Groups[1].Value)"
}

function Clear-TextboxByKeys {
  param([string]$TextboxRef)

  Invoke-AgentBrowser --session $Session click $TextboxRef | Out-Null
  Invoke-AgentBrowser --session $Session press Control+A | Out-Null
  Invoke-AgentBrowser --session $Session press Backspace | Out-Null
}

function Send-CurrentEditor {
  Invoke-AgentBrowser --session $Session eval "(() => { const send = document.querySelector('.send-button-container'); if (!send) { throw new Error('Send button not found'); } send.click(); return 'sent'; })()" | Out-Null
}

function Type-Prompt {
  param([string]$TextboxRef)
  Invoke-AgentBrowser --session $Session fill $TextboxRef $promptText | Out-Null
}

function Save-ResponseText {
  param([string]$Text)
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($ResponsePath, $Text, $utf8NoBom)
}

function Get-ItemCountFromJson {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return $null
  }

  try {
    $parsed = $Text | ConvertFrom-Json
    if ($parsed.items) {
      return [int]$parsed.items.Count
    }
    if ($parsed.rows) {
      return [int]$parsed.rows.Count
    }
  } catch {
    return $null
  }

  return $null
}

function Wait-ForNewJson {
  param(
    [int]$BaselineCount,
    [string]$BaselineLast
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    Start-Sleep -Seconds $PollSec
    $state = Get-JsonState
    $candidate = Repair-Mojibake $state.last
    if (($state.count -gt $BaselineCount) -or (($candidate | Out-String).Trim() -and $candidate -ne $BaselineLast)) {
      if ($expectedItems) {
        $itemCount = Get-ItemCountFromJson $candidate
        if ($itemCount -and $itemCount -ge $expectedItems) {
          return $candidate
        }
      } elseif ($candidate) {
        return $candidate
      }
    }
  } while ((Get-Date) -lt $deadline)

  return $null
}

if ($NewChat) {
  Open-NewChat
}

Ensure-AgentModel
$textboxRef = Get-TextboxRef
$baseline = Get-JsonState
Type-Prompt -TextboxRef $textboxRef
Send-CurrentEditor

$resultText = Wait-ForNewJson -BaselineCount $baseline.count -BaselineLast $baseline.last

if (-not $resultText) {
  if ($expectedItems) {
    $followUp = "Now return only the final JSON for all $expectedItems missing-tone items from the previous request. Return every item, not just an example. Use this exact shape: {`"items`":[{`"rowThai`":`"`",`"itemIndex`":0,`"thai`":`"`",`"tones`":[`"mid`"]}]}. No explanation, no markdown, no extra text."
  } else {
    $followUp = 'Now return only the final JSON for the last missing-tone items from the previous request. Use this exact shape: {"items":[{"rowThai":"","itemIndex":0,"thai":"","tones":["mid"]}]}. No explanation, no markdown, no extra text.'
  }
  $baseline = Get-JsonState
  $textboxRef = Get-TextboxRef
  Clear-TextboxByKeys -TextboxRef $textboxRef
  $promptText = $followUp
  Type-Prompt -TextboxRef $textboxRef
  Send-CurrentEditor
  $resultText = Wait-ForNewJson -BaselineCount $baseline.count -BaselineLast $baseline.last
}

if (-not $resultText) {
  throw "Kimi did not return a new JSON block within ${TimeoutSec}s."
}

$resultText = Repair-Mojibake $resultText
Save-ResponseText -Text $resultText

[pscustomobject]@{
  session = $Session
  promptPath = $promptPathResolved
  responsePath = (Resolve-Path $ResponsePath).Path
  responseLength = $resultText.Length
} | ConvertTo-Json -Depth 4
