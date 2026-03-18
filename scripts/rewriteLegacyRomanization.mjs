import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { fileURLToPath } from "url";

import { pool } from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
const GRAMMAR_DIR = path.resolve(SERVER_ROOT, "grammar");
const MODEL = process.env.GRAMMAR_EXAMPLE_MODEL || "gpt-4o";
const DEFAULT_BATCH_SIZE = Number.parseInt(
  process.env.LEGACY_ROMANIZATION_REWRITE_BATCH_SIZE || "20",
  10,
);
const WRITE_GRAMMAR_CSV_MIRROR = process.env.WRITE_GRAMMAR_CSV_MIRROR !== "false";
const GRAMMAR_EXAMPLES_TABLE = "grammar_examples";
const VALID_TONES = new Set(["mid", "low", "falling", "high", "rising"]);
const FORBIDDEN_ROMANIZATION_REGEX = /[Ê‰É¯É™É¤É”É’É•Ê”Å‹É²É³Ê°ËÉªÊŠÉœÉ’]/u;
const LEARNER_ROMANIZATION_REPLACEMENTS = [
  [/Ê‰|É¯/gu, "ue"],
  [/É™|É¤|Éœ/gu, "oe"],
  [/É”|É’/gu, "o"],
  [/Å‹/gu, "ng"],
  [/É•/gu, "ch"],
  [/Ê”/gu, ""],
  [/É²/gu, "ny"],
  [/É³/gu, "n"],
  [/Ê°/gu, ""],
  [/Ë/gu, ""],
  [/Éª/gu, "i"],
  [/ÊŠ/gu, "u"],
];

function parseArgs() {
  const args = process.argv.slice(2);
  const grammarIds = [];
  let batchSize = DEFAULT_BATCH_SIZE;

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--grammar" && args[index + 1]) {
      grammarIds.push(args[index + 1]);
    }
    if (args[index] === "--batch-size" && args[index + 1]) {
      batchSize = Number.parseInt(args[index + 1], 10);
    }
  }

  return {
    grammarIds,
    batchSize: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : DEFAULT_BATCH_SIZE,
    dryRun: args.includes("--dry-run"),
  };
}

function normalizePlainString(value, fieldName) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    throw new Error(`${fieldName} is required`);
  }
  return trimmed;
}

function sanitizeRomanizationText(value) {
  let nextValue = typeof value === "string" ? value.trim() : "";
  for (const [pattern, replacement] of LEARNER_ROMANIZATION_REPLACEMENTS) {
    nextValue = nextValue.replace(pattern, replacement);
  }
  return nextValue.replace(/\s+/g, " ").trim();
}

function normalizeWordBreakdownItem(item, index) {
  if (!item || typeof item !== "object") {
    throw new Error(`Breakdown item ${index + 1} must be an object`);
  }

  const tone = normalizePlainString(item.tone, `Breakdown item ${index + 1} tone`);
  if (!VALID_TONES.has(tone)) {
    throw new Error(
      `Breakdown item ${index + 1} tone must be one of: ${Array.from(VALID_TONES).join(", ")}`,
    );
  }

  const romanization = sanitizeRomanizationText(
    normalizePlainString(
      item.romanization,
      `Breakdown item ${index + 1} romanization`,
    ),
  );

  if (FORBIDDEN_ROMANIZATION_REGEX.test(romanization)) {
    throw new Error(
      `Breakdown item ${index + 1} romanization must use learner Latin spelling, not IPA`,
    );
  }

  const normalized = {
    thai: normalizePlainString(item.thai, `Breakdown item ${index + 1} Thai`),
    english: normalizePlainString(item.english, `Breakdown item ${index + 1} English`),
    tone,
    romanization,
  };

  if (item.grammar === true) {
    normalized.grammar = true;
  }

  return normalized;
}

function normalizeGrammarRow(row, index) {
  if (!row || typeof row !== "object") {
    throw new Error(`Row ${index + 1} must be an object`);
  }

  if (!Array.isArray(row.breakdown) || row.breakdown.length === 0) {
    throw new Error(`Row ${index + 1} must include at least one breakdown item`);
  }

  const breakdown = row.breakdown.map((item, breakdownIndex) =>
    normalizeWordBreakdownItem(item, breakdownIndex),
  );

  const romanization = sanitizeRomanizationText(
    normalizePlainString(row.romanization, `Row ${index + 1} sentence romanization`),
  );

  if (FORBIDDEN_ROMANIZATION_REGEX.test(romanization)) {
    throw new Error(`Row ${index + 1} sentence romanization must not use IPA`);
  }

  return {
    thai: normalizePlainString(row.thai, `Row ${index + 1} Thai`),
    romanization,
    english: normalizePlainString(row.english, `Row ${index + 1} English`),
    breakdown,
    difficulty: normalizePlainString(row.difficulty, `Row ${index + 1} difficulty`),
  };
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function escapeCsvValue(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function serializeGrammarRows(rows) {
  const header = ["thai", "romanization", "english", "breakdown", "difficulty"];
  const lines = rows.map((row) =>
    [
      row.thai,
      row.romanization,
      row.english,
      JSON.stringify(row.breakdown),
      row.difficulty,
    ]
      .map(escapeCsvValue)
      .join(","),
  );

  return [header.join(","), ...lines].join("\n");
}

async function saveRows(grammarId, rows) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM ${GRAMMAR_EXAMPLES_TABLE} WHERE grammar_id = $1`,
      [grammarId],
    );

    for (const [index, row] of rows.entries()) {
      await client.query(
        `
        INSERT INTO ${GRAMMAR_EXAMPLES_TABLE}
          (grammar_id, sort_order, thai, romanization, english, breakdown, difficulty)
        VALUES
          ($1, $2, $3, $4, $5, $6::jsonb, $7)
        `,
        [
          grammarId,
          index,
          row.thai,
          row.romanization,
          row.english,
          JSON.stringify(row.breakdown),
          row.difficulty,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  if (WRITE_GRAMMAR_CSV_MIRROR) {
    fs.mkdirSync(GRAMMAR_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(GRAMMAR_DIR, `${grammarId}.csv`),
      serializeGrammarRows(rows),
      "utf8",
    );
  }
}

async function fetchGrammarRows(grammarId) {
  const result = await pool.query(
    `
    SELECT grammar_id, sort_order, thai, romanization, english, breakdown, difficulty
    FROM ${GRAMMAR_EXAMPLES_TABLE}
    WHERE grammar_id = $1
    ORDER BY sort_order ASC, id ASC
    `,
    [grammarId],
  );

  return result.rows.map((row) => ({
    grammarId: row.grammar_id,
    sortOrder: row.sort_order,
    thai: row.thai,
    romanization: row.romanization,
    english: row.english,
    breakdown: Array.isArray(row.breakdown) ? row.breakdown : JSON.parse(row.breakdown),
    difficulty: row.difficulty,
  }));
}

function buildRewritePrompt(grammarId, rows) {
  const payload = rows.map((row) => ({
    thai: row.thai,
    english: row.english,
    difficulty: row.difficulty,
    breakdown: row.breakdown.map((item) => ({
      thai: item.thai,
      english: item.english,
      tone: item.tone,
      grammar: item.grammar === true,
    })),
  }));

  return `
You are rewriting legacy Thai learner romanization for a production grammar app.

Grammar point
- id: ${grammarId}

Task
- For every row below, rewrite the sentence romanization and every breakdown romanization in a consistent learner style.
- Keep the Thai sentence EXACTLY as given.
- Keep the English translation EXACTLY as given.
- Keep every breakdown Thai chunk EXACTLY as given.
- Keep the breakdown order EXACTLY as given.
- Do not change tone labels, grammar flags, or English glosses.
- Romanize each breakdown chunk as its own chunk. Do not guess by splitting the sentence into words.
- The sentence romanization should read naturally and match the breakdown chunks.
- Use ordinary Latin learner spelling with accents when natural.
- Never use IPA or specialist symbols such as ʉ, ə, ɔ, ŋ, or ʔ.

Return ONLY valid JSON in this exact shape:
{
  "rows": [
    {
      "thai": "",
      "romanization": "",
      "breakdown": [
        {
          "thai": "",
          "romanization": ""
        }
      ]
    }
  ]
}

Rows to rewrite
${JSON.stringify(payload, null, 2)}
`;
}

function mergeRewrittenBatch(originalRows, candidateRows) {
  if (!Array.isArray(candidateRows) || candidateRows.length !== originalRows.length) {
    throw new Error("Model returned a mismatched row count for legacy romanization rewrite");
  }

  const candidateByThai = new Map();
  for (const row of candidateRows) {
    const thai = normalizePlainString(row?.thai, "Candidate row Thai");
    if (candidateByThai.has(thai)) {
      throw new Error(`Model returned duplicate candidate row for "${thai}"`);
    }
    candidateByThai.set(thai, row);
  }

  return originalRows.map((row, rowIndex) => {
    const candidate = candidateByThai.get(row.thai);
    if (!candidate) {
      throw new Error(`Model omitted row "${row.thai}"`);
    }

    if (!Array.isArray(candidate.breakdown) || candidate.breakdown.length !== row.breakdown.length) {
      throw new Error(`Model returned a mismatched breakdown length for "${row.thai}"`);
    }

    const mergedBreakdown = row.breakdown.map((item, itemIndex) => {
      const candidateItem = candidate.breakdown[itemIndex];
      const candidateThai = normalizePlainString(
        candidateItem?.thai,
        `Candidate row ${rowIndex + 1} breakdown ${itemIndex + 1} Thai`,
      );

      if (candidateThai !== item.thai) {
        throw new Error(
          `Model changed breakdown Thai for "${row.thai}" at index ${itemIndex + 1}`,
        );
      }

      const romanization = sanitizeRomanizationText(
        normalizePlainString(
          candidateItem.romanization,
          `Candidate row ${rowIndex + 1} breakdown ${itemIndex + 1} romanization`,
        ),
      );

      if (FORBIDDEN_ROMANIZATION_REGEX.test(romanization)) {
        throw new Error(
          `Model returned IPA-like romanization for "${row.thai}" at index ${itemIndex + 1}`,
        );
      }

      return {
        ...item,
        romanization,
      };
    });

    const sentenceRomanization = sanitizeRomanizationText(
      normalizePlainString(
        candidate.romanization,
        `Candidate row ${rowIndex + 1} sentence romanization`,
      ),
    );

    return normalizeGrammarRow(
      {
        ...row,
        romanization: sentenceRomanization,
        breakdown: mergedBreakdown,
      },
      rowIndex,
    );
  });
}

async function withRetry(task, label, maxAttempts = 5) {
  let attempt = 0;
  let lastError = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await task();
    } catch (err) {
      lastError = err;
      const status = err?.status ?? err?.response?.status ?? null;
      const retryable =
        status === 429 ||
        (typeof status === "number" && status >= 500) ||
        /rate limit|quota|temporar|timeout|overloaded/i.test(String(err?.message ?? ""));

      if (!retryable || attempt >= maxAttempts) {
        throw err;
      }

      const delayMs = 1500 * attempt;
      console.log(`${label}: retrying after ${delayMs}ms (${attempt}/${maxAttempts})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

async function rewriteBatch(openai, grammarId, rows) {
  const prompt = buildRewritePrompt(grammarId, rows);
  let lastError = null;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await withRetry(
        () =>
          openai.chat.completions.create({
            model: MODEL,
            temperature: 0.2,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content:
                  "You rewrite Thai learner romanization for a grammar app. Return strict JSON only and do not change the source text.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
          }),
        `${grammarId}: OpenAI legacy rewrite`,
      );

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(`${grammarId}: OpenAI returned an empty response`);
      }

      const parsed = JSON.parse(content.replace(/```json|```/g, "").trim());
      return mergeRewrittenBatch(rows, parsed.rows);
    } catch (err) {
      lastError = err;
      if (attempt >= 4) {
        throw err;
      }
      console.log(`${grammarId}: retrying invalid rewrite output (${attempt}/4): ${err.message}`);
    }
  }

  throw lastError;
}

async function main() {
  const { grammarIds, batchSize, dryRun } = parseArgs();
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for legacy romanization rewrite");
  }
  if (grammarIds.length === 0) {
    throw new Error("Pass at least one --grammar <grammarId>");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const summary = [];

  try {
    for (const grammarId of grammarIds) {
      const rows = await fetchGrammarRows(grammarId);
      if (rows.length === 0) {
        throw new Error(`No rows found for ${grammarId}`);
      }

      console.log(`${grammarId}: rewriting ${rows.length} legacy rows`);
      const rewrittenRows = [];
      for (const batch of chunkArray(rows, batchSize)) {
        console.log(`${grammarId}: rewriting batch of ${batch.length} rows`);
        const rewrittenBatch = await rewriteBatch(openai, grammarId, batch);
        rewrittenRows.push(...rewrittenBatch);
      }

      if (!dryRun) {
        await saveRows(grammarId, rewrittenRows);
      }

      summary.push({
        grammarId,
        rowCount: rewrittenRows.length,
        dryRun,
      });
    }
  } finally {
    await pool.end();
  }

  console.log("Legacy romanization rewrite complete");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error("Failed to rewrite legacy romanization:", err);
  process.exitCode = 1;
});
