import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { analyzeBreakdownTones } from "../breakdownTone.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
const SOURCE_DIR = path.join(SERVER_ROOT, "admin-data", "manual-source-lessons");

function parseArgs() {
  const args = process.argv.slice(2);
  const lessonsIndex = args.indexOf("--lessons");
  if (lessonsIndex < 0 || lessonsIndex >= args.length - 1) {
    throw new Error("Usage: node scripts/fillManualSourceMissingTones.mjs --lessons lesson-a,lesson-b");
  }

  return args[lessonsIndex + 1]
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeBreakdownItem(item) {
  const nextItem = { ...item };
  const providedTones = Array.isArray(nextItem.tones)
    ? nextItem.tones.filter(Boolean)
    : nextItem.tone
      ? [nextItem.tone]
      : [];

  if (providedTones.length > 0) {
    return { item: nextItem, updated: false };
  }

  const analysis = analyzeBreakdownTones({
    thai: nextItem.thai,
    romanization: nextItem.romanization,
    providedTones: [],
  });

  if (!Array.isArray(analysis.tones) || analysis.tones.length === 0) {
    return { item: nextItem, updated: false };
  }

  nextItem.tones = analysis.tones;
  if (analysis.tones.length === 1) {
    nextItem.tone = analysis.tones[0];
  } else {
    delete nextItem.tone;
  }

  return { item: nextItem, updated: true };
}

function main() {
  const lessons = parseArgs();

  for (const grammarId of lessons) {
    const filePath = path.join(SOURCE_DIR, `${grammarId}-source.json`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing manual source file for ${grammarId}`);
    }

    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
    const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
    if (!Array.isArray(rows)) {
      throw new Error(`${grammarId}: source file has no rows array`);
    }

    let updatedCount = 0;
    const nextRows = rows.map((row) => {
      const breakdown = Array.isArray(row.breakdown) ? row.breakdown : [];
      const nextBreakdown = breakdown.map((item) => {
        const normalized = normalizeBreakdownItem(item);
        if (normalized.updated) {
          updatedCount += 1;
        }
        return normalized.item;
      });

      return {
        ...row,
        breakdown: nextBreakdown,
      };
    });

    const nextPayload = Array.isArray(parsed)
      ? nextRows
      : {
          ...parsed,
          rows: nextRows,
        };

    fs.writeFileSync(filePath, `${JSON.stringify(nextPayload, null, 2)}\n`, "utf8");
    console.log(`${grammarId}: filled tones for ${updatedCount} breakdown item(s)`);
  }
}

main();
