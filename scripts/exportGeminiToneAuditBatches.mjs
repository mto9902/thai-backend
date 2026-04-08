import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(SERVER_ROOT, ".env"), quiet: true });

const DEFAULT_STAGE = "A1.1";
const DEFAULT_BATCH_SIZE = 60;
const DEFAULT_OUTPUT_ROOT = path.join(
  SERVER_ROOT,
  "admin-data",
  "qa-exports",
  "gemini-tone-audits",
);

function readFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0 || index >= args.length - 1) {
    return null;
  }
  return args[index + 1];
}

function parseArgs() {
  const args = process.argv.slice(2);
  const stage = String(readFlag(args, "--stage") || DEFAULT_STAGE).trim();
  const batchSize = Number.parseInt(
    readFlag(args, "--batch-size") || String(DEFAULT_BATCH_SIZE),
    10,
  );
  const outputDir =
    readFlag(args, "--output-dir") ||
    path.join(DEFAULT_OUTPUT_ROOT, stage.replace(/[^\w.-]+/g, "_"));

  return {
    stage,
    batchSize: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : DEFAULT_BATCH_SIZE,
    outputDir: path.resolve(SERVER_ROOT, outputDir),
  };
}

function readGrammarOrderSeed() {
  const seedPath = path.join(SERVER_ROOT, "admin-data", "grammar-order-seed.json");
  return JSON.parse(fs.readFileSync(seedPath, "utf8"));
}

function loadLessonsForStage(stage) {
  const seed = readGrammarOrderSeed();
  return Object.entries(seed)
    .filter(([, entry]) => String(entry?.stage ?? "").trim() === stage)
    .map(([lessonId, entry]) => ({
      lessonId,
      lessonOrder: Number(entry?.lessonOrder ?? 9999),
    }))
    .sort(
      (left, right) =>
        left.lessonOrder - right.lessonOrder ||
        left.lessonId.localeCompare(right.lessonId),
    );
}

function loadLessonRows(lessonId) {
  const sourcePath = path.join(
    SERVER_ROOT,
    "admin-data",
    "manual-source-lessons",
    `${lessonId}-source.json`,
  );
  const parsed = JSON.parse(
    fs.readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, ""),
  );
  const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
  if (!Array.isArray(rows)) {
    throw new Error(`Lesson ${lessonId} is missing rows`);
  }
  return rows;
}

function currentTones(item) {
  if (Array.isArray(item?.tones)) {
    return item.tones.map((tone) => String(tone ?? "").trim()).filter(Boolean);
  }
  if (typeof item?.tone === "string" && item.tone.trim()) {
    return [item.tone.trim()];
  }
  return [];
}

function dedupeStageItems(stage) {
  const lessons = loadLessonsForStage(stage);
  const groups = new Map();
  let sentenceCount = 0;
  let breakdownItemCount = 0;

  for (const lesson of lessons) {
    const rows = loadLessonRows(lesson.lessonId);
    sentenceCount += rows.length;

    rows.forEach((row, rowIndex) => {
      const sentenceThai = String(row.thai ?? "").trim();
      const sentenceEnglish = String(row.english ?? "").trim();
      const breakdown = Array.isArray(row.breakdown) ? row.breakdown : [];

      breakdown.forEach((item) => {
        breakdownItemCount += 1;
        const thai = String(item?.thai ?? "").trim();
        const romanization = String(item?.romanization ?? "").trim();
        const english = String(item?.english ?? "").trim();
        const tones = currentTones(item);
        const key = JSON.stringify([thai, romanization]);

        if (!groups.has(key)) {
          groups.set(key, {
            thai,
            romanization,
            englishGlosses: new Set(),
            toneVariants: new Map(),
            occurrences: [],
          });
        }

        const group = groups.get(key);
        if (english) {
          group.englishGlosses.add(english);
        }

        const toneKey = JSON.stringify(tones);
        group.toneVariants.set(
          toneKey,
          (group.toneVariants.get(toneKey) ?? 0) + 1,
        );
        group.occurrences.push({
          lesson_id: lesson.lessonId,
          row: rowIndex + 1,
          sentence_thai: sentenceThai,
          sentence_english: sentenceEnglish,
          current_tones: tones,
          english,
        });
      });
    });
  }

  const items = [...groups.values()].map((group, index) => {
    const toneVariants = [...group.toneVariants.entries()]
      .map(([toneKey, count]) => ({
        tones: JSON.parse(toneKey),
        count,
      }))
      .sort((left, right) => right.count - left.count);

    return {
      item_id: `${stage.toLowerCase().replace(/[^\w]+/g, "")}-${String(index + 1).padStart(4, "0")}`,
      thai: group.thai,
      romanization: group.romanization,
      english_glosses: [...group.englishGlosses].sort(),
      current_tones_variants: toneVariants.map((variant) => variant.tones),
      occurrence_count: group.occurrences.length,
      occurrence_summary: toneVariants.map((variant) => ({
        tones: variant.tones,
        count: variant.count,
      })),
      example_occurrences: group.occurrences.slice(0, 5),
    };
  });

  items.sort(
    (left, right) =>
      right.occurrence_count - left.occurrence_count ||
      left.thai.localeCompare(right.thai, "th"),
  );

  return {
    lessons,
    sentenceCount,
    breakdownItemCount,
    uniqueItemCount: items.length,
    items,
  };
}

function chunkItems(items, batchSize) {
  const batches = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }
  return batches;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function main() {
  const { stage, batchSize, outputDir } = parseArgs();
  const { lessons, sentenceCount, breakdownItemCount, uniqueItemCount, items } =
    dedupeStageItems(stage);
  const batches = chunkItems(items, batchSize);

  const manifest = {
    stage,
    batchSize,
    lessonCount: lessons.length,
    sentenceCount,
    breakdownItemCount,
    uniqueItemCount,
    batchCount: batches.length,
    lessons,
    generatedAt: new Date().toISOString(),
  };

  writeJson(path.join(outputDir, "manifest.json"), manifest);
  writeJson(path.join(outputDir, "inventory.json"), items);

  batches.forEach((batchItems, batchIndex) => {
    const batchId = `batch-${String(batchIndex + 1).padStart(3, "0")}`;
    writeJson(path.join(outputDir, "batches", `${batchId}.json`), {
      stage,
      batch_id: batchId,
      batch_index: batchIndex + 1,
      batch_count: batches.length,
      item_count: batchItems.length,
      items: batchItems,
    });
  });

  console.log(
    JSON.stringify(
      {
        stage,
        outputDir,
        lessonCount: lessons.length,
        sentenceCount,
        breakdownItemCount,
        uniqueItemCount,
        batchCount: batches.length,
        batchSize,
      },
      null,
      2,
    ),
  );
}

main();
