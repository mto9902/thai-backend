import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(SERVER_ROOT, ".env"), quiet: true });

const { pool } = await import("../db.js");
const GENERATED_DIR = path.join(SERVER_ROOT, "admin-data", "generated-candidates");
const SOURCE_DIR = path.join(SERVER_ROOT, "admin-data", "manual-source-lessons");
const GRAMMAR_DIR = path.join(SERVER_ROOT, "grammar");

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

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function repair(value) {
  return String(value ?? "").replace(/^\uFEFF/, "").replace(/\u0000/g, "").trim();
}

function findReviewedFinalPath(grammarId) {
  const candidates = [
    path.join(GENERATED_DIR, `${grammarId}-final25-reviewed.json`),
    path.join(GENERATED_DIR, `${grammarId}-kimi-final25-reviewed.json`),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`No reviewed final file found for ${grammarId}`);
}

function readReviewedFinal(grammarId) {
  const filePath = findReviewedFinalPath(grammarId);
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.rows) || parsed.rows.length !== 25) {
    throw new Error(`${grammarId} reviewed final must contain exactly 25 rows`);
  }

  return {
    filePath,
    final: {
      ...parsed,
      lessonId: parsed.lessonId ?? grammarId,
      rows: parsed.rows.map((row) => ({
        thai: repair(row.thai),
        english: repair(row.english),
      })),
    },
  };
}

function readCsvRows(grammarId) {
  const filePath = path.join(GRAMMAR_DIR, `${grammarId}.csv`);
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        try {
          const breakdown = JSON.parse(row.breakdown ?? "[]");
          rows.push({
            thai: repair(row.thai),
            romanization: repair(row.romanization),
            english: repair(row.english),
            difficulty: repair(row.difficulty) || "medium",
            breakdown: normalizeBreakdown(breakdown),
          });
        } catch (error) {
          reject(error);
        }
      })
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
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

function buildIndexes(rows) {
  const byThai = new Map();
  const byThaiEnglish = new Map();

  for (const row of rows) {
    const thai = row.thai;
    const thaiEnglishKey = `${row.thai}\u0001${row.english}`;

    if (!byThai.has(thai)) {
      byThai.set(thai, []);
    }
    byThai.get(thai).push(row);

    if (!byThaiEnglish.has(thaiEnglishKey)) {
      byThaiEnglish.set(thaiEnglishKey, []);
    }
    byThaiEnglish.get(thaiEnglishKey).push(row);
  }

  return { byThai, byThaiEnglish };
}

async function readDbRows(grammarId) {
  const production = await pool.query(
    `
    SELECT current_rewrite_wave_id
    FROM grammar_lesson_production
    WHERE grammar_id = $1
    `,
    [grammarId],
  );
  const currentWaveId = production.rows[0]?.current_rewrite_wave_id ?? null;

  const result = await pool.query(
    `
    SELECT thai, romanization, english, breakdown, difficulty
    FROM grammar_examples
    WHERE grammar_id = $1
      AND (
        publish_state = 'published'
        OR (
          publish_state = 'staged'
          AND ($2::text IS NOT NULL AND rewrite_wave_id = $2)
        )
      )
    ORDER BY sort_order ASC, id ASC
    `,
    [grammarId, currentWaveId],
  );

  return result.rows.map((row) => ({
    thai: repair(row.thai),
    romanization: repair(row.romanization),
    english: repair(row.english),
    difficulty: repair(row.difficulty) || "medium",
    breakdown: normalizeBreakdown(row.breakdown),
  }));
}

function mergeCandidateRows(...rowSets) {
  const merged = [];
  const seen = new Set();

  for (const rows of rowSets) {
    for (const row of rows) {
      const key = `${row.thai}\u0001${row.english}\u0001${row.romanization}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(row);
    }
  }

  return merged;
}

function matchFinalRow(row, indexes, grammarId) {
  const thaiEnglishKey = `${row.thai}\u0001${row.english}`;
  const exact = indexes.byThaiEnglish.get(thaiEnglishKey) ?? [];
  if (exact.length === 1) {
    return exact[0];
  }
  if (exact.length > 1) {
    throw new Error(`${grammarId}: ambiguous exact row match for "${row.thai}"`);
  }

  const thaiOnly = indexes.byThai.get(row.thai) ?? [];
  if (thaiOnly.length === 1) {
    return thaiOnly[0];
  }
  if (thaiOnly.length > 1) {
    throw new Error(
      `${grammarId}: multiple CSV rows share Thai "${row.thai}", and no exact Thai+English match was found`,
    );
  }

  throw new Error(`${grammarId}: no CSV row found for "${row.thai}"`);
}

function validateSourceRows(grammarId, rows) {
  if (rows.length !== 25) {
    throw new Error(`${grammarId}: expected 25 source rows, found ${rows.length}`);
  }

  for (const row of rows) {
    if (!row.thai || !row.english || !row.romanization) {
      throw new Error(`${grammarId}: incomplete row detected for "${row.thai || row.english}"`);
    }

    for (const item of row.breakdown) {
      if (!item.thai || !item.english || !item.romanization) {
        throw new Error(`${grammarId}: incomplete breakdown item in "${row.thai}"`);
      }
      if (!Array.isArray(item.tones) || item.tones.length === 0) {
        throw new Error(`${grammarId}: missing tones for breakdown item "${item.thai}"`);
      }
    }
  }
}

function writeArtifacts(grammarId, finalLesson, sourceRows) {
  const canonicalFinalPath = path.join(GENERATED_DIR, `${grammarId}-final25-reviewed.json`);
  const sourcePath = path.join(SOURCE_DIR, `${grammarId}-source.json`);

  const finalPayload = {
    ...finalLesson,
    lessonId: grammarId,
    rows: finalLesson.rows.map((row) => ({
      thai: row.thai,
      english: row.english,
    })),
  };

  const sourcePayload = {
    grammarId,
    rows: sourceRows,
  };

  fs.writeFileSync(canonicalFinalPath, `${JSON.stringify(finalPayload, null, 2)}\n`, "utf8");
  fs.writeFileSync(sourcePath, `${JSON.stringify(sourcePayload, null, 2)}\n`, "utf8");
}

async function materializeLesson(grammarId) {
  const { final } = readReviewedFinal(grammarId);
  const csvRows = await readCsvRows(grammarId);
  const dbRows = await readDbRows(grammarId);
  const indexes = buildIndexes(mergeCandidateRows(csvRows, dbRows));

  const sourceRows = final.rows.map((row) => {
    const matched = matchFinalRow(row, indexes, grammarId);
    return {
      thai: matched.thai,
      romanization: matched.romanization,
      english: matched.english,
      difficulty: matched.difficulty || "medium",
      breakdown: matched.breakdown,
    };
  });

  validateSourceRows(grammarId, sourceRows);
  writeArtifacts(grammarId, final, sourceRows);
  console.log(`Materialized ${grammarId}: 25 reviewed rows -> source + canonical final`);
}

async function main() {
  const { lessons } = parseArgs();
  ensureDir(GENERATED_DIR);
  ensureDir(SOURCE_DIR);

  try {
    for (const grammarId of lessons) {
      await materializeLesson(grammarId);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
