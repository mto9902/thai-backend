import fs from "fs";
import path from "path";
import OpenAI from "openai";
import pg from "pg";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import {
  DEFAULT_FIRST_PASS_CANDIDATE_TARGET,
  DEFAULT_FINAL_APPROVED_TARGET,
  DEFAULT_SUPPLEMENTAL_BATCH_SIZE,
  PRODUCTION_SCOPE_STAGES,
  getProductionLessonConfig,
  getProductionLessonsForStage,
} from "./lib/productionSentenceConfig.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(SERVER_ROOT, ".env"), quiet: true });

const OUTPUT_DIR = path.join(
  SERVER_ROOT,
  "admin-data",
  "generated-candidates",
);
const GRAMMAR_EXAMPLES_TABLE = "grammar_examples";
const GRAMMAR_LESSON_PRODUCTION_TABLE = "grammar_lesson_production";
const GENERATION_MODEL =
  process.env.MOONSHOT_GENERATION_MODEL ||
  process.env.MOONSHOT_MODEL ||
  "kimi-k2.5";
const REVIEW_MODEL =
  process.env.MOONSHOT_REVIEW_MODEL ||
  process.env.MOONSHOT_MODEL ||
  "kimi-k2-thinking";
const BASE_URL = process.env.MOONSHOT_BASE_URL || "https://api.moonshot.ai/v1";
const MAX_ATTEMPTS = 10;
const MAX_MODEL_RETRIES = 5;
const BATCH_NOTE_PREFIX = "Production candidate batch";
const ACCENTED_ROMANIZATION_REGEX =
  /[\u0300-\u036fàáâãäåèéêëìíîïòóôõöùúûüýÿāēīōūǎěǐǒǔḿńňŕśťźžÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝŸĀĒĪŌŪǍĚǏǑǓḾŃŇŔŚŤŹŽ]/u;

const { Pool } = pg;
let dbPool = null;

async function createPool() {
  const baseConfig = {
    host: process.env.DB_HOST,
    port: Number.parseInt(process.env.DB_PORT || "5432", 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };

  const sslFirstPool = new Pool({
    ...baseConfig,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await sslFirstPool.query("SELECT 1");
    return sslFirstPool;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    await sslFirstPool.end().catch(() => {});
    if (!/does not support ssl connections/i.test(message)) {
      throw error;
    }
  }

  const plainPool = new Pool(baseConfig);
  await plainPool.query("SELECT 1");
  return plainPool;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const getValue = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const hasFlag = (flag) => args.includes(flag);

  return {
    grammarId: getValue("--grammar"),
    stage: getValue("--stage"),
    count: getValue("--count"),
    finalTarget: Number.parseInt(
      getValue("--final-target") || String(DEFAULT_FINAL_APPROVED_TARGET),
      10,
    ),
    dryRun: hasFlag("--dry-run"),
    forceNewWave: hasFlag("--force-new-wave"),
  };
}

function normalizeComparableText(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizePromptText(text) {
  return String(text ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF]/g, " ");
}

function ensureString(value, label) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw new Error(`${label} is required`);
  }
  return text;
}

function ensureRowShape(row, index) {
  if (!row || typeof row !== "object") {
    throw new Error(`Row ${index + 1} must be an object`);
  }

  if (!Array.isArray(row.breakdown) || row.breakdown.length === 0) {
    throw new Error(`Row ${index + 1} must include a breakdown array`);
  }

  const romanization = ensureString(
    row.romanization,
    `Row ${index + 1} romanization`,
  );
  if (!ACCENTED_ROMANIZATION_REGEX.test(romanization)) {
    throw new Error(
      `Row ${index + 1} romanization must include learner accents`,
    );
  }

  return {
    thai: ensureString(row.thai, `Row ${index + 1} Thai`),
    english: ensureString(row.english, `Row ${index + 1} English`),
    romanization,
    difficulty:
      typeof row.difficulty === "string" && row.difficulty.trim()
        ? row.difficulty.trim().toLowerCase()
        : "easy",
    breakdown: row.breakdown.map((item, breakdownIndex) => ({
      thai: ensureString(
        item?.thai,
        `Row ${index + 1} breakdown item ${breakdownIndex + 1} Thai`,
      ),
      english: ensureString(
        item?.english,
        `Row ${index + 1} breakdown item ${breakdownIndex + 1} English`,
      ),
      romanization: ensureString(
        item?.romanization,
        `Row ${index + 1} breakdown item ${breakdownIndex + 1} romanization`,
      ),
      ...(item?.grammar === true ? { grammar: true } : {}),
    })),
  };
}

function parseJsonObject(content, label) {
  const trimmed = String(content ?? "").replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${label} did not return a JSON object`);
  }
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchExistingRows(grammarId) {
  if (!dbPool) {
    throw new Error("Database pool is not initialized");
  }

  const result = await dbPool.query(
    `
    SELECT
      id,
      thai,
      english,
      romanization,
      review_status,
      review_note,
      publish_state,
      rewrite_wave_id
    FROM ${GRAMMAR_EXAMPLES_TABLE}
    WHERE grammar_id = $1
    ORDER BY sort_order ASC, id ASC
    `,
    [grammarId],
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    thai: row.thai,
    english: row.english,
    romanization: row.romanization,
    reviewStatus: row.review_status ?? "flagged",
    reviewNote: row.review_note ?? null,
    publishState: row.publish_state ?? "published",
    rewriteWaveId: row.rewrite_wave_id ?? null,
  }));
}

async function fetchProductionRecord(grammarId) {
  const result = await dbPool.query(
    `
    SELECT
      grammar_id,
      stage,
      final_target_count,
      first_pass_candidate_target,
      supplemental_candidate_batch_size,
      current_rewrite_wave_id,
      last_generated_at,
      last_published_at,
      notes
    FROM ${GRAMMAR_LESSON_PRODUCTION_TABLE}
    WHERE grammar_id = $1
    LIMIT 1
    `,
    [grammarId],
  );

  return result.rows[0] ?? null;
}

async function ensureProductionRecord(meta) {
  const result = await dbPool.query(
    `
    INSERT INTO ${GRAMMAR_LESSON_PRODUCTION_TABLE} (
      grammar_id,
      stage,
      final_target_count,
      first_pass_candidate_target,
      supplemental_candidate_batch_size
    )
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (grammar_id)
    DO UPDATE SET
      stage = EXCLUDED.stage,
      updated_at = NOW()
    RETURNING
      grammar_id,
      stage,
      final_target_count,
      first_pass_candidate_target,
      supplemental_candidate_batch_size,
      current_rewrite_wave_id,
      last_generated_at,
      last_published_at,
      notes
    `,
    [
      meta.id,
      meta.stage,
      DEFAULT_FINAL_APPROVED_TARGET,
      DEFAULT_FIRST_PASS_CANDIDATE_TARGET,
      DEFAULT_SUPPLEMENTAL_BATCH_SIZE,
    ],
  );

  return result.rows[0];
}

async function updateProductionWave(grammarId, waveId) {
  await dbPool.query(
    `
    UPDATE ${GRAMMAR_LESSON_PRODUCTION_TABLE}
    SET
      current_rewrite_wave_id = $2,
      last_generated_at = NOW(),
      updated_at = NOW()
    WHERE grammar_id = $1
    `,
    [grammarId, waveId],
  );
}

function buildGenerationPrompt(config, candidateCount, existingRows, stageLessons) {
  const existingExamples = existingRows
    .slice(0, 120)
    .map((row) => `- ${sanitizePromptText(row.thai)} | ${sanitizePromptText(row.english)}`)
    .join("\n");
  const nearbyLessons = stageLessons
    .filter((lesson) => lesson.id !== config.id)
    .slice(0, 10)
    .map((lesson) => `- ${lesson.title}`)
    .join("\n");

  return sanitizePromptText(`
You are helping create production sentence content for a Thai learning app.

Generate candidate example rows for ONE lesson only.

Lesson ID: ${config.id}
Lesson title: ${config.title}
Target stage: ${config.stage}
Target learner: Thai learner at ${config.stage} / ${config.level}
Target count: ${candidateCount} candidates

LESSON GOAL
${config.lessonGoal}

STAGE PROGRESSION
${config.stageBrief.progression}

STRICT QUALITY RULES
- English must sound like something a real person would actually say.
- Thai must be natural Thai, not literal translation Thai.
- Romanization must use learner accents and diacritics, not plain ASCII.
- Avoid textbook filler, semantically empty lines, or socially odd examples.
- Keep sentence meanings realistic and worth learning.
- Every sentence must clearly demonstrate the target grammar point.

ALLOWED SCOPE
${config.allowedScope.map((line) => `- ${line}`).join("\n")}

DISALLOWED DRIFT
${config.disallowedNearbyPatterns.map((line) => `- ${line}`).join("\n") || "- Do not drift into unrelated nearby grammar."}

SAFE VOCABULARY TERRITORY
Prefer these domains:
${config.safeVocabularyTerritory.map((line) => `- ${line}`).join("\n")}

NATURAL REAL-LIFE SITUATIONS
${config.naturalSituations.map((line) => `- ${line}`).join("\n")}

STAGE LEXICON INVENTORY
Focus areas:
${config.stageLexiconInventory.focus.map((line) => `- ${line}`).join("\n")}

Avoid overusing these easy fallback words:
${config.stageLexiconInventory.avoidOveruse.map((line) => `- ${line}`).join("\n")}

DIVERSITY RULES
${config.stageBrief.diversityRules.map((line) => `- ${line}`).join("\n")}
- No near-duplicate English meanings.
- No near-duplicate Thai sentence shapes unless the lesson itself teaches contrast.
- No more than 2 rows built around the same main verb unless the lesson focus truly requires it.
- No more than 2 rows using the same main subject pattern unless the lesson focus truly requires it.

COMMON TRAPS TO AVOID
${config.commonTraps.map((line) => `- ${line}`).join("\n")}

NEARBY LESSONS IN THIS STAGE
${nearbyLessons || "- none"}

AVOID THESE EXISTING ROWS FOR THIS LESSON
${existingExamples || "- none"}

OUTPUT
Return JSON only. No commentary.

Return this exact top-level shape:
{
  "rows": [
    {
      "english": "...",
      "thai": "...",
      "romanization": "...",
      "breakdown": [
        {
          "thai": "...",
          "english": "...",
          "romanization": "...",
          "grammar": true
        }
      ],
      "difficulty": "easy"
    }
  ]
}

BREAKDOWN RULES
- Breakdown must exactly match the Thai sentence.
- One item per meaningful word or chunk.
- Glosses must help a learner understand the Thai naturally.
- Romanization must match the Thai exactly.
- Every romanization field must include tone accents or vowel diacritics.
- Do not omit any visible Thai word from the breakdown.

FINAL BAR
The rows should feel like a careful human teacher chose them for a polished CEFR-aligned Thai course.
`);
}

function buildReviewPrompt(config, candidateRows, existingRows) {
  return sanitizePromptText(`
Review these candidate rows for the Thai learning app lesson "${config.title}" (${config.stage}).

Evaluate each row for:
1. natural English
2. natural Thai
3. CEFR fit for ${config.stage}
4. strict fit for the lesson focus
5. usefulness in real life
6. breakdown accuracy
7. tone-complete learner romanization
8. duplicate or near-duplicate meaning

Already existing rows for this lesson:
${existingRows
  .slice(0, 120)
  .map((row) => `- ${sanitizePromptText(row.thai)} | ${sanitizePromptText(row.english)}`)
  .join("\n") || "- none"}

Rules:
- If a row is strong, mark it "keep".
- If it could become strong with a small edit, mark it "revise" and provide the corrected full row.
- If it is awkward, unnatural, off-scope, repetitive, or not worth teaching, mark it "reject" and give a short reason.
- Reject rows with plain romanization instead of learner-accented romanization.
- Be strict. Do not keep weak filler.

Return JSON only in this shape:
{
  "results": [
    {
      "decision": "keep" | "revise" | "reject",
      "reason": "...",
      "row": {
        "english": "...",
        "thai": "...",
        "romanization": "...",
        "breakdown": [
          {
            "thai": "...",
            "english": "...",
            "romanization": "...",
            "grammar": true
          }
        ],
        "difficulty": "easy"
      }
    }
  ]
}

Candidate rows to review:
${JSON.stringify(candidateRows, null, 2)}
`);
}

async function callJsonObject(openai, model, label, systemPrompt, userPrompt) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_MODEL_RETRIES; attempt += 1) {
    try {
      const response = await openai.chat.completions.create({
        model,
        temperature: 1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(`${label} model returned an empty response`);
      }
      return parseJsonObject(content, `${label} model`);
    } catch (error) {
      lastError = error;
      const status =
        typeof error?.status === "number" ? error.status : undefined;
      const message =
        error instanceof Error ? error.message : String(error ?? "");
      const retryable =
        status === 429 ||
        status === 408 ||
        status === 409 ||
        (typeof status === "number" && status >= 500) ||
        /overloaded|timeout|temporarily unavailable/i.test(message);

      if (!retryable || attempt === MAX_MODEL_RETRIES) {
        throw error;
      }

      const waitMs = 2500 * attempt;
      console.log(
        `${label} model (${model}) retry ${attempt}/${MAX_MODEL_RETRIES} after ${waitMs}ms: ${message}`,
      );
      await sleep(waitMs);
    }
  }

  throw lastError ?? new Error(`${label} model request failed`);
}

function isDuplicateRow(existingRows, acceptedRows, row) {
  const thaiKey = normalizeComparableText(row.thai);
  const englishKey = normalizeComparableText(row.english);

  return [...existingRows, ...acceptedRows].some((existingRow) => {
    return (
      normalizeComparableText(existingRow.thai) === thaiKey ||
      normalizeComparableText(existingRow.english) === englishKey
    );
  });
}

async function generateAcceptedRows(openai, config, batchTarget, existingRows, stageLessons) {
  const acceptedRows = [];
  const attempts = [];

  for (
    let attempt = 1;
    attempt <= MAX_ATTEMPTS && acceptedRows.length < batchTarget;
    attempt += 1
  ) {
    const missing = batchTarget - acceptedRows.length;
    const generationCount = Math.min(Math.max(missing + 3, 8), 12);
    const generationPrompt = buildGenerationPrompt(
      config,
      generationCount,
      existingRows,
      stageLessons,
    );

    console.log(
      `${config.id}: generation attempt ${attempt}/${MAX_ATTEMPTS} requesting ${generationCount} candidates (${acceptedRows.length}/${batchTarget} accepted so far)`,
    );

    const generatedPayload = await callJsonObject(
      openai,
      GENERATION_MODEL,
      "Generation",
      "You generate production-grade Thai sentence rows. Return strict JSON only.",
      generationPrompt,
    );
    const rawRows = Array.isArray(generatedPayload.rows) ? generatedPayload.rows : [];

    const normalizedGenerated = [];
    for (const [index, row] of rawRows.entries()) {
      try {
        const normalized = ensureRowShape(row, index);
        if (
          !isDuplicateRow(
            existingRows,
            acceptedRows.concat(normalizedGenerated),
            normalized,
          )
        ) {
          normalizedGenerated.push(normalized);
        }
      } catch (error) {
        console.warn(
          `${config.id}: skipped generated candidate ${index + 1}: ${
            error instanceof Error ? error.message : "invalid row"
          }`,
        );
      }
    }

    if (normalizedGenerated.length === 0) {
      attempts.push({
        attempt,
        generated: rawRows.length,
        kept: 0,
        revised: 0,
        rejected: rawRows.length,
      });
      continue;
    }

    const reviewPrompt = buildReviewPrompt(config, normalizedGenerated, [
      ...existingRows,
      ...acceptedRows,
    ]);
    const reviewPayload = await callJsonObject(
      openai,
      REVIEW_MODEL,
      "Review",
      "You are a strict CEFR-aligned Thai course editor. Return strict JSON only and reject weak rows.",
      reviewPrompt,
    );
    const results = Array.isArray(reviewPayload.results) ? reviewPayload.results : [];

    let kept = 0;
    let revised = 0;
    let rejected = 0;

    for (const result of results) {
      const decision =
        typeof result?.decision === "string"
          ? result.decision.trim().toLowerCase()
          : "reject";

      if (decision === "reject") {
        rejected += 1;
        continue;
      }

      try {
        const normalized = ensureRowShape(result.row, acceptedRows.length);
        if (isDuplicateRow(existingRows, acceptedRows, normalized)) {
          rejected += 1;
          continue;
        }

        acceptedRows.push(normalized);
        if (decision === "revise") {
          revised += 1;
        } else {
          kept += 1;
        }

        if (acceptedRows.length >= batchTarget) {
          break;
        }
      } catch (error) {
        rejected += 1;
        console.warn(
          `${config.id}: rejected reviewed row due to invalid shape: ${
            error instanceof Error ? error.message : "invalid row"
          }`,
        );
      }
    }

    attempts.push({
      attempt,
      generated: normalizedGenerated.length,
      kept,
      revised,
      rejected,
    });
  }

  return { acceptedRows, attempts };
}

function createBatchNote(grammarId, waveId) {
  const timestamp = new Date().toISOString();
  return `${BATCH_NOTE_PREFIX} ${timestamp} (${grammarId}, wave ${waveId})`;
}

async function insertCandidateRows(grammarId, waveId, rows, reviewNote) {
  if (!dbPool) {
    throw new Error("Database pool is not initialized");
  }

  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const sortResult = await client.query(
      `
      SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order
      FROM ${GRAMMAR_EXAMPLES_TABLE}
      WHERE grammar_id = $1
      `,
      [grammarId],
    );
    let nextSortOrder = Number(sortResult.rows[0]?.next_sort_order ?? 0);

    for (const row of rows) {
      await client.query(
        `
        INSERT INTO ${GRAMMAR_EXAMPLES_TABLE} (
          grammar_id,
          sort_order,
          thai,
          romanization,
          english,
          breakdown,
          difficulty,
          review_status,
          review_note,
          tone_confidence,
          tone_status,
          tone_analysis,
          publish_state,
          rewrite_wave_id,
          last_edited_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6::jsonb,
          $7,
          'flagged',
          $8,
          0,
          'review',
          '{}'::jsonb,
          'staged',
          $9,
          NOW()
        )
        `,
        [
          grammarId,
          nextSortOrder,
          row.thai,
          row.romanization,
          row.english,
          JSON.stringify(row.breakdown),
          row.difficulty,
          reviewNote,
          waveId,
        ],
      );
      nextSortOrder += 1;
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function createRewriteWaveId(grammarId) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);
  return `${grammarId}-${timestamp}`;
}

function determineBatchTarget(record, explicitCount, forceNewWave) {
  if (Number.isFinite(explicitCount) && explicitCount > 0) {
    return explicitCount;
  }

  if (forceNewWave || !record?.current_rewrite_wave_id) {
    return Number(record?.first_pass_candidate_target ?? DEFAULT_FIRST_PASS_CANDIDATE_TARGET);
  }

  return Number(
    record?.supplemental_candidate_batch_size ?? DEFAULT_SUPPLEMENTAL_BATCH_SIZE,
  );
}

function buildArtifactPath(grammarId, waveId) {
  return path.join(OUTPUT_DIR, `${grammarId}-${waveId}.json`);
}

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function processLesson(openai, meta, options) {
  const existingRows = await fetchExistingRows(meta.id);
  const record = await ensureProductionRecord(meta);
  const batchTarget = determineBatchTarget(
    record,
    options.explicitCount,
    options.forceNewWave,
  );
  const waveId =
    options.forceNewWave || !record.current_rewrite_wave_id
      ? createRewriteWaveId(meta.id)
      : record.current_rewrite_wave_id;

  const stageLessons = getProductionLessonsForStage(meta.stage);
  const { acceptedRows, attempts } = await generateAcceptedRows(
    openai,
    meta,
    batchTarget,
    existingRows,
    stageLessons,
  );
  const reviewNote = createBatchNote(meta.id, waveId);

  const artifact = {
    grammarId: meta.id,
    title: meta.title,
    stage: meta.stage,
    waveId,
    batchTarget,
    reviewNote,
    generatedAt: new Date().toISOString(),
    attempts,
    rows: acceptedRows,
  };

  ensureOutputDir();
  fs.writeFileSync(
    buildArtifactPath(meta.id, waveId),
    JSON.stringify(artifact, null, 2),
  );

  if (!options.dryRun && acceptedRows.length > 0) {
    await updateProductionWave(meta.id, waveId);
    await insertCandidateRows(meta.id, waveId, acceptedRows, reviewNote);
  }

  return {
    grammarId: meta.id,
    title: meta.title,
    stage: meta.stage,
    waveId,
    batchTarget,
    acceptedCount: acceptedRows.length,
    dryRun: options.dryRun,
  };
}

async function main() {
  const { grammarId, stage, count, finalTarget, dryRun, forceNewWave } = parseArgs();

  if (stage && !PRODUCTION_SCOPE_STAGES.includes(stage)) {
    throw new Error(
      `Unsupported stage ${stage}. Use one of: ${PRODUCTION_SCOPE_STAGES.join(", ")}`,
    );
  }

  const selectedLessons = grammarId
    ? [getProductionLessonConfig(grammarId)].filter(Boolean)
    : stage
      ? getProductionLessonsForStage(stage)
      : [];

  if (selectedLessons.length === 0) {
    throw new Error(
      `No production lesson config found for ${grammarId || stage || "the requested scope"}`,
    );
  }

  dbPool = await createPool();

  const openai = new OpenAI({
    apiKey: process.env.MOONSHOT_API_KEY,
    baseURL: BASE_URL,
  });

  const results = [];
  for (const lesson of selectedLessons) {
    console.log(
      `\n=== ${lesson.stage} ${lesson.id} (${lesson.title}) :: target ${finalTarget} approved rows, generating batch ===`,
    );
    const result = await processLesson(openai, lesson, {
      explicitCount: Number.parseInt(count || "", 10),
      dryRun,
      forceNewWave,
    });
    results.push(result);
  }

  console.log("\nProduction candidate generation complete");
  console.table(
    results.map((result) => ({
      grammarId: result.grammarId,
      stage: result.stage,
      waveId: result.waveId,
      requested: result.batchTarget,
      accepted: result.acceptedCount,
      mode: result.dryRun ? "dry-run" : "inserted",
    })),
  );
}

main()
  .catch((error) => {
    console.error("Failed to generate production sentence candidates:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dbPool?.end().catch(() => {});
  });
