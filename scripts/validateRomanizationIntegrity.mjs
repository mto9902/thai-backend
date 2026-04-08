import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  DEFAULT_AUDIT_STAGES,
  MANUAL_SOURCE_DIR,
  ROMANIZATION_AUDIT_OUTPUT_ROOT,
  buildBreakdownInventory,
  buildSentenceInventory,
  buildStageGrammarMetadata,
  fetchPublishedStageRows,
  validateLessonRomanizationRows,
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
  return {
    stages: normalizeStages(args),
    strictSentenceMatch: hasFlag(args, "--strict-sentence-match"),
    includeLegacy: hasFlag(args, "--include-legacy"),
    outputPath: readFlag(args, "--output")
      ? path.resolve(SERVER_ROOT, readFlag(args, "--output"))
      : path.join(ROMANIZATION_AUDIT_OUTPUT_ROOT, "validation-summary.json"),
  };
}

function readSourceRows(sourcePath) {
  const parsed = JSON.parse(fs.readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, ""));
  const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
  return Array.isArray(rows) ? rows : [];
}

function groupByGrammar(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.grammarId)) {
      grouped.set(row.grammarId, []);
    }
    grouped.get(row.grammarId).push({
      thai: row.thai,
      romanization: row.romanization,
      english: row.english,
      breakdown: row.breakdown,
    });
  }
  return grouped;
}

function summarizeIssueCounts(issues) {
  return issues.reduce(
    (accumulator, issue) => {
      accumulator[issue.kind] = (accumulator[issue.kind] || 0) + 1;
      return accumulator;
    },
    {},
  );
}

async function main() {
  const { pool } = await import("../db.js");
  const options = parseArgs();
  const stageMetadata = buildStageGrammarMetadata(options.stages);
  const metadataByStage = stageMetadata.reduce((map, item) => {
    if (!map.has(item.stage)) {
      map.set(item.stage, []);
    }
    map.get(item.stage).push(item);
    return map;
  }, new Map());

  const validation = {
    generated_at: new Date().toISOString(),
    stages: {},
    totals: {
      source_errors: 0,
      source_warnings: 0,
      published_errors: 0,
      published_warnings: 0,
    },
  };

  try {
    for (const stage of options.stages) {
      const metadataForStage = metadataByStage.get(stage) ?? [];
      const sourceIssues = [];
      const publishedIssues = [];

      for (const lesson of metadataForStage) {
        const sourcePath = path.join(MANUAL_SOURCE_DIR, `${lesson.grammarId}-source.json`);
        if (!fs.existsSync(sourcePath)) {
          sourceIssues.push({
            kind: "error",
            grammar_id: lesson.grammarId,
            source_path: sourcePath,
            message: "missing source lesson file",
          });
          continue;
        }

        const rows = readSourceRows(sourcePath);
        const result = validateLessonRomanizationRows(rows, {
          strictSentenceMatch: options.strictSentenceMatch,
        });
        for (const message of result.errors) {
          sourceIssues.push({
            kind: "error",
            grammar_id: lesson.grammarId,
            source_path: sourcePath,
            message,
          });
        }
        for (const message of result.warnings) {
          sourceIssues.push({
            kind: "warning",
            grammar_id: lesson.grammarId,
            source_path: sourcePath,
            message,
          });
        }
      }

      const publishedRows = await fetchPublishedStageRows(pool, metadataForStage, {
        includeLegacy: options.includeLegacy,
      });
      const publishedByGrammar = groupByGrammar(publishedRows);
      for (const lesson of metadataForStage) {
        const rows = publishedByGrammar.get(lesson.grammarId) ?? [];
        if (rows.length === 0) {
          publishedIssues.push({
            kind: "error",
            grammar_id: lesson.grammarId,
            message: "missing published approved rows",
          });
          continue;
        }

        const result = validateLessonRomanizationRows(rows, {
          strictSentenceMatch: options.strictSentenceMatch,
        });
        for (const message of result.errors) {
          publishedIssues.push({
            kind: "error",
            grammar_id: lesson.grammarId,
            message,
          });
        }
        for (const message of result.warnings) {
          publishedIssues.push({
            kind: "warning",
            grammar_id: lesson.grammarId,
            message,
          });
        }
      }

      const breakdownInventory = buildBreakdownInventory(publishedRows, stage);
      const sentenceInventory = buildSentenceInventory(publishedRows, stage);

      validation.stages[stage] = {
        lesson_count: metadataForStage.length,
        published_row_count: publishedRows.length,
        source_issue_counts: summarizeIssueCounts(sourceIssues),
        published_issue_counts: summarizeIssueCounts(publishedIssues),
        source_issues: sourceIssues,
        published_issues: publishedIssues,
        oversized_chunk_candidates: sentenceInventory.filter((row) =>
          row.system_flags.includes("oversized_chunk_candidate"),
        ).length,
        flagged_breakdown_items: breakdownInventory.filter((item) => item.system_flags.length > 0)
          .length,
        flagged_sentence_rows: sentenceInventory.filter((row) => row.system_flags.length > 0)
          .length,
      };

      validation.totals.source_errors += sourceIssues.filter((issue) => issue.kind === "error").length;
      validation.totals.source_warnings += sourceIssues.filter((issue) => issue.kind === "warning").length;
      validation.totals.published_errors += publishedIssues.filter((issue) => issue.kind === "error").length;
      validation.totals.published_warnings += publishedIssues.filter((issue) => issue.kind === "warning").length;
    }

    writeJson(options.outputPath, validation);
    console.log(`Wrote romanization validation summary to ${options.outputPath}`);

    if (validation.totals.source_errors > 0 || validation.totals.published_errors > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
