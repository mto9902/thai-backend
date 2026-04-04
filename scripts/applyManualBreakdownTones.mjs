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

const MANUAL_TONE_OVERRIDES = {
  svo: {
    "กระเป๋า": ["low", "rising"],
    "ก๋วยเตี๋ยว": ["rising", "rising"],
    "กาแฟ": ["mid", "mid"],
    "ขนมปัง": ["low", "rising", "mid"],
    "โซดา": ["mid", "mid"],
    "ตะเกียบ": ["low", "low"],
    "โทรศัพท์": ["mid", "high", "low"],
    "ประตู": ["low", "mid"],
    "มะม่วง": ["high", "falling"],
    "เมนู": ["mid", "mid"],
    "หนังสือ": ["rising", "rising"],
    "หน้าต่าง": ["falling", "falling"],
    "นม": ["mid"],
  },
};

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
    grammarId: (getValue("--grammar") || "svo").trim(),
    dryRun: args.includes("--dry-run"),
  };
}

function normalizeItem(item, overrideMap) {
  const thai = typeof item?.thai === "string" ? item.thai.trim() : "";
  const english = typeof item?.english === "string" ? item.english.trim() : "";
  const romanization =
    typeof item?.romanization === "string" ? item.romanization.trim() : "";
  const explicitTones = overrideMap[thai];
  const existingTones = Array.isArray(item?.tones) ? item.tones : [];
  const finalTones = explicitTones ?? existingTones;
  const toneAnalysis = analyzeBreakdownTones({
    thai,
    romanization,
    providedTones: finalTones,
  });

  const normalizedItem = {
    thai,
    english,
    ...(romanization ? { romanization } : {}),
    ...(item?.grammar === true ? { grammar: true } : {}),
    ...(toneAnalysis.tones.length > 0 ? { tones: toneAnalysis.tones } : {}),
    ...(toneAnalysis.tones.length === 1
      ? { tone: toneAnalysis.tones[0] }
      : {}),
  };

  return {
    item: normalizedItem,
    analysis: {
      confidence: toneAnalysis.confidence,
      status: toneAnalysis.status,
      source: toneAnalysis.source,
      needsReview: toneAnalysis.needsReview,
      reasons: toneAnalysis.reasons,
      syllableCount: toneAnalysis.syllableCount,
    },
    wasOverridden: Array.isArray(explicitTones),
  };
}

async function main() {
  const options = parseArgs();
  const overrideMap = MANUAL_TONE_OVERRIDES[options.grammarId];

  if (!overrideMap) {
    throw new Error(`No manual tone overrides configured for ${options.grammarId}`);
  }

  const pool = await createPool();

  try {
    const result = await pool.query(
      `
      SELECT id, breakdown, tone_confidence, tone_status, tone_analysis
      FROM ${GRAMMAR_EXAMPLES_TABLE}
      WHERE grammar_id = $1
      ORDER BY sort_order ASC, id ASC
      `,
      [options.grammarId],
    );

    let scannedRows = 0;
    let updatedRows = 0;
    let overriddenItems = 0;
    let remainingReviewRows = 0;

    for (const row of result.rows) {
      scannedRows += 1;

      const originalBreakdown = Array.isArray(row.breakdown) ? row.breakdown : [];
      const normalizedBreakdown = [];
      const itemAnalyses = [];
      let rowOverrides = 0;

      for (const item of originalBreakdown) {
        const normalized = normalizeItem(item, overrideMap);
        normalizedBreakdown.push(normalized.item);
        itemAnalyses.push(normalized.analysis);
        if (normalized.wasOverridden) {
          rowOverrides += 1;
        }
      }

      const rowToneAnalysis = summarizeRowToneAnalysis(itemAnalyses);
      if (rowToneAnalysis.status !== "approved") {
        remainingReviewRows += 1;
      }

      const breakdownChanged =
        JSON.stringify(originalBreakdown) !== JSON.stringify(normalizedBreakdown);
      const toneConfidenceChanged =
        Number(row.tone_confidence ?? 0) !== rowToneAnalysis.confidence;
      const toneStatusChanged =
        String(row.tone_status ?? "review") !== rowToneAnalysis.status;
      const toneAnalysisChanged =
        JSON.stringify(row.tone_analysis ?? null) !==
        JSON.stringify(rowToneAnalysis);

      if (
        !breakdownChanged &&
        !toneConfidenceChanged &&
        !toneStatusChanged &&
        !toneAnalysisChanged
      ) {
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
      overriddenItems += rowOverrides;
    }

    console.log(
      JSON.stringify(
        {
          grammarId: options.grammarId,
          dryRun: options.dryRun,
          scannedRows,
          updatedRows,
          overriddenItems,
          remainingReviewRows,
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
  console.error("Failed to apply manual breakdown tones:", error);
  process.exitCode = 1;
});
