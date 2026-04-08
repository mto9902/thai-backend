import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  buildMissingItemsPrompt,
  fetchPublishedRows,
  findUnresolvedItems,
} from "./lib/newGenToneAnnotation.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(SERVER_ROOT, ".env"), quiet: true });

const GRAMMAR_EXAMPLES_TABLE = "grammar_examples";
const DEFAULT_BATCH_SIZE = 12;
const OUTPUT_ROOT = path.join(SERVER_ROOT, "admin-data", "new-gen-tone-batches");

function parseArgs() {
  const args = process.argv.slice(2);
  const readFlag = (flag) => {
    const index = args.indexOf(flag);
    if (index < 0 || index >= args.length - 1) {
      return null;
    }
    return args[index + 1];
  };

  const grammarId = readFlag("--lesson");
  if (!grammarId) {
    throw new Error("--lesson <grammarId> is required");
  }

  const offset = Number.parseInt(readFlag("--offset") ?? "0", 10);
  const limit = Number.parseInt(readFlag("--limit") ?? String(DEFAULT_BATCH_SIZE), 10);

  return {
    grammarId,
    offset: Number.isFinite(offset) && offset >= 0 ? offset : 0,
    limit: Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_BATCH_SIZE,
  };
}

function getBatchLabel(offset, limit) {
  const start = offset + 1;
  const end = offset + limit;
  return `${String(start).padStart(2, "0")}-${String(end).padStart(2, "0")}`;
}

async function main() {
  const { pool } = await import("../db.js");
  const { grammarId, offset, limit } = parseArgs();
  const rows = await fetchPublishedRows(pool, GRAMMAR_EXAMPLES_TABLE, grammarId);
  if (rows.length !== 25) {
    throw new Error(`${grammarId} must have exactly 25 live approved rows before export`);
  }

  const unresolvedItems = findUnresolvedItems(rows);
  const batch = unresolvedItems.slice(offset, offset + limit);
  if (batch.length === 0) {
    throw new Error(`No unresolved items found for ${grammarId} at offset ${offset}`);
  }

  const batchLabel = getBatchLabel(offset, batch.length);
  const lessonDir = path.join(OUTPUT_ROOT, grammarId);
  fs.mkdirSync(lessonDir, { recursive: true });

  const payload = {
    grammarId,
    mode: "missing-items",
    offset,
    limit: batch.length,
    batchLabel,
    exportedAt: new Date().toISOString(),
    items: batch,
  };

  const jsonPath = path.join(lessonDir, `${grammarId}-missing-tones-${batchLabel}.json`);
  const promptPath = path.join(lessonDir, `${grammarId}-missing-tones-${batchLabel}.prompt.txt`);
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  fs.writeFileSync(promptPath, buildMissingItemsPrompt(grammarId, batch), "utf8");

  console.log(
    JSON.stringify(
      {
        grammarId,
        batchLabel,
        unresolvedCount: unresolvedItems.length,
        itemCount: batch.length,
        jsonPath,
        promptPath,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("Failed to export New Gen missing-tone items:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { pool } = await import("../db.js");
    await pool.end().catch(() => {});
  });
