import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { analyzeBreakdownTones } from "../breakdownTone.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
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

  return { lessons };
}

function repair(value) {
  return String(value ?? "").replace(/^\uFEFF/, "").replace(/\u0000/g, "").trim();
}

function normalizeItem(item) {
  const thai = repair(item?.thai);
  const english = repair(item?.english);
  const romanization = repair(item?.romanization);
  const providedTones = Array.isArray(item?.tones)
    ? item.tones.map((tone) => repair(tone)).filter(Boolean)
    : item?.tone
      ? [repair(item.tone)]
      : [];

  const analysis = analyzeBreakdownTones({
    thai,
    romanization,
    providedTones,
  });

  const normalized = {
    thai,
    english,
    ...(romanization ? { romanization } : {}),
    ...(item?.grammar === true ? { grammar: true } : {}),
    ...(analysis.tones.length > 0 ? { tones: analysis.tones } : {}),
    ...(analysis.tones.length === 1 ? { tone: analysis.tones[0] } : {}),
  };

  if (Array.isArray(item?.displayThaiSegments) && item.displayThaiSegments.length > 0) {
    normalized.displayThaiSegments = item.displayThaiSegments.map((segment) => repair(segment));
  }

  return normalized;
}

function normalizeLesson(grammarId) {
  const sourcePath = path.join(SOURCE_DIR, `${grammarId}-source.json`);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source lesson for ${grammarId}`);
  }

  const source = JSON.parse(fs.readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, ""));
  const rows = Array.isArray(source) ? source : source?.rows;
  if (!Array.isArray(rows)) {
    throw new Error(`${grammarId}: invalid source rows`);
  }

  const normalizedRows = rows.map((row) => ({
    thai: repair(row.thai),
    romanization: repair(row.romanization),
    english: repair(row.english),
    difficulty: repair(row.difficulty) || "medium",
    breakdown: Array.isArray(row.breakdown) ? row.breakdown.map(normalizeItem) : [],
  }));

  fs.writeFileSync(
    sourcePath,
    `${JSON.stringify({ grammarId, rows: normalizedRows }, null, 2)}\n`,
    "utf8",
  );

  console.log(`Normalized manual-source breakdowns for ${grammarId}`);
}

function main() {
  const { lessons } = parseArgs();
  for (const grammarId of lessons) {
    normalizeLesson(grammarId);
  }
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
