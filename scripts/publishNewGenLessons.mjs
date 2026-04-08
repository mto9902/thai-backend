import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { fileURLToPath } from "url";

import { analyzeBreakdownTones } from "../breakdownTone.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(SERVER_ROOT, ".env"), quiet: true });

const GRAMMAR_DIR = path.join(SERVER_ROOT, "grammar");
const GENERATED_DIR = path.join(SERVER_ROOT, "admin-data", "generated-candidates");
const MANUAL_SOURCE_DIR = path.join(
  SERVER_ROOT,
  "admin-data",
  "manual-source-lessons",
);
const GRAMMAR_EXAMPLES_TABLE = "grammar_examples";
const GRAMMAR_LESSON_PRODUCTION_TABLE = "grammar_lesson_production";
const PUBLISH_DATE = "2026-04-06";
const REVIEW_NOTE = `New Gen publish ${PUBLISH_DATE}`;

const DEFAULT_PUBLISH_LESSONS = [
  "past-laew",
  "recent-past-phoeng",
  "female-particles-kha-kha",
  "frequency-adverbs",
  "like-chorp",
  "permission-dai",
  "skill-pen",
];

const DEFAULT_RETIRE_ONLY_LESSONS = [
  "duration-penwela-manan",
  "knowledge-ruu-ruujak",
  "quantifiers-thuk-bang-lai",
  "sequence-conjunctions",
  "comparison-kwaa",
  "relative-thi",
  "reported-speech",
  "endurance-wai",
  "superlative",
  "must-tong",
  "should-khuan",
  "prefix-naa-adjective",
  "feelings-rusuek",
  "try-lawng",
  "resultative-ok-samret",
  "passive-tuuk",
  "conditionals",
  "change-state-khuen-long",
  "in-order-to-phuea",
];

function parseArgs() {
  const args = process.argv.slice(2);
  const readListFlag = (flag, fallback) => {
    const index = args.indexOf(flag);
    if (index < 0 || index >= args.length - 1) {
      return fallback;
    }
    return args[index + 1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  };

  return {
    lessons: readListFlag("--lessons", DEFAULT_PUBLISH_LESSONS),
    retireOnlyLessons: readListFlag("--retire-only", DEFAULT_RETIRE_ONLY_LESSONS),
    dryRun: args.includes("--dry-run"),
  };
}

function findFinalLessonPath(grammarId) {
  const candidates = [
    path.join(GENERATED_DIR, `${grammarId}-final25-reviewed.json`),
    path.join(GENERATED_DIR, `${grammarId}-kimi-final25-reviewed.json`),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`No final reviewed file found for ${grammarId}`);
}

function readFinalLesson(grammarId) {
  const filePath = findFinalLessonPath(grammarId);
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.rows) || parsed.rows.length !== 25) {
    throw new Error(`${grammarId} final reviewed file must contain exactly 25 rows`);
  }

  return {
    grammarId,
    stage: parsed.stage ?? null,
    rows: parsed.rows.map((row) => ({
      thai: String(row.thai ?? "").trim(),
      english: String(row.english ?? "").trim(),
    })),
  };
}

function readSourceRows(grammarId) {
  const manualSourcePath = path.join(MANUAL_SOURCE_DIR, `${grammarId}-source.json`);
  if (fs.existsSync(manualSourcePath)) {
    const raw = fs.readFileSync(manualSourcePath, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : parsed?.rows;

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(`Manual source file for ${grammarId} must contain a non-empty rows array`);
    }

    return Promise.resolve(
      rows.map((row) => ({
        thai: String(row.thai ?? "").trim(),
        romanization: String(row.romanization ?? "").trim(),
        english: String(row.english ?? "").trim(),
        breakdown: Array.isArray(row.breakdown) ? row.breakdown : [],
        difficulty: String(row.difficulty ?? "medium").trim() || "medium",
      })),
    );
  }

  const filePath = path.join(GRAMMAR_DIR, `${grammarId}.csv`);
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        try {
          rows.push({
            thai: String(row.thai ?? "").trim(),
            romanization: String(row.romanization ?? "").trim(),
            english: String(row.english ?? "").trim(),
            breakdown: JSON.parse(row.breakdown ?? "[]"),
            difficulty: String(row.difficulty ?? "medium").trim() || "medium",
          });
        } catch (error) {
          reject(error);
        }
      })
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

function withFilledToneMetadata(item) {
  const nextItem = { ...item };
  const existingTones = Array.isArray(nextItem.tones)
    ? nextItem.tones.filter(Boolean)
    : nextItem.tone
      ? [nextItem.tone]
      : [];

  let tones = existingTones;
  if (tones.length === 0) {
    tones = analyzeBreakdownTones({
      thai: nextItem.thai,
      romanization: nextItem.romanization,
      providedTones: [],
    }).tones;
  }

  if (tones.length > 0) {
    nextItem.tones = tones;
    if (tones.length === 1) {
      nextItem.tone = tones[0];
    } else {
      delete nextItem.tone;
    }
  }

  return nextItem;
}

function summarizeRowToneState(breakdown) {
  const analyses = breakdown.map((item) => {
    const providedTones = Array.isArray(item.tones)
      ? item.tones.filter(Boolean)
      : item.tone
        ? [item.tone]
        : [];

    return analyzeBreakdownTones({
      thai: item.thai,
      romanization: item.romanization,
      providedTones,
    });
  });

  const unresolvedItemCount = analyses.filter(
    (analysis) => analysis.tones.length === 0,
  ).length;
  const allResolved = unresolvedItemCount === 0;

  return {
    confidence: allResolved ? 100 : 99,
    status: allResolved ? "approved" : "review",
    source: allResolved ? "new-gen-publish" : "new-gen-publish-partial-tone",
    needsReview: !allResolved,
    reasons: allResolved
      ? []
      : ["Published as New Gen, but some breakdown tone dots still need cleanup."],
    unresolvedItemCount,
    breakdown: analyses,
  };
}

function escapeCsvValue(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsvMirror(grammarId, rows) {
  const header = ["thai", "romanization", "english", "breakdown", "difficulty"];
  const lines = rows.map((row) =>
    [
      row.thai,
      row.romanization,
      row.english,
      JSON.stringify(row.breakdown),
      row.difficulty,
    ]
      .map(escapeCsvValue)
      .join(","),
  );

  fs.writeFileSync(
    path.join(GRAMMAR_DIR, `${grammarId}.csv`),
    [header.join(","), ...lines].join("\n"),
    "utf8",
  );
}

function normalizeQualityFlags(flags) {
  return Array.from(
    new Set(
      (Array.isArray(flags) ? flags : [])
        .map((flag) => String(flag ?? "").trim())
        .filter(Boolean),
    ),
  );
}

async function fetchPublishedRows(client, grammarId) {
  const result = await client.query(
    `
    SELECT
      id,
      grammar_id,
      sort_order,
      thai,
      romanization,
      english,
      breakdown,
      difficulty,
      tone_confidence,
      tone_status,
      tone_analysis,
      review_status,
      publish_state,
      quality_flags
    FROM ${GRAMMAR_EXAMPLES_TABLE}
    WHERE grammar_id = $1
      AND publish_state = 'published'
    ORDER BY sort_order ASC, id ASC
    `,
    [grammarId],
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    grammarId: row.grammar_id,
    sortOrder: Number(row.sort_order ?? 0),
    thai: String(row.thai ?? "").trim(),
    romanization: String(row.romanization ?? "").trim(),
    english: String(row.english ?? "").trim(),
    breakdown: Array.isArray(row.breakdown)
      ? row.breakdown
      : JSON.parse(row.breakdown ?? "[]"),
    difficulty: String(row.difficulty ?? "medium").trim() || "medium",
    toneConfidence: Number(row.tone_confidence ?? 0),
    toneStatus: String(row.tone_status ?? "review"),
    toneAnalysis:
      row.tone_analysis && typeof row.tone_analysis === "object"
        ? row.tone_analysis
        : row.tone_analysis
          ? JSON.parse(row.tone_analysis)
          : null,
    reviewStatus: String(row.review_status ?? "flagged"),
    publishState: String(row.publish_state ?? "published"),
    qualityFlags: normalizeQualityFlags(row.quality_flags),
  }));
}

function currentRowsMatchFinalByThai(currentRows, finalRows) {
  if (currentRows.length !== 25 || finalRows.length !== 25) {
    return false;
  }

  const currentThai = new Set(currentRows.map((row) => row.thai));
  if (currentThai.size !== 25) {
    return false;
  }

  return finalRows.every((row) => currentThai.has(row.thai));
}

function buildRowsFromCurrentPublished(grammarId, currentRows, finalRows) {
  const currentByThai = new Map(currentRows.map((row) => [row.thai, row]));
  return finalRows.map((finalRow, index) => {
    const current = currentByThai.get(finalRow.thai);
    if (!current) {
      throw new Error(`${grammarId} is missing the live row for "${finalRow.thai}"`);
    }

    const breakdown = current.breakdown.map(withFilledToneMetadata);
    const toneAnalysis = summarizeRowToneState(breakdown);

    return {
      id: current.id,
      grammarId,
      sortOrder: index,
      thai: finalRow.thai,
      romanization: current.romanization,
      english: finalRow.english,
      breakdown,
      difficulty: current.difficulty || "medium",
      toneConfidence: toneAnalysis.confidence,
      toneStatus: toneAnalysis.status,
      toneAnalysis,
      reviewStatus: "approved",
      publishState: "published",
      qualityFlags: ["new_gen"],
    };
  });
}

function buildRowsFromAnnotatedSource(grammarId, sourceRows, finalRows) {
  const sourceByThai = new Map(sourceRows.map((row) => [row.thai, row]));
  return finalRows.map((finalRow, index) => {
    const sourceRow = sourceByThai.get(finalRow.thai);
    if (!sourceRow) {
      throw new Error(
        `${grammarId} cannot be published as New Gen yet because "${finalRow.thai}" has no annotated source row`,
      );
    }

    const breakdown = sourceRow.breakdown.map(withFilledToneMetadata);
    const toneAnalysis = summarizeRowToneState(breakdown);

    return {
      grammarId,
      sortOrder: index,
      thai: finalRow.thai,
      romanization: sourceRow.romanization,
      english: finalRow.english,
      breakdown,
      difficulty: sourceRow.difficulty || "medium",
      toneConfidence: toneAnalysis.confidence,
      toneStatus: toneAnalysis.status,
      toneAnalysis,
      reviewStatus: "approved",
      publishState: "published",
      qualityFlags: ["new_gen"],
    };
  });
}

function assertRowsArePublishSafe(grammarId, rows) {
  const unresolved = rows.reduce(
    (sum, row) => sum + Number(row.toneAnalysis?.unresolvedItemCount ?? 0),
    0,
  );
  if (unresolved > 0) {
    throw new Error(
      `${grammarId} still has ${unresolved} unresolved breakdown tone items and is not no-QA-needed yet`,
    );
  }
}

async function upsertPublishedNewGenRows(client, grammarId, stage, rows) {
  await client.query(
    `
    WITH ordered AS (
      SELECT
        id,
        ROW_NUMBER() OVER (ORDER BY sort_order ASC, id ASC) AS seq
      FROM ${GRAMMAR_EXAMPLES_TABLE}
      WHERE grammar_id = $1
    )
    UPDATE ${GRAMMAR_EXAMPLES_TABLE} AS target
    SET sort_order = 1000 + ordered.seq,
        updated_at = NOW()
    FROM ordered
    WHERE target.id = ordered.id
    `,
    [grammarId],
  );

  await client.query(
    `
    UPDATE ${GRAMMAR_EXAMPLES_TABLE}
    SET
      publish_state = 'retired',
      updated_at = NOW()
    WHERE grammar_id = $1
      AND publish_state IN ('published', 'staged')
    `,
    [grammarId],
  );

  for (const row of rows) {
    await client.query(
      `
      INSERT INTO ${GRAMMAR_EXAMPLES_TABLE} (
        grammar_id,
        sort_order,
        thai,
        romanization,
        english,
        breakdown,
        difficulty,
        tone_confidence,
        tone_status,
        tone_analysis,
        review_status,
        review_note,
        publish_state,
        rewrite_wave_id,
        source_example_id,
        quality_flags,
        next_wave_decision,
        next_wave_audit_note,
        next_wave_audited_by_user_id,
        next_wave_audited_at,
        last_edited_by_user_id,
        last_edited_at,
        approved_by_user_id,
        approved_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6::jsonb, $7,
        $8, $9, $10::jsonb, $11, $12, $13, NULL, NULL,
        $14::jsonb, NULL, NULL, NULL, NULL, NULL, NOW(), NULL, NOW()
      )
      `,
      [
        row.grammarId,
        row.sortOrder,
        row.thai,
        row.romanization,
        row.english,
        JSON.stringify(row.breakdown),
        row.difficulty,
        row.toneConfidence,
        row.toneStatus,
        JSON.stringify(row.toneAnalysis),
        row.reviewStatus,
        REVIEW_NOTE,
        row.publishState,
        JSON.stringify(row.qualityFlags),
      ],
    );
  }

  await client.query(
    `
    INSERT INTO ${GRAMMAR_LESSON_PRODUCTION_TABLE} (
      grammar_id,
      stage,
      final_target_count,
      first_pass_candidate_target,
      supplemental_candidate_batch_size,
      current_rewrite_wave_id,
      last_published_at,
      notes,
      created_at,
      updated_at
    ) VALUES ($1, $2, 25, 40, 10, NULL, NOW(), $3, NOW(), NOW())
    ON CONFLICT (grammar_id)
    DO UPDATE SET
      stage = COALESCE(EXCLUDED.stage, ${GRAMMAR_LESSON_PRODUCTION_TABLE}.stage),
      current_rewrite_wave_id = NULL,
      last_published_at = NOW(),
      notes = EXCLUDED.notes,
      updated_at = NOW()
    `,
    [grammarId, stage, REVIEW_NOTE],
  );
}

async function updateCurrentRowsInPlace(client, grammarId, stage, rows) {
  const keepIds = rows.map((row) => row.id);

  await client.query(
    `
    WITH ordered AS (
      SELECT
        id,
        ROW_NUMBER() OVER (ORDER BY sort_order ASC, id ASC) AS seq
      FROM ${GRAMMAR_EXAMPLES_TABLE}
      WHERE grammar_id = $1
        AND NOT (id = ANY($2::bigint[]))
    )
    UPDATE ${GRAMMAR_EXAMPLES_TABLE} AS target
    SET sort_order = 1000 + ordered.seq,
        publish_state = CASE
          WHEN target.publish_state IN ('published', 'staged') THEN 'retired'
          ELSE target.publish_state
        END,
        updated_at = NOW()
    FROM ordered
    WHERE target.id = ordered.id
    `,
    [grammarId, keepIds],
  );

  for (const row of rows) {
    await client.query(
      `
      UPDATE ${GRAMMAR_EXAMPLES_TABLE}
      SET
        sort_order = $2,
        english = $3,
        breakdown = $4::jsonb,
        tone_confidence = $5,
        tone_status = $6,
        tone_analysis = $7::jsonb,
        review_status = 'approved',
        review_note = $8,
        publish_state = 'published',
        quality_flags = $9::jsonb,
        updated_at = NOW(),
        approved_at = COALESCE(approved_at, NOW())
      WHERE id = $1
      `,
      [
        row.id,
        row.sortOrder,
        row.english,
        JSON.stringify(row.breakdown),
        row.toneConfidence,
        row.toneStatus,
        JSON.stringify(row.toneAnalysis),
        REVIEW_NOTE,
        JSON.stringify(row.qualityFlags),
      ],
    );
  }

  await client.query(
    `
    INSERT INTO ${GRAMMAR_LESSON_PRODUCTION_TABLE} (
      grammar_id,
      stage,
      final_target_count,
      first_pass_candidate_target,
      supplemental_candidate_batch_size,
      current_rewrite_wave_id,
      last_published_at,
      notes,
      created_at,
      updated_at
    ) VALUES ($1, $2, 25, 40, 10, NULL, NOW(), $3, NOW(), NOW())
    ON CONFLICT (grammar_id)
    DO UPDATE SET
      stage = COALESCE(EXCLUDED.stage, ${GRAMMAR_LESSON_PRODUCTION_TABLE}.stage),
      current_rewrite_wave_id = NULL,
      last_published_at = NOW(),
      notes = EXCLUDED.notes,
      updated_at = NOW()
    `,
    [grammarId, stage, REVIEW_NOTE],
  );
}

async function retirePublishedLegacyRows(client, grammarIds) {
  if (grammarIds.length === 0) {
    return 0;
  }

  const result = await client.query(
    `
    UPDATE ${GRAMMAR_EXAMPLES_TABLE}
    SET
      publish_state = 'retired',
      updated_at = NOW()
    WHERE grammar_id = ANY($1::text[])
      AND publish_state = 'published'
      AND NOT (quality_flags @> '["new_gen"]'::jsonb)
    `,
    [grammarIds],
  );

  return Number(result.rowCount ?? 0);
}

async function main() {
  const { pool } = await import("../db.js");
  const { lessons, retireOnlyLessons, dryRun } = parseArgs();
  const client = await pool.connect();

  try {
    const publishPayloads = [];

    for (const grammarId of lessons) {
      const finalLesson = readFinalLesson(grammarId);
      const currentPublished = await fetchPublishedRows(client, grammarId);

      let rows;
      let mode;
      if (currentRowsMatchFinalByThai(currentPublished, finalLesson.rows)) {
        rows = buildRowsFromCurrentPublished(
          grammarId,
          currentPublished,
          finalLesson.rows,
        );
        mode = "relabel-live";
      } else {
        const sourceRows = await readSourceRows(grammarId);
        rows = buildRowsFromAnnotatedSource(grammarId, sourceRows, finalLesson.rows);
        mode = "publish-from-source";
      }

      assertRowsArePublishSafe(grammarId, rows);
      publishPayloads.push({
        grammarId,
        stage: finalLesson.stage ?? null,
        mode,
        rows,
      });
    }

    if (dryRun) {
      console.log(
        JSON.stringify(
          {
            publish: publishPayloads.map((payload) => ({
              grammarId: payload.grammarId,
              mode: payload.mode,
              rowCount: payload.rows.length,
              unresolvedToneItems: payload.rows.reduce(
                (sum, row) =>
                  sum + Number(row.toneAnalysis?.unresolvedItemCount ?? 0),
                0,
              ),
            })),
            retireOnlyLessons,
          },
          null,
          2,
        ),
      );
      return;
    }

    await client.query("BEGIN");

    for (const payload of publishPayloads) {
      if (payload.mode === "relabel-live") {
        await updateCurrentRowsInPlace(
          client,
          payload.grammarId,
          payload.stage,
          payload.rows,
        );
      } else {
        await upsertPublishedNewGenRows(
          client,
          payload.grammarId,
          payload.stage,
          payload.rows,
        );
      }
    }

    const retiredCount = await retirePublishedLegacyRows(client, retireOnlyLessons);
    await client.query("COMMIT");

    for (const payload of publishPayloads) {
      writeCsvMirror(payload.grammarId, payload.rows);
    }

    console.log(
      JSON.stringify(
        {
          published: publishPayloads.map((payload) => ({
            grammarId: payload.grammarId,
            mode: payload.mode,
            rowCount: payload.rows.length,
          })),
          retiredLegacyPublishedRows: retiredCount,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error("Failed to publish New Gen lessons:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { pool } = await import("../db.js");
    await pool.end().catch(() => {});
  });
