[CmdletBinding()]
param(
  [string]$GenerationModel = "kimi-k2.5",
  [string]$ReviewModel = "kimi-k2.5"
)

$ErrorActionPreference = "Stop"

if (-not $env:MOONSHOT_API_KEY) {
  throw "MOONSHOT_API_KEY must be set before running this script."
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverRoot = Split-Path -Parent $scriptDir
$logDir = Join-Path $serverRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$remainingLessons = @(
  "knowledge-ruu-ruujak",
  "skill-pen",
  "permission-dai",
  "quantifiers-thuk-bang-lai",
  "sequence-conjunctions",
  "comparison-kwaa",
  "relative-thi",
  "reported-speech",
  "feelings-rusuek",
  "try-lawng",
  "resultative-ok-samret",
  "passive-tuuk",
  "conditionals",
  "change-state-khuen-long",
  "in-order-to-phuea"
)

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logPath = Join-Path $logDir "generate-A2-remaining-$timestamp.log"

"[$(Get-Date -Format o)] Starting remaining A2 generation with generation model=$GenerationModel review model=$ReviewModel" | Tee-Object -FilePath $logPath -Append

foreach ($lessonId in $remainingLessons) {
  "[$(Get-Date -Format o)] BEGIN $lessonId" | Tee-Object -FilePath $logPath -Append

  $env:MOONSHOT_GENERATION_MODEL = $GenerationModel
  $env:MOONSHOT_REVIEW_MODEL = $ReviewModel

  try {
    & node (Join-Path $scriptDir "generateProductionSentenceCandidates.mjs") --grammar $lessonId 2>&1 |
      Tee-Object -FilePath $logPath -Append
    if ($LASTEXITCODE -ne 0) {
      throw "Generator exited with code $LASTEXITCODE for $lessonId"
    }
    "[$(Get-Date -Format o)] DONE $lessonId" | Tee-Object -FilePath $logPath -Append
  } catch {
    "[$(Get-Date -Format o)] FAIL $lessonId :: $($_.Exception.Message)" | Tee-Object -FilePath $logPath -Append
    throw
  }
}

"[$(Get-Date -Format o)] Remaining A2 generation finished" | Tee-Object -FilePath $logPath -Append
