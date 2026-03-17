import csv from "csv-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { pool } from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
const GRAMMAR_DIR = path.resolve(SERVER_ROOT, "grammar");
const GRAMMAR_EXAMPLES_TABLE = "grammar_examples";
const VALID_TONES = new Set(["mid", "low", "falling", "high", "rising"]);
const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const replaceExisting = process.argv.includes("--replace-existing");

function normalizePlainString(value, fieldName, { allowEmpty = false } = {}) {
  const trimmed = typeof value === "string" ? value.trim() : "";

  if (!allowEmpty && !trimmed) {
    throw new Error(`${fieldName} is required`);
  }

  return trimmed;
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

  const normalized = {
    thai: normalizePlainString(item.thai, `Breakdown item ${index + 1} Thai`),
    english: normalizePlainString(item.english, `Breakdown item ${index + 1} English`),
    tone,
  };

  if (item.grammar === true) {
    normalized.grammar = true;
  }

  if (typeof item.romanization === "string" && item.romanization.trim()) {
    normalized.romanization = item.romanization.trim();
  }

  return normalized;
}

function parseBreakdown(rawBreakdown, grammarId, rowIndex) {
  try {
    const parsed =
      typeof rawBreakdown === "string" ? JSON.parse(rawBreakdown) : rawBreakdown;

    if (!Array.isArray(parsed)) {
      throw new Error("Breakdown must be an array");
    }

    return parsed;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to parse breakdown";
    throw new Error(
      `Invalid breakdown for ${grammarId} row ${rowIndex + 1}: ${message}`,
    );
  }
}

function normalizeGrammarRow(row, index, grammarId) {
  const difficulty = normalizePlainString(
    row.difficulty ?? "easy",
    `Row ${index + 1} difficulty`,
  ).toLowerCase();

  if (!VALID_DIFFICULTIES.has(difficulty)) {
    throw new Error(
      `Row ${index + 1} difficulty must be one of: ${Array.from(VALID_DIFFICULTIES).join(", ")}`,
    );
  }

  return {
    thai: normalizePlainString(row.thai, `Row ${index + 1} Thai`),
    romanization: normalizePlainString(
      row.romanization,
      `Row ${index + 1} romanization`,
    ),
    english: normalizePlainString(row.english, `Row ${index + 1} English`),
    breakdown: parseBreakdown(row.breakdown, grammarId, index).map((item, breakdownIndex) =>
      normalizeWordBreakdownItem(item, breakdownIndex),
    ),
    difficulty,
  };
}

function readGrammarRowsFromCsvFile(filePath, grammarId) {
  const rows = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        try {
          rows.push(normalizeGrammarRow(row, rows.length, grammarId));
        } catch (err) {
          reject(err);
        }
      })
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

async function ensureGrammarExamplesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${GRAMMAR_EXAMPLES_TABLE} (
      id BIGSERIAL PRIMARY KEY,
      grammar_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      thai TEXT NOT NULL,
      romanization TEXT NOT NULL,
      english TEXT NOT NULL,
      breakdown JSONB NOT NULL,
      difficulty TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (grammar_id, sort_order)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_grammar_examples_grammar_sort
      ON ${GRAMMAR_EXAMPLES_TABLE} (grammar_id, sort_order);
  `);
}

async function main() {
  if (!fs.existsSync(GRAMMAR_DIR)) {
    throw new Error(`Grammar directory not found: ${GRAMMAR_DIR}`);
  }

  await ensureGrammarExamplesTable();

  const files = fs
    .readdirSync(GRAMMAR_DIR)
    .filter((file) => file.endsWith(".csv"))
    .sort();

  const existingResult = await pool.query(
    `
    SELECT grammar_id
    FROM ${GRAMMAR_EXAMPLES_TABLE}
    GROUP BY grammar_id
    HAVING COUNT(*) > 0
    `,
  );
  const existingGrammarIds = new Set(
    existingResult.rows.map((row) => row.grammar_id),
  );

  const client = await pool.connect();
  let importedGrammarIds = 0;
  let importedRows = 0;
  let skippedGrammarIds = 0;

  try {
    await client.query("BEGIN");

    for (const file of files) {
      const grammarId = file.replace(".csv", "");

      if (!replaceExisting && existingGrammarIds.has(grammarId)) {
        skippedGrammarIds += 1;
        continue;
      }

      const rows = await readGrammarRowsFromCsvFile(
        path.join(GRAMMAR_DIR, file),
        grammarId,
      );

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

      importedGrammarIds += 1;
      importedRows += rows.length;
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }

  console.log("Grammar CSV -> Postgres migration complete");
  console.log(`Imported grammar ids: ${importedGrammarIds}`);
  console.log(`Imported rows: ${importedRows}`);
  console.log(`Skipped existing grammar ids: ${skippedGrammarIds}`);
  console.log(
    replaceExisting
      ? "Mode: replace existing grammar rows"
      : "Mode: import missing grammar ids only",
  );
}

main().catch((err) => {
  console.error("Failed to migrate grammar CSVs to Postgres:", err);
  process.exitCode = 1;
});
