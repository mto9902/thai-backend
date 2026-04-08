import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { analyzeBreakdownTones } from "../breakdownTone.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(SERVER_ROOT, ".env"), quiet: true });

const STAGE_ORDER = [
  "A1.1",
  "A1.2",
  "A2.1",
  "A2.2",
  "B1.1",
  "B1.2",
  "B2.1",
  "B2.2",
  "C1",
  "C2",
];
const STAGE_INDEX = new Map(STAGE_ORDER.map((stage, index) => [stage, index]));
const OUTPUT_DIR = path.join(SERVER_ROOT, "admin-data", "qa-exports");
const DEFAULT_STAGE_FROM = "A2.1";
const DEFAULT_STAGE_TO = "B2.2";

function readFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0 || index >= args.length - 1) {
    return null;
  }
  return args[index + 1];
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

function normalizeStage(stage, fallback) {
  const value = String(stage ?? "").trim();
  return STAGE_INDEX.has(value) ? value : fallback;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const stageFrom = normalizeStage(
    readFlag(args, "--stage-from"),
    DEFAULT_STAGE_FROM,
  );
  const stageTo = normalizeStage(readFlag(args, "--stage-to"), DEFAULT_STAGE_TO);
  const outputPath = readFlag(args, "--output");

  return {
    stageFrom,
    stageTo,
    includeLegacy: hasFlag(args, "--include-legacy"),
    outputPath:
      outputPath && outputPath.trim()
        ? path.resolve(SERVER_ROOT, outputPath.trim())
        : null,
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
  const stringValue = value == null ? "" : String(value);
  return `<Cell><Data ss:Type="String">${xmlEscape(stringValue)}</Data></Cell>`;
}

function formatWorksheet(name, headers, rows) {
  const headerRow = headers.map((header) => formatCell(header)).join("");
  const bodyRows = rows
    .map(
      (row) =>
        `<Row>${headers
          .map((header) => formatCell(row[header] ?? ""))
          .join("")}</Row>`,
    )
    .join("");

  return `
    <Worksheet ss:Name="${xmlEscape(name)}">
      <Table>
        <Row ss:StyleID="header">${headerRow}</Row>
        ${bodyRows}
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

function readGrammarOrderSeed() {
  const seedPath = path.join(SERVER_ROOT, "admin-data", "grammar-order-seed.json");
  if (!fs.existsSync(seedPath)) {
    return new Map();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
    return new Map(
      Object.entries(parsed ?? {}).map(([grammarId, entry]) => [grammarId, entry]),
    );
  } catch {
    return new Map();
  }
}

function stageInRange(stage, stageFrom, stageTo) {
  const index = STAGE_INDEX.get(stage);
  const fromIndex = STAGE_INDEX.get(stageFrom);
  const toIndex = STAGE_INDEX.get(stageTo);
  if (index == null || fromIndex == null || toIndex == null) {
    return false;
  }
  return index >= fromIndex && index <= toIndex;
}

function normalizeBreakdown(rawBreakdown) {
  if (Array.isArray(rawBreakdown)) {
    return rawBreakdown;
  }
  try {
    return JSON.parse(rawBreakdown ?? "[]");
  } catch {
    return [];
  }
}

function normalizeQualityFlags(value) {
  if (Array.isArray(value)) {
    return value.map((flag) => String(flag ?? "").trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((flag) => String(flag ?? "").trim()).filter(Boolean);
      }
    } catch {
      return [];
    }
  }
  return [];
}

function currentTonesForItem(item) {
  if (Array.isArray(item?.tones) && item.tones.length > 0) {
    return item.tones.map((tone) => String(tone ?? "").trim()).filter(Boolean);
  }
  if (typeof item?.tone === "string" && item.tone.trim()) {
    return [item.tone.trim()];
  }
  return [];
}

function buildInstructionsRows({ stageFrom, stageTo, lessonCount, rowCount, itemCount }) {
  return [
    {
      ColumnA: "Workbook",
      ColumnB: "Manual tone review export",
      ColumnC: "",
    },
    {
      ColumnA: "Scope",
      ColumnB: `${stageFrom} through ${stageTo}`,
      ColumnC: "",
    },
    {
      ColumnA: "Lessons",
      ColumnB: String(lessonCount),
      ColumnC: "",
    },
    {
      ColumnA: "Sentences",
      ColumnB: String(rowCount),
      ColumnC: "",
    },
    {
      ColumnA: "Breakdown items",
      ColumnB: String(itemCount),
      ColumnC: "",
    },
    {
      ColumnA: "Reviewer workflow",
      ColumnB:
        "Use the Missing Tones sheet first. Fill QA Final Tones with pipe-separated tones like mid|low, then set QA Status and QA Notes.",
      ColumnC: "",
    },
    {
      ColumnA: "Helpful filters",
      ColumnB:
        "Filter by Stage, Grammar ID, Lesson Title, Missing Tones = yes, or Tone Count Mismatch = yes.",
      ColumnC: "",
    },
  ];
}

async function fetchPublishedToneReviewRows(pool, { includeLegacy }) {
  const result = await pool.query(
    `
    SELECT
      e.id,
      e.grammar_id,
      e.sort_order,
      e.thai,
      e.romanization,
      e.english,
      e.breakdown,
      e.difficulty,
      e.tone_status,
      e.tone_confidence,
      e.quality_flags,
      l.stage AS override_stage,
      l.lesson_order AS override_lesson_order,
      l.content
    FROM grammar_examples e
    LEFT JOIN grammar_lesson_overrides l
      ON l.grammar_id = e.grammar_id
    WHERE e.publish_state = 'published'
      AND e.review_status = 'approved'
      AND (
        $1::boolean = TRUE
        OR NOT (e.quality_flags @> '["legacy"]'::jsonb)
      )
    ORDER BY e.grammar_id ASC, e.sort_order ASC, e.id ASC
    `,
    [includeLegacy],
  );

  return result.rows;
}

async function main() {
  const { pool } = await import("../db.js");
  const options = parseArgs();
  const seedMap = readGrammarOrderSeed();
  const sourceRows = await fetchPublishedToneReviewRows(pool, options);

  const lessons = new Map();
  const sentenceRows = [];
  const breakdownRows = [];

  for (const row of sourceRows) {
    const content =
      row.content && typeof row.content === "object"
        ? row.content
        : typeof row.content === "string" && row.content.trim()
          ? JSON.parse(row.content)
          : {};
    const seed = seedMap.get(row.grammar_id) ?? {};
    const stage = String(
      row.override_stage ?? content.stage ?? seed.stage ?? "",
    ).trim();

    if (!stageInRange(stage, options.stageFrom, options.stageTo)) {
      continue;
    }

    const lessonOrder = Number.isInteger(row.override_lesson_order)
      ? row.override_lesson_order
      : Number.parseInt(
          String(content.lessonOrder ?? seed.lessonOrder ?? ""),
          10,
        );
    const lessonTitle =
      String(content.title ?? row.grammar_id ?? "").trim() || row.grammar_id;
    const hiddenFromLearners = content.hiddenFromLearners === true ? "yes" : "no";
    const breakdown = normalizeBreakdown(row.breakdown);
    const qualityFlags = normalizeQualityFlags(row.quality_flags);

    const sentenceSummary = {
      Stage: stage,
      LessonOrder: Number.isInteger(lessonOrder) ? String(lessonOrder) : "",
      "Grammar ID": row.grammar_id,
      "Lesson Title": lessonTitle,
      "Learner Hidden": hiddenFromLearners,
      "Sentence Sort": String(Number(row.sort_order ?? 0)),
      "Sentence ID": String(Number(row.id)),
      Thai: String(row.thai ?? "").trim(),
      Romanization: String(row.romanization ?? "").trim(),
      English: String(row.english ?? "").trim(),
      Difficulty: String(row.difficulty ?? "").trim(),
      "Tone Status": String(row.tone_status ?? "").trim(),
      "Tone Confidence": String(row.tone_confidence ?? ""),
      "Quality Flags": qualityFlags.join("|"),
      "Breakdown Item Count": String(breakdown.length),
      "Missing Tones Count": "0",
      "Tone Count Mismatch Count": "0",
    };

    let sentenceMissingToneCount = 0;
    let sentenceMismatchCount = 0;

    breakdown.forEach((item, itemIndex) => {
      const currentTones = currentTonesForItem(item);
      const analysis = analyzeBreakdownTones({
        thai: item?.thai,
        romanization: item?.romanization,
        providedTones: currentTones,
      });
      const toneCountMatches =
        analysis.syllableCount === 0 || currentTones.length === analysis.syllableCount;
      const missingTones = currentTones.length === 0 ? "yes" : "no";
      const toneCountMismatch = toneCountMatches ? "no" : "yes";

      if (currentTones.length === 0) {
        sentenceMissingToneCount += 1;
      }
      if (!toneCountMatches) {
        sentenceMismatchCount += 1;
      }

      breakdownRows.push({
        Stage: stage,
        LessonOrder: Number.isInteger(lessonOrder) ? String(lessonOrder) : "",
        "Grammar ID": row.grammar_id,
        "Lesson Title": lessonTitle,
        "Learner Hidden": hiddenFromLearners,
        "Sentence Sort": String(Number(row.sort_order ?? 0)),
        "Sentence ID": String(Number(row.id)),
        "Sentence Thai": String(row.thai ?? "").trim(),
        "Sentence English": String(row.english ?? "").trim(),
        "Item Index": String(itemIndex),
        "Breakdown Thai": String(item?.thai ?? "").trim(),
        "Breakdown English": String(item?.english ?? "").trim(),
        "Breakdown Romanization": String(item?.romanization ?? "").trim(),
        "Current Tones": currentTones.join("|"),
        "Display Segments": Array.isArray(item?.displayThaiSegments)
          ? item.displayThaiSegments.join("|")
          : "",
        "Syllable Count": String(analysis.syllableCount ?? 0),
        "Tone Count Matches": toneCountMatches ? "yes" : "no",
        "Tone Count Mismatch": toneCountMismatch,
        "Auto Source": String(analysis.source ?? ""),
        "Auto Status": String(analysis.status ?? ""),
        "Missing Tones": missingTones,
        "Grammar Chunk": item?.grammar === true ? "yes" : "no",
        "Quality Flags": qualityFlags.join("|"),
        "QA Final Tones": "",
        "QA Status": "",
        "QA Notes": "",
      });
    });

    sentenceSummary["Missing Tones Count"] = String(sentenceMissingToneCount);
    sentenceSummary["Tone Count Mismatch Count"] = String(sentenceMismatchCount);
    sentenceRows.push(sentenceSummary);

    const lessonKey = `${stage}::${row.grammar_id}`;
    const existingLesson =
      lessons.get(lessonKey) ??
      {
        Stage: stage,
        LessonOrder: Number.isInteger(lessonOrder) ? String(lessonOrder) : "",
        "Grammar ID": row.grammar_id,
        "Lesson Title": lessonTitle,
        "Learner Hidden": hiddenFromLearners,
        "Sentence Count": 0,
        "Breakdown Item Count": 0,
        "Missing Tones Count": 0,
        "Tone Count Mismatch Count": 0,
      };

    existingLesson["Sentence Count"] += 1;
    existingLesson["Breakdown Item Count"] += breakdown.length;
    existingLesson["Missing Tones Count"] += sentenceMissingToneCount;
    existingLesson["Tone Count Mismatch Count"] += sentenceMismatchCount;
    lessons.set(lessonKey, existingLesson);
  }

  const lessonRows = Array.from(lessons.values()).sort((a, b) => {
    const stageDelta =
      (STAGE_INDEX.get(a.Stage) ?? Number.MAX_SAFE_INTEGER) -
      (STAGE_INDEX.get(b.Stage) ?? Number.MAX_SAFE_INTEGER);
    if (stageDelta !== 0) {
      return stageDelta;
    }

    const lessonOrderDelta =
      Number.parseInt(a.LessonOrder || "999999", 10) -
      Number.parseInt(b.LessonOrder || "999999", 10);
    if (lessonOrderDelta !== 0) {
      return lessonOrderDelta;
    }

    return a["Grammar ID"].localeCompare(b["Grammar ID"]);
  });

  const missingToneRows = breakdownRows.filter(
    (row) => row["Missing Tones"] === "yes",
  );

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const defaultOutputPath = path.join(
    OUTPUT_DIR,
    `tone-review-${options.stageFrom}-${options.stageTo}-${new Date()
      .toISOString()
      .slice(0, 10)}.xml`,
  );
  const outputPath = options.outputPath ?? defaultOutputPath;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const workbookXml = buildWorkbookXml([
    formatWorksheet(
      "Instructions",
      ["ColumnA", "ColumnB", "ColumnC"],
      buildInstructionsRows({
        stageFrom: options.stageFrom,
        stageTo: options.stageTo,
        lessonCount: lessonRows.length,
        rowCount: sentenceRows.length,
        itemCount: breakdownRows.length,
      }),
    ),
    formatWorksheet(
      "Lesson Summary",
      [
        "Stage",
        "LessonOrder",
        "Grammar ID",
        "Lesson Title",
        "Learner Hidden",
        "Sentence Count",
        "Breakdown Item Count",
        "Missing Tones Count",
        "Tone Count Mismatch Count",
      ],
      lessonRows,
    ),
    formatWorksheet(
      "Sentences",
      [
        "Stage",
        "LessonOrder",
        "Grammar ID",
        "Lesson Title",
        "Learner Hidden",
        "Sentence Sort",
        "Sentence ID",
        "Thai",
        "Romanization",
        "English",
        "Difficulty",
        "Tone Status",
        "Tone Confidence",
        "Quality Flags",
        "Breakdown Item Count",
        "Missing Tones Count",
        "Tone Count Mismatch Count",
      ],
      sentenceRows,
    ),
    formatWorksheet(
      "Breakdown QA",
      [
        "Stage",
        "LessonOrder",
        "Grammar ID",
        "Lesson Title",
        "Learner Hidden",
        "Sentence Sort",
        "Sentence ID",
        "Sentence Thai",
        "Sentence English",
        "Item Index",
        "Breakdown Thai",
        "Breakdown English",
        "Breakdown Romanization",
        "Current Tones",
        "Display Segments",
        "Syllable Count",
        "Tone Count Matches",
        "Tone Count Mismatch",
        "Auto Source",
        "Auto Status",
        "Missing Tones",
        "Grammar Chunk",
        "Quality Flags",
        "QA Final Tones",
        "QA Status",
        "QA Notes",
      ],
      breakdownRows,
    ),
    formatWorksheet(
      "Missing Tones",
      [
        "Stage",
        "LessonOrder",
        "Grammar ID",
        "Lesson Title",
        "Learner Hidden",
        "Sentence Sort",
        "Sentence ID",
        "Sentence Thai",
        "Sentence English",
        "Item Index",
        "Breakdown Thai",
        "Breakdown English",
        "Breakdown Romanization",
        "Current Tones",
        "Display Segments",
        "Syllable Count",
        "Tone Count Matches",
        "Tone Count Mismatch",
        "Auto Source",
        "Auto Status",
        "Missing Tones",
        "Grammar Chunk",
        "Quality Flags",
        "QA Final Tones",
        "QA Status",
        "QA Notes",
      ],
      missingToneRows,
    ),
  ]);

  fs.writeFileSync(outputPath, workbookXml, "utf8");

  console.log(
    JSON.stringify(
      {
        outputPath,
        stageFrom: options.stageFrom,
        stageTo: options.stageTo,
        includeLegacy: options.includeLegacy,
        lessonCount: lessonRows.length,
        sentenceCount: sentenceRows.length,
        breakdownItemCount: breakdownRows.length,
        missingToneCount: missingToneRows.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("Failed to export tone review workbook:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { pool } = await import("../db.js");
    await pool.end().catch(() => {});
  });
