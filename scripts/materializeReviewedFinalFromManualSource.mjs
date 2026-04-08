import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { validateLessonRomanizationRows } from "./lib/romanizationAudit.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
const SOURCE_DIR = path.join(SERVER_ROOT, "admin-data", "manual-source-lessons");
const GENERATED_DIR = path.join(SERVER_ROOT, "admin-data", "generated-candidates");

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

function containsThai(value) {
  return /[\u0E00-\u0E7F]/.test(repair(value));
}

function readGrammarTitles() {
  const regex = /{\s*id:\s*"([^"]+)"[\s\S]*?title:\s*"([^"]+)"/g;
  const titles = new Map();

  const grammarPaths = [
    path.join(
      "C:",
      "Users",
      "Lux",
      "thai-generator",
      "thaiApp-2",
      "src",
      "data",
      "grammar.ts",
    ),
    path.join(
      "C:",
      "Users",
      "Lux",
      "thai-generator",
      "thaiApp-2",
      "src",
      "data",
      "grammarB2.ts",
    ),
  ];

  for (const grammarPath of grammarPaths) {
    const source = fs.readFileSync(grammarPath, "utf8").replace(/^\uFEFF/, "");
    for (const match of source.matchAll(regex)) {
      titles.set(match[1], match[2]);
    }
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
  const sectionMatch = source.match(
    /export const GRAMMAR_STAGE_GROUPS:[\s\S]*?=\s*{([\s\S]*?)};\s*export const GRAMMAR_STAGE_BY_ID/,
  );
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

function validateRows(grammarId, rows) {
  if (!Array.isArray(rows) || rows.length !== 25) {
    throw new Error(`${grammarId}: source must contain exactly 25 rows`);
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
    if (!repair(row.thai) || !repair(row.english)) {
      throw new Error(`${grammarId}: row missing thai/english`);
    }
    if (!containsThai(row.thai)) {
      throw new Error(`${grammarId}: row is missing Thai text for "${repair(row.english)}"`);
    }
  }
}

function main() {
  const { lessons } = parseArgs();
  const grammarTitles = readGrammarTitles();
  const grammarStages = readGrammarStages();

  for (const grammarId of lessons) {
    const sourcePath = path.join(SOURCE_DIR, `${grammarId}-source.json`);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Missing source lesson for ${grammarId}`);
    }

    const source = JSON.parse(fs.readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, ""));
    const rows = Array.isArray(source) ? source : source?.rows;
    validateRows(grammarId, rows);

    const final = {
      lessonId: grammarId,
      stage: grammarStages.get(grammarId) || "",
      lessonTitle: grammarTitles.get(grammarId) || grammarId,
      rows: rows.map((row) => ({
        thai: repair(row.thai),
        english: repair(row.english),
      })),
    };

    fs.writeFileSync(
      path.join(GENERATED_DIR, `${grammarId}-final25-reviewed.json`),
      `${JSON.stringify(final, null, 2)}\n`,
      "utf8",
    );

    console.log(`Materialized reviewed final for ${grammarId}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
