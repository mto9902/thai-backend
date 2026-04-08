import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  mergeAnnotatedBatch,
  parseJsonFromText,
  saveAnnotatedRows,
} from "./lib/newGenToneAnnotation.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
const GRAMMAR_DIR = path.resolve(SERVER_ROOT, "grammar");
dotenv.config({ path: path.join(SERVER_ROOT, ".env"), quiet: true });

const GRAMMAR_EXAMPLES_TABLE = "grammar_examples";
const REVIEW_DATE = "2026-04-06";
const REVIEW_NOTE = `New Gen tone annotation ${REVIEW_DATE}`;

function parseArgs() {
  const args = process.argv.slice(2);
  const readFlag = (flag) => {
    const index = args.indexOf(flag);
    if (index < 0 || index >= args.length - 1) {
      return null;
    }
    return args[index + 1];
  };

  const inputPath = readFlag("--input");
  const responsePath = readFlag("--response");

  if (!inputPath || !responsePath) {
    throw new Error("--input <batch.json> and --response <response.txt> are required");
  }

  return {
    inputPath: path.resolve(inputPath),
    responsePath: path.resolve(responsePath),
    dryRun: args.includes("--dry-run"),
  };
}

function loadBatch(inputPath) {
  const parsed = JSON.parse(fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, ""));
  if (!parsed?.grammarId || !Array.isArray(parsed.rows) || parsed.rows.length === 0) {
    throw new Error("Input batch file is missing grammarId or rows");
  }
  return parsed;
}

async function main() {
  const { pool } = await import("../db.js");
  const { inputPath, responsePath, dryRun } = parseArgs();
  const batch = loadBatch(inputPath);
  const responseText = fs.readFileSync(responsePath, "utf8");
  const parsed = parseJsonFromText(responseText);
  const candidateRows = Array.isArray(parsed) ? parsed : parsed?.rows;
  const mergedRows = mergeAnnotatedBatch(batch.rows, candidateRows);

  const unresolvedToneItems = mergedRows.reduce(
    (sum, row) => sum + Number(row.toneAnalysis?.unresolvedItemCount ?? 0),
    0,
  );

  if (!dryRun) {
    await saveAnnotatedRows({
      pool,
      tableName: GRAMMAR_EXAMPLES_TABLE,
      grammarDir: GRAMMAR_DIR,
      reviewNote: REVIEW_NOTE,
      grammarId: batch.grammarId,
      rows: mergedRows,
    });
  }

  console.log(
    JSON.stringify(
      {
        grammarId: batch.grammarId,
        batchLabel: batch.batchLabel ?? null,
        rowCount: mergedRows.length,
        unresolvedToneItems,
        dryRun,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("Failed to apply New Gen tone batch:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { pool } = await import("../db.js");
    await pool.end().catch(() => {});
  });
