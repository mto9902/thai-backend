import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { validateLessonRomanizationRows } from "./lib/romanizationAudit.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(SERVER_ROOT, ".env"), quiet: true });

const { pool } = await import("../db.js");

const SOURCE_DIR = path.join(SERVER_ROOT, "admin-data", "manual-source-lessons");
const GENERATED_DIR = path.join(SERVER_ROOT, "admin-data", "generated-candidates");
const GRAMMAR_EXAMPLES_TABLE = "grammar_examples";
const GRAMMAR_LESSON_PRODUCTION_TABLE = "grammar_lesson_production";
const NOTE = "Manual content sweep staged 2026-04-07";
const DEFAULT_LESSONS = [
  "past-laew",
  "recent-past-phoeng",
  "duration-penwela-manan",
  "female-particles-kha-kha",
  "frequency-adverbs",
  "like-chorp",
  "knowledge-ruu-ruujak",
  "skill-pen",
  "permission-dai",
  "quantifiers-thuk-bang-lai",
  "sequence-conjunctions",
  "comparison-kwaa",
  "relative-thi",
  "reported-speech",
  "endurance-wai",
  "superlative",
  "must-tong",
  "should-khuan",
  "prefix-naa-adjective",
  "feelings-rusuek",
  "try-lawng",
  "resultative-ok-samret",
  "passive-tuuk",
  "conditionals",
  "change-state-khuen-long",
  "in-order-to-phuea",
];

function parseArgs() {
  const args = process.argv.slice(2);
  const lessonsIndex = args.indexOf("--lessons");
  const lessons =
    lessonsIndex >= 0 && lessonsIndex < args.length - 1
      ? args[lessonsIndex + 1]
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : DEFAULT_LESSONS;

  return {
    lessons,
  };
}

function repair(value) {
  return String(value ?? "").replace(/^\uFEFF/, "").replace(/\u0000/g, "").trim();
}

function containsThai(value) {
  return /[\u0E00-\u0E7F]/.test(repair(value));
}

function makeToneAnalysis() {
  return {
    status: "approved",
    confidence: 100,
    source: "manual-content-sweep",
    needsReview: false,
    reasons: [],
    unresolvedItemCount: 0,
    breakdown: [],
  };
}

function readSourceLesson(grammarId) {
  const sourcePath = path.join(SOURCE_DIR, `${grammarId}-source.json`);
  const finalPath = path.join(GENERATED_DIR, `${grammarId}-final25-reviewed.json`);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source lesson for ${grammarId}`);
  }
  if (!fs.existsSync(finalPath)) {
    throw new Error(`Missing final reviewed lesson for ${grammarId}`);
  }

  const source = JSON.parse(fs.readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, ""));
  const final = JSON.parse(fs.readFileSync(finalPath, "utf8").replace(/^\uFEFF/, ""));
  const rows = Array.isArray(source) ? source : source?.rows;
  if (!Array.isArray(rows) || rows.length !== 25) {
    throw new Error(`${grammarId}: source lesson must contain exactly 25 rows`);
  }

  return {
    stage: repair(final.stage),
    rows: rows.map((row) => ({
      thai: repair(row.thai),
      romanization: repair(row.romanization),
      english: repair(row.english),
      difficulty: repair(row.difficulty) || "medium",
      breakdown: Array.isArray(row.breakdown) ? row.breakdown : [],
    })),
  };
}

function validateLessonRows(grammarId, rows) {
  if (!Array.isArray(rows) || rows.length !== 25) {
    throw new Error(`${grammarId}: expected exactly 25 source rows`);
  }

  const romanizationValidation = validateLessonRomanizationRows(rows, {
    strictSentenceMatch: false,
  });
  if (romanizationValidation.errors.length > 0) {
    throw new Error(
      `${grammarId}: romanization validation failed\n${romanizationValidation.errors
        .slice(0, 10)
        .map((message) => `- ${message}`)
        .join("\n")}`,
    );
  }
  if (romanizationValidation.warnings.length > 0) {
    console.warn(
      `${grammarId}: romanization warnings\n${romanizationValidation.warnings
        .slice(0, 10)
        .map((message) => `- ${message}`)
        .join("\n")}`,
    );
  }

  for (const row of rows) {
    if (!row.thai || !row.english || !row.romanization) {
      throw new Error(`${grammarId}: incomplete row detected for "${row.thai || row.english}"`);
    }
    if (!containsThai(row.thai)) {
      throw new Error(`${grammarId}: row is missing Thai text for "${row.english}"`);
    }

    for (const item of row.breakdown) {
      if (!containsThai(item?.thai)) {
        throw new Error(
          `${grammarId}: breakdown item is missing Thai text for "${repair(item?.english)}" in "${row.english}"`,
        );
      }
      const tones = Array.isArray(item?.tones)
        ? item.tones.filter(Boolean)
        : item?.tone
          ? [item.tone]
          : [];
      if (tones.length === 0) {
        throw new Error(
          `${grammarId}: missing tones for breakdown item "${repair(item?.thai)}" in "${row.thai}"`,
        );
      }
    }
  }
}

async function stageLesson(client, grammarId, lesson) {
  const waveId = `${grammarId}-manual-${Date.now()}`;
  const sortResult = await client.query(
    `
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order
    FROM ${GRAMMAR_EXAMPLES_TABLE}
    WHERE grammar_id = $1
    `,
    [grammarId],
  );
  const baseSortOrder = Number(sortResult.rows[0]?.next_sort_order ?? 0);

  await client.query(
    `
    INSERT INTO ${GRAMMAR_LESSON_PRODUCTION_TABLE} (
      grammar_id,
      stage,
      final_target_count,
      first_pass_candidate_target,
      supplemental_candidate_batch_size,
      current_rewrite_wave_id,
      notes,
      last_generated_at,
      created_at,
      updated_at
    ) VALUES ($1, $2, 25, 40, 10, $3, $4, NOW(), NOW(), NOW())
    ON CONFLICT (grammar_id)
    DO UPDATE SET
      stage = EXCLUDED.stage,
      current_rewrite_wave_id = EXCLUDED.current_rewrite_wave_id,
      notes = EXCLUDED.notes,
      last_generated_at = NOW(),
      updated_at = NOW()
    `,
    [grammarId, lesson.stage, waveId, NOTE],
  );

  await client.query(
    `
    UPDATE ${GRAMMAR_EXAMPLES_TABLE}
    SET publish_state = 'retired', updated_at = NOW()
    WHERE grammar_id = $1
      AND publish_state = 'staged'
    `,
    [grammarId],
  );

  for (const [index, row] of lesson.rows.entries()) {
    await client.query(
      `
      INSERT INTO ${GRAMMAR_EXAMPLES_TABLE} (
        grammar_id,
        thai,
        romanization,
        english,
        breakdown,
        difficulty,
        sort_order,
        tone_confidence,
        tone_status,
        tone_analysis,
        review_status,
        review_note,
        publish_state,
        rewrite_wave_id,
        source_example_id,
        quality_flags,
        next_wave_decision,
        next_wave_audit_note,
        next_wave_audited_by_user_id,
        next_wave_audited_at,
        last_edited_by_user_id,
        last_edited_at,
        approved_by_user_id,
        approved_at
      ) VALUES (
        $1, $2, $3, $4, $5::jsonb, $6, $7, 100, 'approved', $8::jsonb,
        'approved', $9, 'staged', $10, NULL, $11::jsonb,
        NULL, NULL, NULL, NULL, NULL, NOW(), NULL, NOW()
      )
      `,
      [
        grammarId,
        row.thai,
        row.romanization,
        row.english,
        JSON.stringify(row.breakdown),
        row.difficulty,
        baseSortOrder + index,
        JSON.stringify(makeToneAnalysis()),
        NOTE,
        waveId,
        JSON.stringify(["new_gen"]),
      ],
    );
  }

  return waveId;
}

async function main() {
  const { lessons } = parseArgs();
  const client = await pool.connect();

  try {
    for (const grammarId of lessons) {
      const lesson = readSourceLesson(grammarId);
      validateLessonRows(grammarId, lesson.rows);
      await client.query("BEGIN");
      try {
        const waveId = await stageLesson(client, grammarId, lesson);
        await client.query("COMMIT");
        console.log(`Staged ${grammarId} as ${waveId} (${lesson.rows.length} rows)`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
