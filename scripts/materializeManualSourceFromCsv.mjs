import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
const GRAMMAR_DIR = path.join(SERVER_ROOT, "grammar");
const GENERATED_DIR = path.join(SERVER_ROOT, "admin-data", "generated-candidates");
const SOURCE_DIR = path.join(SERVER_ROOT, "admin-data", "manual-source-lessons");

const DEFAULT_LESSONS = ["just-in-time-pho-di"];

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
    skipValidation: args.includes("--skip-validation"),
  };
}

function repair(value) {
  return String(value ?? "").replace(/^\uFEFF/, "").replace(/\u0000/g, "").trim();
}

function readGrammarTitles() {
  const grammarPath = path.join(
    "C:",
    "Users",
    "Lux",
    "thai-generator",
    "thaiApp-2",
    "src",
    "data",
    "grammar.ts",
  );
  const source = fs.readFileSync(grammarPath, "utf8").replace(/^\uFEFF/, "");
  const regex = /{\s*id:\s*"([^"]+)"[\s\S]*?title:\s*"([^"]+)"/g;
  const titles = new Map();
  for (const match of source.matchAll(regex)) {
    titles.set(match[1], match[2]);
  }
  return titles;
}

function readGrammarStages() {
  const stagesPath = path.join(
    "C:",
    "Users",
    "Lux",
    "thai-generator",
    "thaiApp-2",
    "src",
    "data",
    "grammarStages.ts",
  );
  const source = fs.readFileSync(stagesPath, "utf8").replace(/^\uFEFF/, "");
  const sectionMatch = source.match(/export const GRAMMAR_STAGE_GROUPS:[\s\S]*?=\s*{([\s\S]*?)};\s*export const GRAMMAR_STAGE_BY_ID/);
  if (!sectionMatch) {
    return new Map();
  }

  const section = sectionMatch[1];
  const stageRegex = /"([^"]+)":\s*\[([\s\S]*?)\],/g;
  const stageMap = new Map();
  for (const stageMatch of section.matchAll(stageRegex)) {
    const stage = stageMatch[1];
    const items = [...stageMatch[2].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    for (const item of items) {
      stageMap.set(item, stage);
    }
  }
  return stageMap;
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

function readCsvRows(grammarId) {
  const csvPath = path.join(GRAMMAR_DIR, `${grammarId}.csv`);
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Missing CSV for ${grammarId}`);
  }

  const raw = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    throw new Error(`${grammarId}: CSV is empty`);
  }

  const headers = parseCsvLine(lines[0]).map((value) => repair(value));
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });

  return rows;
}

function normalizeBreakdown(raw) {
  let parsed = [];
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.map((item) => {
    const next = { ...item };
    next.thai = repair(next.thai);
    next.english = repair(next.english);
    next.romanization = repair(next.romanization);
    const tones = Array.isArray(next.tones)
      ? next.tones.map((tone) => repair(tone)).filter(Boolean)
      : next.tone
        ? [repair(next.tone)]
        : [];
    next.tones = tones;
    if (tones.length === 1) {
      next.tone = tones[0];
    } else {
      delete next.tone;
    }
    if (Array.isArray(next.displayThaiSegments)) {
      next.displayThaiSegments = next.displayThaiSegments.map((segment) => repair(segment));
    }
    if (!next.displayThaiSegments?.length) {
      delete next.displayThaiSegments;
    }
    if (!next.grammar) {
      delete next.grammar;
    }
    return next;
  });
}

function validateRows(grammarId, rows) {
  if (rows.length !== 25) {
    throw new Error(`${grammarId}: expected exactly 25 rows, found ${rows.length}`);
  }

  for (const row of rows) {
    if (!row.thai || !row.english || !row.romanization) {
      throw new Error(`${grammarId}: row is missing thai/english/romanization`);
    }

    if (!Array.isArray(row.breakdown) || row.breakdown.length === 0) {
      throw new Error(`${grammarId}: row "${row.thai}" is missing breakdown`);
    }

    for (const item of row.breakdown) {
      if (!Array.isArray(item.tones) || item.tones.length === 0) {
        throw new Error(`${grammarId}: "${item.thai}" in "${row.thai}" is missing tones`);
      }
    }
  }
}

function materializeLesson(grammarId, grammarTitles, grammarStages, skipValidation) {
  const csvRows = readCsvRows(grammarId);
  const lessonTitle = grammarTitles.get(grammarId) || grammarId;
  const stage = grammarStages.get(grammarId) || "";

  const sourceRows = csvRows.map((row) => ({
    thai: repair(row.thai),
    romanization: repair(row.romanization),
    english: repair(row.english),
    difficulty: repair(row.difficulty) || "medium",
    breakdown: normalizeBreakdown(row.breakdown),
  }));

  if (!skipValidation) {
    validateRows(grammarId, sourceRows);
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
    `${JSON.stringify(
      {
        lessonId: grammarId,
        stage,
        lessonTitle,
        rows: finalRows,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`Materialized ${grammarId} from CSV`);
}

function main() {
  const { lessons, skipValidation } = parseArgs();
  const grammarTitles = readGrammarTitles();
  const grammarStages = readGrammarStages();
  for (const grammarId of lessons) {
    materializeLesson(grammarId, grammarTitles, grammarStages, skipValidation);
  }
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
