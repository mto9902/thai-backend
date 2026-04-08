import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

import { pool } from "../db.js";

const VALID_DECISIONS = new Set(["carry", "revise", "replace", "retire"]);

function parseArgs(argv) {
  const manifestPath = argv[2];
  if (!manifestPath) {
    throw new Error("Usage: node ./scripts/applyLegacyLessonAudit.mjs <manifest-path>");
  }

  return {
    manifestPath: path.resolve(manifestPath),
  };
}

function loadManifest(manifestPath) {
  const raw = fs.readFileSync(manifestPath, "utf8");
  const parsed = JSON.parse(raw);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Audit manifest must be a JSON object");
  }

  if (typeof parsed.grammarId !== "string" || !parsed.grammarId.trim()) {
    throw new Error("Audit manifest must include grammarId");
  }

  if (!Array.isArray(parsed.decisions) || parsed.decisions.length === 0) {
    throw new Error("Audit manifest must include a non-empty decisions array");
  }

  for (const entry of parsed.decisions) {
    if (!entry || typeof entry !== "object") {
      throw new Error("Each decision entry must be an object");
    }

    const id = Number(entry.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error(`Invalid row id in audit manifest: ${entry.id}`);
    }

    if (!VALID_DECISIONS.has(entry.decision)) {
      throw new Error(
        `Invalid decision "${entry.decision}" for row ${entry.id}. Valid decisions: ${[...VALID_DECISIONS].join(", ")}`,
      );
    }
  }

  return parsed;
}

async function main() {
  const { manifestPath } = parseArgs(process.argv);
  const manifest = loadManifest(manifestPath);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const updated = [];
    for (const entry of manifest.decisions) {
      const result = await client.query(
        `
        UPDATE grammar_examples
        SET next_wave_decision = $2,
            next_wave_audit_note = $3,
            next_wave_audited_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
          AND grammar_id = $4
        RETURNING id, grammar_id, next_wave_decision
        `,
        [
          Number(entry.id),
          entry.decision,
          typeof entry.note === "string" ? entry.note.trim() : null,
          manifest.grammarId,
        ],
      );

      if (result.rowCount === 0) {
        throw new Error(
          `Row ${entry.id} was not found for grammarId ${manifest.grammarId}`,
        );
      }

      updated.push(result.rows[0]);
    }

    await client.query("COMMIT");

    console.log(
      JSON.stringify(
        {
          grammarId: manifest.grammarId,
          updatedCount: updated.length,
          decisions: updated,
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
  console.error(error);
  process.exitCode = 1;
});
