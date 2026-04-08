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
  [int]$GenerationMaxCandidates = 8
)

$ErrorActionPreference = "Stop"

if (-not $env:MOONSHOT_API_KEY) {
  throw "MOONSHOT_API_KEY must be set before running this script."
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverRoot = Split-Path -Parent $scriptDir
$logDir = Join-Path $serverRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$logPath = Join-Path $logDir ("generate-A2-next-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")

$orderedLessons = @(
  "past-laew",
  "recent-past-phoeng",
  "duration-penwela-manan",
  "female-particles-kha-kha",
  "frequency-adverbs",
  "like-chorp",
  "knowledge-ruu-ruujak",
  "skill-pen",
  "permission-dai",
  "quantifiers-thuk-bang-lai",
  "sequence-conjunctions",
  "comparison-kwaa",
  "relative-thi",
  "reported-speech",
  "endurance-wai",
  "superlative",
  "must-tong",
  "should-khuan",
  "prefix-naa-adjective",
  "feelings-rusuek",
  "try-lawng",
  "resultative-ok-samret",
  "passive-tuuk",
  "conditionals",
  "change-state-khuen-long",
  "in-order-to-phuea"
)

$env:LESSONS_JSON = ($orderedLessons | ConvertTo-Json -Compress)
$nextLesson = @'
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT || "5432", 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
});

const ordered = JSON.parse(process.env.LESSONS_JSON || "[]");
const result = await pool.query(
  `
  select grammar_id,
         count(*) filter (where publish_state = 'staged')::int as staged_count
  from grammar_examples
  where grammar_id = any($1::text[])
  group by grammar_id
  `,
  [ordered],
);
const counts = new Map(
  result.rows.map((row) => [row.grammar_id, Number(row.staged_count ?? 0)]),
);
const nextLesson = ordered.find((grammarId) => (counts.get(grammarId) ?? 0) < 40) ?? "";
console.log(nextLesson);
await pool.end();
'@ | node --input-type=module -
Remove-Item Env:\LESSONS_JSON -ErrorAction SilentlyContinue

$nextLesson = ($nextLesson | Select-Object -Last 1).Trim()

if (-not $nextLesson -or $orderedLessons -notcontains $nextLesson) {
  "[$(Get-Date -Format o)] No pending A2 lesson found. Nothing to run." | Tee-Object -FilePath $logPath -Append
  exit 0
}

$env:MOONSHOT_GENERATION_MODEL = $GenerationModel
$env:MOONSHOT_REVIEW_MODEL = $ReviewModel
$env:MOONSHOT_REVIEW_FALLBACK_MODEL = $ReviewFallbackModel
$env:MOONSHOT_REQUEST_TIMEOUT_MS = [string]$RequestTimeoutMs
$env:MOONSHOT_MAX_MODEL_RETRIES = [string]$MaxModelRetries
$env:MOONSHOT_RETRY_BASE_MS = [string]$RetryBaseMs
$env:MOONSHOT_RETRY_MAX_MS = [string]$RetryMaxMs
$env:MOONSHOT_REVIEW_COOLDOWN_MS = [string]$ReviewCooldownMs
$env:MOONSHOT_GENERATION_MIN_CANDIDATES = [string]$GenerationMinCandidates
$env:MOONSHOT_GENERATION_MAX_CANDIDATES = [string]$GenerationMaxCandidates

"[$(Get-Date -Format o)] Running one A2 lesson only: $nextLesson (generation=$GenerationModel review=$ReviewModel fallbackReview=$ReviewFallbackModel requestTimeoutMs=$RequestTimeoutMs retries=$MaxModelRetries baseMs=$RetryBaseMs maxMs=$RetryMaxMs cooldownMs=$ReviewCooldownMs minCandidates=$GenerationMinCandidates maxCandidates=$GenerationMaxCandidates)" | Tee-Object -FilePath $logPath -Append

& node (Join-Path $scriptDir "generateProductionSentenceCandidates.mjs") --grammar $nextLesson 2>&1 |
  Tee-Object -FilePath $logPath -Append

if ($LASTEXITCODE -ne 0) {
  throw "Generator exited with code $LASTEXITCODE for $nextLesson"
}

"[$(Get-Date -Format o)] Finished $nextLesson" | Tee-Object -FilePath $logPath -Append
