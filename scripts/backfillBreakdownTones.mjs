import path from "path";
import pg from "pg";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

import { analyzeBreakdownTones } from "../breakdownTone.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(SERVER_ROOT, ".env"), quiet: true });

const { Pool } = pg;
const GRAMMAR_EXAMPLES_TABLE = "grammar_examples";
const APPROVED_TONE_CONFIDENCE = 99;
const VALID_TONES = new Set(["mid", "low", "falling", "high", "rising"]);

function normalizeToneArray(tones) {
  if (!Array.isArray(tones)) {
    return [];
  }

  return tones
    .map((tone) =>
      typeof tone === "string" ? tone.trim().toLowerCase() : "",
    )
    .filter((tone) => VALID_TONES.has(tone));
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function summarizeRowToneAnalysis(itemAnalyses) {
  const confidence = itemAnalyses.reduce(
    (lowest, item) => Math.min(lowest, item.confidence),
    100,
  );
  const flaggedItems = itemAnalyses.filter(
    (item) => item.needsReview || item.confidence < APPROVED_TONE_CONFIDENCE,
  );

  return {
    confidence,
    status:
      flaggedItems.length === 0 && confidence >= APPROVED_TONE_CONFIDENCE
        ? "approved"
        : "review",
    flaggedItemCount: flaggedItems.length,
    reasons: Array.from(
      new Set(flaggedItems.flatMap((item) => item.reasons || [])),
    ),
    breakdown: itemAnalyses,
  };
}

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

  return {
    grammarId: getValue("--grammar")?.trim() || null,
    dryRun: args.includes("--dry-run"),
  };
}

function normalizeBreakdownItem(item) {
  const thai = cleanString(item?.thai);
  const english = cleanString(item?.english);
  const romanization = cleanString(item?.romanization);
  const existingTones = normalizeToneArray(item?.tones);
  const existingToneCount = existingTones.length;
  const autoAnalysis =
    existingToneCount === 0
      ? analyzeBreakdownTones({
          thai,
          romanization,
          providedTones: [],
        })
      : null;

  const shouldBackfill =
    existingToneCount === 0 &&
    autoAnalysis &&
    autoAnalysis.status === "approved" &&
    autoAnalysis.needsReview === false &&
    autoAnalysis.tones.length > 0;

  const finalTones = shouldBackfill ? autoAnalysis.tones : existingTones;
  const finalAnalysis = analyzeBreakdownTones({
    thai,
    romanization,
    providedTones: finalTones,
  });

  const normalizedItem = {
    thai,
    english,
    ...(romanization ? { romanization } : {}),
    ...(item?.grammar === true ? { grammar: true } : {}),
    ...(finalAnalysis.tones.length > 0 ? { tones: finalAnalysis.tones } : {}),
    ...(finalAnalysis.tones.length === 1
      ? { tone: finalAnalysis.tones[0] }
      : {}),
  };

  return {
    item: normalizedItem,
    didBackfill: shouldBackfill,
    analysis: {
      confidence: finalAnalysis.confidence,
      status: finalAnalysis.status,
      source: finalAnalysis.source,
      needsReview: finalAnalysis.needsReview,
      reasons: finalAnalysis.reasons,
      syllableCount: finalAnalysis.syllableCount,
    },
  };
}

async function main() {
  const options = parseArgs();
  const pool = await createPool();

  try {
    const whereClause = options.grammarId ? "WHERE grammar_id = $1" : "";
    const params = options.grammarId ? [options.grammarId] : [];
    const result = await pool.query(
      `
      SELECT id, grammar_id, breakdown, tone_confidence, tone_status, tone_analysis
      FROM ${GRAMMAR_EXAMPLES_TABLE}
      ${whereClause}
      ORDER BY grammar_id ASC, sort_order ASC, id ASC
      `,
      params,
    );

    let scannedRows = 0;
    let updatedRows = 0;
    let backfilledItems = 0;
    let rowsStillMissing = 0;
    let rowsWithMultiSyllables = 0;

    for (const row of result.rows) {
      scannedRows += 1;

      const originalBreakdown = Array.isArray(row.breakdown) ? row.breakdown : [];
      const normalizedBreakdown = [];
      const itemAnalyses = [];
      let rowBackfilledItems = 0;

      for (const item of originalBreakdown) {
        const normalized = normalizeBreakdownItem(item);
        normalizedBreakdown.push(normalized.item);
        itemAnalyses.push(normalized.analysis);
        if (normalized.didBackfill) {
          rowBackfilledItems += 1;
        }
      }

      const rowToneAnalysis = summarizeRowToneAnalysis(itemAnalyses);
      const hasMissingTones = normalizedBreakdown.some(
        (item) => !Array.isArray(item.tones) || item.tones.length === 0,
      );
      const hasMultiSyllableWords = itemAnalyses.some(
        (item) => Number(item.syllableCount) > 1,
      );

      if (hasMissingTones) {
        rowsStillMissing += 1;
      }
      if (hasMultiSyllableWords) {
        rowsWithMultiSyllables += 1;
      }

      if (rowBackfilledItems === 0) {
        continue;
      }

      if (!options.dryRun) {
        await pool.query(
          `
          UPDATE ${GRAMMAR_EXAMPLES_TABLE}
          SET breakdown = $2::jsonb,
              tone_confidence = $3,
              tone_status = $4,
              tone_analysis = $5::jsonb,
              updated_at = NOW()
          WHERE id = $1
          `,
          [
            row.id,
            JSON.stringify(normalizedBreakdown),
            rowToneAnalysis.confidence,
            rowToneAnalysis.status,
            JSON.stringify(rowToneAnalysis),
          ],
        );
      }

      updatedRows += 1;
      backfilledItems += rowBackfilledItems;
    }

    console.log(
      JSON.stringify(
        {
          grammarId: options.grammarId ?? "ALL",
          dryRun: options.dryRun,
          scannedRows,
          updatedRows,
          backfilledItems,
          rowsStillMissing,
          rowsWithMultiSyllables,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error("Failed to backfill breakdown tones:", error);
  process.exitCode = 1;
});
