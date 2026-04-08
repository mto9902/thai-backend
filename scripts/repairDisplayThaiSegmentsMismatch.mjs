import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
const FRONTEND_ROOT = path.resolve(SERVER_ROOT, "..", "thaiApp-2");
dotenv.config({ path: path.join(SERVER_ROOT, ".env"), quiet: true });

const { pool } = await import("../db.js");

const GRAMMAR_STAGES_PATH = path.join(
  FRONTEND_ROOT,
  "src",
  "data",
  "grammarStages.ts",
);
const MANUAL_SOURCE_DIR = path.join(SERVER_ROOT, "admin-data", "manual-source-lessons");
const GRAMMAR_EXAMPLES_TABLE = "grammar_examples";
const DEFAULT_STAGES = ["A2.1", "A2.2", "B1.1", "B1.2", "B2.1", "B2.2"];

function parseArgs() {
  const args = process.argv.slice(2);
  const index = args.indexOf("--stages");
  return index >= 0 && index < args.length - 1
    ? args[index + 1]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : DEFAULT_STAGES;
}

function collectGrammarIds(stages) {
  const source = fs.readFileSync(GRAMMAR_STAGES_PATH, "utf8");
  const ids = [];

  for (const stage of stages) {
    const marker = `"${stage}": [`;
    const stageIndex = source.indexOf(marker);
    if (stageIndex < 0) {
      throw new Error(`Could not find stage ${stage} in grammarStages.ts`);
    }

    const start = source.indexOf("[", stageIndex);
    let depth = 0;
    let end = -1;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (char === "[") {
        depth += 1;
      } else if (char === "]") {
        depth -= 1;
        if (depth === 0) {
          end = index;
          break;
        }
      }
    }

    const block = source.slice(start, end + 1);
    ids.push(...[...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]));
  }

  return [...new Set(ids)];
}

function getToneCount(item) {
  if (Array.isArray(item?.tones)) {
    return item.tones.filter(Boolean).length;
  }
  if (item?.tone) {
    return 1;
  }
  return 0;
}

function normalizeBreakdown(breakdown) {
  let updated = false;
  const nextBreakdown = (Array.isArray(breakdown) ? breakdown : []).map((item) => {
    const displayThaiSegments = Array.isArray(item?.displayThaiSegments)
      ? item.displayThaiSegments.filter(Boolean)
      : null;
    if (!displayThaiSegments) {
      return item;
    }

    if (displayThaiSegments.length === getToneCount(item)) {
      return item;
    }

    updated = true;
    const nextItem = { ...item };
    delete nextItem.displayThaiSegments;
    return nextItem;
  });

  return { breakdown: nextBreakdown, updated };
}

function repairManualSource(grammarId) {
  const filePath = path.join(MANUAL_SOURCE_DIR, `${grammarId}-source.json`);
  if (!fs.existsSync(filePath)) {
    return 0;
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
  if (!Array.isArray(rows)) {
    return 0;
  }

  let updatedItems = 0;
  const nextRows = rows.map((row) => {
    const normalized = normalizeBreakdown(row.breakdown);
    if (normalized.updated) {
      updatedItems += 1;
    }
    return {
      ...row,
      breakdown: normalized.breakdown,
    };
  });

  if (updatedItems === 0) {
    return 0;
  }

  const nextPayload = Array.isArray(parsed)
    ? nextRows
    : {
        ...parsed,
        rows: nextRows,
      };

  fs.writeFileSync(filePath, `${JSON.stringify(nextPayload, null, 2)}\n`, "utf8");
  return updatedItems;
}

async function repairDatabaseRows(client, grammarIds) {
  const result = await client.query(
    `
    SELECT id, grammar_id, breakdown
    FROM ${GRAMMAR_EXAMPLES_TABLE}
    WHERE grammar_id = ANY($1::text[])
    `,
    [grammarIds],
  );

  let updatedRows = 0;

  for (const row of result.rows) {
    const normalized = normalizeBreakdown(row.breakdown);
    if (!normalized.updated) {
      continue;
    }

    updatedRows += 1;
    await client.query(
      `
      UPDATE ${GRAMMAR_EXAMPLES_TABLE}
      SET breakdown = $2::jsonb, updated_at = NOW()
      WHERE id = $1
      `,
      [row.id, JSON.stringify(normalized.breakdown)],
    );
  }

  return updatedRows;
}

async function main() {
  const stages = parseArgs();
  const grammarIds = collectGrammarIds(stages);
  const client = await pool.connect();

  try {
    const sourceUpdates = [];
    for (const grammarId of grammarIds) {
      const count = repairManualSource(grammarId);
      if (count > 0) {
        sourceUpdates.push({ grammarId, count });
      }
    }

    await client.query("BEGIN");
    const updatedRows = await repairDatabaseRows(client, grammarIds);
    await client.query("COMMIT");

    console.log(
      JSON.stringify(
        {
          stages,
          updatedSourceLessons: sourceUpdates,
          updatedDatabaseRows: updatedRows,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Failed to repair displayThaiSegments mismatches:", error);
  process.exitCode = 1;
});
