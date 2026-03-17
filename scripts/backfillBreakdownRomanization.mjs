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
const WRITE_GRAMMAR_CSV_MIRROR = process.env.WRITE_GRAMMAR_CSV_MIRROR !== "false";
const GRAMMAR_EXAMPLES_TABLE = "grammar_examples";
const VALID_TONES = new Set(["mid", "low", "falling", "high", "rising"]);
const FORBIDDEN_ROMANIZATION_REGEX = /[ʉɯəɤɔɒɕʔŋɲɳʰːɪʊɜɒ]/u;
const LEARNER_ROMANIZATION_REPLACEMENTS = [
  [/ʉ|ɯ/gu, "ue"],
  [/ə|ɤ|ɜ/gu, "oe"],
  [/ɔ|ɒ/gu, "o"],
  [/ŋ/gu, "ng"],
  [/ɕ/gu, "ch"],
  [/ʔ/gu, ""],
  [/ɲ/gu, "ny"],
  [/ɳ/gu, "n"],
  [/ʰ/gu, ""],
  [/ː/gu, ""],
  [/ɪ/gu, "i"],
  [/ʊ/gu, "u"],
];
const DEFAULT_BATCH_SIZE = Number.parseInt(
  process.env.BREAKDOWN_ROMANIZATION_BACKFILL_BATCH_SIZE || "20",
  10,
);

function parseArgs() {
  const args = process.argv.slice(2);
  const getValue = (flag) => {
    const index = args.indexOf(flag);
    if (index === -1 || index === args.length - 1) {
      return null;
    }
    return args[index + 1];
  };

  const grammarId = getValue("--grammar");
  const batchSize = Number.parseInt(
    getValue("--batch-size") || String(DEFAULT_BATCH_SIZE),
    10,
  );

  return {
    grammarId,
    batchSize: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : DEFAULT_BATCH_SIZE,
    dryRun: args.includes("--dry-run"),
  };
}

function normalizePlainString(value, fieldName, { allowEmpty = false } = {}) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!allowEmpty && !trimmed) {
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

  return {
    thai: normalizePlainString(row.thai, `Row ${index + 1} Thai`),
    romanization: normalizePlainString(
      row.romanization,
      `Row ${index + 1} sentence romanization`,
    ),
    english: normalizePlainString(row.english, `Row ${index + 1} English`),
    breakdown: row.breakdown.map((item, breakdownIndex) =>
      normalizeWordBreakdownItem(item, breakdownIndex),
    ),
    difficulty: normalizePlainString(row.difficulty, `Row ${index + 1} difficulty`),
  };
}

function hasMissingBreakdownRomanization(row) {
  return row.breakdown.some(
    (item) => typeof item.romanization !== "string" || !item.romanization.trim(),
  );
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

async function fetchGrammarRows(grammarId = null) {
  const params = [];
  const whereClause = grammarId
    ? (() => {
        params.push(grammarId);
        return "WHERE grammar_id = $1";
      })()
    : "";

  const result = await pool.query(
    `
    SELECT grammar_id, sort_order, thai, romanization, english, breakdown, difficulty
    FROM ${GRAMMAR_EXAMPLES_TABLE}
    ${whereClause}
    ORDER BY grammar_id ASC, sort_order ASC, id ASC
    `,
    params,
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

function buildBackfillPrompt(grammarId, rows) {
  const payload = rows.map((row) => ({
    thai: row.thai,
    sentenceRomanization: row.romanization,
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
You are repairing chunk-by-chunk Thai learner romanization for an app.

Grammar point
- id: ${grammarId}

Task
- For every row below, add learner-friendly romanization to every breakdown item.
- Keep the Thai chunks EXACTLY as given.
- Keep the breakdown order EXACTLY as given.
- Do not change Thai, English, tone, or grammar flags.
- Do not split by whitespace from the sentence romanization. Romanize each breakdown chunk as its own chunk.
- Multi-word Thai chunks such as "สัตว์เลี้ยง" or "ที่มีชื่อเสียง" must receive a single chunk romanization that matches that exact chunk.
- Use ordinary Latin learner spelling with accents when natural.
- Never use IPA or specialist symbols such as ʉ, ə, ɔ, ŋ, or ʔ.

Return ONLY valid JSON in this exact shape:
{
  "rows": [
    {
      "thai": "",
      "breakdown": [
        {
          "thai": "",
          "romanization": ""
        }
      ]
    }
  ]
}

Rows to repair
${JSON.stringify(payload, null, 2)}
`;
}

function mergeBackfilledBatch(originalRows, candidateRows) {
  if (!Array.isArray(candidateRows) || candidateRows.length !== originalRows.length) {
    throw new Error("Model returned a mismatched row count for breakdown backfill");
  }

  const candidateByThai = new Map();
  for (const row of candidateRows) {
    if (!row || typeof row !== "object") {
      throw new Error("Model returned an invalid row");
    }
    const thai = normalizePlainString(row.thai, "Candidate row Thai");
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
      if (!candidateItem || typeof candidateItem !== "object") {
        throw new Error(
          `Model returned an invalid breakdown item for "${row.thai}" at index ${itemIndex + 1}`,
        );
      }

      const candidateThai = normalizePlainString(
        candidateItem.thai,
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

    return normalizeGrammarRow(
      {
        ...row,
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

async function repairBatch(openai, grammarId, rows) {
  const prompt = buildBackfillPrompt(grammarId, rows);
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
                  "You repair Thai chunk romanization for a grammar app. Return strict JSON only and do not change the source text.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
          }),
        `${grammarId}: OpenAI backfill`,
      );

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(`${grammarId}: OpenAI returned an empty response`);
      }

      const parsed = JSON.parse(content.replace(/```json|```/g, "").trim());
      return mergeBackfilledBatch(rows, parsed.rows);
    } catch (err) {
      lastError = err;
      if (attempt >= 4) {
        throw err;
      }
      console.log(
        `${grammarId}: retrying invalid batch output (${attempt}/4): ${err.message}`,
      );
    }
  }

  throw lastError;
}

function countMissingItems(rows) {
  let missing = 0;
  for (const row of rows) {
    for (const item of row.breakdown) {
      if (typeof item.romanization !== "string" || !item.romanization.trim()) {
        missing += 1;
      }
    }
  }
  return missing;
}

async function main() {
  const { grammarId, batchSize, dryRun } = parseArgs();
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for romanization backfill");
  }

  const rawRows = await fetchGrammarRows(grammarId);
  if (rawRows.length === 0) {
    throw new Error(grammarId ? `No rows found for ${grammarId}` : "No grammar rows found");
  }

  const byGrammar = new Map();
  for (const row of rawRows) {
    const normalizedRow = {
      ...row,
      breakdown: Array.isArray(row.breakdown) ? row.breakdown : JSON.parse(row.breakdown),
    };
    const list = byGrammar.get(row.grammarId) ?? [];
    list.push(normalizedRow);
    byGrammar.set(row.grammarId, list);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const summary = [];

  try {
    for (const [currentGrammarId, grammarRows] of byGrammar.entries()) {
      const missingRows = grammarRows.filter(hasMissingBreakdownRomanization);
      if (missingRows.length === 0) {
        summary.push({
          grammarId: currentGrammarId,
          rowCount: grammarRows.length,
          updatedRows: 0,
          missingItemsAfter: 0,
          skipped: true,
        });
        continue;
      }

      console.log(
        `${currentGrammarId}: repairing ${missingRows.length}/${grammarRows.length} rows missing breakdown romanization`,
      );

      const repairedByThai = new Map();
      for (const batch of chunkArray(missingRows, batchSize)) {
        console.log(`${currentGrammarId}: repairing batch of ${batch.length} rows`);
        const repairedBatch = await repairBatch(openai, currentGrammarId, batch);
        for (const row of repairedBatch) {
          repairedByThai.set(row.thai, row);
        }
      }

      const nextRows = grammarRows.map((row, index) =>
        normalizeGrammarRow(repairedByThai.get(row.thai) ?? row, index),
      );
      const missingItemsAfter = countMissingItems(nextRows);

      if (!dryRun) {
        await saveRows(currentGrammarId, nextRows);
      }

      console.log(
        `${currentGrammarId}: ${dryRun ? "validated" : "saved"} ${nextRows.length} rows`,
      );
      summary.push({
        grammarId: currentGrammarId,
        rowCount: nextRows.length,
        updatedRows: missingRows.length,
        missingItemsAfter,
        skipped: false,
      });
    }
  } finally {
    await pool.end();
  }

  console.log("Breakdown romanization backfill complete");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error("Failed to backfill breakdown romanization:", err);
  process.exitCode = 1;
});
