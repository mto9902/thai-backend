import dotenv from "dotenv";
import path from "path";
import OpenAI from "openai";
import { fileURLToPath } from "url";

import {
  buildMissingItemsPrompt,
  fetchPublishedRows,
  findUnresolvedItems,
  mergeAnnotatedItems,
  parseJsonFromText,
  saveAnnotatedRows,
} from "./lib/newGenToneAnnotation.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(SERVER_ROOT, ".env"), quiet: true });

const GRAMMAR_EXAMPLES_TABLE = "grammar_examples";
const GRAMMAR_DIR = path.join(SERVER_ROOT, "grammar");
const REVIEW_DATE = "2026-04-06";
const REVIEW_NOTE = `New Gen tone annotation ${REVIEW_DATE}`;
const DEFAULT_BATCH_SIZE = 12;
const MAX_ATTEMPTS = Number.parseInt(
  process.env.MOONSHOT_ANNOTATION_MAX_ATTEMPTS || "8",
  10,
);

function parseArgs() {
  const args = process.argv.slice(2);
  const getValue = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 && index < args.length - 1 ? args[index + 1] : undefined;
  };

  const lessonsValue = getValue("--lessons");
  const batchSizeValue = Number.parseInt(
    getValue("--batch-size") || String(DEFAULT_BATCH_SIZE),
    10,
  );

  return {
    lessons: lessonsValue
      ? lessonsValue
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [
          "past-laew",
          "female-particles-kha-kha",
          "frequency-adverbs",
          "like-chorp",
          "permission-dai",
          "skill-pen",
        ],
    batchSize:
      Number.isFinite(batchSizeValue) && batchSizeValue > 0
        ? batchSizeValue
        : DEFAULT_BATCH_SIZE,
    dryRun: args.includes("--dry-run"),
  };
}

async function withRetry(task, label) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      const status = error?.status ?? error?.response?.status ?? null;
      const retryable =
        status === 429 ||
        (typeof status === "number" && status >= 500) ||
        /rate limit|quota|temporar|timeout|overloaded|connection/i.test(
          String(error?.message ?? ""),
        );

      if (!retryable || attempt >= MAX_ATTEMPTS) {
        throw error;
      }

      const delayMs = Math.min(5000 * attempt, 30000);
      console.log(`${label}: retrying after ${delayMs}ms (${attempt}/${MAX_ATTEMPTS})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

async function annotateBatch(openai, model, grammarId, batch, modelOptions = {}) {
  const prompt = buildMissingItemsPrompt(grammarId, batch);

  const response = await withRetry(
    () =>
      openai.chat.completions.create({
        model,
        ...modelOptions,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You annotate Thai breakdown tone arrays. Return strict JSON only. Keep rowThai, itemIndex, and thai unchanged. Do not browse or use tools.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    `${grammarId}: missing-tone batch`,
  );

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`${grammarId}: model returned an empty missing-tone response`);
  }

  const parsed = parseJsonFromText(content);
  const items = Array.isArray(parsed) ? parsed : parsed?.items;
  if (!Array.isArray(items) || items.length !== batch.length) {
    throw new Error(
      `${grammarId}: expected ${batch.length} annotated items, got ${Array.isArray(items) ? items.length : 0}`,
    );
  }

  return items;
}

async function main() {
  const { pool } = await import("../db.js");
  const { lessons, batchSize, dryRun } = parseArgs();

  const apiKey = process.env.MOONSHOT_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("MOONSHOT_API_KEY (or OPENAI_API_KEY) is required");
  }

  const usingMoonshot = Boolean(process.env.MOONSHOT_API_KEY);
  const model = usingMoonshot
    ? process.env.MOONSHOT_ANNOTATION_MODEL ||
      process.env.MOONSHOT_MODEL ||
      "kimi-k2.5"
    : process.env.GRAMMAR_EXAMPLE_MODEL || "gpt-4o";
  const modelOptions = usingMoonshot ? { temperature: 1 } : { temperature: 0.1 };

  const openai = new OpenAI({
    apiKey,
    ...(usingMoonshot
      ? { baseURL: process.env.MOONSHOT_BASE_URL || "https://api.moonshot.ai/v1" }
      : {}),
  });

  const summary = [];

  for (const grammarId of lessons) {
    let rows = await fetchPublishedRows(pool, GRAMMAR_EXAMPLES_TABLE, grammarId);
    if (rows.length !== 25) {
      throw new Error(`${grammarId} must have exactly 25 live approved rows before annotation`);
    }

    let unresolvedItems = findUnresolvedItems(rows);
    let batchCount = 0;

    while (unresolvedItems.length > 0) {
      batchCount += 1;
      const batch = unresolvedItems.slice(0, batchSize);
      console.log(
        `${grammarId}: annotating ${batch.length} missing items (${unresolvedItems.length} remaining before batch ${batchCount})`,
      );
      const annotatedItems = await annotateBatch(
        openai,
        model,
        grammarId,
        batch,
        modelOptions,
      );
      rows = mergeAnnotatedItems(rows, annotatedItems);
      unresolvedItems = findUnresolvedItems(rows);
    }

    if (!dryRun) {
      await saveAnnotatedRows({
        pool,
        tableName: GRAMMAR_EXAMPLES_TABLE,
        grammarDir: GRAMMAR_DIR,
        reviewNote: REVIEW_NOTE,
        grammarId,
        rows,
      });
    }

    summary.push({
      grammarId,
      rowCount: rows.length,
      unresolvedToneItems: findUnresolvedItems(rows).length,
      batchCount,
      dryRun,
    });
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error("Failed to annotate New Gen missing tones:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { pool } = await import("../db.js");
    await pool.end().catch(() => {});
  });
