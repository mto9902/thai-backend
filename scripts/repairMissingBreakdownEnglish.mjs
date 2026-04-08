import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(SERVER_ROOT, ".env"), quiet: true });

const { pool } = await import("../db.js");

const SOURCE_DIR = path.join(SERVER_ROOT, "admin-data", "manual-source-lessons");
const GRAMMAR_EXAMPLES_TABLE = "grammar_examples";

function repairBreakdown(breakdown) {
  let updated = false;
  const nextBreakdown = (Array.isArray(breakdown) ? breakdown : []).map((item) => {
    if (item?.thai === "เรา" && String(item?.english ?? "").trim() === "") {
      updated = true;
      return {
        ...item,
        english: "our",
      };
    }
    return item;
  });

  return { breakdown: nextBreakdown, updated };
}

async function main() {
  const grammarId = "to-be-khue-vs-pen";
  const sourcePath = path.join(SOURCE_DIR, `${grammarId}-source.json`);
  const parsed = JSON.parse(fs.readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, ""));
  const rows = Array.isArray(parsed) ? parsed : parsed?.rows;

  let sourceUpdates = 0;
  const nextRows = rows.map((row) => {
    const normalized = repairBreakdown(row.breakdown);
    if (normalized.updated) {
      sourceUpdates += 1;
    }
    return {
      ...row,
      breakdown: normalized.breakdown,
    };
  });

  const nextPayload = Array.isArray(parsed)
    ? nextRows
    : {
        ...parsed,
        rows: nextRows,
      };
  fs.writeFileSync(sourcePath, `${JSON.stringify(nextPayload, null, 2)}\n`, "utf8");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `
      SELECT id, breakdown
      FROM ${GRAMMAR_EXAMPLES_TABLE}
      WHERE grammar_id = $1
      `,
      [grammarId],
    );

    let dbUpdates = 0;
    for (const row of result.rows) {
      const normalized = repairBreakdown(row.breakdown);
      if (!normalized.updated) {
        continue;
      }

      dbUpdates += 1;
      await client.query(
        `
        UPDATE ${GRAMMAR_EXAMPLES_TABLE}
        SET breakdown = $2::jsonb, updated_at = NOW()
        WHERE id = $1
        `,
        [row.id, JSON.stringify(normalized.breakdown)],
      );
    }

    await client.query("COMMIT");
    console.log(JSON.stringify({ grammarId, sourceUpdates, dbUpdates }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Failed to repair missing breakdown English:", error);
  process.exitCode = 1;
});
