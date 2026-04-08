import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
const FRONTEND_ROOT = path.resolve(SERVER_ROOT, "..", "thaiApp-2");
dotenv.config({ path: path.join(SERVER_ROOT, ".env"), quiet: true });

const { pool } = await import("../db.js");

const GRAMMAR_STAGES_PATH = path.join(
  FRONTEND_ROOT,
  "src",
  "data",
  "grammarStages.ts",
);
const MANUAL_SOURCE_DIR = path.join(SERVER_ROOT, "admin-data", "manual-source-lessons");
const GENERATED_DIR = path.join(SERVER_ROOT, "admin-data", "generated-candidates");
const GRAMMAR_EXAMPLES_TABLE = "grammar_examples";
const GRAMMAR_LESSON_PRODUCTION_TABLE = "grammar_lesson_production";
const APPROVED_TONE_CONFIDENCE = 99;
const DEFAULT_STAGES = ["A2.1", "A2.2", "B1.1", "B1.2", "B2.1", "B2.2"];

function parseArgs() {
  const args = process.argv.slice(2);
  const stageIndex = args.indexOf("--stages");
  const lessonIndex = args.indexOf("--lessons");

  const stages =
    stageIndex >= 0 && stageIndex < args.length - 1
      ? args[stageIndex + 1]
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : DEFAULT_STAGES;

  const lessons =
    lessonIndex >= 0 && lessonIndex < args.length - 1
      ? args[lessonIndex + 1]
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : [];

  return {
    stages,
    lessons,
    dryRun: args.includes("--dry-run"),
  };
}

function collectGrammarIds(stages) {
  const source = fs.readFileSync(GRAMMAR_STAGES_PATH, "utf8");
  const ids = [];

  for (const stage of stages) {
    const marker = `"${stage}": [`;
    const stageIndex = source.indexOf(marker);
    if (stageIndex < 0) {
      throw new Error(`Could not find stage ${stage} in grammarStages.ts`);
    }

    const start = source.indexOf("[", stageIndex);
    let depth = 0;
    let end = -1;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (char === "[") {
        depth += 1;
      } else if (char === "]") {
        depth -= 1;
        if (depth === 0) {
          end = index;
          break;
        }
      }
    }

    const block = source.slice(start, end + 1);
    ids.push(...[...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]));
  }

  return [...new Set(ids)];
}

function readSourceThaiRows(grammarId) {
  const filePath = path.join(MANUAL_SOURCE_DIR, `${grammarId}-source.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
  if (!Array.isArray(rows) || rows.length !== 25) {
    return null;
  }

  return rows.map((row) => String(row.thai ?? "").trim());
}

function readFinalStage(grammarId) {
  const filePath = path.join(GENERATED_DIR, `${grammarId}-final25-reviewed.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  return typeof parsed?.stage === "string" && parsed.stage.trim()
    ? parsed.stage.trim()
    : null;
}

async function fetchPublishedThaiRows(client, grammarId) {
  const result = await client.query(
    `
    SELECT thai
    FROM ${GRAMMAR_EXAMPLES_TABLE}
    WHERE grammar_id = $1
      AND publish_state = 'published'
    ORDER BY sort_order ASC, id ASC
    `,
    [grammarId],
  );

  return result.rows.map((row) => String(row.thai ?? "").trim());
}

async function fetchProductionState(client, grammarIds) {
  const result = await client.query(
    `
    SELECT
      p.grammar_id,
      p.current_rewrite_wave_id,
      COUNT(*) FILTER (
        WHERE e.publish_state = 'published'
          AND e.review_status = 'approved'
      )::int AS live_approved_count,
      COUNT(*) FILTER (
        WHERE e.publish_state = 'staged'
          AND e.rewrite_wave_id IS NOT DISTINCT FROM p.current_rewrite_wave_id
          AND e.review_status = 'approved'
          AND e.tone_status = 'approved'
          AND e.tone_confidence >= $2
      )::int AS current_wave_ready_count
    FROM ${GRAMMAR_LESSON_PRODUCTION_TABLE} p
    LEFT JOIN ${GRAMMAR_EXAMPLES_TABLE} e
      ON e.grammar_id = p.grammar_id
    WHERE p.grammar_id = ANY($1::text[])
    GROUP BY p.grammar_id, p.current_rewrite_wave_id
    ORDER BY p.grammar_id ASC
    `,
    [grammarIds, APPROVED_TONE_CONFIDENCE],
  );

  return new Map(result.rows.map((row) => [row.grammar_id, row]));
}

async function publishLesson(client, grammarId, currentRewriteWaveId) {
  await client.query(
    `
    UPDATE ${GRAMMAR_EXAMPLES_TABLE}
    SET
      publish_state = 'retired',
      updated_at = NOW()
    WHERE grammar_id = $1
      AND publish_state = 'published'
    `,
    [grammarId],
  );

  await client.query(
    `
    UPDATE ${GRAMMAR_EXAMPLES_TABLE}
    SET
      publish_state = 'published',
      updated_at = NOW()
    WHERE grammar_id = $1
      AND publish_state = 'staged'
      AND rewrite_wave_id = $2
      AND review_status = 'approved'
      AND tone_status = 'approved'
      AND tone_confidence >= $3
    `,
    [grammarId, currentRewriteWaveId, APPROVED_TONE_CONFIDENCE],
  );

  await client.query(
    `
    UPDATE ${GRAMMAR_LESSON_PRODUCTION_TABLE}
    SET
      last_published_at = NOW(),
      current_rewrite_wave_id = NULL,
      updated_at = NOW()
    WHERE grammar_id = $1
    `,
    [grammarId],
  );
}

async function adoptMatchingPublishedLesson(client, grammarId) {
  const stage = readFinalStage(grammarId);
  await client.query(
    `
    UPDATE ${GRAMMAR_EXAMPLES_TABLE}
    SET
      review_status = 'approved',
      quality_flags = '["new_gen"]'::jsonb,
      approved_at = NOW(),
      updated_at = NOW()
    WHERE grammar_id = $1
      AND publish_state = 'published'
    `,
    [grammarId],
  );

  await client.query(
    `
    INSERT INTO ${GRAMMAR_LESSON_PRODUCTION_TABLE} (
      grammar_id,
      stage,
      final_target_count,
      first_pass_candidate_target,
      supplemental_candidate_batch_size,
      current_rewrite_wave_id,
      notes,
      last_generated_at,
      last_published_at,
      created_at,
      updated_at
    ) VALUES ($1, $2, 25, 40, 10, NULL, 'Adopted matching published manual-source rows', NOW(), NOW(), NOW(), NOW())
    ON CONFLICT (grammar_id)
    DO UPDATE SET
      stage = COALESCE(EXCLUDED.stage, ${GRAMMAR_LESSON_PRODUCTION_TABLE}.stage),
      last_published_at = NOW(),
      current_rewrite_wave_id = NULL,
      updated_at = NOW()
    `,
    [grammarId, stage],
  );
}

async function main() {
  const { stages, lessons, dryRun } = parseArgs();
  const targetLessonIds = lessons.length > 0 ? lessons : collectGrammarIds(stages);
  const client = await pool.connect();

  try {
    const productionState = await fetchProductionState(client, targetLessonIds);
    const readyToPublish = [];
    const adoptPublished = [];
    const skipped = [];
    const blockers = [];

    for (const grammarId of targetLessonIds) {
      const state = productionState.get(grammarId);
      const liveApprovedCount = Number(state?.live_approved_count ?? 0);
      const currentWaveReadyCount = Number(state?.current_wave_ready_count ?? 0);
      const currentRewriteWaveId = state?.current_rewrite_wave_id ?? null;

      if (!currentRewriteWaveId) {
        if (liveApprovedCount === 25) {
          skipped.push(grammarId);
        } else {
          const sourceThaiRows = readSourceThaiRows(grammarId);
          const publishedThaiRows = await fetchPublishedThaiRows(client, grammarId);
          const canAdoptPublishedRows =
            Array.isArray(sourceThaiRows) &&
            publishedThaiRows.length === 25 &&
            JSON.stringify(sourceThaiRows) === JSON.stringify(publishedThaiRows);

          if (canAdoptPublishedRows) {
            adoptPublished.push(grammarId);
          } else {
            blockers.push(
              `${grammarId}: no staged rewrite wave and only ${liveApprovedCount}/25 live approved rows`,
            );
          }
        }
        continue;
      }

      if (currentWaveReadyCount < 25) {
        blockers.push(
          `${grammarId}: staged wave ${currentRewriteWaveId} only has ${currentWaveReadyCount}/25 publish-ready rows`,
        );
        continue;
      }

      readyToPublish.push({
        grammarId,
        currentRewriteWaveId,
      });
    }

    if (blockers.length > 0) {
      throw new Error(`Cannot publish curriculum sweep:\n${blockers.join("\n")}`);
    }

    if (dryRun) {
      console.log(
        JSON.stringify(
          {
            stages,
            targetLessonCount: targetLessonIds.length,
            readyToPublish: readyToPublish.map((lesson) => lesson.grammarId),
            adoptPublished,
            skipped,
          },
          null,
          2,
        ),
      );
      return;
    }

    await client.query("BEGIN");
    for (const lesson of readyToPublish) {
      await publishLesson(client, lesson.grammarId, lesson.currentRewriteWaveId);
    }
    for (const grammarId of adoptPublished) {
      await adoptMatchingPublishedLesson(client, grammarId);
    }
    await client.query("COMMIT");

    console.log(
      JSON.stringify(
        {
          stages,
          publishedCount: readyToPublish.length,
          publishedLessons: readyToPublish.map((lesson) => lesson.grammarId),
          adoptedPublishedCount: adoptPublished.length,
          adoptedPublishedLessons: adoptPublished,
          skipped,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback errors after failed dry runs / preflight checks.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Failed to publish curriculum rewrite waves:", error);
  process.exitCode = 1;
});
