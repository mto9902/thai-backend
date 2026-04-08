import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(SERVER_ROOT, ".env"), quiet: true });

const { pool } = await import("../db.js");

const GENERATED_DIR = path.join(SERVER_ROOT, "admin-data", "generated-candidates");
const SOURCE_DIR = path.join(SERVER_ROOT, "admin-data", "manual-source-lessons");
const DEFAULT_LESSONS = ["skill-pen", "permission-dai"];

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

function normalizeBreakdown(breakdown) {
  if (!Array.isArray(breakdown)) {
    return [];
  }

  return breakdown.map((item) => {
    const next = { ...item };
    const tones = Array.isArray(next.tones)
      ? next.tones.map((tone) => repair(tone)).filter(Boolean)
      : next.tone
        ? [repair(next.tone)]
        : [];

    next.thai = repair(next.thai);
    next.english = repair(next.english);
    next.romanization = repair(next.romanization);

    if (tones.length > 0) {
      next.tones = tones;
      if (tones.length === 1) {
        next.tone = tones[0];
      } else {
        delete next.tone;
      }
    } else {
      next.tones = [];
      delete next.tone;
    }

    if (Array.isArray(next.displayThaiSegments)) {
      next.displayThaiSegments = next.displayThaiSegments.map((segment) => repair(segment));
    }

    return next;
  });
}

function readExistingFinal(grammarId) {
  const candidates = [
    path.join(GENERATED_DIR, `${grammarId}-final25-reviewed.json`),
    path.join(GENERATED_DIR, `${grammarId}-kimi-final25-reviewed.json`),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, "utf8").replace(/^\uFEFF/, ""));
    }
  }

  return null;
}

async function materializeLesson(grammarId) {
  const rowsResult = await pool.query(
    `
    SELECT thai, romanization, english, breakdown, difficulty
    FROM grammar_examples
    WHERE grammar_id = $1
      AND publish_state = 'published'
    ORDER BY sort_order ASC, id ASC
    `,
    [grammarId],
  );

  if (rowsResult.rows.length !== 25) {
    throw new Error(`${grammarId}: expected 25 published rows, found ${rowsResult.rows.length}`);
  }

  const productionResult = await pool.query(
    `
    SELECT stage
    FROM grammar_lesson_production
    WHERE grammar_id = $1
    `,
    [grammarId],
  );

  const existingFinal = readExistingFinal(grammarId);
  const stage = repair(existingFinal?.stage) || repair(productionResult.rows[0]?.stage);
  const lessonTitle = repair(existingFinal?.lessonTitle) || grammarId;

  const sourceRows = rowsResult.rows.map((row) => ({
    thai: repair(row.thai),
    romanization: repair(row.romanization),
    english: repair(row.english),
    difficulty: repair(row.difficulty) || "medium",
    breakdown: normalizeBreakdown(row.breakdown),
  }));

  for (const row of sourceRows) {
    for (const item of row.breakdown) {
      const tones = Array.isArray(item?.tones)
        ? item.tones.filter(Boolean)
        : item?.tone
          ? [item.tone]
          : [];
      if (tones.length === 0) {
        throw new Error(
          `${grammarId}: published row still missing tones for "${repair(item?.thai)}" in "${row.thai}"`,
        );
      }
    }
  }

  const finalRows = sourceRows.map((row) => ({
    thai: row.thai,
    english: row.english,
  }));

  fs.writeFileSync(
    path.join(SOURCE_DIR, `${grammarId}-source.json`),
    `${JSON.stringify({ grammarId, rows: sourceRows }, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(GENERATED_DIR, `${grammarId}-final25-reviewed.json`),
    `${JSON.stringify({ lessonId: grammarId, stage, lessonTitle, rows: finalRows }, null, 2)}\n`,
    "utf8",
  );

  console.log(`Materialized ${grammarId} from published DB rows`);
}

async function main() {
  const { lessons } = parseArgs();
  for (const grammarId of lessons) {
    await materializeLesson(grammarId);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
