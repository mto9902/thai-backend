import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");

const DEFAULT_STAGE = "A1.2";

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
  const reviewPath =
    readFlag(args, "--review") ||
    path.join(
      SERVER_ROOT,
      "admin-data",
      "qa-exports",
      "gemini-tone-audits",
      stage,
      "manual-standard-review.json",
    );

  return {
    stage,
    reviewPath,
    dryRun: args.includes("--dry-run"),
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function loadStageLessons(stage) {
  const seed = readJson(path.join(SERVER_ROOT, "admin-data", "grammar-order-seed.json"));
  return Object.entries(seed)
    .filter(([, entry]) => String(entry?.stage ?? "").trim() === stage)
    .map(([lessonId, entry]) => ({
      lessonId,
      lessonOrder: Number(entry?.lessonOrder ?? 9999),
    }))
    .sort(
      (left, right) =>
        left.lessonOrder - right.lessonOrder || left.lessonId.localeCompare(right.lessonId),
    );
}

function buildAcceptedMap(stage, review) {
  const inventory = readJson(
    path.join(
      SERVER_ROOT,
      "admin-data",
      "qa-exports",
      "gemini-tone-audits",
      stage,
      "inventory.json",
    ),
  );
  const inventoryById = new Map(inventory.map((item) => [item.item_id, item]));
  const accepted = new Map();

  for (const [itemId, decision] of Object.entries(review.decisions || {})) {
    if (!["accept", "accept_modified"].includes(String(decision?.decision ?? ""))) {
      continue;
    }
    const inventoryItem = inventoryById.get(itemId);
    if (!inventoryItem) {
      throw new Error(`Missing inventory item for decision ${itemId}`);
    }
    if (!Array.isArray(decision.finalTones) || decision.finalTones.length === 0) {
      throw new Error(`Decision ${itemId} is missing finalTones`);
    }
    const key = JSON.stringify([inventoryItem.thai, inventoryItem.romanization]);
    accepted.set(key, {
      itemId,
      thai: inventoryItem.thai,
      romanization: inventoryItem.romanization,
      finalTones: decision.finalTones,
      note: decision.note || null,
    });
  }

  return accepted;
}

function main() {
  const { stage, reviewPath, dryRun } = parseArgs();
  const review = readJson(reviewPath);
  const acceptedMap = buildAcceptedMap(stage, review);
  const lessons = loadStageLessons(stage);
  const sourceDir = path.join(SERVER_ROOT, "admin-data", "manual-source-lessons");

  const changedLessons = [];
  let changedItems = 0;

  for (const lesson of lessons) {
    const filePath = path.join(sourceDir, `${lesson.lessonId}-source.json`);
    const parsed = readJson(filePath);
    const rows = Array.isArray(parsed) ? parsed : parsed.rows;
    let lessonChanged = false;

    for (const row of rows) {
      for (const item of row.breakdown || []) {
        const key = JSON.stringify([
          String(item?.thai ?? ""),
          String(item?.romanization ?? ""),
        ]);
        const accepted = acceptedMap.get(key);
        if (!accepted) {
          continue;
        }
        const currentTones = Array.isArray(item?.tones)
          ? item.tones.map((tone) => String(tone))
          : item?.tone
            ? [String(item.tone)]
            : [];
        const desired = accepted.finalTones.map((tone) => String(tone));
        if (JSON.stringify(currentTones) === JSON.stringify(desired)) {
          continue;
        }
        item.tones = desired;
        delete item.tone;
        changedItems += 1;
        lessonChanged = true;
      }
    }

    if (lessonChanged) {
      changedLessons.push(lesson.lessonId);
      if (!dryRun) {
        writeJson(filePath, parsed);
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        stage,
        dryRun,
        acceptedDecisionCount: acceptedMap.size,
        changedLessonCount: changedLessons.length,
        changedLessons,
        changedItems,
      },
      null,
      2,
    ),
  );
}

main();
