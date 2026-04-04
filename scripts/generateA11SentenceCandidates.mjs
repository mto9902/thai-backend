import fs from "fs";
import path from "path";
import OpenAI from "openai";
import pg from "pg";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

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
const MODEL = process.env.MOONSHOT_MODEL || "kimi-k2.5";
const BASE_URL = process.env.MOONSHOT_BASE_URL || "https://api.moonshot.ai/v1";
const TARGET_COUNT = 20;
const MAX_ATTEMPTS = 8;
const MAX_MODEL_RETRIES = 5;
const BATCH_NOTE_PREFIX = "Kimi candidate batch";
const { Pool } = pg;
let dbPool = null;
const ACCENTED_ROMANIZATION_REGEX =
  /[\u0300-\u036fàáâãäåèéêëìíîïòóôõöùúûüýÿāēīōūǎěǐǒǔḿńňŕśťźžÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝŸĀĒĪŌŪǍĚǏǑǓḾŃŇŔŚŤŹŽ]/u;

const LESSON_CONFIG = {
  svo: {
    id: "svo",
    title: "Basic Sentence Order",
    stage: "A1.1",
    level: "A1",
    lessonGoal:
      "This lesson teaches the most basic Thai affirmative sentence order: SUBJECT + VERB + OBJECT.",
    learnerOutcome: [
      "Thai can be built in a clear, direct order.",
      "Simple everyday statements are possible right away.",
      "Short useful sentences are better than textbook filler.",
    ],
    scopeRules: [
      "Focus only on plain affirmative statements.",
      "Do not use negation.",
      "Do not use yes/no questions.",
      "Do not use question words.",
      "Do not use possession or location patterns unless absolutely unavoidable.",
      "Do not rely on later grammar to make the sentence sound good.",
      "Keep vocabulary beginner-safe and common.",
    ],
    goodMeaningTerritory: [
      "eating or drinking something ordinary",
      "buying something ordinary",
      "reading, watching, listening, opening, closing, carrying, or using",
      "very normal home, class, and daily routine actions",
      "sentences that a beginner could realistically imagine saying or hearing",
    ],
    subjects: ["ฉัน", "คุณ", "เขา", "เธอ"],
    preferredObjects: [
      "น้ำ",
      "ข้าว",
      "หนังสือ",
      "เพลง",
      "กาแฟ",
      "ประตู",
      "โทรศัพท์",
    ],
  },
};

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
    grammarId: getValue("--grammar") || "svo",
    count: Number.parseInt(getValue("--count") || String(TARGET_COUNT), 10),
    dryRun: hasFlag("--dry-run"),
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

  const romanization = ensureString(row.romanization, `Row ${index + 1} romanization`);
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
    SELECT id, thai, english, romanization, review_status, review_note
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
  }));
}

function buildGenerationPrompt(config, candidateCount, existingRows, acceptedRows) {
  const existingThai = [...existingRows, ...acceptedRows]
    .slice(0, 80)
    .map((row) => `- ${sanitizePromptText(row.thai)} | ${sanitizePromptText(row.english)}`)
    .join("\n");

  return sanitizePromptText(`
You are helping create production sentence content for a Thai learning app.

Generate candidate example rows for ONE lesson only.

Lesson ID: ${config.id}
Lesson title: ${config.title}
Target stage: ${config.stage}
Target learner: absolute beginner learning Thai
Target count: ${candidateCount} candidates

LESSON GOAL
${config.lessonGoal}

The learner should come away feeling:
${config.learnerOutcome.map((line) => `- ${line}`).join("\n")}

STRICT QUALITY RULES
- English must sound like something a real person would actually say.
- Do not generate awkward textbook filler such as:
  - "I eat good food"
  - "He drinks tea every day"
  - "She reads a book"
  unless the sentence is genuinely natural and useful in real life.
- Thai must be natural Thai, not literal translation Thai.
- Romanization must use learner accents and diacritics, not plain ASCII.
- Good romanization examples: chǎn, khâao, nǎngsǔe, khàwp-khun, pə̀ət, prà-tuu.
- Never return plain romanization such as "chan", "kin", "duem", or "nangsue".
- Keep the sentence meaning simple, useful, and realistic.
- Avoid bizarre, empty, repetitive, or contextless examples.
- Avoid near-duplicates that only swap one noun or pronoun.

SCOPE RULES
${config.scopeRules.map((line) => `- ${line}`).join("\n")}

GOOD MEANING TERRITORY
${config.goodMeaningTerritory.map((line) => `- ${line}`).join("\n")}

SUBJECTS
Prefer natural beginner subjects such as:
${config.subjects.map((subject) => `- ${subject}`).join("\n")}
Use names only if it sounds clearly natural.

VERBS / OBJECTS
Use common beginner verbs and objects.
Prefer useful objects like:
${config.preferredObjects.map((item) => `- ${item}`).join("\n")}
Only use objects if the full sentence still sounds natural.

AVOID THESE EXISTING OR ALREADY-ACCEPTED ROWS
${existingThai || "- none"}

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
- Every romanization field must include tone accents or vowel diacritics for learner readability.
- Do not omit any visible Thai word from the breakdown.

FINAL BAR
The rows should feel like a careful human teacher chose them for a polished beginner Thai course.
`);
}

function buildReviewPrompt(config, candidateRows, acceptedRows, existingRows) {
  return sanitizePromptText(`
Review these candidate rows for the Thai learning app lesson "${config.title}" (${config.stage}).

Evaluate each row for:
1. natural English
2. natural Thai
3. strict fit for ${config.lessonGoal}
4. beginner-safe vocabulary and scope
5. usefulness in real life
6. breakdown accuracy
7. duplicate or near-duplicate meaning
8. learner-style accented romanization

Already accepted or existing rows:
${[...existingRows, ...acceptedRows]
  .slice(0, 80)
  .map((row) => `- ${sanitizePromptText(row.thai)} | ${sanitizePromptText(row.english)}`)
  .join("\n") || "- none"}

Rules:
- If a row is strong, mark it "keep".
- If it could become strong with a small edit, mark it "revise" and provide the corrected full row.
- If it is awkward, unnatural, off-scope, repetitive, or not worth teaching, mark it "reject" and give a short reason.
- Reject or revise rows with plain romanization instead of learner-accented romanization.
- Be strict. Do not keep weak textbook filler.

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

async function callJsonObject(openai, systemPrompt, userPrompt) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_MODEL_RETRIES; attempt += 1) {
    try {
      const response = await openai.chat.completions.create({
        model: MODEL,
        temperature: 1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Model returned an empty response");
      }
      return parseJsonObject(content, "Model");
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
        `Model retry ${attempt}/${MAX_MODEL_RETRIES} after ${waitMs}ms: ${message}`,
      );
      await sleep(waitMs);
    }
  }

  throw lastError ?? new Error("Model request failed");
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

async function generateAcceptedRows(openai, config, targetCount, existingRows) {
  const acceptedRows = [];
  const attempts = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS && acceptedRows.length < targetCount; attempt += 1) {
    const missing = targetCount - acceptedRows.length;
    const generationCount = Math.min(Math.max(missing + 2, 6), 10);
    const generationPrompt = buildGenerationPrompt(
      config,
      generationCount,
      existingRows,
      acceptedRows,
    );
    console.log(
      `${config.id}: generation attempt ${attempt}/${MAX_ATTEMPTS} requesting ${generationCount} candidates (${acceptedRows.length}/${targetCount} accepted so far)`,
    );
    const generatedPayload = await callJsonObject(
      openai,
      "You generate production-grade Thai sentence rows. Return strict JSON only.",
      generationPrompt,
    );
    const rawRows = Array.isArray(generatedPayload.rows) ? generatedPayload.rows : [];

    const normalizedGenerated = [];
    for (const [index, row] of rawRows.entries()) {
      try {
        const normalized = ensureRowShape(row, index);
        if (!isDuplicateRow(existingRows, acceptedRows.concat(normalizedGenerated), normalized)) {
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
      attempts.push({ attempt, generated: 0, kept: 0, revised: 0, rejected: rawRows.length });
      continue;
    }

    const reviewPrompt = buildReviewPrompt(
      config,
      normalizedGenerated,
      acceptedRows,
      existingRows,
    );
    const reviewPayload = await callJsonObject(
      openai,
      "You are a strict Thai course editor. Return strict JSON only and reject weak rows.",
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

        if (acceptedRows.length >= targetCount) {
          break;
        }
      } catch (error) {
        rejected += 1;
      }
    }

    attempts.push({
      attempt,
      generated: normalizedGenerated.length,
      kept,
      revised,
      rejected,
    });
    console.log(
      `${config.id}: attempt ${attempt} kept ${kept}, revised ${revised}, rejected ${rejected}. Total accepted: ${acceptedRows.length}/${targetCount}`,
    );
  }

  if (acceptedRows.length < targetCount) {
    throw new Error(
      `${config.id}: only accepted ${acceptedRows.length}/${targetCount} rows after ${MAX_ATTEMPTS} attempts`,
    );
  }

  return {
    acceptedRows: acceptedRows.slice(0, targetCount),
    attempts,
  };
}

function buildBatchNote(grammarId) {
  const timestamp = new Date().toISOString();
  return `${BATCH_NOTE_PREFIX} ${timestamp} (${grammarId})`;
}

async function insertCandidateRows(grammarId, rows, reviewNote) {
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

function writeArtifact(grammarId, payload) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(OUTPUT_DIR, `${grammarId}-${stamp}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");
  return outputPath;
}

async function main() {
  const { grammarId, count, dryRun } = parseArgs();
  const config = LESSON_CONFIG[grammarId];

  if (!config) {
    throw new Error(`No lesson config found for ${grammarId}`);
  }

  const apiKey =
    process.env.MOONSHOT_API_KEY ||
    process.env.KIMI_API_KEY ||
    process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Set MOONSHOT_API_KEY or KIMI_API_KEY before running this script");
  }

  const openai = new OpenAI({
    apiKey,
    baseURL: BASE_URL,
  });
  dbPool = await createPool();
  globalThis.__a11CandidatePool = dbPool;

  const existingRows = await fetchExistingRows(grammarId);
  const { acceptedRows, attempts } = await generateAcceptedRows(
    openai,
    config,
    count,
    existingRows,
  );
  const reviewNote = buildBatchNote(grammarId);

  const artifactPayload = {
    grammarId,
    generatedAt: new Date().toISOString(),
    model: MODEL,
    baseURL: BASE_URL,
    count,
    existingRowCount: existingRows.length,
    reviewNote,
    prompts: {
      generation: buildGenerationPrompt(config, count, existingRows, []),
      review: buildReviewPrompt(config, acceptedRows, [], existingRows),
    },
    attempts,
    rows: acceptedRows,
  };
  const artifactPath = writeArtifact(grammarId, artifactPayload);

  if (!dryRun) {
    await insertCandidateRows(grammarId, acceptedRows, reviewNote);
  }

  console.log(
    JSON.stringify(
      {
        grammarId,
        inserted: dryRun ? 0 : acceptedRows.length,
        dryRun,
        artifactPath,
        reviewNote,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("Failed to generate A1.1 sentence candidates:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (globalThis.__a11CandidatePool) {
      await globalThis.__a11CandidatePool.end();
    }
  });
