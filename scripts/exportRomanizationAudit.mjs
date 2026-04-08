import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  DEFAULT_AUDIT_STAGES,
  ROMANIZATION_AUDIT_OUTPUT_ROOT,
  buildAggregateSummary,
  buildBreakdownInventory,
  buildManualReview,
  buildSentenceInventory,
  buildStageGrammarMetadata,
  fetchPublishedStageRows,
  writeJson,
} from "./lib/romanizationAudit.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(SERVER_ROOT, ".env"), quiet: true });

const STAGE_INDEX = new Map(DEFAULT_AUDIT_STAGES.map((stage, index) => [stage, index]));

function readFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0 || index >= args.length - 1) {
    return null;
  }
  return String(args[index + 1] ?? "").trim();
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

function normalizeStages(args) {
  const explicitStages = readFlag(args, "--stages");
  if (explicitStages) {
    return explicitStages
      .split(",")
      .map((stage) => stage.trim())
      .filter((stage) => STAGE_INDEX.has(stage));
  }

  const stageFrom = readFlag(args, "--stage-from");
  const stageTo = readFlag(args, "--stage-to");
  if (!stageFrom && !stageTo) {
    return DEFAULT_AUDIT_STAGES;
  }

  const fromIndex = STAGE_INDEX.get(stageFrom) ?? 0;
  const toIndex = STAGE_INDEX.get(stageTo) ?? DEFAULT_AUDIT_STAGES.length - 1;
  const lower = Math.min(fromIndex, toIndex);
  const upper = Math.max(fromIndex, toIndex);
  return DEFAULT_AUDIT_STAGES.filter((stage) => {
    const index = STAGE_INDEX.get(stage) ?? -1;
    return index >= lower && index <= upper;
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const stages = normalizeStages(args);
  const outputRoot = readFlag(args, "--output-root");

  return {
    stages,
    includeLegacy: hasFlag(args, "--include-legacy"),
    outputRoot: outputRoot
      ? path.resolve(SERVER_ROOT, outputRoot)
      : ROMANIZATION_AUDIT_OUTPUT_ROOT,
  };
}

function groupMetadataByStage(stageMetadata) {
  const grouped = new Map();
  for (const entry of stageMetadata) {
    if (!grouped.has(entry.stage)) {
      grouped.set(entry.stage, []);
    }
    grouped.get(entry.stage).push(entry);
  }
  return grouped;
}

async function main() {
  const { pool } = await import("../db.js");
  const options = parseArgs();
  const stageMetadata = buildStageGrammarMetadata(options.stages);
  const groupedMetadata = groupMetadataByStage(stageMetadata);
  const aggregateStages = [];

  try {
    for (const stage of options.stages) {
      const metadataForStage = groupedMetadata.get(stage) ?? [];
      const rows = await fetchPublishedStageRows(pool, metadataForStage, {
        includeLegacy: options.includeLegacy,
      });
      const breakdownInventory = buildBreakdownInventory(rows, stage);
      const sentenceInventory = buildSentenceInventory(rows, stage);
      const manualReview = buildManualReview(stage, breakdownInventory, sentenceInventory);
      const summary = {
        ...buildAggregateSummary(stage, breakdownInventory, sentenceInventory),
        lesson_count: metadataForStage.length,
        published_row_count: rows.length,
      };

      const stageDir = path.join(options.outputRoot, stage);
      fs.mkdirSync(stageDir, { recursive: true });
      writeJson(path.join(stageDir, "inventory-breakdown.json"), breakdownInventory);
      writeJson(path.join(stageDir, "inventory-sentence.json"), sentenceInventory);
      writeJson(path.join(stageDir, "manual-review.json"), manualReview);
      writeJson(path.join(stageDir, "aggregate-summary.json"), summary);

      aggregateStages.push(summary);
      console.log(
        `Exported romanization audit for ${stage}: ${breakdownInventory.length} breakdown items, ${sentenceInventory.length} sentence rows`,
      );
    }

    const aggregateSummary = {
      generated_at: new Date().toISOString(),
      stages: aggregateStages.map((stage) => stage.stage),
      totals: aggregateStages.reduce(
        (accumulator, stage) => {
          accumulator.lesson_count += Number(stage.lesson_count ?? 0);
          accumulator.published_row_count += Number(stage.published_row_count ?? 0);
          accumulator.breakdown_items += Number(stage.totals?.breakdown_items ?? 0);
          accumulator.flagged_breakdown_items += Number(stage.totals?.flagged_breakdown_items ?? 0);
          accumulator.sentence_rows += Number(stage.totals?.sentence_rows ?? 0);
          accumulator.flagged_sentence_rows += Number(stage.totals?.flagged_sentence_rows ?? 0);
          return accumulator;
        },
        {
          lesson_count: 0,
          published_row_count: 0,
          breakdown_items: 0,
          flagged_breakdown_items: 0,
          sentence_rows: 0,
          flagged_sentence_rows: 0,
        },
      ),
      per_stage: aggregateStages,
    };

    writeJson(path.join(options.outputRoot, "aggregate-summary.json"), aggregateSummary);
    console.log(`Wrote aggregate summary to ${path.join(options.outputRoot, "aggregate-summary.json")}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
