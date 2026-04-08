[CmdletBinding()]
param(
  [string]$GenerationModel = "kimi-k2-turbo-preview",
  [string]$ReviewModel = "kimi-k2.5",
  [string]$ReviewFallbackModel = "kimi-k2-turbo-preview",
  [int]$RequestTimeoutMs = 90000,
  [int]$MaxModelRetries = 8,
  [int]$RetryBaseMs = 10000,
  [int]$RetryMaxMs = 90000,
  [int]$ReviewCooldownMs = 3000,
  [int]$GenerationMinCandidates = 6,
  [int]$GenerationMaxCandidates = 8,
  [int]$PauseBetweenLessonsSeconds = 15,
  [int]$MaxConsecutiveFailures = 3,
  [int]$MaxLessons = 0
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nextRunnerPath = Join-Path $scriptDir "runNextPendingA2Production.ps1"

if (-not (Test-Path $nextRunnerPath)) {
  throw "Missing runner script: $nextRunnerPath"
}

$completedLessons = 0
$consecutiveFailures = 0

while ($true) {
  if ($MaxLessons -gt 0 -and $completedLessons -ge $MaxLessons) {
    Write-Host "Reached MaxLessons=$MaxLessons. Stopping."
    break
  }

  try {
    & $nextRunnerPath `
      -GenerationModel $GenerationModel `
      -ReviewModel $ReviewModel `
      -ReviewFallbackModel $ReviewFallbackModel `
      -RequestTimeoutMs $RequestTimeoutMs `
      -MaxModelRetries $MaxModelRetries `
      -RetryBaseMs $RetryBaseMs `
      -RetryMaxMs $RetryMaxMs `
      -ReviewCooldownMs $ReviewCooldownMs `
      -GenerationMinCandidates $GenerationMinCandidates `
      -GenerationMaxCandidates $GenerationMaxCandidates

    if ($LASTEXITCODE -ne 0) {
      throw "runNextPendingA2Production.ps1 exited with code $LASTEXITCODE"
    }

    $completedLessons += 1
    $consecutiveFailures = 0
  } catch {
    $consecutiveFailures += 1
    Write-Warning "Sequential A2 runner failure $consecutiveFailures/$MaxConsecutiveFailures: $($_.Exception.Message)"

    if ($consecutiveFailures -ge $MaxConsecutiveFailures) {
      throw "Stopping after $consecutiveFailures consecutive lesson failures."
    }
  }

  Start-Sleep -Seconds $PauseBetweenLessonsSeconds
}
