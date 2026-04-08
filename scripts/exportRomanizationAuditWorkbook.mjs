import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import {
  DEFAULT_AUDIT_STAGES,
  ROMANIZATION_AUDIT_OUTPUT_ROOT,
  readJson,
} from "./lib/romanizationAudit.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
const STAGE_INDEX = new Map(DEFAULT_AUDIT_STAGES.map((stage, index) => [stage, index]));

function readFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0 || index >= args.length - 1) {
    return null;
  }
  return String(args[index + 1] ?? "").trim();
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
  const outputPath = readFlag(args, "--output");
  const inputRoot = readFlag(args, "--input-root");
  const stages = normalizeStages(args);

  return {
    stages,
    inputRoot: inputRoot ? path.resolve(SERVER_ROOT, inputRoot) : ROMANIZATION_AUDIT_OUTPUT_ROOT,
    outputPath: outputPath
      ? path.resolve(SERVER_ROOT, outputPath)
      : path.join(
          ROMANIZATION_AUDIT_OUTPUT_ROOT,
          `romanization-review-${stages[0]}-${stages[stages.length - 1]}.xml`,
        ),
  };
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatCell(value) {
  return `<Cell><Data ss:Type="String">${xmlEscape(value ?? "")}</Data></Cell>`;
}

function formatWorksheet(name, headers, rows) {
  const headerRow = headers.map((header) => formatCell(header)).join("");
  const body = rows
    .map(
      (row) =>
        `<Row>${headers.map((header) => formatCell(row[header] ?? "")).join("")}</Row>`,
    )
    .join("");

  return `
    <Worksheet ss:Name="${xmlEscape(name)}">
      <Table>
        <Row ss:StyleID="header">${headerRow}</Row>
        ${body}
      </Table>
    </Worksheet>
  `.trim();
}

function buildWorkbookXml(worksheets) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook
  xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Bottom"/>
      <Font ss:FontName="Calibri" ss:Size="11"/>
    </Style>
    <Style ss:ID="header">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#E8EDF5" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  ${worksheets.join("\n")}
</Workbook>`;
}

function loadStageAudit(inputRoot, stage) {
  const stageDir = path.join(inputRoot, stage);
  return {
    summary: readJson(path.join(stageDir, "aggregate-summary.json")),
    manualReview: readJson(path.join(stageDir, "manual-review.json")),
    breakdown: readJson(path.join(stageDir, "inventory-breakdown.json")),
    sentences: readJson(path.join(stageDir, "inventory-sentence.json")),
  };
}

function buildInstructionsRows(stages, summaryRows, breakdownRows, sentenceRows) {
  return [
    { ColumnA: "Workbook", ColumnB: "Romanization + chunking QA export", ColumnC: "" },
    { ColumnA: "Stages", ColumnB: stages.join(", "), ColumnC: "" },
    { ColumnA: "Flagged breakdown items", ColumnB: String(breakdownRows.length), ColumnC: "" },
    { ColumnA: "Flagged sentence rows", ColumnB: String(sentenceRows.length), ColumnC: "" },
    {
      ColumnA: "Reviewer workflow",
      ColumnB:
        "Review Breakdown QA first, then Sentence QA. Fill Decision, Final Romanization, and Notes. Use Chunk Decision only when the current breakdown is clearly overpacked or broken.",
      ColumnC: "",
    },
    {
      ColumnA: "Decision values",
      ColumnB: "accept | accept_modified | keep_current",
      ColumnC: "Chunk: chunk_ok | chunk_fix_needed",
    },
    {
      ColumnA: "Summary rows",
      ColumnB: String(summaryRows.length),
      ColumnC: "",
    },
  ];
}

function main() {
  const options = parseArgs();
  const summaryRows = [];
  const breakdownRows = [];
  const sentenceRows = [];

  for (const stage of options.stages) {
    const audit = loadStageAudit(options.inputRoot, stage);
    summaryRows.push({
      Stage: stage,
      Lessons: String(audit.summary.lesson_count ?? 0),
      "Published Rows": String(audit.summary.published_row_count ?? 0),
      "Breakdown Items": String(audit.summary.totals?.breakdown_items ?? 0),
      "Flagged Breakdown Items": String(audit.summary.totals?.flagged_breakdown_items ?? 0),
      "Sentence Rows": String(audit.summary.totals?.sentence_rows ?? 0),
      "Flagged Sentence Rows": String(audit.summary.totals?.flagged_sentence_rows ?? 0),
      "Sentence Match Counts": JSON.stringify(audit.summary.sentence_match_counts ?? {}),
    });

    for (const itemId of audit.manualReview.breakdown.flagged_item_ids) {
      const item = audit.breakdown.find((entry) => entry.item_id === itemId);
      const decision = audit.manualReview.breakdown.decisions[itemId] ?? {};
      if (!item) {
        continue;
      }
      breakdownRows.push({
        Stage: stage,
        "Grammar ID": item.grammar_id,
        "Lesson Title": item.lesson_title,
        Row: String(item.row),
        "Item Index": String(item.item_index),
        Thai: item.thai,
        English: item.english,
        Romanization: item.romanization,
        Tones: (item.tones ?? []).join("|"),
        Frequency: String(item.frequency ?? 0),
        "System Flags": (item.system_flags ?? []).join("|"),
        "Same Thai Variants": (item.same_thai_romanization_variants ?? []).join("|"),
        "Example Thai": item.example_sentence_context?.thai ?? "",
        "Example English": item.example_sentence_context?.english ?? "",
        "Example Romanization": item.example_sentence_context?.romanization ?? "",
        Decision: decision.decision ?? "",
        "Final Romanization": decision.finalRomanization ?? "",
        "Chunk Decision": decision.chunkDecision ?? "",
        "Replacement Breakdown": decision.replacementBreakdown
          ? JSON.stringify(decision.replacementBreakdown)
          : "",
        Notes: decision.notes ?? "",
      });
    }

    for (const rowId of audit.manualReview.sentences.flagged_row_ids) {
      const row = audit.sentences.find((entry) => entry.row_id === rowId);
      const decision = audit.manualReview.sentences.decisions[rowId] ?? {};
      if (!row) {
        continue;
      }
      sentenceRows.push({
        Stage: stage,
        "Grammar ID": row.grammar_id,
        "Lesson Title": row.lesson_title,
        Row: String(row.row),
        Thai: row.thai,
        English: row.english,
        "Sentence Romanization": row.sentence_romanization,
        "Breakdown Joined Romanization": row.breakdown_joined_romanization,
        "Match Type": row.match_type,
        "System Flags": (row.system_flags ?? []).join("|"),
        "Oversized Chunks": (row.oversized_chunks ?? [])
          .map((item) => `${item.index}:${item.thai}:${item.syllableCount}`)
          .join("|"),
        Decision: decision.decision ?? "",
        "Final Romanization": decision.finalRomanization ?? "",
        Notes: decision.notes ?? "",
      });
    }
  }

  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  const workbookXml = buildWorkbookXml([
    formatWorksheet(
      "Instructions",
      ["ColumnA", "ColumnB", "ColumnC"],
      buildInstructionsRows(options.stages, summaryRows, breakdownRows, sentenceRows),
    ),
    formatWorksheet(
      "Stage Summary",
      [
        "Stage",
        "Lessons",
        "Published Rows",
        "Breakdown Items",
        "Flagged Breakdown Items",
        "Sentence Rows",
        "Flagged Sentence Rows",
        "Sentence Match Counts",
      ],
      summaryRows,
    ),
    formatWorksheet(
      "Breakdown QA",
      [
        "Stage",
        "Grammar ID",
        "Lesson Title",
        "Row",
        "Item Index",
        "Thai",
        "English",
        "Romanization",
        "Tones",
        "Frequency",
        "System Flags",
        "Same Thai Variants",
        "Example Thai",
        "Example English",
        "Example Romanization",
        "Decision",
        "Final Romanization",
        "Chunk Decision",
        "Replacement Breakdown",
        "Notes",
      ],
      breakdownRows,
    ),
    formatWorksheet(
      "Sentence QA",
      [
        "Stage",
        "Grammar ID",
        "Lesson Title",
        "Row",
        "Thai",
        "English",
        "Sentence Romanization",
        "Breakdown Joined Romanization",
        "Match Type",
        "System Flags",
        "Oversized Chunks",
        "Decision",
        "Final Romanization",
        "Notes",
      ],
      sentenceRows,
    ),
  ]);

  fs.writeFileSync(options.outputPath, workbookXml, "utf8");
  console.log(`Wrote romanization review workbook to ${options.outputPath}`);
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
