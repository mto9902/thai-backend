import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { fileURLToPath } from "url";

import { analyzeBreakdownTones } from "../breakdownTone.js";
import { pool } from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
const GRAMMAR_DIR = path.resolve(SERVER_ROOT, "grammar");
const MODEL = process.env.GRAMMAR_EXAMPLE_MODEL || "gpt-4o";
const GRAMMAR_EXAMPLES_TABLE = "grammar_examples";
const REVIEW_DATE = "2026-04-06";
const REVIEW_NOTE = `New Gen tone annotation ${REVIEW_DATE}`;
const VALID_TONES = new Set(["mid", "low", "falling", "high", "rising"]);
const DEFAULT_LESSONS = [
  "past-laew",
  "recent-past-phoeng",
  "female-particles-kha-kha",
  "frequency-adverbs",
  "like-chorp",
  "permission-dai",
  "skill-pen",
];

function parseArgs() {
  const args = process.argv.slice(2);
  const lessonsIndex = args.indexOf("--lessons");
  const batchSizeIndex = args.indexOf("--batch-size");

  const lessons =
    lessonsIndex >= 0 && lessonsIndex < args.length - 1
      ? args[lessonsIndex + 1]
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : DEFAULT_LESSONS;

  const parsedBatchSize =
    batchSizeIndex >= 0 && batchSizeIndex < args.length - 1
      ? Number.parseInt(args[batchSizeIndex + 1], 10)
      : 8;

  return {
    lessons,
    batchSize:
      Number.isFinite(parsedBatchSize) && parsedBatchSize > 0 ? parsedBatchSize : 8,
    dryRun: args.includes("--dry-run"),
  };
}

function normalizeToneArray(value, fieldLabel) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${fieldLabel} must be a non-empty tones array`);
  }

  const normalized = value.map((item) => String(item ?? "").trim().toLowerCase());
  for (const tone of normalized) {
    if (!VALID_TONES.has(tone)) {
      throw new Error(`${fieldLabel} contains invalid tone "${tone}"`);
    }
  }

  return normalized;
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
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

function summarizeRowToneState(breakdown) {
  const analyses = breakdown.map((item) =>
    analyzeBreakdownTones({
      thai: item.thai,
      romanization: item.romanization,
      providedTones: Array.isArray(item.tones) ? item.tones : item.tone ? [item.tone] : [],
    }),
  );

  const unresolvedItemCount = analyses.filter((analysis) => analysis.tones.length === 0).length;
  const allResolved = unresolvedItemCount === 0;

  return {
    confidence: allResolved ? 100 : 99,
    status: allResolved ? "approved" : "review",
    source: allResolved ? "new-gen-annotated" : "new-gen-annotated-partial",
    needsReview: !allResolved,
    reasons: allResolved
      ? []
      : ["Some breakdown tones still need manual cleanup."],
    unresolvedItemCount,
    breakdown: analyses,
  };
}

async function fetchPublishedRows(grammarId) {
  const result = await pool.query(
    `
    SELECT
      id,
      grammar_id,
      sort_order,
      thai,
      romanization,
      english,
      breakdown,
      difficulty
    FROM ${GRAMMAR_EXAMPLES_TABLE}
    WHERE grammar_id = $1
      AND publish_state = 'published'
      AND review_status = 'approved'
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
  }));
}

function buildPrompt(grammarId, rows) {
  const payload = rows.map((row) => ({
    thai: row.thai,
    english: row.english,
    sentenceRomanization: row.romanization,
    breakdown: row.breakdown.map((item) => ({
      thai: item.thai,
      english: item.english,
      romanization: item.romanization || "",
      existingTones: Array.isArray(item.tones)
        ? item.tones
        : item.tone
          ? [item.tone]
          : [],
      grammar: item.grammar === true,
    })),
  }));

  return `
You are annotating Thai breakdown tones for a production learner app.

Grammar point
- id: ${grammarId}

Task
- For every row below, return the SAME row Thai and the SAME breakdown Thai chunks in the SAME order.
- Do not change Thai, English, or romanization.
- Your only job is to return a tones array for every breakdown item.
- Use only these tone names: mid, low, falling, high, rising.
- Return exactly one tone per heard Thai syllable in that chunk, in order.
- Single-syllable chunks must have exactly one tone.
- Multi-syllable chunks such as พวกเรา or เชียงใหม่ must have one tone entry per syllable.
- Keep existing tones if they are already correct.
- Do not add commentary.
- Do not use markdown.

Return ONLY valid JSON in this exact shape:
{
  "rows": [
    {
      "thai": "",
      "breakdown": [
        {
          "thai": "",
          "tones": ["mid"]
        }
      ]
    }
  ]
}

Rows to annotate
${JSON.stringify(payload, null, 2)}
`;
}

function mergeAnnotatedBatch(originalRows, candidateRows) {
  if (!Array.isArray(candidateRows) || candidateRows.length !== originalRows.length) {
    throw new Error("Model returned a mismatched row count for tone annotation");
  }

  const candidateByThai = new Map();
  for (const row of candidateRows) {
    const thai = String(row?.thai ?? "").trim();
    if (!thai) {
      throw new Error("Model returned a row with missing Thai text");
    }
    if (candidateByThai.has(thai)) {
      throw new Error(`Model returned duplicate tone annotation row for "${thai}"`);
    }
    candidateByThai.set(thai, row);
  }

  return originalRows.map((row, rowIndex) => {
    const candidate = candidateByThai.get(row.thai);
    if (!candidate) {
      throw new Error(`Model omitted row "${row.thai}"`);
    }
    if (!Array.isArray(candidate.breakdown) || candidate.breakdown.length !== row.breakdown.length) {
      throw new Error(`Model returned a mismatched breakdown length for "${row.thai}"`);
    }

    const mergedBreakdown = row.breakdown.map((item, itemIndex) => {
      const candidateItem = candidate.breakdown[itemIndex];
      const candidateThai = String(candidateItem?.thai ?? "").trim();
      if (candidateThai !== item.thai) {
        throw new Error(
          `Model changed breakdown Thai for "${row.thai}" at index ${itemIndex + 1}`,
        );
      }

      const tones = normalizeToneArray(
        candidateItem?.tones,
        `${row.thai} breakdown ${itemIndex + 1}`,
      );
      const analysis = analyzeBreakdownTones({
        thai: item.thai,
        romanization: item.romanization,
        providedTones: tones,
      });

      if (analysis.syllableCount !== tones.length) {
        throw new Error(
          `${row.thai} breakdown "${item.thai}" returned ${tones.length} tones for ${analysis.syllableCount} syllables`,
        );
      }

      return {
        ...item,
        tones,
        ...(tones.length === 1 ? { tone: tones[0] } : {}),
      };
    });

    const toneAnalysis = summarizeRowToneState(mergedBreakdown);
    return {
      ...row,
      breakdown: mergedBreakdown,
      toneConfidence: toneAnalysis.confidence,
      toneStatus: toneAnalysis.status,
      toneAnalysis,
    };
  });
}

async function withRetry(task, label, maxAttempts = 5) {
  let attempt = 0;
  let lastError = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await task();
    } catch (err) {
      lastError = err;
      const status = err?.status ?? err?.response?.status ?? null;
      const retryable =
        status === 429 ||
        (typeof status === "number" && status >= 500) ||
        /rate limit|quota|temporar|timeout|overloaded/i.test(String(err?.message ?? ""));

      if (!retryable || attempt >= maxAttempts) {
        throw err;
      }

      const delayMs = 1500 * attempt;
      console.log(`${label}: retrying after ${delayMs}ms (${attempt}/${maxAttempts})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

async function annotateBatch(openai, grammarId, rows) {
  const prompt = buildPrompt(grammarId, rows);
  let lastError = null;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await withRetry(
        () =>
          openai.chat.completions.create({
            model: MODEL,
            temperature: 0.1,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content:
                  "You annotate Thai breakdown tone arrays for a production learner app. Return strict JSON only and do not change the source text.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
          }),
        `${grammarId}: OpenAI tone annotation`,
      );

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(`${grammarId}: OpenAI returned an empty response`);
      }

      const parsed = JSON.parse(content.replace(/```json|```/g, "").trim());
      return mergeAnnotatedBatch(rows, parsed.rows);
    } catch (error) {
      lastError = error;
      if (attempt >= 4) {
        throw error;
      }
      console.log(
        `${grammarId}: retrying invalid tone annotation output (${attempt}/4): ${error.message}`,
      );
    }
  }

  throw lastError;
}

async function saveRows(grammarId, rows) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const row of rows) {
      await client.query(
        `
        UPDATE ${GRAMMAR_EXAMPLES_TABLE}
        SET
          breakdown = $2::jsonb,
          tone_confidence = $3,
          tone_status = $4,
          tone_analysis = $5::jsonb,
          review_status = 'approved',
          review_note = $6,
          last_edited_at = NOW(),
          approved_at = COALESCE(approved_at, NOW())
        WHERE id = $1
        `,
        [
          row.id,
          JSON.stringify(row.breakdown),
          row.toneConfidence,
          row.toneStatus,
          JSON.stringify(row.toneAnalysis),
          REVIEW_NOTE,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  writeCsvMirror(grammarId, rows);
}

async function main() {
  const { lessons, batchSize, dryRun } = parseArgs();
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for New Gen tone annotation");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const summary = [];

  for (const grammarId of lessons) {
    const rows = await fetchPublishedRows(grammarId);
    if (rows.length !== 25) {
      throw new Error(`${grammarId} must have exactly 25 live approved rows before tone annotation`);
    }

    const annotatedByThai = new Map();
    for (const batch of chunkArray(rows, batchSize)) {
      console.log(`${grammarId}: annotating batch of ${batch.length} rows`);
      const annotatedBatch = await annotateBatch(openai, grammarId, batch);
      for (const row of annotatedBatch) {
        annotatedByThai.set(row.thai, row);
      }
    }

    const nextRows = rows.map((row) => annotatedByThai.get(row.thai) ?? row);
    const unresolvedToneItems = nextRows.reduce(
      (sum, row) => sum + Number(row.toneAnalysis?.unresolvedItemCount ?? 0),
      0,
    );

    if (!dryRun) {
      await saveRows(grammarId, nextRows);
    }

    summary.push({
      grammarId,
      rowCount: nextRows.length,
      unresolvedToneItems,
    });
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error("Failed to annotate New Gen breakdown tones:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
