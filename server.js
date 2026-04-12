import bcrypt from "bcrypt";
import cors from "cors";
import csv from "csv-parser";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import OpenAI from "openai";
import path from "path";
import textToSpeech from "@google-cloud/text-to-speech";
import { createHash, randomBytes, randomUUID } from "crypto";
import { analyzeBreakdownTones } from "./breakdownTone.js";
import { getPoolStats, pool } from "./db.js";
import registerJlptRoutes from "./jlpt.js";
import {
  extractPaddleCustomUserId,
  extractPaddlePriceId,
  findPaddleCustomerByEmail,
  getPaddlePublicConfig,
  isPaddleApiConfigured,
  isPaddleSubscriptionAccessActive,
  isPaddleWebhookConfigured,
  listPaddleSubscriptionsForCustomer,
  normalizePaddleSubscriptionStatus,
  paddleApiRequest,
  verifyPaddleWebhookSignature,
} from "./paddle.js";
import { registerSRSRoutes, SRS_CONFIG } from "./srs.js";
import registerExplainSentenceRoute from "./explainSentence.js";
import registerTransformRoute from "./transform.js";

dotenv.config();

const app = express();
app.set("trust proxy", true);
app.use(cors());
app.use(
  express.json({
    limit: process.env.JSON_BODY_LIMIT || "1mb",
    verify: (req, _res, buffer) => {
      if (req.originalUrl === "/webhooks/paddle") {
        req.rawBody = buffer.toString("utf8");
      }
    },
  }),
);

const registeredRoutes = [];
const TRACKED_HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

function trackRouteRegistration(method, routePath) {
  if (typeof routePath !== "string") {
    return;
  }

  registeredRoutes.push({
    method: method.toUpperCase(),
    path: routePath,
  });
}

for (const method of TRACKED_HTTP_METHODS) {
  const originalMethod = app[method].bind(app);
  app[method] = (routePath, ...handlers) => {
    if (handlers.length === 0) {
      return originalMethod(routePath);
    }

    trackRouteRegistration(method, routePath);
    return originalMethod(routePath, ...handlers);
  };
}

function readPositiveIntEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const PORT = readPositiveIntEnv("PORT", 3000);
const TTS_CACHE_DIR = path.resolve(process.env.TTS_CACHE_DIR || "./tts-cache");
const TTS_SENTENCE_DIR = path.join(TTS_CACHE_DIR, "sentences");
const TTS_CACHE_MAX_BYTES = readPositiveIntEnv(
  "TTS_CACHE_MAX_BYTES",
  1024 * 1024 * 1024,
);
const TTS_CACHE_TRIM_TARGET_BYTES = Math.floor(TTS_CACHE_MAX_BYTES * 0.85);
const TTS_MAX_CONCURRENT = readPositiveIntEnv("TTS_MAX_CONCURRENT", 4);
const GRAMMAR_EXAMPLES_TABLE = "grammar_examples";
const GRAMMAR_LESSON_OVERRIDES_TABLE = "grammar_lesson_overrides";
const GRAMMAR_EXAMPLE_COMMENTS_TABLE = "grammar_example_comments";
const GRAMMAR_EXAMPLE_REVISIONS_TABLE = "grammar_example_revisions";
const GRAMMAR_LESSON_COMMENTS_TABLE = "grammar_lesson_comments";
const GRAMMAR_LESSON_PRODUCTION_TABLE = "grammar_lesson_production";
const WRITE_GRAMMAR_CSV_MIRROR = process.env.WRITE_GRAMMAR_CSV_MIRROR !== "false";
const PASSWORD_RESET_EXPIRY_MINUTES = readPositiveIntEnv(
  "PASSWORD_RESET_EXPIRY_MINUTES",
  60,
);
app.use(
  "/tts-cache",
  express.static(TTS_CACHE_DIR, {
    immutable: true,
    maxAge: "365d",
  }),
);

/* =============================== */
/* THAI VOWEL SYLLABLE DETECTION */
/* =============================== */

const thaiVowels = [
  "\u0E30", // ะ
  "\u0E32", // า
  "\u0E34", // ิ
  "\u0E35", // ี
  "\u0E36", // ึ
  "\u0E37", // ื
  "\u0E38", // ุ
  "\u0E39", // ู
  "\u0E40", // เ
  "\u0E41", // แ
  "\u0E42", // โ
  "\u0E43", // ใ
  "\u0E44", // ไ
  "\u0E33", // ำ
  "\u0E45", // ๅ
  "\u0E24", // ฤ
];

function countThaiSyllables(word) {
  let count = 0;

  for (const v of thaiVowels) {
    if (word.includes(v)) {
      count += word.split(v).length - 1;
    }
  }

  return count;
}

/* =============================== */
/* LOAD GRAMMAR CSV FILES */
/* =============================== */

let grammarSentences = {};

const ADMIN_DATA_DIR = path.resolve("./admin-data");
const GRAMMAR_OVERRIDES_FILE = path.join(
  ADMIN_DATA_DIR,
  "grammar-overrides.json",
);
const GRAMMAR_ORDER_SEED_FILE = path.join(
  ADMIN_DATA_DIR,
  "grammar-order-seed.json",
);
const SUPPORT_REQUESTS_FILE = path.join(
  ADMIN_DATA_DIR,
  "support-requests.ndjson",
);
const SUPPORT_INBOX_EMAIL =
  process.env.SUPPORT_EMAIL?.trim() || "hello@keystonelanguages.com";
const GRAMMAR_DIR = path.resolve("./grammar");
const VALID_CEFR_LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);
const GRAMMAR_STAGE_ORDER = [
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
const VALID_GRAMMAR_STAGES = new Set(GRAMMAR_STAGE_ORDER);
const GRAMMAR_STAGE_ORDER_INDEX = new Map(
  GRAMMAR_STAGE_ORDER.map((stage, index) => [stage, index]),
);
const VALID_TONES = new Set(["mid", "low", "falling", "high", "rising"]);
const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const VALID_TONE_STATUSES = new Set(["approved", "review"]);
const VALID_REVIEW_STATUSES = new Set([
  "flagged",
  "in_review",
  "approved",
  "needs_changes",
  "hidden",
]);
const VALID_PUBLISH_STATES = new Set(["published", "staged", "retired"]);
const VALID_NEXT_WAVE_DECISIONS = new Set([
  "carry",
  "revise",
  "replace",
  "retire",
]);
const VALID_ROW_QUALITY_FLAGS = new Set(["thai_weak", "legacy", "new_gen"]);
const APPROVED_TONE_CONFIDENCE = 99;
const DEFAULT_FINAL_APPROVED_TARGET = 25;
const DEFAULT_FIRST_PASS_CANDIDATE_TARGET = 40;
const DEFAULT_SUPPLEMENTAL_BATCH_SIZE = 10;

function getRequestIdentity(req, prefix = "anon") {
  if (req.userId) {
    return `${prefix}:user:${req.userId}`;
  }

  const forwardedFor = req.headers["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : typeof forwardedFor === "string"
      ? forwardedFor.split(",")[0]
      : "";
  const ip = forwardedIp || req.ip || req.socket?.remoteAddress || "unknown";
  return `${prefix}:ip:${ip}`;
}

function createRateLimiter({ keyPrefix, maxRequests, windowMs }) {
  const buckets = new Map();
  const cleanupHandle = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of buckets.entries()) {
      const active = timestamps.filter((timestamp) => now - timestamp < windowMs);
      if (active.length > 0) {
        buckets.set(key, active);
      } else {
        buckets.delete(key);
      }
    }
  }, Math.max(windowMs, 60000));
  cleanupHandle.unref?.();

  return function rateLimiter(req, res, next) {
    const key = getRequestIdentity(req, keyPrefix);
    const now = Date.now();
    const bucket = (buckets.get(key) || []).filter(
      (timestamp) => now - timestamp < windowMs,
    );

    if (bucket.length >= maxRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((windowMs - (now - bucket[0])) / 1000),
      );
      res.set("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        error: "Too many requests. Please wait a moment and try again.",
      });
    }

    bucket.push(now);
    buckets.set(key, bucket);
    next();
  };
}

function createConcurrencyLimiter(maxConcurrent) {
  let activeCount = 0;
  const waitQueue = [];

  async function run(task) {
    if (activeCount >= maxConcurrent) {
      await new Promise((resolve) => {
        waitQueue.push(resolve);
      });
    }

    activeCount += 1;

    try {
      return await task();
    } finally {
      activeCount = Math.max(0, activeCount - 1);
      const next = waitQueue.shift();
      next?.();
    }
  }

  return {
    run,
    getStats() {
      return {
        activeCount,
        maxConcurrent,
        queuedCount: waitQueue.length,
      };
    },
  };
}

const authRateLimiter = createRateLimiter({
  keyPrefix: "auth",
  maxRequests: readPositiveIntEnv("AUTH_RATE_LIMIT_MAX", 20),
  windowMs: readPositiveIntEnv("AUTH_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
});
const sentenceTtsRateLimiter = createRateLimiter({
  keyPrefix: "tts",
  maxRequests: readPositiveIntEnv("TTS_RATE_LIMIT_MAX", 90),
  windowMs: readPositiveIntEnv("TTS_RATE_LIMIT_WINDOW_MS", 60 * 1000),
});
const grammarExplanationRateLimiter = createRateLimiter({
  keyPrefix: "grammar-explain",
  maxRequests: readPositiveIntEnv("GRAMMAR_EXPLANATION_RATE_LIMIT_MAX", 20),
  windowMs: readPositiveIntEnv("GRAMMAR_EXPLANATION_RATE_LIMIT_WINDOW_MS", 60 * 1000),
});
const supportRequestRateLimiter = createRateLimiter({
  keyPrefix: "support",
  maxRequests: readPositiveIntEnv("SUPPORT_RATE_LIMIT_MAX", 8),
  windowMs: readPositiveIntEnv("SUPPORT_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
});
const ttsConcurrencyLimiter = createConcurrencyLimiter(TTS_MAX_CONCURRENT);

function parseGrammarBreakdown(rawBreakdown, contextLabel) {
  try {
    const parsed =
      typeof rawBreakdown === "string" ? JSON.parse(rawBreakdown) : rawBreakdown;

    if (!Array.isArray(parsed)) {
      throw new Error("Breakdown must be an array");
    }

    return parsed;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to parse breakdown";
    throw new Error(`${contextLabel}: ${message}`);
  }
}

function normalizeStoredGrammarRow(row, index, grammarId, options = {}) {
  return normalizeGrammarRow(
    {
      thai: row.thai,
      romanization: row.romanization,
      english: row.english,
      breakdown: parseGrammarBreakdown(
        row.breakdown,
        `Invalid breakdown for ${grammarId} row ${index + 1}`,
      ),
      difficulty: row.difficulty,
    },
    index,
    options,
  );
}

function readGrammarRowsFromCsvFile(filePath, grammarId) {
  const rows = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        try {
          rows.push(
            normalizeStoredGrammarRow(row, rows.length, grammarId, {
              trustProvidedTones: true,
            }),
          );
        } catch (err) {
          reject(err);
        }
      })
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

async function readGrammarRowsFromCsvDirectory() {
  const nextGrammarSentences = {};
  const files = fs.readdirSync(GRAMMAR_DIR);

  for (const file of files) {
    if (!file.endsWith(".csv")) {
      continue;
    }

    const grammarId = file.replace(".csv", "");
    const rows = await readGrammarRowsFromCsvFile(
      path.join(GRAMMAR_DIR, file),
      grammarId,
    );
    nextGrammarSentences[grammarId] = rows;
  }

  return nextGrammarSentences;
}

let grammarRowNormalizationPromise = null;

async function persistNormalizedGrammarRows(
  updates,
  nextGrammarSentences,
  grammarsNeedingCsvMirror,
) {
  if (!Array.isArray(updates) || updates.length === 0) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const update of updates) {
      await client.query(
        `
        UPDATE ${GRAMMAR_EXAMPLES_TABLE}
        SET
          breakdown = $2::jsonb,
          tone_confidence = $3,
          tone_status = $4,
          tone_analysis = $5::jsonb,
          review_status = $6,
          updated_at = NOW()
        WHERE id = $1
        `,
        [
          update.id,
          JSON.stringify(update.breakdown),
          update.toneConfidence,
          update.toneStatus,
          JSON.stringify(update.toneAnalysis),
          update.reviewStatus,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  for (const grammarId of grammarsNeedingCsvMirror) {
    const rows = nextGrammarSentences[grammarId];
    if (Array.isArray(rows)) {
      writeGrammarRowsToCsvMirror(grammarId, rows);
    }
  }

  console.log(
    `Backfilled tone metadata for ${updates.length} grammar example row${updates.length === 1 ? "" : "s"}`,
  );
}

async function loadGrammarRowsFromDatabase() {
  const result = await pool.query(
    `
    SELECT
      id,
      grammar_id,
      thai,
      romanization,
      english,
      breakdown,
      difficulty,
      sort_order,
      tone_confidence,
      tone_status,
      tone_analysis,
      review_status,
      review_assignee_user_id,
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
    FROM ${GRAMMAR_EXAMPLES_TABLE}
    ORDER BY grammar_id ASC, sort_order ASC, id ASC
    `,
  );

  const nextGrammarSentences = {};
  const updates = [];
  const grammarsNeedingCsvMirror = new Set();

  for (const row of result.rows) {
    if (!nextGrammarSentences[row.grammar_id]) {
      nextGrammarSentences[row.grammar_id] = [];
    }

    const normalizedBaseRow = normalizeStoredGrammarRow(
      row,
      nextGrammarSentences[row.grammar_id].length,
      row.grammar_id,
      {
        trustProvidedTonesByIndex: getToneTrustByIndexFromStoredRow(row),
      },
    );
    const defaultReviewStatus = deriveInitialReviewStatus({
      toneConfidence: normalizedBaseRow.toneConfidence,
      toneStatus: normalizedBaseRow.toneStatus,
    });
    const normalizedReviewStatus = normalizeReviewStatus(
      row.review_status,
      defaultReviewStatus,
    );
    const normalizedRow = {
      ...normalizedBaseRow,
      reviewStatus: normalizedReviewStatus,
      reviewAssigneeUserId: row.review_assignee_user_id
        ? Number(row.review_assignee_user_id)
        : null,
      reviewNote: row.review_note ?? null,
      publishState: normalizePublishState(row.publish_state, "published"),
      rewriteWaveId: row.rewrite_wave_id ?? null,
      sourceExampleId: row.source_example_id ? Number(row.source_example_id) : null,
      nextWaveDecision: normalizeOptionalNextWaveDecision(row.next_wave_decision),
      nextWaveAuditNote: row.next_wave_audit_note ?? null,
      nextWaveAuditedByUserId: row.next_wave_audited_by_user_id
        ? Number(row.next_wave_audited_by_user_id)
        : null,
      nextWaveAuditedAt: row.next_wave_audited_at ?? null,
      lastEditedByUserId: row.last_edited_by_user_id
        ? Number(row.last_edited_by_user_id)
        : null,
      lastEditedAt: row.last_edited_at ?? null,
      approvedByUserId: row.approved_by_user_id
        ? Number(row.approved_by_user_id)
        : null,
      approvedAt: row.approved_at ?? null,
    };
    nextGrammarSentences[row.grammar_id].push(normalizedRow);

    const storedBreakdown = JSON.stringify(row.breakdown ?? []);
    const normalizedBreakdown = JSON.stringify(normalizedBaseRow.breakdown);
    const storedConfidence = Number.isFinite(Number(row.tone_confidence))
      ? Number(row.tone_confidence)
      : 0;
    const storedStatus =
      typeof row.tone_status === "string" && VALID_TONE_STATUSES.has(row.tone_status)
        ? row.tone_status
        : "review";
    const storedAnalysis = JSON.stringify(row.tone_analysis ?? {});
    const normalizedAnalysis = JSON.stringify(normalizedBaseRow.toneAnalysis);
    const storedReviewStatus =
      typeof row.review_status === "string" ? row.review_status.trim().toLowerCase() : "";

    if (
      storedBreakdown !== normalizedBreakdown ||
      storedConfidence !== normalizedBaseRow.toneConfidence ||
      storedStatus !== normalizedBaseRow.toneStatus ||
      storedAnalysis !== normalizedAnalysis ||
      storedReviewStatus !== normalizedReviewStatus
    ) {
      updates.push({
        id: row.id,
        breakdown: normalizedBaseRow.breakdown,
        toneConfidence: normalizedBaseRow.toneConfidence,
        toneStatus: normalizedBaseRow.toneStatus,
        toneAnalysis: normalizedBaseRow.toneAnalysis,
        reviewStatus: normalizedReviewStatus,
      });
      grammarsNeedingCsvMirror.add(row.grammar_id);
    }
  }

  if (updates.length > 0) {
    // Keep startup responsive: the in-memory rows are already normalized, so
    // persisting those fixes back to Postgres can happen in the background.
    if (!grammarRowNormalizationPromise) {
      const scheduledUpdates = updates.map((update) => ({ ...update }));
      const scheduledGrammarIds = Array.from(grammarsNeedingCsvMirror);
      const scheduledRows = Object.fromEntries(
        scheduledGrammarIds.map((grammarId) => [grammarId, nextGrammarSentences[grammarId]]),
      );
      console.log(
        `Scheduling tone metadata backfill for ${scheduledUpdates.length} grammar example row${scheduledUpdates.length === 1 ? "" : "s"}`,
      );
      grammarRowNormalizationPromise = persistNormalizedGrammarRows(
        scheduledUpdates,
        scheduledRows,
        scheduledGrammarIds,
      )
        .catch((err) => {
          console.error("Background grammar tone metadata backfill failed:", err);
        })
        .finally(() => {
          grammarRowNormalizationPromise = null;
        });
    }
  }

  return nextGrammarSentences;
}

async function writeGrammarRowsToDatabase(grammarId, rows) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM ${GRAMMAR_EXAMPLES_TABLE} WHERE grammar_id = $1`,
      [grammarId],
    );

    for (const [index, row] of rows.entries()) {
      await client.query(
        `
        INSERT INTO ${GRAMMAR_EXAMPLES_TABLE}
          (
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
            review_assignee_user_id,
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
          )
        VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6::jsonb,
            $7,
            $8,
            $9,
            $10::jsonb,
            $11,
            $12::bigint,
            $13,
            $14,
            $15,
            $16::bigint,
            $17,
            $18,
            $19::bigint,
            $20,
            $21::bigint,
            CASE WHEN $21::bigint IS NOT NULL THEN NOW() ELSE NULL END,
            $22::bigint,
            CASE WHEN $22::bigint IS NOT NULL THEN NOW() ELSE NULL END
          )
        `,
        [
          grammarId,
          index,
          row.thai,
          row.romanization,
          row.english,
          JSON.stringify(row.breakdown),
          row.difficulty,
          row.toneConfidence,
          row.toneStatus,
          JSON.stringify(row.toneAnalysis),
          normalizeReviewStatus(
            row.reviewStatus,
            deriveInitialReviewStatus(row),
          ),
          row.reviewAssigneeUserId ?? null,
          row.reviewNote ?? null,
          normalizePublishState(row.publishState, "published"),
          normalizeOptionalRewriteWaveId(row.rewriteWaveId),
          row.sourceExampleId ?? null,
          normalizeOptionalNextWaveDecision(row.nextWaveDecision),
          row.nextWaveAuditNote ?? null,
          row.nextWaveAuditedByUserId ?? null,
          row.nextWaveAuditedAt ?? null,
          row.lastEditedByUserId ?? null,
          row.reviewStatus === "approved"
            ? row.approvedByUserId ?? row.lastEditedByUserId ?? null
            : null,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function writeGrammarRowsToCsvMirror(grammarId, rows) {
  if (!WRITE_GRAMMAR_CSV_MIRROR) {
    return;
  }

  fs.mkdirSync(GRAMMAR_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(GRAMMAR_DIR, `${grammarId}.csv`),
    serializeGrammarRows(rows),
    "utf8",
  );
}

async function importMissingGrammarCsvsToDatabase() {
  fs.mkdirSync(GRAMMAR_DIR, { recursive: true });

  const files = fs.readdirSync(GRAMMAR_DIR).filter((file) => file.endsWith(".csv"));
  if (files.length === 0) {
    return;
  }

  const existingResult = await pool.query(
    `
    SELECT grammar_id
    FROM ${GRAMMAR_EXAMPLES_TABLE}
    GROUP BY grammar_id
    HAVING COUNT(*) > 0
    `,
  );
  const existingGrammarIds = new Set(
    existingResult.rows.map((row) => row.grammar_id),
  );

  let importedCount = 0;

  for (const file of files) {
    const grammarId = file.replace(".csv", "");
    if (existingGrammarIds.has(grammarId)) {
      continue;
    }

    const rows = await readGrammarRowsFromCsvFile(
      path.join(GRAMMAR_DIR, file),
      grammarId,
    );

    if (rows.length === 0) {
      continue;
    }

    await writeGrammarRowsToDatabase(grammarId, rows);
    importedCount += 1;
  }

  if (importedCount > 0) {
    console.log(`Imported ${importedCount} grammar CSV files into Postgres`);
  }
}

async function loadGrammarSentencesIntoMemory() {
  await importMissingGrammarCsvsToDatabase();

  const fromDatabase = await loadGrammarRowsFromDatabase();

  if (Object.keys(fromDatabase).length > 0) {
    grammarSentences = fromDatabase;
    console.log(
      "Loaded grammar examples from Postgres:",
      Object.keys(fromDatabase).length,
      "grammar points",
    );
    return;
  }

  const fromCsv = await readGrammarRowsFromCsvDirectory();
  grammarSentences = fromCsv;
  console.log(
    "Loaded grammar examples from CSV fallback:",
    Object.keys(fromCsv).length,
    "grammar points",
  );
}

function buildWordRomanizationMap() {
  const wordMap = new Map();
  for (const sentences of Object.values(grammarSentences)) {
    for (const sentence of sentences) {
      if (!sentence.romanization || !sentence.breakdown) continue;
      const tokens = sentence.romanization.split(/\s+/);
      const canUseTokenFallback = tokens.length === sentence.breakdown.length;
      sentence.breakdown.forEach((w, i) => {
        const preferredRoman =
          w?.romanization || (canUseTokenFallback ? tokens[i] : "");
        if (preferredRoman && !wordMap.has(w.thai)) {
          wordMap.set(w.thai, preferredRoman);
        }
      });
    }
  }
  console.log("Built word romanization map:", wordMap.size, "entries");
  return wordMap;
}

async function backfillRomanization(wordMap) {
  try {
    const result = await pool.query(
      `SELECT DISTINCT thai FROM user_vocab WHERE romanization IS NULL OR romanization = ''`
    );
    let updated = 0;
    for (const row of result.rows) {
      const roman = wordMap.get(row.thai);
      if (roman) {
        await pool.query(
          `UPDATE user_vocab SET romanization = $1 WHERE thai = $2 AND (romanization IS NULL OR romanization = '')`,
          [roman, row.thai]
        );
        updated++;
      }
    }
    console.log("Backfilled romanization for", updated, "words");
  } catch (err) {
    console.error("Romanization backfill error:", err);
  }
}

/* =============================== */
/* LOAD DICTIONARY */
/* =============================== */

let dictionary = [];

function loadDictionary() {
  return new Promise((resolve, reject) => {
    const temp = [];

    fs.createReadStream("./telex-utf8.csv")
      .pipe(csv())
      .on("data", (row) => {
        let thai = row["t-entry"];
        const english = row["e-entry"];

        if (!thai || !english) return;

        thai = thai.replace(/\s\d+$/, "").trim();

        const syllables = countThaiSyllables(thai);

        if (syllables > 0) {
          temp.push({
            thai,
            english: english.trim(),
          });
        }
      })
      .on("end", () => {
        dictionary = temp;

        console.log("Dictionary loaded:", dictionary.length);

        resolve();
      })
      .on("error", (err) => {
        console.error("Dictionary load error:", err);
        reject(err);
      });
  });
}

/* =============================== */
/* DB CHECK */
/* =============================== */

pool
  .query("SELECT NOW()")
  .then(() => console.log("DB connected"))
  .catch((err) => console.error("DB error:", err));

/* =============================== */
/* OPENAI */
/* =============================== */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =============================== */
/* USER MEMORY */
/* =============================== */

const userMemory = {};
const MAX_MEMORY = 10;

function getUserMemory(sessionId) {
  if (!userMemory[sessionId]) {
    userMemory[sessionId] = {
      sentences: [],
      transformSentences: [],
      trainerWords: [],
    };
  }

  return userMemory[sessionId];
}

registerTransformRoute(app, openai);
registerJlptRoutes(app, { adminDataDir: ADMIN_DATA_DIR });

/* =============================== */
/* AUTH */
/* =============================== */

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ensureAdminDataFiles() {
  fs.mkdirSync(ADMIN_DATA_DIR, { recursive: true });

  if (!fs.existsSync(GRAMMAR_OVERRIDES_FILE)) {
    fs.writeFileSync(GRAMMAR_OVERRIDES_FILE, "{}", "utf8");
  }
}

function appendSupportRequest(record) {
  ensureAdminDataFiles();
  fs.appendFileSync(SUPPORT_REQUESTS_FILE, `${JSON.stringify(record)}\n`, "utf8");
}

function readGrammarOverrides() {
  ensureAdminDataFiles();

  try {
    const raw = fs.readFileSync(GRAMMAR_OVERRIDES_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    console.error("Failed to read grammar overrides:", err);
    return {};
  }
}

function writeGrammarOverrides(overrides) {
  ensureAdminDataFiles();
  fs.writeFileSync(
    GRAMMAR_OVERRIDES_FILE,
    JSON.stringify(overrides, null, 2),
    "utf8",
  );
}

let grammarOrderSeedMapCache = null;

function coerceLessonOrder(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return null;
}

function getGrammarStageOrder(stage) {
  return GRAMMAR_STAGE_ORDER_INDEX.get(stage) ?? Number.MAX_SAFE_INTEGER;
}

function readGrammarOrderSeedMap() {
  if (grammarOrderSeedMapCache) {
    return grammarOrderSeedMapCache;
  }

  ensureAdminDataFiles();

  if (!fs.existsSync(GRAMMAR_ORDER_SEED_FILE)) {
    grammarOrderSeedMapCache = new Map();
    return grammarOrderSeedMapCache;
  }

  try {
    const raw = fs.readFileSync(GRAMMAR_ORDER_SEED_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      grammarOrderSeedMapCache = new Map();
      return grammarOrderSeedMapCache;
    }

    grammarOrderSeedMapCache = new Map(
      Object.entries(parsed)
        .map(([grammarId, entry]) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }

          const stage =
            typeof entry.stage === "string" && VALID_GRAMMAR_STAGES.has(entry.stage)
              ? entry.stage
              : null;
          const lessonOrder = coerceLessonOrder(entry.lessonOrder);
          if (!stage || lessonOrder === null) {
            return null;
          }

          return [
            grammarId,
            {
              stage,
              stageOrder: getGrammarStageOrder(stage),
              lessonOrder,
            },
          ];
        })
        .filter(Boolean),
    );
    return grammarOrderSeedMapCache;
  } catch (err) {
    console.error("Failed to read grammar order seed:", err);
    grammarOrderSeedMapCache = new Map();
    return grammarOrderSeedMapCache;
  }
}

function getSeededGrammarOrder(grammarId) {
  return readGrammarOrderSeedMap().get(grammarId) ?? null;
}

function normalizeReviewStatus(value, fallback = "flagged") {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return VALID_REVIEW_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizePublishState(value, fallback = "published") {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return VALID_PUBLISH_STATES.has(normalized) ? normalized : fallback;
}

function normalizeOptionalReviewNote(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalAssigneeId(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeOptionalRewriteWaveId(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalNextWaveDecision(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return VALID_NEXT_WAVE_DECISIONS.has(normalized) ? normalized : null;
}

function normalizeOptionalAuditNote(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeLessonOrder(value) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("Lesson order must be a non-negative integer");
  }

  return parsed;
}

function normalizeQualityFlags(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) =>
          typeof item === "string" ? item.trim().toLowerCase() : "",
        )
        .filter((item) => VALID_ROW_QUALITY_FLAGS.has(item)),
    ),
  );
}

function createRewriteWaveId(grammarId) {
  return `${grammarId}-wave-${Date.now()}`;
}

function deriveInitialReviewStatus({ toneConfidence, toneStatus }) {
  if (
    toneStatus === "approved" &&
    Number(toneConfidence) >= APPROVED_TONE_CONFIDENCE
  ) {
    return "approved";
  }

  return "flagged";
}

function serializeReviewerUser(row) {
  return {
    id: Number(row.id),
    email: row.email,
    display_name: row.display_name ?? null,
    is_admin: row.is_admin === true,
    can_review_content: row.can_review_content === true,
  };
}

function normalizeReviewCommentBody(value, label = "Comment") {
  return normalizePlainString(value, label, { maxLength: 2000 });
}

function normalizePlainString(value, fieldName, options = {}) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  const { allowEmpty = false, maxLength = null } = options;

  if (!allowEmpty && !trimmed) {
    throw new Error(`${fieldName} is required`);
  }

  if (maxLength && trimmed.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or fewer`);
  }

  return trimmed;
}

function normalizeProvidedTones(value, fieldName) {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array of tone names`);
  }

  return value.map((entry, index) => {
    const tone = normalizePlainString(
      entry,
      `${fieldName} item ${index + 1}`,
      { allowEmpty: false },
    ).toLowerCase();

    if (!VALID_TONES.has(tone)) {
      throw new Error(
        `${fieldName} item ${index + 1} must be one of: ${Array.from(VALID_TONES).join(", ")}`,
      );
    }

    return tone;
  });
}

function normalizeDisplayThaiSegments(value, fieldName) {
  if (value == null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array of Thai display segments`);
  }

  return value.map((entry, index) =>
    normalizePlainString(
      entry,
      `${fieldName} item ${index + 1}`,
      { allowEmpty: false, maxLength: 40 },
    ),
  );
}

function normalizeWordBreakdownItem(item, index, options = {}) {
  if (!item || typeof item !== "object") {
    throw new Error(`Breakdown item ${index + 1} must be an object`);
  }

  const thai = normalizePlainString(item.thai, `Breakdown item ${index + 1} Thai`);
  const english = normalizePlainString(
    item.english,
    `Breakdown item ${index + 1} English`,
  );
  const romanization =
    typeof item.romanization === "string" && item.romanization.trim()
      ? item.romanization.trim()
      : undefined;
  const providedTones = options.trustProvidedTones
    ? normalizeProvidedTones(
        item.tones,
        `Breakdown item ${index + 1} tones`,
      )
    : [];
  const displayThaiSegments = normalizeDisplayThaiSegments(
    item.displayThaiSegments,
    `Breakdown item ${index + 1} displayThaiSegments`,
  );
  const toneAnalysis = analyzeBreakdownTones({
    thai,
    romanization,
    providedTones,
  });

  const normalized = { thai, english };

  if (toneAnalysis.tones.length > 0) {
    normalized.tones = toneAnalysis.tones;
    if (toneAnalysis.tones.length === 1) {
      normalized.tone = toneAnalysis.tones[0];
    }
  }

  if (item.grammar === true) {
    normalized.grammar = true;
  }

  if (romanization) {
    normalized.romanization = romanization;
  }

  if (displayThaiSegments) {
    if (toneAnalysis.tones.length !== displayThaiSegments.length) {
      throw new Error(
        `Breakdown item ${index + 1} displayThaiSegments count must match the tone count`,
      );
    }

    normalized.displayThaiSegments = displayThaiSegments;
  }

  return {
    item: normalized,
    toneAnalysis: {
      confidence: toneAnalysis.confidence,
      status: toneAnalysis.status,
      source: toneAnalysis.source,
      needsReview: toneAnalysis.needsReview,
      reasons: toneAnalysis.reasons,
      syllableCount: toneAnalysis.syllableCount,
    },
  };
}

function summarizeRowToneAnalysis(itemAnalyses) {
  const confidence = itemAnalyses.reduce(
    (lowest, item) => Math.min(lowest, item.confidence),
    100,
  );
  const flaggedItems = itemAnalyses.filter(
    (item) => item.needsReview || item.confidence < APPROVED_TONE_CONFIDENCE,
  );

  return {
    confidence,
    status:
      flaggedItems.length === 0 && confidence >= APPROVED_TONE_CONFIDENCE
        ? "approved"
        : "review",
    flaggedItemCount: flaggedItems.length,
    reasons: Array.from(
      new Set(flaggedItems.flatMap((item) => item.reasons || [])),
    ),
    breakdown: itemAnalyses,
  };
}

function normalizeExample(example) {
  if (!example || typeof example !== "object") {
    throw new Error("Example is required");
  }

  if (!Array.isArray(example.breakdown) || example.breakdown.length === 0) {
    throw new Error("Example breakdown must contain at least one item");
  }

  return {
    thai: normalizePlainString(example.thai, "Example Thai"),
    roman: normalizePlainString(example.roman, "Example romanization"),
    english: normalizePlainString(example.english, "Example English"),
    breakdown: example.breakdown.map(
      (item, index) =>
        normalizeWordBreakdownItem(item, index, {
          trustProvidedTones: true,
        }).item,
    ),
  };
}

function normalizeFocus(focus) {
  if (!focus || typeof focus !== "object") {
    throw new Error("Focus is required");
  }

  return {
    particle: normalizePlainString(focus.particle, "Focus particle"),
    meaning: normalizePlainString(focus.meaning, "Focus meaning"),
  };
}

function normalizeLessonBlocks(lessonBlocks) {
  if (lessonBlocks == null) {
    return undefined;
  }

  if (typeof lessonBlocks !== "object") {
    throw new Error("Lesson blocks must be an object");
  }

  const summary = normalizePlainString(
    lessonBlocks.summary,
    "Lesson summary",
    { allowEmpty: true, maxLength: 4000 },
  );
  const build = normalizePlainString(
    lessonBlocks.build,
    "Lesson build",
    { allowEmpty: true, maxLength: 4000 },
  );
  const use = normalizePlainString(
    lessonBlocks.use,
    "Lesson use",
    { allowEmpty: true, maxLength: 4000 },
  );

  if (!summary && !build && !use) {
    return undefined;
  }

  return {
    summary,
    build,
    use,
  };
}

function hasRequiredGrammarOverrideMetadata(override) {
  return Boolean(
    override &&
      typeof override === "object" &&
      typeof override.title === "string" &&
      override.title.trim() &&
      typeof override.level === "string" &&
      override.level.trim() &&
      typeof override.stage === "string" &&
      override.stage.trim() &&
      typeof override.explanation === "string" &&
      override.explanation.trim() &&
      typeof override.pattern === "string" &&
      override.pattern.trim(),
  );
}

function hasRequiredPublishedGrammarCatalogFields(override) {
  return Boolean(
    hasRequiredGrammarOverrideMetadata(override) &&
      override.example &&
      typeof override.example === "object" &&
      override.focus &&
      typeof override.focus === "object",
  );
}

function normalizeGrammarOverride(override) {
  if (!override || typeof override !== "object") {
    throw new Error("Grammar override payload is required");
  }

  const level = normalizePlainString(override.level, "Level");
  const stage = normalizePlainString(override.stage, "Stage");
  const lessonOrder = normalizeLessonOrder(override.lessonOrder);

  if (!VALID_CEFR_LEVELS.has(level)) {
    throw new Error("Level must be one of: A1, A2, B1, B2, C1, C2");
  }

  if (!VALID_GRAMMAR_STAGES.has(stage)) {
    throw new Error(
      `Stage must be one of: ${Array.from(VALID_GRAMMAR_STAGES).join(", ")}`,
    );
  }

  const normalizedOverride = {
    title: normalizePlainString(override.title, "Title"),
    level,
    stage,
    lessonOrder,
    hiddenFromLearners: override.hiddenFromLearners === true,
    explanation: normalizePlainString(override.explanation, "Explanation"),
    pattern: normalizePlainString(override.pattern, "Pattern"),
    aiPrompt:
      typeof override.aiPrompt === "string" && override.aiPrompt.trim()
        ? override.aiPrompt.trim()
        : undefined,
    example: normalizeExample(override.example),
    focus: normalizeFocus(override.focus),
  };

  const lessonBlocks = normalizeLessonBlocks(override.lessonBlocks);
  if (lessonBlocks) {
    normalizedOverride.lessonBlocks = lessonBlocks;
  }

  return normalizedOverride;
}

function normalizeGrammarRow(row, index, options = {}) {
  if (!row || typeof row !== "object") {
    throw new Error(`Row ${index + 1} must be an object`);
  }

  if (!Array.isArray(row.breakdown) || row.breakdown.length === 0) {
    throw new Error(`Row ${index + 1} must include at least one breakdown item`);
  }

  const difficulty = normalizePlainString(
    row.difficulty ?? "easy",
    `Row ${index + 1} difficulty`,
  ).toLowerCase();

  if (!VALID_DIFFICULTIES.has(difficulty)) {
    throw new Error(
      `Row ${index + 1} difficulty must be one of: ${Array.from(VALID_DIFFICULTIES).join(", ")}`,
    );
  }

  const normalizedBreakdown = row.breakdown.map((item, breakdownIndex) =>
    normalizeWordBreakdownItem(item, breakdownIndex, {
      trustProvidedTones:
        options.trustProvidedTones === true ||
        options.trustProvidedTonesByIndex?.[breakdownIndex] === true,
    }),
  );
  const toneAnalysis = summarizeRowToneAnalysis(
    normalizedBreakdown.map((item) => item.toneAnalysis),
  );

  return {
    thai: normalizePlainString(row.thai, `Row ${index + 1} Thai`),
    romanization: normalizePlainString(
      row.romanization,
      `Row ${index + 1} romanization`,
    ),
    english: normalizePlainString(row.english, `Row ${index + 1} English`),
    breakdown: normalizedBreakdown.map((item) => item.item),
    difficulty,
    toneConfidence: toneAnalysis.confidence,
    toneStatus: toneAnalysis.status,
    toneAnalysis,
  };
}

function normalizeGrammarRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Practice rows must contain at least one sentence");
  }

  return rows.map((row, index) =>
    normalizeGrammarRow(row, index, { trustProvidedTones: true }),
  );
}

function getToneTrustByIndexFromAnalysis(toneAnalysis) {
  return Array.isArray(toneAnalysis?.breakdown)
    ? toneAnalysis.breakdown.map(
        (item) => item?.source === "manual" || item?.source === "override",
      )
    : [];
}

function getToneTrustByIndexFromStoredBreakdown(rawBreakdown) {
  try {
    const breakdown = parseGrammarBreakdown(rawBreakdown, "Stored breakdown");
    return breakdown.map(
      (item) =>
        Array.isArray(item?.tones) &&
        item.tones.some(
          (tone) => typeof tone === "string" && tone.trim().length > 0,
        ),
    );
  } catch {
    return [];
  }
}

function mergeToneTrustByIndex(...maps) {
  const maxLength = maps.reduce(
    (largest, map) =>
      Math.max(largest, Array.isArray(map) ? map.length : 0),
    0,
  );

  return Array.from({ length: maxLength }, (_, index) =>
    maps.some((map) => Array.isArray(map) && map[index] === true),
  );
}

function getToneTrustByIndexFromStoredRow(row) {
  return mergeToneTrustByIndex(
    getToneTrustByIndexFromAnalysis(row?.tone_analysis),
    getToneTrustByIndexFromStoredBreakdown(row?.breakdown),
  );
}

function serializeGrammarExampleRow(row, index) {
  const normalizedRow = normalizeStoredGrammarRow(
    row,
    index,
    row.grammar_id,
    {
      trustProvidedTonesByIndex: getToneTrustByIndexFromStoredRow(row),
    },
  );
  const defaultReviewStatus = deriveInitialReviewStatus({
    toneConfidence: normalizedRow.toneConfidence,
    toneStatus: normalizedRow.toneStatus,
  });

  return {
    id: Number(row.id),
    grammarId: row.grammar_id,
    thai: normalizedRow.thai,
    romanization: normalizedRow.romanization,
    english: normalizedRow.english,
    breakdown: normalizedRow.breakdown,
    difficulty: normalizedRow.difficulty,
    toneConfidence: normalizedRow.toneConfidence,
    toneStatus: normalizedRow.toneStatus,
    toneAnalysis: normalizedRow.toneAnalysis,
    reviewStatus: normalizeReviewStatus(row.review_status, defaultReviewStatus),
    reviewAssigneeUserId: row.review_assignee_user_id
      ? Number(row.review_assignee_user_id)
      : null,
    reviewNote: row.review_note ?? null,
    publishState: normalizePublishState(row.publish_state, "published"),
    rewriteWaveId: row.rewrite_wave_id ?? null,
    sourceExampleId: row.source_example_id ? Number(row.source_example_id) : null,
    qualityFlags: normalizeQualityFlags(row.quality_flags),
    nextWaveDecision: normalizeOptionalNextWaveDecision(row.next_wave_decision),
    nextWaveAuditNote: row.next_wave_audit_note ?? null,
    nextWaveAuditedByUserId: row.next_wave_audited_by_user_id
      ? Number(row.next_wave_audited_by_user_id)
      : null,
    nextWaveAuditedAt: row.next_wave_audited_at ?? null,
    lastEditedByUserId: row.last_edited_by_user_id
      ? Number(row.last_edited_by_user_id)
      : null,
    lastEditedAt: row.last_edited_at ?? null,
    approvedByUserId: row.approved_by_user_id
      ? Number(row.approved_by_user_id)
      : null,
    approvedAt: row.approved_at ?? null,
    sortOrder: Number(row.sort_order) || index,
  };
}

function buildExampleRevisionSnapshot(row) {
  if (!row || typeof row !== "object") {
    return null;
  }

  return {
    thai: row.thai ?? "",
    romanization: row.romanization ?? "",
    english: row.english ?? "",
    breakdown: Array.isArray(row.breakdown) ? row.breakdown : [],
    difficulty: row.difficulty ?? "easy",
    reviewStatus: row.reviewStatus ?? "flagged",
    reviewAssigneeUserId: row.reviewAssigneeUserId ?? null,
    reviewNote: row.reviewNote ?? null,
    publishState: row.publishState ?? "published",
    rewriteWaveId: row.rewriteWaveId ?? null,
    sourceExampleId: row.sourceExampleId ?? null,
    qualityFlags: normalizeQualityFlags(row.qualityFlags),
    nextWaveDecision: row.nextWaveDecision ?? null,
    nextWaveAuditNote: row.nextWaveAuditNote ?? null,
    nextWaveAuditedByUserId: row.nextWaveAuditedByUserId ?? null,
    nextWaveAuditedAt: row.nextWaveAuditedAt ?? null,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : 0,
    toneConfidence: Number.isFinite(Number(row.toneConfidence))
      ? Number(row.toneConfidence)
      : 0,
    toneStatus: row.toneStatus ?? "review",
  };
}

function normalizeBreakdownForRevisionDiff(items, options = {}) {
  const { includeTones = true } = options;
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item, index) => ({
    index,
    thai: item?.thai ?? "",
    english: item?.english ?? "",
    romanization: item?.romanization ?? "",
    displayThaiSegments: Array.isArray(item?.displayThaiSegments)
      ? item.displayThaiSegments
      : [],
    grammar: item?.grammar === true,
    ...(includeTones
      ? {
          tones: Array.isArray(item?.tones) ? item.tones : [],
        }
      : {}),
  }));
}

function diffExampleRevisionSnapshots(beforeSnapshot, afterSnapshot) {
  if (!beforeSnapshot && !afterSnapshot) {
    return [];
  }

  const before = beforeSnapshot ?? {};
  const after = afterSnapshot ?? {};
  const changedFields = [];

  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const field of fields) {
    if (field === "breakdown") {
      continue;
    }

    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
      changedFields.push(field);
    }
  }

  const beforeBreakdownContent = normalizeBreakdownForRevisionDiff(
    before.breakdown,
    { includeTones: false },
  );
  const afterBreakdownContent = normalizeBreakdownForRevisionDiff(
    after.breakdown,
    { includeTones: false },
  );

  if (
    JSON.stringify(beforeBreakdownContent) !==
    JSON.stringify(afterBreakdownContent)
  ) {
    changedFields.push("breakdown");
  }

  const beforeBreakdownTones = normalizeBreakdownForRevisionDiff(
    before.breakdown,
    { includeTones: true },
  ).map((item) => ({
    index: item.index,
    thai: item.thai,
    romanization: item.romanization,
    tones: item.tones,
  }));
  const afterBreakdownTones = normalizeBreakdownForRevisionDiff(
    after.breakdown,
    { includeTones: true },
  ).map((item) => ({
    index: item.index,
    thai: item.thai,
    romanization: item.romanization,
    tones: item.tones,
  }));

  if (
    JSON.stringify(beforeBreakdownTones) !==
    JSON.stringify(afterBreakdownTones)
  ) {
    changedFields.push("tones");
  }

  return changedFields;
}

function serializeExampleRevision(row) {
  return {
    id: Number(row.id),
    exampleId: Number(row.example_id),
    grammarId: row.grammar_id,
    action: row.action,
    editedByUserId: row.edited_by_user_id
      ? Number(row.edited_by_user_id)
      : null,
    changedFields: Array.isArray(row.changed_fields) ? row.changed_fields : [],
    beforeSnapshot: row.before_snapshot ?? null,
    afterSnapshot: row.after_snapshot ?? null,
    createdAt: row.created_at,
    editor: row.edited_by_user_id
      ? {
          id: Number(row.edited_by_user_id),
          email: row.editor_email,
          display_name: row.editor_display_name ?? null,
        }
      : null,
  };
}

function serializeLessonOverrideRecord(row) {
  const lessonOrder = coerceLessonOrder(row.lesson_order ?? row.content?.lessonOrder);
  const override =
    row.content && typeof row.content === "object"
      ? {
          ...row.content,
          ...(lessonOrder !== null ? { lessonOrder } : {}),
        }
      : null;

  return {
    grammarId: row.grammar_id,
    override,
    reviewStatus: normalizeReviewStatus(row.review_status, "flagged"),
    reviewAssigneeUserId: row.review_assignee_user_id
      ? Number(row.review_assignee_user_id)
      : null,
    reviewNote: row.review_note ?? null,
    lastEditedByUserId: row.last_edited_by_user_id
      ? Number(row.last_edited_by_user_id)
      : null,
    lastEditedAt: row.last_edited_at ?? null,
    approvedByUserId: row.approved_by_user_id
      ? Number(row.approved_by_user_id)
      : null,
    approvedAt: row.approved_at ?? null,
  };
}

function serializePublishedGrammarCatalogEntry(row) {
  const content =
    row && typeof row.content === "object" && row.content !== null ? row.content : null;
  const stage =
    typeof row.stage === "string" && VALID_GRAMMAR_STAGES.has(row.stage)
      ? row.stage
      : content?.stage;
  const lessonOrder = coerceLessonOrder(row.lesson_order ?? content?.lessonOrder);

  if (!content || !hasRequiredPublishedGrammarCatalogFields(content) || !stage) {
    return null;
  }

  return {
    id: row.grammar_id,
    title: content.title,
    level: content.level,
    stage,
    stageOrder: getGrammarStageOrder(stage),
    lessonOrder: lessonOrder ?? undefined,
    hiddenFromLearners: content.hiddenFromLearners === true,
    explanation: content.explanation,
    pattern: content.pattern,
    lessonBlocks: content.lessonBlocks ?? undefined,
    aiPrompt: content.aiPrompt ?? undefined,
    example: content.example,
    focus: content.focus,
  };
}

async function fetchGrammarRowsForGrammarId(
  grammarId,
  { includeLegacy = true } = {},
) {
  const result = await pool.query(
    `
    SELECT
      id,
      grammar_id,
      thai,
      romanization,
      english,
      breakdown,
      difficulty,
      sort_order,
      tone_confidence,
      tone_status,
      tone_analysis,
      review_status,
      review_assignee_user_id,
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
    FROM ${GRAMMAR_EXAMPLES_TABLE}
    WHERE grammar_id = $1
      AND (
        publish_state <> 'retired'
        OR ($2::boolean = TRUE AND quality_flags @> '["legacy"]'::jsonb)
      )
      AND (
        $2::boolean = TRUE
        OR NOT (quality_flags @> '["legacy"]'::jsonb)
      )
    ORDER BY sort_order ASC, id ASC
    `,
    [grammarId, includeLegacy],
  );

  return result.rows.map((row, index) => serializeGrammarExampleRow(row, index));
}

async function fetchLegacyRowCountForGrammarId(grammarId) {
  const result = await pool.query(
    `
    SELECT COUNT(*)::int AS legacy_count
    FROM ${GRAMMAR_EXAMPLES_TABLE}
    WHERE grammar_id = $1
      AND quality_flags @> '["legacy"]'::jsonb
    `,
    [grammarId],
  );

  return Number(result.rows[0]?.legacy_count ?? 0);
}

async function refreshGrammarRowsForGrammarId(grammarId) {
  const rows = await fetchGrammarRowsForGrammarId(grammarId);
  grammarSentences[grammarId] = rows;
  writeGrammarRowsToCsvMirror(grammarId, rows);
  return rows;
}

async function fetchGrammarOverrideRecord(grammarId) {
  const result = await pool.query(
    `
    SELECT
      grammar_id,
      stage,
      lesson_order,
      content,
      review_status,
      review_assignee_user_id,
      review_note,
      last_edited_by_user_id,
      last_edited_at,
      approved_by_user_id,
      approved_at
    FROM ${GRAMMAR_LESSON_OVERRIDES_TABLE}
    WHERE grammar_id = $1
    LIMIT 1
    `,
    [grammarId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return serializeLessonOverrideRecord(result.rows[0]);
}

async function fetchPublishedGrammarOverridesMap() {
  const result = await pool.query(
    `
    SELECT grammar_id, stage, lesson_order, content
    FROM ${GRAMMAR_LESSON_OVERRIDES_TABLE}
    WHERE review_status = 'approved'
      OR COALESCE((content->>'hiddenFromLearners')::boolean, false) = true
    ORDER BY grammar_id ASC
    `,
  );

  return Object.fromEntries(
    result.rows.map((row) => {
      const content =
        row.content && typeof row.content === "object" ? { ...row.content } : {};
      const stage =
        typeof row.stage === "string" && VALID_GRAMMAR_STAGES.has(row.stage)
          ? row.stage
          : content.stage;
      const lessonOrder = coerceLessonOrder(row.lesson_order ?? content.lessonOrder);

      return [
        row.grammar_id,
        {
          ...content,
          ...(stage ? { stage } : {}),
          ...(stage ? { stageOrder: getGrammarStageOrder(stage) } : {}),
          ...(lessonOrder !== null ? { lessonOrder } : {}),
        },
      ];
    }),
  );
}

async function fetchPublishedGrammarCatalogEntries() {
  const result = await pool.query(
    `
    SELECT grammar_id, stage, lesson_order, content
    FROM ${GRAMMAR_LESSON_OVERRIDES_TABLE}
    WHERE review_status = 'approved'
      OR COALESCE((content->>'hiddenFromLearners')::boolean, false) = true
    `,
  );

  return result.rows
    .map((row) => serializePublishedGrammarCatalogEntry(row))
    .filter(Boolean)
    .sort((a, b) => {
      const stageDelta = (a.stageOrder ?? 9999) - (b.stageOrder ?? 9999);
      if (stageDelta !== 0) {
        return stageDelta;
      }

      const lessonDelta =
        (a.lessonOrder ?? Number.MAX_SAFE_INTEGER) -
        (b.lessonOrder ?? Number.MAX_SAFE_INTEGER);
      if (lessonDelta !== 0) {
        return lessonDelta;
      }

      return String(a.id).localeCompare(String(b.id));
    });
}

async function fetchPublishedGrammarCatalogEntry(grammarId) {
  const lesson = await fetchGrammarOverrideRecord(grammarId);

  if (!lesson?.override) {
    return null;
  }

  const override = lesson.override;
  const isPublished =
    lesson.reviewStatus === "approved" || override.hiddenFromLearners === true;

  if (!isPublished || !hasRequiredPublishedGrammarCatalogFields(override)) {
    return null;
  }

  return {
    id: grammarId,
    title: override.title,
    level: override.level,
    stage: override.stage,
    stageOrder: getGrammarStageOrder(override.stage),
    lessonOrder: coerceLessonOrder(override.lessonOrder) ?? undefined,
    hiddenFromLearners: override.hiddenFromLearners === true,
    explanation: override.explanation,
    pattern: override.pattern,
    lessonBlocks: override.lessonBlocks ?? undefined,
    aiPrompt: override.aiPrompt ?? undefined,
    example: override.example,
    focus: override.focus,
  };
}

async function fetchGrammarOverrideMetadata() {
  const result = await pool.query(
    `
    SELECT grammar_id, review_status
    FROM ${GRAMMAR_LESSON_OVERRIDES_TABLE}
    `,
  );

  return new Map(
    result.rows.map((row) => [
      row.grammar_id,
      {
        reviewStatus: normalizeReviewStatus(row.review_status, "flagged"),
      },
    ]),
  );
}

function deriveLessonProductionWorkflowStatus(summary) {
  if (!summary) {
    return "not_started";
  }

  if (summary.currentWaveReadyCount >= summary.finalTargetCount) {
    return "ready_to_publish";
  }

  if (summary.currentWaveApprovedCount >= summary.finalTargetCount) {
    return "tone_review";
  }

  if (summary.currentWaveRowCount > 0) {
    return "reviewing";
  }

  if (summary.stagedRowCount > 0) {
    return "generated";
  }

  if (summary.livePublishedCount >= summary.finalTargetCount) {
    return "published";
  }

  return "not_started";
}

function buildLessonProductionSummary(
  record,
  counts,
  stageFallback = null,
  grammarIdFallback = null,
) {
  const finalTargetCount = Number(
    record?.final_target_count ?? DEFAULT_FINAL_APPROVED_TARGET,
  );
  const firstPassCandidateTarget = Number(
    record?.first_pass_candidate_target ?? DEFAULT_FIRST_PASS_CANDIDATE_TARGET,
  );
  const supplementalCandidateBatchSize = Number(
    record?.supplemental_candidate_batch_size ?? DEFAULT_SUPPLEMENTAL_BATCH_SIZE,
  );

  const summary = {
    grammarId: record?.grammar_id ?? grammarIdFallback ?? null,
    stage: record?.stage ?? stageFallback ?? null,
    finalTargetCount,
    firstPassCandidateTarget,
    supplementalCandidateBatchSize,
    currentRewriteWaveId: record?.current_rewrite_wave_id ?? null,
    lastGeneratedAt: record?.last_generated_at ?? null,
    lastPublishedAt: record?.last_published_at ?? null,
    notes: record?.notes ?? null,
    livePublishedCount: Number(counts?.livePublishedCount ?? 0),
    publishedRowCount: Number(counts?.publishedRowCount ?? 0),
    stagedRowCount: Number(counts?.stagedRowCount ?? 0),
    stagedApprovedCount: Number(counts?.stagedApprovedCount ?? 0),
    stagedReadyCount: Number(counts?.stagedReadyCount ?? 0),
    currentWaveRowCount: Number(counts?.currentWaveRowCount ?? 0),
    currentWaveApprovedCount: Number(counts?.currentWaveApprovedCount ?? 0),
    currentWaveReadyCount: Number(counts?.currentWaveReadyCount ?? 0),
    retiredRowCount: Number(counts?.retiredRowCount ?? 0),
  };

  return {
    ...summary,
    remainingForPublish: Math.max(
      0,
      finalTargetCount - summary.currentWaveReadyCount,
    ),
    workflowStatus: deriveLessonProductionWorkflowStatus(summary),
    isReadyToPublish: summary.currentWaveReadyCount >= finalTargetCount,
  };
}

async function fetchLessonProductionSummaryMap(grammarIds = []) {
  const recordResult =
    grammarIds.length > 0
      ? await pool.query(
          `
          SELECT
            grammar_id,
            stage,
            final_target_count,
            first_pass_candidate_target,
            supplemental_candidate_batch_size,
            current_rewrite_wave_id,
            last_generated_at,
            last_published_at,
            notes
          FROM ${GRAMMAR_LESSON_PRODUCTION_TABLE}
          WHERE grammar_id = ANY($1::text[])
          `,
          [grammarIds],
        )
      : await pool.query(
          `
          SELECT
            grammar_id,
            stage,
            final_target_count,
            first_pass_candidate_target,
            supplemental_candidate_batch_size,
            current_rewrite_wave_id,
            last_generated_at,
            last_published_at,
            notes
          FROM ${GRAMMAR_LESSON_PRODUCTION_TABLE}
          `,
        );

  const countResult =
    grammarIds.length > 0
      ? await pool.query(
          `
          SELECT
            e.grammar_id,
              COUNT(*) FILTER (
                WHERE e.publish_state = 'published'
                  AND e.review_status = 'approved'
              )::int AS live_published_count,
            COUNT(*) FILTER (
              WHERE e.publish_state = 'published'
            )::int AS published_row_count,
            COUNT(*) FILTER (
              WHERE e.publish_state = 'staged'
            )::int AS staged_row_count,
            COUNT(*) FILTER (
              WHERE e.publish_state = 'staged'
                AND e.review_status = 'approved'
            )::int AS staged_approved_count,
            COUNT(*) FILTER (
              WHERE e.publish_state = 'staged'
                AND e.review_status = 'approved'
                AND e.tone_status = 'approved'
                AND e.tone_confidence >= ${APPROVED_TONE_CONFIDENCE}
            )::int AS staged_ready_count,
            COUNT(*) FILTER (
              WHERE e.publish_state = 'staged'
                AND e.rewrite_wave_id IS NOT DISTINCT FROM p.current_rewrite_wave_id
            )::int AS current_wave_row_count,
            COUNT(*) FILTER (
              WHERE e.publish_state = 'staged'
                AND e.rewrite_wave_id IS NOT DISTINCT FROM p.current_rewrite_wave_id
                AND e.review_status = 'approved'
            )::int AS current_wave_approved_count,
            COUNT(*) FILTER (
              WHERE e.publish_state = 'staged'
                AND e.rewrite_wave_id IS NOT DISTINCT FROM p.current_rewrite_wave_id
                AND e.review_status = 'approved'
                AND e.tone_status = 'approved'
                AND e.tone_confidence >= ${APPROVED_TONE_CONFIDENCE}
            )::int AS current_wave_ready_count,
            COUNT(*) FILTER (
              WHERE e.publish_state = 'retired'
            )::int AS retired_row_count
          FROM ${GRAMMAR_EXAMPLES_TABLE} e
          LEFT JOIN ${GRAMMAR_LESSON_PRODUCTION_TABLE} p
            ON p.grammar_id = e.grammar_id
          WHERE e.grammar_id = ANY($1::text[])
          GROUP BY e.grammar_id
          `,
          [grammarIds],
        )
      : await pool.query(
          `
          SELECT
            e.grammar_id,
              COUNT(*) FILTER (
                WHERE e.publish_state = 'published'
                  AND e.review_status = 'approved'
              )::int AS live_published_count,
            COUNT(*) FILTER (
              WHERE e.publish_state = 'published'
            )::int AS published_row_count,
            COUNT(*) FILTER (
              WHERE e.publish_state = 'staged'
            )::int AS staged_row_count,
            COUNT(*) FILTER (
              WHERE e.publish_state = 'staged'
                AND e.review_status = 'approved'
            )::int AS staged_approved_count,
            COUNT(*) FILTER (
              WHERE e.publish_state = 'staged'
                AND e.review_status = 'approved'
                AND e.tone_status = 'approved'
                AND e.tone_confidence >= ${APPROVED_TONE_CONFIDENCE}
            )::int AS staged_ready_count,
            COUNT(*) FILTER (
              WHERE e.publish_state = 'staged'
                AND e.rewrite_wave_id IS NOT DISTINCT FROM p.current_rewrite_wave_id
            )::int AS current_wave_row_count,
            COUNT(*) FILTER (
              WHERE e.publish_state = 'staged'
                AND e.rewrite_wave_id IS NOT DISTINCT FROM p.current_rewrite_wave_id
                AND e.review_status = 'approved'
            )::int AS current_wave_approved_count,
            COUNT(*) FILTER (
              WHERE e.publish_state = 'staged'
                AND e.rewrite_wave_id IS NOT DISTINCT FROM p.current_rewrite_wave_id
                AND e.review_status = 'approved'
                AND e.tone_status = 'approved'
                AND e.tone_confidence >= ${APPROVED_TONE_CONFIDENCE}
            )::int AS current_wave_ready_count,
            COUNT(*) FILTER (
              WHERE e.publish_state = 'retired'
            )::int AS retired_row_count
          FROM ${GRAMMAR_EXAMPLES_TABLE} e
          LEFT JOIN ${GRAMMAR_LESSON_PRODUCTION_TABLE} p
            ON p.grammar_id = e.grammar_id
          GROUP BY e.grammar_id
          `,
        );

  const recordById = new Map(
    recordResult.rows.map((row) => [row.grammar_id, row]),
  );
  const countById = new Map(
    countResult.rows.map((row) => [
      row.grammar_id,
      {
        livePublishedCount: row.live_published_count,
        publishedRowCount: row.published_row_count,
        stagedRowCount: row.staged_row_count,
        stagedApprovedCount: row.staged_approved_count,
        stagedReadyCount: row.staged_ready_count,
        currentWaveRowCount: row.current_wave_row_count,
        currentWaveApprovedCount: row.current_wave_approved_count,
        currentWaveReadyCount: row.current_wave_ready_count,
        retiredRowCount: row.retired_row_count,
      },
    ]),
  );

  const ids =
    grammarIds.length > 0
      ? grammarIds
      : Array.from(new Set([...recordById.keys(), ...countById.keys()]));

  return new Map(
    ids.map((grammarId) => [
      grammarId,
      buildLessonProductionSummary(
        recordById.get(grammarId) ?? null,
        countById.get(grammarId) ?? null,
        null,
        grammarId,
      ),
    ]),
  );
}

async function ensureLessonProductionRecord(grammarId, stage, client = pool) {
  const result = await client.query(
    `
    INSERT INTO ${GRAMMAR_LESSON_PRODUCTION_TABLE} (
      grammar_id,
      stage,
      final_target_count,
      first_pass_candidate_target,
      supplemental_candidate_batch_size
    )
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (grammar_id)
    DO UPDATE SET
      stage = EXCLUDED.stage,
      updated_at = NOW()
    RETURNING *
    `,
    [
      grammarId,
      stage,
      DEFAULT_FINAL_APPROVED_TARGET,
      DEFAULT_FIRST_PASS_CANDIDATE_TARGET,
      DEFAULT_SUPPLEMENTAL_BATCH_SIZE,
    ],
  );

  return result.rows[0] ?? null;
}

async function fetchReviewerUsers() {
  const result = await pool.query(
    `
    SELECT id, email, display_name, is_admin, can_review_content
    FROM users
    WHERE is_admin = TRUE OR can_review_content = TRUE
    ORDER BY is_admin DESC, display_name ASC NULLS LAST, email ASC
    `,
  );

  return result.rows.map(serializeReviewerUser);
}

async function fetchLessonComments(grammarId) {
  const result = await pool.query(
    `
    SELECT
      c.id,
      c.grammar_id,
      c.author_user_id,
      c.body,
      c.created_at,
      u.email,
      u.display_name
    FROM ${GRAMMAR_LESSON_COMMENTS_TABLE} c
    JOIN users u ON u.id = c.author_user_id
    WHERE c.grammar_id = $1
    ORDER BY c.created_at ASC, c.id ASC
    `,
    [grammarId],
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    grammarId: row.grammar_id,
    authorUserId: Number(row.author_user_id),
    body: row.body,
    createdAt: row.created_at,
    author: {
      id: Number(row.author_user_id),
      email: row.email,
      display_name: row.display_name ?? null,
    },
  }));
}

async function fetchExampleComments(exampleIds) {
  if (!Array.isArray(exampleIds) || exampleIds.length === 0) {
    return new Map();
  }

  const result = await pool.query(
    `
    SELECT
      c.id,
      c.example_id,
      c.author_user_id,
      c.body,
      c.created_at,
      u.email,
      u.display_name
    FROM ${GRAMMAR_EXAMPLE_COMMENTS_TABLE} c
    JOIN users u ON u.id = c.author_user_id
    WHERE c.example_id = ANY($1::bigint[])
    ORDER BY c.created_at ASC, c.id ASC
    `,
    [exampleIds],
  );

  const commentsByExampleId = new Map();

  for (const row of result.rows) {
    const exampleId = Number(row.example_id);
    if (!commentsByExampleId.has(exampleId)) {
      commentsByExampleId.set(exampleId, []);
    }

    commentsByExampleId.get(exampleId).push({
      id: Number(row.id),
      exampleId,
      authorUserId: Number(row.author_user_id),
      body: row.body,
      createdAt: row.created_at,
      author: {
        id: Number(row.author_user_id),
        email: row.email,
        display_name: row.display_name ?? null,
      },
    });
  }

  return commentsByExampleId;
}

async function fetchExampleRevisions(exampleId) {
  const result = await pool.query(
    `
    SELECT
      r.id,
      r.example_id,
      r.grammar_id,
      r.action,
      r.edited_by_user_id,
      r.changed_fields,
      r.before_snapshot,
      r.after_snapshot,
      r.created_at,
      u.email AS editor_email,
      u.display_name AS editor_display_name
    FROM ${GRAMMAR_EXAMPLE_REVISIONS_TABLE} r
    LEFT JOIN users u ON u.id = r.edited_by_user_id
    WHERE r.example_id = $1
    ORDER BY r.created_at DESC, r.id DESC
    `,
    [exampleId],
  );

  return result.rows.map((row) => serializeExampleRevision(row));
}

async function ensureReviewAssigneeExists(userId) {
  if (!userId) {
    return null;
  }

  const result = await pool.query(
    `
    SELECT id
    FROM users
    WHERE id = $1
      AND (is_admin = TRUE OR can_review_content = TRUE)
    LIMIT 1
    `,
    [userId],
  );

  if (result.rows.length === 0) {
    console.warn(
      `Ignoring stale review assignee ${userId}; user is no longer an admin or reviewer`,
    );
    return null;
  }

  return Number(result.rows[0].id);
}

function serializeCommentMap(commentsByExampleId) {
  return Object.fromEntries(
    Array.from(commentsByExampleId.entries()).map(([exampleId, comments]) => [
      String(exampleId),
      comments,
    ]),
  );
}

function normalizeReviewQueueType(value) {
  if (value === "lesson" || value === "row") {
    return value;
  }

  return null;
}

function matchesReviewAssigneeFilter(reviewAssigneeUserId, assigneeFilter, currentUserId) {
  if (!assigneeFilter) {
    return true;
  }

  if (assigneeFilter === "me") {
    return reviewAssigneeUserId === currentUserId;
  }

  if (assigneeFilter === "unassigned") {
    return !reviewAssigneeUserId;
  }

  const parsed = Number.parseInt(String(assigneeFilter), 10);
  return Number.isInteger(parsed) && parsed > 0
    ? reviewAssigneeUserId === parsed
    : true;
}

async function fetchReviewQueueItems(filters = {}, currentUserId = null) {
  const requestedType = normalizeReviewQueueType(filters.type);
  const requestedStatus =
    typeof filters.status === "string" && VALID_REVIEW_STATUSES.has(filters.status)
      ? filters.status
      : null;
  const requestedGrammarId =
    typeof filters.grammarId === "string" && filters.grammarId.trim()
      ? filters.grammarId.trim()
      : null;
  const requestedStage =
    typeof filters.stage === "string" && filters.stage.trim()
      ? filters.stage.trim()
      : null;
  const requestedAssignee =
    typeof filters.assignee === "string" && filters.assignee.trim()
      ? filters.assignee.trim().toLowerCase()
      : null;

  const items = [];

  if (requestedType !== "row") {
    const lessonResult = await pool.query(
      `
      SELECT
        grammar_id,
        stage,
        content,
        review_status,
        review_assignee_user_id,
        review_note,
        last_edited_by_user_id,
        last_edited_at,
        approved_by_user_id,
        approved_at
      FROM ${GRAMMAR_LESSON_OVERRIDES_TABLE}
      ${requestedGrammarId ? "WHERE grammar_id = $1" : ""}
      ORDER BY updated_at DESC NULLS LAST, grammar_id ASC
      `,
      requestedGrammarId ? [requestedGrammarId] : [],
    );
    const lessonIds = new Set(
      requestedGrammarId
        ? [requestedGrammarId]
        : [...Object.keys(grammarSentences), ...lessonResult.rows.map((row) => row.grammar_id)],
    );
    const lessonRowById = new Map(
      lessonResult.rows.map((row) => [row.grammar_id, row]),
    );

    for (const grammarId of lessonIds) {
      const row = lessonRowById.get(grammarId);
      const record = row
        ? serializeLessonOverrideRecord(row)
        : {
            grammarId,
            override: null,
            reviewStatus: "flagged",
            reviewAssigneeUserId: null,
            reviewNote: null,
            lastEditedByUserId: null,
            lastEditedAt: null,
            approvedByUserId: null,
            approvedAt: null,
          };
      const stage = row?.stage ?? record.override?.stage ?? null;

      if (requestedStatus && record.reviewStatus !== requestedStatus) {
        continue;
      }
      if (requestedStage && stage !== requestedStage) {
        continue;
      }
      if (
        !matchesReviewAssigneeFilter(
          record.reviewAssigneeUserId,
          requestedAssignee,
          currentUserId,
        )
      ) {
        continue;
      }

      items.push({
        id: `lesson:${record.grammarId}`,
        type: "lesson",
        grammarId: record.grammarId,
        stage,
        reviewStatus: record.reviewStatus,
        reviewAssigneeUserId: record.reviewAssigneeUserId,
        reviewNote: record.reviewNote,
        lastEditedByUserId: record.lastEditedByUserId,
        lastEditedAt: record.lastEditedAt,
        approvedByUserId: record.approvedByUserId,
        approvedAt: record.approvedAt,
        confidence: null,
        flaggedItemCount: 0,
        previewThai: record.override?.example?.thai ?? null,
        previewEnglish: record.override?.example?.english ?? null,
        title: record.override?.title ?? null,
      });
    }
  }

  if (requestedType !== "lesson") {
    const exampleResult = await pool.query(
      `
      SELECT
        e.id,
        e.grammar_id,
        e.thai,
        e.romanization,
        e.english,
        e.breakdown,
        e.difficulty,
        e.sort_order,
        e.tone_confidence,
        e.tone_status,
        e.tone_analysis,
        e.review_status,
        e.review_assignee_user_id,
        e.review_note,
        e.last_edited_by_user_id,
        e.last_edited_at,
        e.approved_by_user_id,
        e.approved_at,
        l.stage
      FROM ${GRAMMAR_EXAMPLES_TABLE} e
      LEFT JOIN ${GRAMMAR_LESSON_OVERRIDES_TABLE} l
        ON l.grammar_id = e.grammar_id
      ${
        requestedGrammarId
          ? "WHERE e.grammar_id = $1 AND e.publish_state <> 'retired'"
          : "WHERE e.publish_state <> 'retired'"
      }
      ORDER BY e.last_edited_at DESC NULLS LAST, e.id DESC
      `,
      requestedGrammarId ? [requestedGrammarId] : [],
    );

    for (const row of exampleResult.rows) {
      const record = serializeGrammarExampleRow(row, 0);
      const stage = row.stage ?? null;

      if (requestedStatus && record.reviewStatus !== requestedStatus) {
        continue;
      }
      if (requestedStage && stage !== requestedStage) {
        continue;
      }
      if (
        !matchesReviewAssigneeFilter(
          record.reviewAssigneeUserId,
          requestedAssignee,
          currentUserId,
        )
      ) {
        continue;
      }

      items.push({
        id: record.id,
        type: "row",
        grammarId: record.grammarId,
        stage,
        reviewStatus: record.reviewStatus,
        reviewAssigneeUserId: record.reviewAssigneeUserId,
        reviewNote: record.reviewNote,
        lastEditedByUserId: record.lastEditedByUserId,
        lastEditedAt: record.lastEditedAt,
        approvedByUserId: record.approvedByUserId,
        approvedAt: record.approvedAt,
        confidence: record.toneConfidence,
        flaggedItemCount:
          typeof record.toneAnalysis?.flaggedItemCount === "number"
            ? record.toneAnalysis.flaggedItemCount
            : 0,
        previewThai: record.thai,
        previewEnglish: record.english,
        title: null,
      });
    }
  }

  const statusOrder = {
    flagged: 0,
    needs_changes: 1,
    in_review: 2,
    hidden: 3,
    approved: 4,
  };

  items.sort((a, b) => {
    const statusDelta =
      (statusOrder[a.reviewStatus] ?? 99) - (statusOrder[b.reviewStatus] ?? 99);
    if (statusDelta !== 0) {
      return statusDelta;
    }

    if ((b.confidence ?? -1) !== (a.confidence ?? -1)) {
      return (a.confidence ?? -1) - (b.confidence ?? -1);
    }

    const aTime = a.lastEditedAt ? new Date(a.lastEditedAt).getTime() : 0;
    const bTime = b.lastEditedAt ? new Date(b.lastEditedAt).getTime() : 0;
    if (aTime !== bTime) {
      return bTime - aTime;
    }

    return String(a.grammarId).localeCompare(String(b.grammarId));
  });

  return items;
}

async function upsertGrammarLessonOverrideRecord({
  grammarId,
  override,
  reviewStatus,
  reviewAssigneeUserId,
  reviewNote,
  editorUserId,
}) {
  const normalizedReviewStatus = normalizeReviewStatus(reviewStatus, "flagged");
  const approvedByUserId =
    normalizedReviewStatus === "approved" ? editorUserId : null;
  const seededOrder = getSeededGrammarOrder(grammarId)?.lessonOrder ?? null;
  const lessonOrder = coerceLessonOrder(override.lessonOrder) ?? seededOrder;
  const storedOverride =
    lessonOrder !== null ? { ...override, lessonOrder } : { ...override };

  const result = await pool.query(
    `
    INSERT INTO ${GRAMMAR_LESSON_OVERRIDES_TABLE} (
      grammar_id,
      stage,
      lesson_order,
      content,
      review_status,
      review_assignee_user_id,
      review_note,
      last_edited_by_user_id,
      last_edited_at,
      approved_by_user_id,
      approved_at,
      updated_at
    )
    VALUES (
      $1,
      $2,
      $3::integer,
      $4::jsonb,
      $5,
      $6::bigint,
      $7,
      $8::bigint,
      NOW(),
      $9::bigint,
      CASE WHEN $9::bigint IS NOT NULL THEN NOW() ELSE NULL END,
      NOW()
    )
    ON CONFLICT (grammar_id)
    DO UPDATE SET
      stage = EXCLUDED.stage,
      lesson_order = EXCLUDED.lesson_order,
      content = EXCLUDED.content,
      review_status = EXCLUDED.review_status,
      review_assignee_user_id = EXCLUDED.review_assignee_user_id,
      review_note = EXCLUDED.review_note,
      last_edited_by_user_id = EXCLUDED.last_edited_by_user_id,
      last_edited_at = NOW(),
      approved_by_user_id = EXCLUDED.approved_by_user_id,
      approved_at = CASE
        WHEN EXCLUDED.approved_by_user_id IS NOT NULL THEN NOW()
        ELSE NULL
      END,
      updated_at = NOW()
    RETURNING
      grammar_id,
      stage,
      lesson_order,
      content,
      review_status,
      review_assignee_user_id,
      review_note,
      last_edited_by_user_id,
      last_edited_at,
      approved_by_user_id,
      approved_at
    `,
    [
      grammarId,
      storedOverride.stage,
      lessonOrder,
      JSON.stringify(storedOverride),
      normalizedReviewStatus,
      reviewAssigneeUserId,
      reviewNote,
      editorUserId,
      approvedByUserId,
    ],
  );

  return serializeLessonOverrideRecord(result.rows[0]);
}

async function migrateGrammarOverridesFileToDatabase() {
  const overrides = readGrammarOverrides();
  const entries = Object.entries(overrides);

  if (entries.length === 0) {
    return;
  }

  const existingResult = await pool.query(
    `
    SELECT grammar_id
    FROM ${GRAMMAR_LESSON_OVERRIDES_TABLE}
    `,
  );
  const existingIds = new Set(
    existingResult.rows.map((row) => row.grammar_id),
  );

  let migratedCount = 0;

  for (const [grammarId, rawOverride] of entries) {
    if (existingIds.has(grammarId)) {
      continue;
    }

    if (!hasRequiredGrammarOverrideMetadata(rawOverride)) {
      console.warn(
        `Skipping legacy grammar override ${grammarId}: missing required metadata for database migration`, 
      );
      continue;
    }

    try {
      const normalizedOverride = normalizeGrammarOverride(rawOverride);
      const seededOrder = getSeededGrammarOrder(grammarId)?.lessonOrder ?? null;
      const lessonOrder =
        coerceLessonOrder(normalizedOverride.lessonOrder) ?? seededOrder;
      const storedOverride =
        lessonOrder !== null
          ? { ...normalizedOverride, lessonOrder }
          : normalizedOverride;
      await pool.query(
        `
        INSERT INTO ${GRAMMAR_LESSON_OVERRIDES_TABLE} (
          grammar_id,
          stage,
          lesson_order,
          content,
          review_status,
          review_note,
          last_edited_at,
          approved_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3::integer,
          $4::jsonb,
          'approved',
          'Migrated from grammar-overrides.json',
          NOW(),
          NOW(),
          NOW()
        )
        `,
        [
          grammarId,
          storedOverride.stage,
          lessonOrder,
          JSON.stringify(storedOverride),
        ],
      );
      migratedCount += 1;
    } catch (err) {
      console.error(`Failed to migrate grammar override ${grammarId}:`, err);
    }
  }

  if (migratedCount > 0) {
    console.log(
      `Migrated ${migratedCount} grammar lesson override${migratedCount === 1 ? "" : "s"} into Postgres`,
    );
  }
}

async function backfillGrammarLessonOrderFromSeed() {
  const seedMap = readGrammarOrderSeedMap();
  if (seedMap.size === 0) {
    return;
  }

  const result = await pool.query(
    `
    SELECT grammar_id, lesson_order, content
    FROM ${GRAMMAR_LESSON_OVERRIDES_TABLE}
    `,
  );

  let updatedCount = 0;

  for (const row of result.rows) {
    const seededOrder = seedMap.get(row.grammar_id)?.lessonOrder;
    if (seededOrder == null) {
      continue;
    }

    const currentLessonOrder = coerceLessonOrder(
      row.lesson_order ?? row.content?.lessonOrder,
    );
    if (currentLessonOrder !== null) {
      continue;
    }

    await pool.query(
      `
      UPDATE ${GRAMMAR_LESSON_OVERRIDES_TABLE}
      SET
        lesson_order = $2,
        content = jsonb_set(
          content,
          '{lessonOrder}',
          to_jsonb($2::integer),
          true
        ),
        updated_at = NOW()
      WHERE grammar_id = $1
      `,
      [row.grammar_id, seededOrder],
    );
    updatedCount += 1;
  }

  if (updatedCount > 0) {
    console.log(
      `Backfilled lesson order for ${updatedCount} grammar lesson override${updatedCount === 1 ? "" : "s"} from grammar-order-seed.json`,
    );
  }
}

function escapeCsvValue(value) {
  const text = String(value ?? "");

  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function serializeGrammarRows(rows) {
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

  return [header.join(","), ...lines].join("\n");
}

function isValidGrammarId(grammarId) {
  return /^[a-z0-9][a-z0-9.-]*$/i.test(grammarId);
}

let googleTtsClient;
const ttsSentenceRequests = new Map();

function ensureTtsCacheDir() {
  fs.mkdirSync(TTS_SENTENCE_DIR, { recursive: true });
}

async function pruneTtsCacheIfNeeded() {
  if (!Number.isFinite(TTS_CACHE_MAX_BYTES) || TTS_CACHE_MAX_BYTES <= 0) {
    return;
  }

  ensureTtsCacheDir();

  const fileNames = await fs.promises.readdir(TTS_SENTENCE_DIR);
  const entries = [];
  let totalBytes = 0;

  for (const fileName of fileNames) {
    const filePath = path.join(TTS_SENTENCE_DIR, fileName);
    const stat = await fs.promises.stat(filePath);

    if (!stat.isFile()) {
      continue;
    }

    totalBytes += stat.size;
    entries.push({
      filePath,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    });
  }

  if (totalBytes <= TTS_CACHE_MAX_BYTES) {
    return;
  }

  entries.sort((a, b) => a.mtimeMs - b.mtimeMs);

  for (const entry of entries) {
    await fs.promises.unlink(entry.filePath);
    totalBytes -= entry.size;

    if (totalBytes <= TTS_CACHE_TRIM_TARGET_BYTES) {
      break;
    }
  }
}

function getGoogleTtsClient() {
  if (googleTtsClient !== undefined) {
    return googleTtsClient;
  }

  const rawCredentials = process.env.GOOGLE_TTS_CREDENTIALS_JSON?.trim();

  try {
    if (rawCredentials) {
      try {
        googleTtsClient = new textToSpeech.TextToSpeechClient({
          credentials: JSON.parse(rawCredentials),
        });
        return googleTtsClient;
      } catch (err) {
        console.error(
          "Failed to parse GOOGLE_TTS_CREDENTIALS_JSON, falling back to GOOGLE_APPLICATION_CREDENTIALS:",
          err,
        );
      }
    }

    googleTtsClient = new textToSpeech.TextToSpeechClient();
  } catch (err) {
    console.error("Failed to initialize Google TTS client:", err);
    googleTtsClient = null;
  }

  return googleTtsClient;
}

function normalizeTtsSpeakingRate(value) {
  const rate = Number(value);

  if (!Number.isFinite(rate)) {
    return 1;
  }

  return Math.min(1.3, Math.max(0.7, rate));
}

function normalizeTtsLanguageCode(value) {
  const fallback = process.env.GOOGLE_TTS_LANGUAGE_CODE || "th-TH";

  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  if (!trimmed || !/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(trimmed)) {
    return fallback;
  }

  const [language, region] = trimmed.split("-");

  if (!region) {
    return language.toLowerCase();
  }

  return `${language.toLowerCase()}-${region.toUpperCase()}`;
}

function buildSentenceTtsConfig(text, speakingRate, languageCodeOverride) {
  const normalizedText =
    typeof text === "string" ? text.trim().replace(/\s+/g, " ") : "";

  if (!normalizedText) {
    throw new Error("Text is required");
  }

  if (normalizedText.length > 500) {
    throw new Error("Sentence audio is limited to 500 characters");
  }

  const defaultLanguageCode = normalizeTtsLanguageCode(
    process.env.GOOGLE_TTS_LANGUAGE_CODE || "th-TH",
  );
  const languageCode = normalizeTtsLanguageCode(
    languageCodeOverride || defaultLanguageCode,
  );
  const configuredVoiceName = process.env.GOOGLE_TTS_VOICE_NAME?.trim() || null;
  const voiceName =
    languageCode === defaultLanguageCode ? configuredVoiceName : null;
  const ssmlGender =
    process.env.GOOGLE_TTS_SSML_GENDER?.trim().toUpperCase() || "FEMALE";
  const normalizedRate = normalizeTtsSpeakingRate(speakingRate);

  const cacheKey = createHash("sha256")
    .update(
      JSON.stringify({
        text: normalizedText,
        languageCode,
        voiceName,
        ssmlGender,
        speakingRate: normalizedRate,
      }),
    )
    .digest("hex");

  return {
    cacheKey,
    languageCode,
    normalizedText,
    speakingRate: normalizedRate,
    ssmlGender,
    voiceName,
  };
}

function getSentenceAudioPublicPath(cacheKey) {
  return `/tts-cache/sentences/${cacheKey}.mp3`;
}

async function synthesizeSentenceAudio(text, speakingRate, languageCodeOverride) {
  const config = buildSentenceTtsConfig(text, speakingRate, languageCodeOverride);
  ensureTtsCacheDir();

  const targetPath = path.join(TTS_SENTENCE_DIR, `${config.cacheKey}.mp3`);
  const publicPath = getSentenceAudioPublicPath(config.cacheKey);

  if (fs.existsSync(targetPath)) {
    return { cacheKey: config.cacheKey, cached: true, path: publicPath };
  }

  if (ttsSentenceRequests.has(config.cacheKey)) {
    return ttsSentenceRequests.get(config.cacheKey);
  }

  const task = (async () => {
    return ttsConcurrencyLimiter.run(async () => {
      const client = getGoogleTtsClient();

      if (!client) {
        throw new Error(
          "Google TTS is not configured on the server. Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_TTS_CREDENTIALS_JSON.",
        );
      }

      const [response] = await client.synthesizeSpeech({
        input: { text: config.normalizedText },
        voice: {
          languageCode: config.languageCode,
          ...(config.voiceName ? { name: config.voiceName } : {}),
          ssmlGender: config.ssmlGender,
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: config.speakingRate,
        },
      });

      const audioContent = response.audioContent;

      if (!audioContent) {
        throw new Error("Google TTS returned no audio content");
      }

      const audioBuffer =
        typeof audioContent === "string"
          ? Buffer.from(audioContent, "binary")
          : Buffer.from(audioContent);

      await fs.promises.writeFile(targetPath, audioBuffer);
      await pruneTtsCacheIfNeeded();

      return { cacheKey: config.cacheKey, cached: false, path: publicPath };
    });
  })();

  ttsSentenceRequests.set(config.cacheKey, task);

  try {
    return await task;
  } finally {
    ttsSentenceRequests.delete(config.cacheKey);
  }
}

function getAdminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isConfiguredAdminEmail(email) {
  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";
  return normalizedEmail ? getAdminEmails().includes(normalizedEmail) : false;
}

async function syncConfiguredAdminEmails() {
  const adminEmails = getAdminEmails();
  if (adminEmails.length === 0) return;

  await pool.query(
    `
    UPDATE users
    SET is_admin = TRUE
    WHERE LOWER(email) = ANY($1::text[])
    `,
    [adminEmails],
  );
}

function isValidPassword(password) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
}

function getEmailLocalPart(email) {
  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalizedEmail) return "";
  return normalizedEmail.split("@")[0]?.trim() || "";
}

function getDefaultDisplayName(email) {
  const localPart = getEmailLocalPart(email);
  return localPart ? localPart.slice(0, 40) : null;
}

function normalizeDisplayName(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed.slice(0, 40) : null;
}

function resolveDisplayName(value, email) {
  return normalizeDisplayName(value) ?? getDefaultDisplayName(email);
}

function createSessionToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET || "devsecret",
  );
}

function hasKeystoneAccess(row) {
  return row?.has_keystone_access === true || row?.paddle_keystone_access === true;
}

function mapUserAccessRow(row) {
  if (!row || typeof row !== "object") {
    return row;
  }

  return {
    ...row,
    has_keystone_access: hasKeystoneAccess(row),
  };
}

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizePaddleWebPlan(value) {
  return value === "monthly" || value === "yearly" ? value : null;
}

function getConfiguredPaddlePlanPriceIds() {
  const config = getPaddlePublicConfig();
  const monthlyPriceId =
    typeof config?.monthlyPriceId === "string" ? config.monthlyPriceId.trim() : "";
  const yearlyPriceId =
    typeof config?.yearlyPriceId === "string" ? config.yearlyPriceId.trim() : "";

  return {
    monthlyPriceId,
    yearlyPriceId,
    isReady: Boolean(monthlyPriceId && yearlyPriceId),
  };
}

function inferPaddleWebPlanFromPriceId(priceId) {
  const normalizedPriceId =
    typeof priceId === "string" ? priceId.trim() : "";
  if (!normalizedPriceId) {
    return null;
  }

  const { monthlyPriceId, yearlyPriceId } = getConfiguredPaddlePlanPriceIds();
  if (monthlyPriceId && normalizedPriceId === monthlyPriceId) {
    return "monthly";
  }

  if (yearlyPriceId && normalizedPriceId === yearlyPriceId) {
    return "yearly";
  }

  return null;
}

function inferPaddleWebPlanFromSubscription(subscription) {
  const directPlan = inferPaddleWebPlanFromPriceId(extractPaddlePriceId(subscription));
  if (directPlan) {
    return directPlan;
  }

  const itemInterval =
    typeof subscription?.items?.[0]?.price?.billing_cycle?.interval === "string"
      ? subscription.items[0].price.billing_cycle.interval.trim().toLowerCase()
      : "";
  if (itemInterval === "month") {
    return "monthly";
  }
  if (itemInterval === "year") {
    return "yearly";
  }

  const subscriptionInterval =
    typeof subscription?.billing_cycle?.interval === "string"
      ? subscription.billing_cycle.interval.trim().toLowerCase()
      : "";
  if (subscriptionInterval === "month") {
    return "monthly";
  }
  if (subscriptionInterval === "year") {
    return "yearly";
  }

  return null;
}

function mapPaddleMoneyTotals(totals) {
  if (!totals || typeof totals !== "object") {
    return null;
  }

  const amount =
    typeof totals.grand_total === "string"
      ? totals.grand_total
      : typeof totals.total === "string"
        ? totals.total
        : "";
  const currencyCode =
    typeof totals.currency_code === "string" ? totals.currency_code.trim() : "";

  if (!amount || !currencyCode) {
    return null;
  }

  return {
    amount,
    currencyCode,
  };
}

function mapPaddleSubscriptionSummary(subscription) {
  if (!subscription || typeof subscription !== "object") {
    return null;
  }

  const priceId = extractPaddlePriceId(subscription);

  return {
    subscriptionId:
      typeof subscription.id === "string" ? subscription.id.trim() : null,
    subscriptionStatus: normalizePaddleSubscriptionStatus(subscription.status),
    currentPlan: inferPaddleWebPlanFromSubscription(subscription),
    currentPriceId: priceId,
    nextBilledAt:
      typeof subscription.next_billed_at === "string"
        ? subscription.next_billed_at
        : null,
    currentBillingPeriod:
      subscription.current_billing_period &&
      typeof subscription.current_billing_period === "object"
        ? subscription.current_billing_period
        : null,
    billingCycle:
      subscription.billing_cycle && typeof subscription.billing_cycle === "object"
        ? subscription.billing_cycle
        : null,
    scheduledChange:
      subscription.scheduled_change && typeof subscription.scheduled_change === "object"
        ? subscription.scheduled_change
        : null,
  };
}

function mapPaddleSwitchPreview(previewSubscription, currentPlan, targetPlan) {
  const summary = mapPaddleSubscriptionSummary(previewSubscription) || {};

  return {
    subscriptionId: summary.subscriptionId,
    subscriptionStatus: summary.subscriptionStatus,
    currentPlan,
    currentPriceId: null,
    targetPlan,
    targetPriceId: summary.currentPriceId || null,
    nextBilledAt: summary.nextBilledAt || null,
    currentBillingPeriod: summary.currentBillingPeriod || null,
    billingCycle: summary.billingCycle || null,
    scheduledChange: summary.scheduledChange || null,
    prorationBillingMode: "prorated_immediately",
    immediateCharge: mapPaddleMoneyTotals(
      previewSubscription?.immediate_transaction?.details?.totals,
    ),
    recurringCharge: mapPaddleMoneyTotals(
      previewSubscription?.recurring_transaction_details?.totals,
    ),
  };
}

function selectBestPaddleSubscription(subscriptions) {
  const list = Array.isArray(subscriptions) ? subscriptions : [];

  return (
    list.find((subscription) =>
      isPaddleSubscriptionAccessActive(subscription?.status),
    ) ||
    list.find((subscription) =>
      ["active", "trialing"].includes(
        normalizePaddleSubscriptionStatus(subscription?.status) || "",
      ),
    ) ||
    list[0] ||
    null
  );
}

function selectSwitchablePaddleItem(subscription) {
  const items = Array.isArray(subscription?.items) ? subscription.items : [];
  const recurringItems = items.filter((item) => item?.recurring !== false);

  if (recurringItems.length !== 1) {
    return null;
  }

  const quantity = Number.parseInt(String(recurringItems[0]?.quantity ?? 1), 10);

  return {
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
  };
}

async function findUserForPaddleEntity(entity) {
  const directUserId = extractPaddleCustomUserId(entity);
  if (directUserId) {
    const result = await pool.query(
      `
      SELECT id, email, paddle_customer_id, paddle_subscription_id
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [directUserId],
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }
  }

  const subscriptionId =
    typeof entity?.subscription_id === "string"
      ? entity.subscription_id.trim()
      : "";
  const customerId =
    typeof entity?.customer_id === "string" ? entity.customer_id.trim() : "";

  if (subscriptionId || customerId) {
    const result = await pool.query(
      `
      SELECT id, email, paddle_customer_id, paddle_subscription_id
      FROM users
      WHERE ($1 <> '' AND paddle_subscription_id = $1)
         OR ($2 <> '' AND paddle_customer_id = $2)
      LIMIT 1
      `,
      [subscriptionId, customerId],
    );

    if (result.rows.length > 0) {
      return result.rows[0];
    }
  }

  const fallbackEmail =
    typeof entity?.customer?.email === "string"
      ? entity.customer.email.trim().toLowerCase()
      : typeof entity?.custom_data?.keystone_email === "string"
        ? entity.custom_data.keystone_email.trim().toLowerCase()
        : "";

  if (!fallbackEmail) {
    return null;
  }

  const result = await pool.query(
    `
    SELECT id, email, paddle_customer_id, paddle_subscription_id
    FROM users
    WHERE LOWER(email) = LOWER($1)
    LIMIT 1
    `,
    [fallbackEmail],
  );

  return result.rows[0] ?? null;
}

async function updateUserPaddleAccess(userId, updates) {
  const hasCustomerIdUpdate =
    updates && Object.prototype.hasOwnProperty.call(updates, "customerId");
  const hasSubscriptionIdUpdate =
    updates && Object.prototype.hasOwnProperty.call(updates, "subscriptionId");
  const hasSubscriptionStatusUpdate =
    updates && Object.prototype.hasOwnProperty.call(updates, "subscriptionStatus");
  const hasPriceIdUpdate =
    updates && Object.prototype.hasOwnProperty.call(updates, "priceId");
  const hasAccessUpdate =
    updates && Object.prototype.hasOwnProperty.call(updates, "hasAccess");

  const customerId = hasCustomerIdUpdate ? updates.customerId ?? null : null;
  const subscriptionId = hasSubscriptionIdUpdate
    ? updates.subscriptionId ?? null
    : null;
  const subscriptionStatus = hasSubscriptionStatusUpdate
    ? updates.subscriptionStatus ?? null
    : null;
  const priceId = hasPriceIdUpdate ? updates.priceId ?? null : null;
  const hasBooleanAccessUpdate =
    hasAccessUpdate && typeof updates.hasAccess === "boolean";
  const hasAccess =
    hasBooleanAccessUpdate
      ? updates.hasAccess
      : null;

  const result = await pool.query(
    `
    UPDATE users
    SET
      paddle_customer_id = CASE WHEN $2 THEN $3 ELSE paddle_customer_id END,
      paddle_subscription_id = CASE WHEN $4 THEN $5 ELSE paddle_subscription_id END,
      paddle_subscription_status = CASE WHEN $6 THEN $7 ELSE paddle_subscription_status END,
      paddle_price_id = CASE WHEN $8 THEN $9 ELSE paddle_price_id END,
      paddle_keystone_access = CASE WHEN $10 THEN $11 ELSE paddle_keystone_access END,
      paddle_access_updated_at = NOW()
    WHERE id = $1
    RETURNING
      id,
      email,
      display_name,
      is_admin,
      can_review_content,
      has_keystone_access,
      paddle_keystone_access,
      paddle_customer_id,
      paddle_subscription_id,
      paddle_subscription_status,
      paddle_price_id
    `,
    [
      userId,
      hasCustomerIdUpdate,
      customerId,
      hasSubscriptionIdUpdate,
      subscriptionId,
      hasSubscriptionStatusUpdate,
      subscriptionStatus,
      hasPriceIdUpdate,
      priceId,
      hasBooleanAccessUpdate,
      hasAccess,
    ],
  );

  return mapUserAccessRow(result.rows[0] ?? null);
}

async function getStoredPaddleBillingUser(userId) {
  const result = await pool.query(
    `
    SELECT
      id,
      email,
      display_name,
      is_admin,
      can_review_content,
      has_keystone_access,
      paddle_keystone_access,
      paddle_customer_id,
      paddle_subscription_id,
      paddle_subscription_status,
      paddle_price_id
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [userId],
  );

  return result.rows[0] ?? null;
}

async function resolvePaddleBillingStateForUser(userId) {
  let user = await getStoredPaddleBillingUser(userId);
  if (!user) {
    return null;
  }

  let customerId =
    typeof user.paddle_customer_id === "string"
      ? user.paddle_customer_id.trim()
      : "";
  if (!customerId) {
    const customer = await findPaddleCustomerByEmail(user.email);
    customerId = typeof customer?.id === "string" ? customer.id.trim() : "";

    if (customerId) {
      user = (await updateUserPaddleAccess(userId, { customerId })) || {
        ...user,
        paddle_customer_id: customerId,
      };
    }
  }

  let subscriptionId =
    typeof user.paddle_subscription_id === "string"
      ? user.paddle_subscription_id.trim()
      : "";
  let subscription = null;

  if (subscriptionId) {
    try {
      const response = await paddleApiRequest(`/subscriptions/${subscriptionId}`);
      subscription = response?.data ?? null;
    } catch (error) {
      if (error?.status !== 404) {
        throw error;
      }

      subscriptionId = "";
    }
  }

  if (!subscription && customerId) {
    try {
      const subscriptions = await listPaddleSubscriptionsForCustomer(customerId);
      const bestSubscription = selectBestPaddleSubscription(subscriptions);
      if (bestSubscription) {
        subscription = bestSubscription;
        subscriptionId =
          typeof bestSubscription.id === "string" ? bestSubscription.id.trim() : "";
      }
    } catch (error) {
      if (error?.status !== 404) {
        throw error;
      }

      // A stale sandbox customer ID can survive the move to live billing.
      // Fall back to the live customer resolved by email and clear old pointers
      // if the live account does not know about the stored customer.
      customerId = "";
      subscriptionId = "";
      subscription = null;

      const liveCustomer = await findPaddleCustomerByEmail(user.email);
      const liveCustomerId =
        typeof liveCustomer?.id === "string" ? liveCustomer.id.trim() : "";

      user =
        (await updateUserPaddleAccess(userId, {
          customerId: liveCustomerId || null,
          subscriptionId: null,
          subscriptionStatus: null,
          priceId: null,
          ...(liveCustomerId ? {} : { hasAccess: false }),
        })) || user;

      customerId = liveCustomerId;

      if (customerId) {
        const subscriptions = await listPaddleSubscriptionsForCustomer(customerId);
        const bestSubscription = selectBestPaddleSubscription(subscriptions);
        if (bestSubscription) {
          subscription = bestSubscription;
          subscriptionId =
            typeof bestSubscription.id === "string" ? bestSubscription.id.trim() : "";
        }
      }
    }
  }

  if (subscription) {
    const nextCustomerId =
      typeof subscription.customer_id === "string"
        ? subscription.customer_id.trim()
        : customerId;
    const nextSubscriptionStatus = normalizePaddleSubscriptionStatus(
      subscription.status,
    );
    const nextPriceId = extractPaddlePriceId(subscription);

    user =
      (await updateUserPaddleAccess(userId, {
        customerId: nextCustomerId,
        subscriptionId,
        subscriptionStatus: nextSubscriptionStatus,
        priceId: nextPriceId,
        hasAccess: isPaddleSubscriptionAccessActive(nextSubscriptionStatus),
      })) || user;
    customerId = nextCustomerId;
  }

  return {
    user: mapUserAccessRow(user),
    customerId: customerId || null,
    subscription,
    summary: mapPaddleSubscriptionSummary(subscription),
  };
}

async function resolvePaddlePlanSwitchForUser(userId, rawTargetPlan) {
  const targetPlan = normalizePaddleWebPlan(rawTargetPlan);
  if (!targetPlan) {
    throw createHttpError(400, "Choose monthly or yearly before switching.");
  }

  const planPriceIds = getConfiguredPaddlePlanPriceIds();
  if (!planPriceIds.isReady) {
    throw createHttpError(
      503,
      "Monthly and yearly Paddle prices are not configured on the server yet.",
    );
  }

  const billingState = await resolvePaddleBillingStateForUser(userId);
  if (!billingState?.user) {
    throw createHttpError(404, "User not found");
  }

  if (!billingState.subscription) {
    throw createHttpError(404, "No web subscription was found for this account yet.");
  }

  const currentPlan = billingState.summary?.currentPlan;
  if (!currentPlan) {
    throw createHttpError(
      409,
      "This subscription can't be switched automatically yet. Use billing management instead.",
    );
  }

  if (currentPlan === targetPlan) {
    throw createHttpError(
      409,
      `This subscription already renews ${targetPlan === "monthly" ? "monthly" : "yearly"}.`,
    );
  }

  const subscriptionStatus = normalizePaddleSubscriptionStatus(
    billingState.subscription.status,
  );
  if (subscriptionStatus === "past_due") {
    throw createHttpError(
      409,
      "Bring this subscription back into good standing before switching plans.",
    );
  }

  if (billingState.subscription?.scheduled_change) {
    throw createHttpError(
      409,
      "This subscription already has a scheduled change. Review it in billing management first.",
    );
  }

  const switchableItem = selectSwitchablePaddleItem(billingState.subscription);
  if (!switchableItem) {
    throw createHttpError(
      409,
      "This subscription has multiple recurring items, so switch it from the Paddle portal for now.",
    );
  }

  const targetPriceId =
    targetPlan === "monthly"
      ? planPriceIds.monthlyPriceId
      : planPriceIds.yearlyPriceId;

  return {
    ...billingState,
    currentPlan,
    targetPlan,
    targetPriceId,
    requestBody: {
      proration_billing_mode: "prorated_immediately",
      on_payment_failure: "prevent_change",
      items: [
        {
          price_id: targetPriceId,
          quantity: switchableItem.quantity,
        },
      ],
    },
  };
}

async function syncPaddleSubscriptionEntity(entity) {
  const user = await findUserForPaddleEntity(entity);
  if (!user) {
    return null;
  }

  const subscriptionId =
    typeof entity?.id === "string" ? entity.id.trim() : user.paddle_subscription_id;
  const customerId =
    typeof entity?.customer_id === "string"
      ? entity.customer_id.trim()
      : user.paddle_customer_id;
  const subscriptionStatus = normalizePaddleSubscriptionStatus(entity?.status);
  const priceId = extractPaddlePriceId(entity);

  return updateUserPaddleAccess(user.id, {
    customerId,
    subscriptionId,
    subscriptionStatus,
    priceId,
    hasAccess: isPaddleSubscriptionAccessActive(subscriptionStatus),
  });
}

async function syncPaddleTransactionEntity(entity) {
  const user = await findUserForPaddleEntity(entity);
  if (!user) {
    return null;
  }

  const customerId =
    typeof entity?.customer_id === "string"
      ? entity.customer_id.trim()
      : user.paddle_customer_id;
  const subscriptionId =
    typeof entity?.subscription_id === "string"
      ? entity.subscription_id.trim()
      : user.paddle_subscription_id;
  const priceId = extractPaddlePriceId(entity);

  return updateUserPaddleAccess(user.id, {
    customerId,
    subscriptionId,
    subscriptionStatus: subscriptionId ? "active" : null,
    priceId,
    hasAccess: subscriptionId ? true : null,
  });
}

function hashPasswordResetToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function isTruthyEnv(value) {
  return typeof value === "string" && ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function isEmailTransportConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_FROM_EMAIL,
  );
}

let emailTransporter;

function getEmailTransporter() {
  if (!isEmailTransportConfigured()) {
    throw new Error("SMTP email is not configured on the server");
  }

  if (!emailTransporter) {
    const smtpPort = Number.parseInt(process.env.SMTP_PORT || "", 10) || 587;
    const secure =
      process.env.SMTP_SECURE != null
        ? isTruthyEnv(process.env.SMTP_SECURE)
        : smtpPort === 465;

    emailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: smtpPort,
      secure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  return emailTransporter;
}

function buildPasswordResetUrl(req, token) {
  const configuredBase = process.env.PASSWORD_RESET_BASE_URL?.trim();
  const baseUrl =
    configuredBase ||
    `${req.protocol || "http"}://${req.get("host") || "localhost:3000"}/reset-password`;
  const url = new URL(baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

async function sendPasswordResetEmail({ email, resetUrl }) {
  const transporter = getEmailTransporter();
  const fromEmail = process.env.SMTP_FROM_EMAIL?.trim();
  const fromName = process.env.SMTP_FROM_NAME?.trim() || "Keystone Languages";

  await transporter.sendMail({
    from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
    to: email,
    subject: "Reset your Keystone password",
    text: [
      "We received a request to reset your Keystone password.",
      "",
      `Use this link within ${PASSWORD_RESET_EXPIRY_MINUTES} minutes:`,
      resetUrl,
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#0f1720;max-width:560px;margin:0 auto;padding:24px;">
        <h1 style="font-size:24px;margin:0 0 12px;">Reset your Keystone password</h1>
        <p style="margin:0 0 16px;">We received a request to reset your Keystone password.</p>
        <p style="margin:0 0 20px;">Use the link below within ${PASSWORD_RESET_EXPIRY_MINUTES} minutes.</p>
        <p style="margin:0 0 24px;">
          <a href="${resetUrl}" style="display:inline-block;background:#344863;color:#ffffff;text-decoration:none;padding:12px 18px;font-weight:700;">
            Reset password
          </a>
        </p>
        <p style="margin:0 0 8px;font-size:14px;color:#4a5563;">If the button does not work, copy and paste this link into your browser:</p>
        <p style="margin:0 0 20px;font-size:14px;word-break:break-word;color:#344863;">${resetUrl}</p>
        <p style="margin:0;font-size:14px;color:#4a5563;">If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });
}

async function sendSupportRequestEmail({
  accountEmail,
  contactEmail,
  userId,
  message,
}) {
  const transporter = getEmailTransporter();
  const fromEmail = process.env.SMTP_FROM_EMAIL?.trim();
  const fromName = process.env.SMTP_FROM_NAME?.trim() || "Keystone Languages";
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br />");
  const contactLabel = contactEmail || accountEmail || "guest submission";
  const replyTo = isValidEmail(contactEmail || "") ? contactEmail : undefined;

  await transporter.sendMail({
    from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
    to: SUPPORT_INBOX_EMAIL,
    replyTo,
    subject: `Support request from ${contactLabel}`,
    text: [
      `Support request received from ${contactLabel}.`,
      "",
      `User ID: ${userId ?? "unknown"}`,
      `Account email: ${accountEmail || "unknown"}`,
      `Reply-to email: ${contactEmail || "not provided"}`,
      "",
      "Message:",
      message,
    ].join("\n"),
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#0f1720;max-width:680px;margin:0 auto;padding:24px;">
        <h1 style="font-size:24px;margin:0 0 12px;">Support request</h1>
        <p style="margin:0 0 16px;"><strong>Reply-to:</strong> ${escapeHtml(contactEmail || "not provided")}</p>
        <p style="margin:0 0 8px;"><strong>User ID:</strong> ${escapeHtml(userId ?? "unknown")}</p>
        <p style="margin:0 0 20px;"><strong>Account email:</strong> ${escapeHtml(accountEmail || "unknown")}</p>
        <div style="padding:16px;border:1px solid #d8dde5;background:#faf7f1;">
          ${safeMessage}
        </div>
      </div>
    `,
  });
}

function renderPasswordResetPage() {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reset Password | Keystone Languages</title>
    <style>
      :root {
        color-scheme: light;
        --paper: #faf7f1;
        --card: #ffffff;
        --ink: #111827;
        --muted: #556070;
        --line: #d8dde5;
        --accent: #344863;
        --danger: #a45151;
        --success: #4e6b48;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: Arial, Helvetica, sans-serif;
        background: var(--paper);
        color: var(--ink);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .shell {
        width: 100%;
        max-width: 460px;
        border: 1px solid var(--line);
        background: var(--card);
        padding: 28px;
      }
      h1 {
        margin: 0 0 10px;
        font-size: 32px;
        line-height: 1.05;
      }
      p {
        margin: 0 0 16px;
        color: var(--muted);
        line-height: 1.6;
      }
      label {
        display: block;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 8px;
      }
      input {
        width: 100%;
        border: 1px solid var(--line);
        padding: 14px;
        font-size: 16px;
        margin-bottom: 14px;
      }
      button {
        width: 100%;
        border: 1px solid var(--accent);
        background: var(--accent);
        color: #fff;
        font-size: 15px;
        font-weight: 700;
        padding: 14px;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.6;
        cursor: default;
      }
      .message {
        display: none;
        border: 1px solid var(--line);
        padding: 14px;
        margin-bottom: 18px;
        line-height: 1.55;
      }
      .message.show { display: block; }
      .message.error {
        color: var(--danger);
        border-color: rgba(164,81,81,0.35);
        background: rgba(164,81,81,0.08);
      }
      .message.success {
        color: var(--success);
        border-color: rgba(78,107,72,0.35);
        background: rgba(78,107,72,0.08);
      }
      .hint {
        font-size: 13px;
        color: var(--muted);
        margin-top: 14px;
      }
      .login-link {
        display: inline-block;
        margin-top: 18px;
        color: var(--accent);
        font-weight: 700;
        text-decoration: none;
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <h1>Reset your password</h1>
      <p>Choose a new password for your Keystone account.</p>
      <div id="message" class="message" role="status" aria-live="polite"></div>
      <form id="reset-form" novalidate>
        <label for="password">New password</label>
        <input id="password" name="password" type="password" autocomplete="new-password" />
        <label for="confirm-password">Confirm password</label>
        <input id="confirm-password" name="confirm-password" type="password" autocomplete="new-password" />
        <button id="submit-button" type="submit">Update password</button>
      </form>
      <div class="hint">Use at least 8 characters, including uppercase, lowercase, and a number.</div>
      <a class="login-link" href="https://keystonelanguages.com/">Back to Keystone</a>
    </main>
    <script>
      const form = document.getElementById("reset-form");
      const message = document.getElementById("message");
      const button = document.getElementById("submit-button");
      const token = new URLSearchParams(window.location.search).get("token") || "";
      let resetPath = window.location.pathname || "";
      while (resetPath.length > 1 && resetPath.endsWith("/")) {
        resetPath = resetPath.slice(0, -1);
      }
      const apiPrefix = resetPath.endsWith("/reset-password")
        ? resetPath.slice(0, -"/reset-password".length)
        : "";

      function apiUrl(path) {
        return (apiPrefix || "") + path;
      }

      function showMessage(type, text) {
        message.className = "message show " + type;
        message.textContent = text;
      }

      async function validateToken() {
        if (!token) {
          form.style.display = "none";
          showMessage("error", "This reset link is missing a token.");
          return;
        }

        try {
          const response = await fetch(apiUrl("/password/reset/validate"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            form.style.display = "none";
            showMessage("error", data.error || "This reset link is invalid or has expired.");
          }
        } catch {
          form.style.display = "none";
          showMessage("error", "We could not verify this reset link right now.");
        }
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const password = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirm-password").value;

        if (!password || !confirmPassword) {
          showMessage("error", "Please fill out both password fields.");
          return;
        }

        if (password !== confirmPassword) {
          showMessage("error", "The passwords do not match.");
          return;
        }

        button.disabled = true;
        button.textContent = "Updating...";

        try {
          const response = await fetch(apiUrl("/password/reset"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, password }),
          });
          const data = await response.json().catch(() => ({}));

          if (!response.ok) {
            showMessage("error", data.error || "We could not reset your password.");
          } else {
            form.style.display = "none";
            showMessage("success", "Your password has been updated. You can return to Keystone and sign in now.");
          }
        } catch {
          showMessage("error", "We could not reset your password right now.");
        } finally {
          button.disabled = false;
          button.textContent = "Update password";
        }
      });

      validateToken();
    </script>
  </body>
</html>`;
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    db: getPoolStats(),
    tts: {
      cacheDir: TTS_SENTENCE_DIR,
      cacheMaxBytes: TTS_CACHE_MAX_BYTES,
      ...ttsConcurrencyLimiter.getStats(),
    },
  });
});

const STARTUP_ROUTE_CHECKS = [
  { group: "core", method: "GET", path: "/health", label: "health" },
  { group: "core", method: "GET", path: "/health/startup", label: "startup health" },
  { group: "core", method: "POST", path: "/signup", label: "signup" },
  { group: "core", method: "POST", path: "/login", label: "login" },
  { group: "core", method: "POST", path: "/auth/google", label: "google auth" },
  { group: "core", method: "GET", path: "/me", label: "current user" },
  { group: "core", method: "DELETE", path: "/me", label: "delete account" },
  { group: "thai", method: "GET", path: "/grammar/overrides", label: "grammar overrides" },
  { group: "thai", method: "POST", path: "/practice-csv", label: "practice sentence" },
  { group: "thai", method: "POST", path: "/grammar/explain-sentence", label: "grammar sentence explanation" },
  { group: "thai", method: "GET", path: "/review/queue", label: "review queue" },
  { group: "thai", method: "GET", path: "/review/grammar/:grammarId", label: "review grammar detail" },
  { group: "thai", method: "PATCH", path: "/review/grammar/:grammarId/lesson", label: "review lesson save" },
  { group: "thai", method: "POST", path: "/review/grammar/:grammarId/publish", label: "review lesson publish" },
  { group: "thai", method: "POST", path: "/review/grammar/:grammarId/seed-wave", label: "review lesson seed wave" },
  { group: "thai", method: "GET", path: "/review/examples/:exampleId/history", label: "review row history" },
  { group: "thai", method: "PATCH", path: "/review/examples/:exampleId/audit", label: "review row audit" },
  { group: "thai", method: "PATCH", path: "/review/examples/:exampleId", label: "review row save" },
  { group: "thai", method: "POST", path: "/tts/sentence", label: "sentence TTS" },
  { group: "thai", method: "POST", path: "/me/keystone-access", label: "keystone access sync" },
  { group: "thai", method: "POST", path: "/transform", label: "transform generation" },
  { group: "thai", method: "GET", path: "/vocab/review", label: "SRS review" },
  { group: "thai", method: "POST", path: "/vocab/answer", label: "SRS answer" },
  { group: "jlpt", method: "GET", path: "/jlpt/levels", label: "JLPT levels" },
  { group: "jlpt", method: "GET", path: "/jlpt/lessons", label: "JLPT lesson list" },
  { group: "jlpt", method: "GET", path: "/jlpt/lessons/:id", label: "JLPT lesson detail" },
  { group: "jlpt", method: "GET", path: "/jlpt/lessons/:id/examples", label: "JLPT lesson examples" },
];

function isRouteRegistered(method, routePath) {
  return registeredRoutes.some(
    (route) => route.method === method && route.path === routePath,
  );
}

function countStructuredJlptLessons() {
  const jlptRoot = path.join(ADMIN_DATA_DIR, "jlpt", "levels");
  if (!fs.existsSync(jlptRoot)) {
    return { mode: "missing", lessonCount: 0 };
  }

  let lessonCount = 0;

  for (const level of ["N5", "N4", "N3", "N2", "N1"]) {
    const levelDir = path.join(jlptRoot, level);
    if (!fs.existsSync(levelDir)) {
      continue;
    }

    const entries = fs
      .readdirSync(levelDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory());

    lessonCount += entries.length;
  }

  return {
    mode: lessonCount > 0 ? "structured-files" : "structured-empty",
    lessonCount,
  };
}

function countLegacyJlptLessons() {
  const legacyFile = path.join(ADMIN_DATA_DIR, "jlpt-lessons.json");
  if (!fs.existsSync(legacyFile)) {
    return 0;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(legacyFile, "utf8"));
    return Array.isArray(parsed?.lessons) ? parsed.lessons.length : 0;
  } catch (err) {
    console.error("Failed to inspect legacy JLPT lesson file:", err);
    return 0;
  }
}

function getGoogleTtsConfigStatus() {
  if (process.env.GOOGLE_TTS_CREDENTIALS_JSON?.trim()) {
    return "inline-json";
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    return "credentials-file";
  }

  return "missing";
}

function buildStartupReport() {
  const structuredJlpt = countStructuredJlptLessons();
  const grammarPointCount = Object.keys(grammarSentences).length;
  const routeChecks = STARTUP_ROUTE_CHECKS.map((route) => ({
    group: route.group,
    method: route.method,
    path: route.path,
    label: route.label,
    registered: isRouteRegistered(route.method, route.path),
  }));

  return {
    ok: true,
    runtime: {
      port: PORT,
      nodeEnv: process.env.NODE_ENV || "development",
      jsonBodyLimit: process.env.JSON_BODY_LIMIT || "1mb",
    },
    services: {
      core: {
        db: {
          status: "connected",
          pool: getPoolStats(),
        },
        googleSignIn: {
          status:
            getConfiguredGoogleClientIds().length > 0 ? "configured" : "missing",
          clientIdCount: getConfiguredGoogleClientIds().length,
        },
        passwordResetEmail: {
          status: isEmailTransportConfigured() ? "configured" : "missing",
        },
        googleTts: {
          status:
            getGoogleTtsConfigStatus() === "missing" ? "missing" : "configured",
          configSource: getGoogleTtsConfigStatus(),
        },
        ttsCache: {
          status: fs.existsSync(TTS_SENTENCE_DIR) ? "ready" : "missing",
          cacheDir: TTS_SENTENCE_DIR,
          cacheMaxBytes: TTS_CACHE_MAX_BYTES,
          ...ttsConcurrencyLimiter.getStats(),
        },
      },
      thai: {
        dictionary: {
          status: dictionary.length > 0 ? "loaded" : "empty",
          entryCount: dictionary.length,
        },
        grammarExamples: {
          status: grammarPointCount > 0 ? "loaded" : "empty",
          grammarPointCount,
        },
      },
      jlpt: {
        content: {
          status:
            structuredJlpt.lessonCount > 0 || countLegacyJlptLessons() > 0
              ? "loaded"
              : "missing",
          mode:
            structuredJlpt.lessonCount > 0
              ? structuredJlpt.mode
              : countLegacyJlptLessons() > 0
                ? "legacy-json"
                : "missing",
          lessonCount:
            structuredJlpt.lessonCount > 0
              ? structuredJlpt.lessonCount
              : countLegacyJlptLessons(),
        },
      },
    },
    routes: routeChecks,
  };
}

function printStartupSummary() {
  const report = buildStartupReport();
  const coreServiceRows = [
    {
      component: "DB",
      status: report.services.core.db.status,
      details: `pool max ${report.services.core.db.pool.max}, waiting ${report.services.core.db.pool.waitingCount}`,
    },
    {
      component: "Google sign-in",
      status: report.services.core.googleSignIn.status,
      details: `${report.services.core.googleSignIn.clientIdCount} client IDs`,
    },
    {
      component: "Password reset email",
      status: report.services.core.passwordResetEmail.status,
      details: report.services.core.passwordResetEmail.status,
    },
    {
      component: "Google TTS",
      status: report.services.core.googleTts.status,
      details: report.services.core.googleTts.configSource,
    },
    {
      component: "TTS cache",
      status: report.services.core.ttsCache.status,
      details: report.services.core.ttsCache.cacheDir,
    },
  ];

  const thaiServiceRows = [
    {
      component: "Dictionary",
      status: report.services.thai.dictionary.status,
      details: `${report.services.thai.dictionary.entryCount} entries`,
    },
    {
      component: "Grammar examples",
      status: report.services.thai.grammarExamples.status,
      details: `${report.services.thai.grammarExamples.grammarPointCount} grammar points`,
    },
  ];

  const jlptServiceRows = [
    {
      component: "JLPT content",
      status: report.services.jlpt.content.status,
      details: `${report.services.jlpt.content.lessonCount} lessons via ${report.services.jlpt.content.mode}`,
    },
  ];

  const routeRowsForGroup = (group) =>
    report.routes
      .filter((route) => route.group === group)
      .map((route) => ({
        route: `${route.method} ${route.path}`,
        status: route.registered ? "registered" : "missing",
        label: route.label,
      }));

  console.log("");
  console.log("Backend startup summary");
  console.log("Core services");
  console.table(coreServiceRows);
  console.log("Thai services");
  console.table(thaiServiceRows);
  console.log("JLPT services");
  console.table(jlptServiceRows);
  console.log("Core routes");
  console.table(routeRowsForGroup("core"));
  console.log("Thai routes");
  console.table(routeRowsForGroup("thai"));
  console.log("JLPT routes");
  console.table(routeRowsForGroup("jlpt"));
}

app.get("/health/startup", (_req, res) => {
  res.json(buildStartupReport());
});

function getConfiguredGoogleClientIds() {
  return [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_WEB_CLIENT_ID,
    process.env.GOOGLE_EXPO_CLIENT_ID,
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  ].filter(Boolean);
}

async function verifyGoogleIdToken(idToken) {
  const allowedClientIds = getConfiguredGoogleClientIds();

  if (allowedClientIds.length === 0) {
    throw new Error("Google sign-in is not configured on the server");
  }

  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
  );

  if (!response.ok) {
    throw new Error("Google token verification failed");
  }

  const payload = await response.json();
  const email = payload.email?.toLowerCase().trim();
  const iss = payload.iss;
  const aud = payload.aud;
  const sub = payload.sub;
  const emailVerified =
    payload.email_verified === true || payload.email_verified === "true";

  if (
    !email ||
    !sub ||
    !emailVerified ||
    !allowedClientIds.includes(aud) ||
    !["accounts.google.com", "https://accounts.google.com"].includes(iss)
  ) {
    throw new Error("Invalid Google sign-in token");
  }

  return {
    email,
    sub,
    displayName:
      typeof payload.name === "string" && payload.name.trim()
        ? payload.name.trim().slice(0, 40)
        : null,
  };
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send("Missing token");
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "devsecret");

    req.userId = decoded.userId;
    req.userEmail = decoded.email;

    next();
  } catch (err) {
    return res.status(401).send("Invalid token");
  }
}

async function adminMiddleware(req, res, next) {
  try {
    const result = await pool.query(
      `
      SELECT is_admin
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [req.userId],
    );

    if (result.rows.length === 0 || result.rows[0].is_admin !== true) {
      return res.status(403).json({ error: "Admin access required" });
    }

    next();
  } catch (err) {
    console.error("Admin auth failed:", err);
    res.status(500).json({ error: "Failed to verify admin access" });
  }
}

async function reviewContentMiddleware(req, res, next) {
  try {
    const result = await pool.query(
      `
      SELECT is_admin, can_review_content
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [req.userId],
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: "Review access required" });
    }

    const row = result.rows[0];
    if (row.is_admin !== true && row.can_review_content !== true) {
      return res.status(403).json({ error: "Review access required" });
    }

    next();
  } catch (err) {
    console.error("Review auth failed:", err);
    res.status(500).json({ error: "Failed to verify review access" });
  }
}

function optionalAuthMiddleware(req, _res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next();
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "devsecret");
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
  } catch (_err) {
    req.userId = undefined;
    req.userEmail = undefined;
  }

  next();
}

registerExplainSentenceRoute(app, {
  openai,
  authMiddleware: optionalAuthMiddleware,
  rateLimiter: grammarExplanationRateLimiter,
});

app.get("/me", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        email,
        display_name,
        is_admin,
        can_review_content,
        has_keystone_access,
        paddle_keystone_access
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [req.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(mapUserAccessRow(result.rows[0]));
  } catch (err) {
    console.error("Failed to fetch user profile:", err);
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

app.post("/support/request", supportRequestRateLimiter, optionalAuthMiddleware, async (req, res) => {
  try {
    const contactEmail =
      typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";

    if (contactEmail && !isValidEmail(contactEmail)) {
      return res.status(400).json({ error: "Enter a valid email address." });
    }

    if (!message) {
      return res.status(400).json({ error: "Describe the problem before sending." });
    }

    if (message.length > 4000) {
      return res.status(400).json({ error: "Please keep the message under 4000 characters." });
    }

    let user = null;
    if (req.userId) {
      const userResult = await pool.query(
        `
        SELECT id, email
        FROM users
        WHERE id = $1
        LIMIT 1
        `,
        [req.userId],
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      user = userResult.rows[0];
    }

    const resolvedAccountEmail = user?.email || contactEmail || null;
    const supportRequest = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      userId: user?.id || null,
      accountEmail: resolvedAccountEmail,
      contactEmail: contactEmail || null,
      isGuest: !user,
      message,
      deliveredByEmail: false,
    };

    try {
      if (isEmailTransportConfigured()) {
        await sendSupportRequestEmail({
          accountEmail: resolvedAccountEmail,
          contactEmail,
          userId: user?.id ? String(user.id) : "guest",
          message,
        });
        supportRequest.deliveredByEmail = true;
      }
    } catch (err) {
      console.error("Failed to send support request email:", err);
    }

    appendSupportRequest(supportRequest);

    res.json({
      success: true,
      deliveredByEmail: supportRequest.deliveredByEmail,
    });
  } catch (err) {
    console.error("Failed to submit support request:", err);
    res.status(500).json({ error: "Failed to send support request" });
  }
});

app.patch("/me", authMiddleware, async (req, res) => {
  try {
    const displayName = normalizeDisplayName(req.body.displayName);

    const result = await pool.query(
      `
      UPDATE users
      SET display_name = COALESCE($2, LEFT(split_part(email, '@', 1), 40))
      WHERE id = $1
      RETURNING
        id,
        email,
        display_name,
        is_admin,
        can_review_content,
        has_keystone_access,
        paddle_keystone_access
      `,
      [req.userId, displayName],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(mapUserAccessRow(result.rows[0]));
  } catch (err) {
    console.error("Failed to update user profile:", err);
    res.status(500).json({ error: "Failed to update user profile" });
  }
});

app.post("/me/keystone-access", authMiddleware, async (req, res) => {
  try {
    if (typeof req.body?.hasAccess !== "boolean") {
      return res.status(400).json({ error: "hasAccess must be a boolean" });
    }

    const result = await pool.query(
      `
      UPDATE users
      SET has_keystone_access = $2,
          keystone_access_updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        email,
        display_name,
        is_admin,
        can_review_content,
        has_keystone_access,
        paddle_keystone_access
      `,
      [req.userId, req.body.hasAccess],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(mapUserAccessRow(result.rows[0]));
  } catch (err) {
    console.error("Failed to sync Keystone Access:", err);
    res.status(500).json({ error: "Failed to sync Keystone Access" });
  }
});

app.get("/billing/paddle/subscription", authMiddleware, async (req, res) => {
  try {
    if (!isPaddleApiConfigured()) {
      return res.status(503).json({ error: "Paddle billing is not configured" });
    }

    const billingState = await resolvePaddleBillingStateForUser(req.userId);
    if (!billingState?.user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!billingState.subscription || !billingState.summary) {
      return res.status(404).json({
        error: "No web subscription was found for this account yet.",
      });
    }

    res.json({
      ...billingState.summary,
      customerId: billingState.customerId,
      hasAccess: hasKeystoneAccess(billingState.user),
    });
  } catch (err) {
    console.error("Failed to load Paddle subscription details:", err);
    res.status(500).json({ error: "Failed to load subscription details" });
  }
});

app.post(
  "/billing/paddle/subscription/switch-preview",
  authMiddleware,
  async (req, res) => {
    try {
      if (!isPaddleApiConfigured()) {
        return res.status(503).json({ error: "Paddle billing is not configured" });
      }

      const switchRequest = await resolvePaddlePlanSwitchForUser(
        req.userId,
        req.body?.targetPlan,
      );
      const previewResponse = await paddleApiRequest(
        `/subscriptions/${switchRequest.summary.subscriptionId}/preview`,
        {
          method: "PATCH",
          body: switchRequest.requestBody,
        },
      );

      res.json(
        mapPaddleSwitchPreview(
          previewResponse?.data ?? null,
          switchRequest.currentPlan,
          switchRequest.targetPlan,
        ),
      );
    } catch (err) {
      const status =
        Number.isInteger(err?.status) && err.status >= 400 && err.status < 600
          ? err.status
          : 500;
      if (status >= 500) {
        console.error("Failed to preview Paddle subscription switch:", err);
      }
      res
        .status(status)
        .json({ error: err?.message || "Failed to preview the plan change" });
    }
  },
);

app.post("/billing/paddle/subscription/switch", authMiddleware, async (req, res) => {
  try {
    if (!isPaddleApiConfigured()) {
      return res.status(503).json({ error: "Paddle billing is not configured" });
    }

    const switchRequest = await resolvePaddlePlanSwitchForUser(
      req.userId,
      req.body?.targetPlan,
    );
    const response = await paddleApiRequest(
      `/subscriptions/${switchRequest.summary.subscriptionId}`,
      {
        method: "PATCH",
        body: switchRequest.requestBody,
      },
    );
    const updatedSubscription = response?.data ?? null;
    const updatedStatus = normalizePaddleSubscriptionStatus(
      updatedSubscription?.status,
    );

    await updateUserPaddleAccess(req.userId, {
      customerId: switchRequest.customerId,
      subscriptionId: switchRequest.summary.subscriptionId,
      subscriptionStatus: updatedStatus,
      priceId: extractPaddlePriceId(updatedSubscription),
      hasAccess: isPaddleSubscriptionAccessActive(updatedStatus),
    });

    res.json({
      ...mapPaddleSubscriptionSummary(updatedSubscription),
      customerId: switchRequest.customerId,
      previousPlan: switchRequest.currentPlan,
      switched: true,
      prorationBillingMode: "prorated_immediately",
      hasAccess: isPaddleSubscriptionAccessActive(updatedStatus),
    });
  } catch (err) {
    const status =
      Number.isInteger(err?.status) && err.status >= 400 && err.status < 600
        ? err.status
        : 500;
    if (status >= 500) {
      console.error("Failed to switch Paddle subscription:", err);
    }
    res.status(status).json({ error: err?.message || "Failed to switch plans" });
  }
});

app.post("/billing/paddle/portal", authMiddleware, async (req, res) => {
  try {
    if (!isPaddleApiConfigured()) {
      return res.status(503).json({ error: "Paddle billing is not configured" });
    }

    const billingState = await resolvePaddleBillingStateForUser(req.userId);
    if (!billingState?.user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!billingState.customerId) {
      return res.status(404).json({
        error: "No web subscription was found for this account yet.",
      });
    }

    const response = await paddleApiRequest(
      `/customers/${billingState.customerId}/portal-sessions`,
      {
        method: "POST",
        body: billingState.summary?.subscriptionId
          ? {
              subscription_ids: [billingState.summary.subscriptionId],
            }
          : {},
      },
    );
    const url =
      response?.data?.urls?.general?.overview ||
      response?.data?.urls?.overview ||
      null;

    if (!url) {
      return res
        .status(500)
        .json({ error: "Paddle did not return a customer portal URL" });
    }

    res.json({
      url,
      customerId: billingState.customerId,
      subscriptionId: billingState.summary?.subscriptionId || null,
      subscriptionStatus: billingState.summary?.subscriptionStatus || null,
    });
  } catch (err) {
    console.error("Failed to create Paddle customer portal session:", err);
    res.status(500).json({ error: "Failed to open billing management" });
  }
});

app.post("/webhooks/paddle", async (req, res) => {
  try {
    if (!isPaddleWebhookConfigured()) {
      return res.status(503).json({ error: "Paddle webhook secret is not configured" });
    }

    const signatureHeader = req.headers["paddle-signature"];
    const rawBody = typeof req.rawBody === "string" ? req.rawBody : "";

    if (!verifyPaddleWebhookSignature(rawBody, signatureHeader)) {
      return res.status(401).json({ error: "Invalid Paddle signature" });
    }

    const eventType =
      typeof req.body?.event_type === "string" ? req.body.event_type.trim() : "";
    const entity = req.body?.data ?? null;

    if (!eventType || !entity) {
      return res.status(400).json({ error: "Invalid Paddle webhook payload" });
    }

    if (eventType === "transaction.completed") {
      await syncPaddleTransactionEntity(entity);
    } else if (
      eventType === "subscription.created" ||
      eventType === "subscription.updated" ||
      eventType === "subscription.canceled"
    ) {
      await syncPaddleSubscriptionEntity(entity);
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Failed to process Paddle webhook:", err);
    res.status(500).json({ error: "Failed to process Paddle webhook" });
  }
});

async function deleteUserAndRelatedData(client, userId) {
  await client.query(`DELETE FROM review_queue WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM review_sessions WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM activity_log WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM user_vocab WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM grammar_progress WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM bookmarks WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM user_preferences WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
}

app.post("/me/reset-progress", authMiddleware, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM review_queue WHERE user_id = $1`, [req.userId]);
    await client.query(`DELETE FROM review_sessions WHERE user_id = $1`, [req.userId]);
    await client.query(`DELETE FROM activity_log WHERE user_id = $1`, [req.userId]);
    await client.query(`DELETE FROM user_vocab WHERE user_id = $1`, [req.userId]);
    await client.query(`DELETE FROM grammar_progress WHERE user_id = $1`, [req.userId]);
    await client.query(`DELETE FROM bookmarks WHERE user_id = $1`, [req.userId]);
    await client.query("COMMIT");

    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed to reset user progress:", err);
    res.status(500).json({ error: "Failed to reset user progress" });
  } finally {
    client.release();
  }
});

app.delete("/me", authMiddleware, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await deleteUserAndRelatedData(client, req.userId);
    await client.query("COMMIT");

    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed to delete account:", err);
    res.status(500).json({ error: "Failed to delete account" });
  } finally {
    client.release();
  }
});

app.get("/user/preferences", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT track_practice_vocab
      FROM user_preferences
      WHERE user_id = $1
      LIMIT 1
      `,
      [req.userId],
    );

    res.json({
      trackPracticeVocab:
        result.rows.length > 0 ? result.rows[0].track_practice_vocab : true,
    });
  } catch (err) {
    console.error("Failed to fetch user preferences:", err);
    res.status(500).json({ error: "Failed to fetch user preferences" });
  }
});

app.patch("/user/preferences", authMiddleware, async (req, res) => {
  try {
    const { trackPracticeVocab } = req.body;

    if (typeof trackPracticeVocab !== "boolean") {
      return res
        .status(400)
        .json({ error: "trackPracticeVocab must be a boolean" });
    }

    const result = await pool.query(
      `
      INSERT INTO user_preferences (user_id, track_practice_vocab)
      VALUES ($1, $2)
      ON CONFLICT (user_id)
      DO UPDATE SET track_practice_vocab = EXCLUDED.track_practice_vocab
      RETURNING track_practice_vocab
      `,
      [req.userId, trackPracticeVocab],
    );

    res.json({
      trackPracticeVocab: result.rows[0].track_practice_vocab,
    });
  } catch (err) {
    console.error("Failed to update user preferences:", err);
    res.status(500).json({ error: "Failed to update user preferences" });
  }
});

/* =============================== */
/* SRS ROUTES (from srs.js) */
/* =============================== */

registerSRSRoutes(app, authMiddleware);

/* =============================== */
/* GRAMMAR PROGRESS */
/* =============================== */

const GRAMMAR_ACTIVITY_MIN_ROUNDS = 10;

function mapGrammarProgressRow(row) {
  return {
    grammarId: row.grammar_id,
    rounds: row.rounds,
    correct: row.correct,
    total: row.total,
    lastPracticed: row.lastPracticed,
  };
}

app.get("/grammar/progress", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        grammar_id,
        rounds,
        correct,
        total,
        last_practiced AS "lastPracticed"
      FROM grammar_progress
      WHERE user_id = $1
      ORDER BY last_practiced DESC
      `,
      [req.userId],
    );

    res.json(result.rows.map(mapGrammarProgressRow));
  } catch (err) {
    console.error("Failed to fetch grammar progress:", err);
    res.status(500).json({ error: "Failed to fetch grammar progress" });
  }
});

app.get("/grammar/progress/:grammarId", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        grammar_id,
        rounds,
        correct,
        total,
        last_practiced AS "lastPracticed"
      FROM grammar_progress
      WHERE user_id = $1 AND grammar_id = $2
      LIMIT 1
      `,
      [req.userId, req.params.grammarId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Grammar progress not found" });
    }

    res.json(mapGrammarProgressRow(result.rows[0]));
  } catch (err) {
    console.error("Failed to fetch grammar progress item:", err);
    res.status(500).json({ error: "Failed to fetch grammar progress" });
  }
});

app.post("/grammar/progress/round", authMiddleware, async (req, res) => {
  try {
    const { grammarId, wasCorrect } = req.body;

    if (!grammarId || typeof wasCorrect !== "boolean") {
      return res
        .status(400)
        .json({ error: "grammarId and wasCorrect are required" });
    }

    const result = await pool.query(
      `
      INSERT INTO grammar_progress (
        user_id,
        grammar_id,
        rounds,
        correct,
        total,
        last_practiced
      )
      VALUES ($1, $2, 1, $3, 1, NOW())
      ON CONFLICT (user_id, grammar_id)
      DO UPDATE SET
        rounds = grammar_progress.rounds + 1,
        correct = grammar_progress.correct + EXCLUDED.correct,
        total = grammar_progress.total + 1,
        last_practiced = NOW()
      RETURNING
        grammar_id,
        rounds,
        correct,
        total,
        last_practiced AS "lastPracticed"
      `,
      [req.userId, grammarId, wasCorrect ? 1 : 0],
    );

    const progress = mapGrammarProgressRow(result.rows[0]);

    if (progress.rounds >= GRAMMAR_ACTIVITY_MIN_ROUNDS) {
      await pool.query(
        `
        INSERT INTO activity_log (user_id, activity_date, source, count)
        VALUES ($1, CURRENT_DATE, 'grammar', 1)
        ON CONFLICT (user_id, activity_date, source)
        DO UPDATE SET count = activity_log.count + 1
        `,
        [req.userId],
      );
    }

    res.json(progress);
  } catch (err) {
    console.error("Failed to save grammar progress:", err);
    res.status(500).json({ error: "Failed to save grammar progress" });
  }
});

app.delete("/grammar/progress/:grammarId", authMiddleware, async (req, res) => {
  try {
    await pool.query(
      `
      DELETE FROM grammar_progress
      WHERE user_id = $1 AND grammar_id = $2
      `,
      [req.userId, req.params.grammarId],
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Failed to reset grammar progress:", err);
    res.status(500).json({ error: "Failed to reset grammar progress" });
  }
});

app.delete("/grammar/progress", authMiddleware, async (req, res) => {
  try {
    await pool.query(
      `
      DELETE FROM grammar_progress
      WHERE user_id = $1
      `,
      [req.userId],
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Failed to clear grammar progress:", err);
    res.status(500).json({ error: "Failed to clear grammar progress" });
  }
});

/* =============================== */
/* BOOKMARKS */
/* =============================== */

app.post("/bookmark", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { grammarId } = req.body;

    await pool.query(
      `
      INSERT INTO bookmarks (user_id, grammar_id)
      VALUES ($1, $2)
      `,
      [userId, grammarId],
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send("Bookmark failed");
  }
});

app.delete("/bookmark", authMiddleware, async (req, res) => {
  try {
    const { grammarId } = req.body;
    const userId = req.userId;

    await pool.query(
      `
      DELETE FROM bookmarks
      WHERE user_id = $1
      AND grammar_id = $2
      `,
      [userId, grammarId],
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send("Bookmark delete failed");
  }
});

app.get("/bookmarks", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const result = await pool.query(
      `
      SELECT grammar_id
      FROM bookmarks
      WHERE user_id = $1
      `,
      [userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to fetch bookmarks");
  }
});

/* =============================== */
/* ADMIN */
/* =============================== */

app.get("/admin/dashboard", authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const [
      usersResult,
      activeUsersResult,
      bookmarksResult,
      grammarProgressResult,
      grammarRoundsResult,
      vocabResult,
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM users`),
      pool.query(`
        SELECT COUNT(DISTINCT user_id)
        FROM activity_log
        WHERE activity_date >= CURRENT_DATE - INTERVAL '6 days'
      `),
      pool.query(`SELECT COUNT(*) FROM bookmarks`),
      pool.query(`SELECT COUNT(*) FROM grammar_progress`),
      pool.query(`SELECT COALESCE(SUM(rounds), 0) AS total FROM grammar_progress`),
      pool.query(`SELECT COUNT(*) FROM user_vocab`),
    ]);

    const overrides = readGrammarOverrides();
    const grammarTopicCount = Object.keys(grammarSentences).length;
    const grammarRowCount = Object.values(grammarSentences).reduce(
      (sum, rows) => sum + rows.length,
      0,
    );

    res.json({
      totalUsers: Number(usersResult.rows[0].count || 0),
      activeUsers7d: Number(activeUsersResult.rows[0].count || 0),
      totalBookmarks: Number(bookmarksResult.rows[0].count || 0),
      grammarProgressEntries: Number(grammarProgressResult.rows[0].count || 0),
      grammarRounds: Number(grammarRoundsResult.rows[0].total || 0),
      vocabCards: Number(vocabResult.rows[0].count || 0),
      grammarTopics: grammarTopicCount,
      grammarPracticeRows: grammarRowCount,
      overriddenTopics: Object.keys(overrides).length,
    });
  } catch (err) {
    console.error("Failed to fetch admin dashboard:", err);
    res.status(500).json({ error: "Failed to fetch admin dashboard" });
  }
});

app.get("/admin/users", authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        u.id,
        u.email,
        u.display_name,
        u.is_admin,
        u.can_review_content,
        u.has_keystone_access,
        u.paddle_keystone_access,
        u.consent_source,
        NULLIF(
          GREATEST(
            COALESCE(
              (SELECT MAX(gp.last_practiced::timestamp) FROM grammar_progress gp WHERE gp.user_id = u.id),
              TIMESTAMP 'epoch'
            ),
            COALESCE(
              (SELECT MAX(rs.session_date::timestamp) FROM review_sessions rs WHERE rs.user_id = u.id),
              TIMESTAMP 'epoch'
            ),
            COALESCE(
              (SELECT MAX(al.activity_date::timestamp) FROM activity_log al WHERE al.user_id = u.id),
              TIMESTAMP 'epoch'
            )
          ),
          TIMESTAMP 'epoch'
        ) AS last_active_at
      FROM users u
      ORDER BY u.id DESC
      `,
    );

    res.json(
      result.rows.map((row) => ({
        id: Number(row.id),
        email: row.email,
        display_name: row.display_name,
        is_admin: row.is_admin === true,
        can_review_content: row.can_review_content === true,
        has_keystone_access: hasKeystoneAccess(row),
        consent_source: row.consent_source ?? null,
        last_active_at: row.last_active_at ?? null,
      })),
    );
  } catch (err) {
    console.error("Failed to fetch admin users:", err);
    res.status(500).json({ error: "Failed to fetch admin users" });
  }
});

app.post("/admin/users", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const email = req.body.email?.toLowerCase().trim();
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const wantsPremium = req.body?.hasKeystoneAccess === true;
    const wantsAdmin = req.body?.isAdmin === true;
    const wantsReviewer = req.body?.canReviewContent === true;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        error:
          "Password must be at least 8 characters and include uppercase, lowercase, and a number",
      });
    }

    const existing = await pool.query(
      `
      SELECT id
      FROM users
      WHERE email = $1
      LIMIT 1
      `,
      [email],
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const displayName = resolveDisplayName(req.body.displayName, email);
    const isAdmin = wantsAdmin || isConfiguredAdminEmail(email);

    const result = await pool.query(
      `
      INSERT INTO users (
        email,
        password_hash,
        display_name,
        is_admin,
        can_review_content,
        has_keystone_access,
        keystone_access_updated_at,
        consent_source
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        CASE WHEN $6 THEN NOW() ELSE NULL END,
        'admin_created'
      )
      RETURNING
        id,
        email,
        display_name,
        is_admin,
        can_review_content,
        has_keystone_access,
        paddle_keystone_access,
        consent_source
      `,
      [email, passwordHash, displayName, isAdmin, wantsReviewer, wantsPremium],
    );

    res.status(201).json(mapUserAccessRow(result.rows[0]));
  } catch (err) {
    console.error("Failed to create admin user:", err);
    res.status(500).json({ error: "Failed to create user" });
  }
});

app.patch("/admin/users/:userId", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = Number.parseInt(req.params.userId, 10);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    const existingResult = await pool.query(
      `
      SELECT id, email
      , can_review_content
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [userId],
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const existingUser = existingResult.rows[0];
    const updates = [];
    const values = [userId];
    let valueIndex = 2;

    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "displayName")) {
      updates.push(
        `display_name = COALESCE($${valueIndex}, LEFT(split_part(email, '@', 1), 40))`,
      );
      values.push(normalizeDisplayName(req.body.displayName));
      valueIndex += 1;
    }

    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "hasKeystoneAccess")) {
      if (typeof req.body.hasKeystoneAccess !== "boolean") {
        return res.status(400).json({ error: "hasKeystoneAccess must be a boolean" });
      }

      updates.push(`has_keystone_access = $${valueIndex}`);
      values.push(req.body.hasKeystoneAccess);
      valueIndex += 1;
      updates.push(`keystone_access_updated_at = NOW()`);
    }

    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "isAdmin")) {
      if (typeof req.body.isAdmin !== "boolean") {
        return res.status(400).json({ error: "isAdmin must be a boolean" });
      }

      const nextIsAdmin =
        req.body.isAdmin === true || isConfiguredAdminEmail(existingUser.email);

      if (userId === req.userId && nextIsAdmin !== true) {
        return res.status(400).json({ error: "You cannot remove your own admin access" });
      }

      updates.push(`is_admin = $${valueIndex}`);
      values.push(nextIsAdmin);
      valueIndex += 1;
    }

    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, "canReviewContent")) {
      if (typeof req.body.canReviewContent !== "boolean") {
        return res.status(400).json({ error: "canReviewContent must be a boolean" });
      }

      updates.push(`can_review_content = $${valueIndex}`);
      values.push(req.body.canReviewContent);
      valueIndex += 1;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: "Provide displayName, hasKeystoneAccess, isAdmin, or canReviewContent",
      });
    }

    const result = await pool.query(
      `
      UPDATE users
      SET ${updates.join(", ")}
      WHERE id = $1
      RETURNING
        id,
        email,
        display_name,
        is_admin,
        can_review_content,
        has_keystone_access,
        paddle_keystone_access,
        consent_source
      `,
      values,
    );

    res.json(mapUserAccessRow(result.rows[0]));
  } catch (err) {
    console.error("Failed to update admin user:", err);
    res.status(500).json({ error: "Failed to update user" });
  }
});

app.delete("/admin/users/:userId", authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = Number.parseInt(req.params.userId, 10);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    if (userId === req.userId) {
      return res.status(400).json({ error: "Use your own account settings to delete yourself" });
    }

    await client.query("BEGIN");

    const existingResult = await client.query(
      `
      SELECT id
      FROM users
      WHERE id = $1
      LIMIT 1
      FOR UPDATE
      `,
      [userId],
    );

    if (existingResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User not found" });
    }

    await deleteUserAndRelatedData(client, userId);
    await client.query("COMMIT");

    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed to delete admin user:", err);
    res.status(500).json({ error: "Failed to delete user" });
  } finally {
    client.release();
  }
});

app.get("/admin/grammar", authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const overrideMetadata = await fetchGrammarOverrideMetadata();
    const productionSummaryMap = await fetchLessonProductionSummaryMap();
    const ids = Array.from(
      new Set([...Object.keys(grammarSentences), ...Array.from(overrideMetadata.keys())]),
    ).sort();

    res.json(
      ids.map((id) => {
        const production = productionSummaryMap.get(id) ?? null;
        return {
          id,
          rowCount: Array.isArray(grammarSentences[id]) ? grammarSentences[id].length : 0,
          approvedRowCount: production?.livePublishedCount ?? 0,
          hasOverride: overrideMetadata.has(id),
          overrideReviewStatus:
            overrideMetadata.get(id)?.reviewStatus ?? null,
          production,
        };
      }),
    );
  } catch (err) {
    console.error("Failed to fetch admin grammar list:", err);
    res.status(500).json({ error: "Failed to fetch admin grammar list" });
  }
});

app.get(
  "/admin/grammar/:grammarId",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { grammarId } = req.params;

      if (!isValidGrammarId(grammarId)) {
        return res.status(400).json({ error: "Invalid grammar id" });
      }

      const [lesson, productionSummary] = await Promise.all([
        fetchGrammarOverrideRecord(grammarId),
        fetchLessonProductionSummaryMap([grammarId]),
      ]);
      const rows = grammarSentences[grammarId];
      const override = lesson?.override ?? null;

      if (!rows && !lesson) {
        return res.status(404).json({ error: "Grammar point not found" });
      }

      res.json({
        override,
        lesson,
        rows: Array.isArray(rows) ? rows : [],
        production: productionSummary.get(grammarId) ?? null,
      });
    } catch (err) {
      console.error("Failed to fetch admin grammar detail:", err);
      res.status(500).json({ error: "Failed to fetch admin grammar detail" });
    }
  },
);

app.put(
  "/admin/grammar/:grammarId",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { grammarId } = req.params;

      if (!isValidGrammarId(grammarId)) {
        return res.status(400).json({ error: "Invalid grammar id" });
      }

      const hasOverride = Object.prototype.hasOwnProperty.call(req.body ?? {}, "override");
      const hasRows = Object.prototype.hasOwnProperty.call(req.body ?? {}, "rows");

      if (!hasOverride && !hasRows) {
        return res.status(400).json({
          error: "Provide override, rows, or both in the request body",
        });
      }

      let savedOverride = null;
      let savedRows = grammarSentences[grammarId] || [];

      if (hasOverride) {
        savedOverride = normalizeGrammarOverride(req.body.override);
        await upsertGrammarLessonOverrideRecord({
          grammarId,
          override: savedOverride,
          reviewStatus: req.body.reviewStatus ?? req.body.overrideReviewStatus ?? "approved",
          reviewAssigneeUserId: normalizeOptionalAssigneeId(
            req.body.reviewAssigneeUserId,
          ),
          reviewNote: normalizeOptionalReviewNote(req.body.reviewNote),
          editorUserId: req.userId,
        });
      }

      if (hasRows) {
        const sourceRows = Array.isArray(req.body.rows) ? req.body.rows : [];
        savedRows = normalizeGrammarRows(sourceRows).map((row, index) => {
          const sourceRow = sourceRows[index] ?? {};
          const reviewStatus = normalizeReviewStatus(
            sourceRow.reviewStatus ?? deriveInitialReviewStatus(row),
            deriveInitialReviewStatus(row),
          );

          return {
            ...row,
            reviewStatus,
            reviewAssigneeUserId: normalizeOptionalAssigneeId(
              sourceRow.reviewAssigneeUserId,
            ),
            reviewNote: normalizeOptionalReviewNote(sourceRow.reviewNote),
            publishState: normalizePublishState(
              sourceRow.publishState,
              "published",
            ),
            rewriteWaveId: normalizeOptionalRewriteWaveId(
              sourceRow.rewriteWaveId,
            ),
            sourceExampleId: normalizeOptionalAssigneeId(
              sourceRow.sourceExampleId,
            ),
            nextWaveDecision: normalizeOptionalNextWaveDecision(
              sourceRow.nextWaveDecision,
            ),
            nextWaveAuditNote: normalizeOptionalAuditNote(
              sourceRow.nextWaveAuditNote,
            ),
            nextWaveAuditedByUserId: normalizeOptionalAssigneeId(
              sourceRow.nextWaveAuditedByUserId,
            ),
            nextWaveAuditedAt:
              typeof sourceRow.nextWaveAuditedAt === "string"
                ? sourceRow.nextWaveAuditedAt
                : null,
            lastEditedByUserId: req.userId,
            approvedByUserId: reviewStatus === "approved" ? req.userId : null,
          };
        });
        await writeGrammarRowsToDatabase(grammarId, savedRows);
        savedRows = await refreshGrammarRowsForGrammarId(grammarId);
      }

      res.json({
        success: true,
        override: savedOverride,
        rowCount: savedRows.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save grammar";
      console.error("Failed to save admin grammar:", err);
      res.status(400).json({ error: message });
    }
  },
);

app.get(
  "/review/queue",
  authMiddleware,
  reviewContentMiddleware,
  async (req, res) => {
    try {
      const reviewers = await fetchReviewerUsers();
      const items = await fetchReviewQueueItems(
        {
          status:
            typeof req.query.status === "string"
              ? normalizeReviewStatus(req.query.status, "")
              : null,
          assignee: req.query.assignee,
          stage: req.query.stage,
          grammarId: req.query.grammarId,
          type: req.query.type,
        },
        req.userId,
      );

      res.json({
        items,
        reviewers,
      });
    } catch (err) {
      console.error("Failed to fetch review queue:", err);
      res.status(500).json({ error: "Failed to fetch review queue" });
    }
  },
);

app.get(
  "/review/grammar/:grammarId",
  authMiddleware,
  reviewContentMiddleware,
  async (req, res) => {
    try {
      const { grammarId } = req.params;

      if (!isValidGrammarId(grammarId)) {
        return res.status(400).json({ error: "Invalid grammar id" });
      }

      const includeLegacy =
        !("includeLegacy" in req.query) ||
        req.query.includeLegacy === "1" ||
        req.query.includeLegacy === "true";

      const [lesson, rows, legacyRowCount, reviewers, productionSummaryMap] =
        await Promise.all([
          fetchGrammarOverrideRecord(grammarId),
          fetchGrammarRowsForGrammarId(grammarId, { includeLegacy }),
          fetchLegacyRowCountForGrammarId(grammarId),
          fetchReviewerUsers(),
          fetchLessonProductionSummaryMap([grammarId]),
        ]);

      if (!lesson && rows.length === 0 && legacyRowCount === 0) {
        return res.status(404).json({ error: "Grammar point not found" });
      }

      const [lessonComments, exampleComments] = await Promise.all([
        lesson ? fetchLessonComments(grammarId) : Promise.resolve([]),
        fetchExampleComments(rows.map((row) => row.id)),
      ]);

      res.json({
        lesson,
        rows,
        legacyRowCount,
        production: productionSummaryMap.get(grammarId) ?? null,
        reviewers,
        lessonComments,
        exampleCommentsByExampleId: serializeCommentMap(exampleComments),
      });
    } catch (err) {
      console.error("Failed to fetch review grammar detail:", err);
      res.status(500).json({ error: "Failed to fetch review grammar detail" });
    }
  },
);

app.get(
  "/review/examples/:exampleId/history",
  authMiddleware,
  reviewContentMiddleware,
  async (req, res) => {
    try {
      const exampleId = Number.parseInt(req.params.exampleId, 10);
      if (!Number.isInteger(exampleId) || exampleId <= 0) {
        return res.status(400).json({ error: "Invalid example id" });
      }

      const existingResult = await pool.query(
        `
        SELECT id
        FROM ${GRAMMAR_EXAMPLES_TABLE}
        WHERE id = $1
        LIMIT 1
        `,
        [exampleId],
      );

      if (existingResult.rows.length === 0) {
        return res.status(404).json({ error: "Example row not found" });
      }

      const revisions = await fetchExampleRevisions(exampleId);
      res.json({ revisions });
    } catch (err) {
      console.error("Failed to fetch review example history:", err);
      res.status(500).json({ error: "Failed to fetch example history" });
    }
  },
);

app.post(
  "/review/grammar/:grammarId/publish",
  authMiddleware,
  reviewContentMiddleware,
  async (req, res) => {
    const client = await pool.connect();
    let transactionStarted = false;
    try {
      const { grammarId } = req.params;

      if (!isValidGrammarId(grammarId)) {
        return res.status(400).json({ error: "Invalid grammar id" });
      }

      const productionSummaryMap = await fetchLessonProductionSummaryMap([grammarId]);
      const production = productionSummaryMap.get(grammarId) ?? null;

      if (!production?.currentRewriteWaveId) {
        return res.status(400).json({
          error: "No active rewrite wave is staged for this lesson",
        });
      }

      if (!production.isReadyToPublish) {
        return res.status(400).json({
          error: `This lesson is not ready to publish yet. ${production.remainingForPublish} more publish-ready rows are still needed.`,
        });
      }

      await client.query("BEGIN");
      transactionStarted = true;

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
        [grammarId, production.currentRewriteWaveId, APPROVED_TONE_CONFIDENCE],
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

      await client.query("COMMIT");
      await refreshGrammarRowsForGrammarId(grammarId);
      const refreshedSummary =
        (await fetchLessonProductionSummaryMap([grammarId])).get(grammarId) ?? null;

      res.json({
        success: true,
        grammarId,
        production: refreshedSummary,
      });
    } catch (err) {
      if (transactionStarted) {
        await client.query("ROLLBACK");
      }
      console.error("Failed to publish grammar rewrite:", err);
      res.status(500).json({ error: "Failed to publish grammar rewrite" });
    } finally {
      client.release();
    }
  },
);

app.patch(
  "/review/grammar/:grammarId/lesson",
  authMiddleware,
  reviewContentMiddleware,
  async (req, res) => {
    try {
      const { grammarId } = req.params;

      if (!isValidGrammarId(grammarId)) {
        return res.status(400).json({ error: "Invalid grammar id" });
      }

      const overridePayload =
        req.body?.override ??
        {
          title: req.body?.title,
          level: req.body?.level,
          stage: req.body?.stage,
          explanation: req.body?.explanation,
          pattern: req.body?.pattern,
          lessonBlocks: req.body?.lessonBlocks,
          aiPrompt: req.body?.aiPrompt,
          example: req.body?.example,
          focus: req.body?.focus,
        };

      const normalizedOverride = normalizeGrammarOverride(overridePayload);
      const reviewAssigneeUserId = await ensureReviewAssigneeExists(
        normalizeOptionalAssigneeId(req.body?.reviewAssigneeUserId),
      );
      const lesson = await upsertGrammarLessonOverrideRecord({
        grammarId,
        override: normalizedOverride,
        reviewStatus: normalizeReviewStatus(
          req.body?.reviewStatus,
          "in_review",
        ),
        reviewAssigneeUserId,
        reviewNote: normalizeOptionalReviewNote(req.body?.reviewNote),
        editorUserId: req.userId,
      });

      res.json({
        success: true,
        lesson,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save lesson review";
      console.error("Failed to save review lesson:", err);
      res.status(400).json({ error: message });
    }
  },
);

app.post(
  "/review/grammar/:grammarId/comments",
  authMiddleware,
  reviewContentMiddleware,
  async (req, res) => {
    try {
      const { grammarId } = req.params;

      if (!isValidGrammarId(grammarId)) {
        return res.status(400).json({ error: "Invalid grammar id" });
      }

      const lesson = await fetchGrammarOverrideRecord(grammarId);
      if (!lesson) {
        return res.status(400).json({
          error: "Save lesson content before adding lesson comments",
        });
      }

      const body = normalizeReviewCommentBody(req.body?.body, "Lesson comment");
      const result = await pool.query(
        `
        INSERT INTO ${GRAMMAR_LESSON_COMMENTS_TABLE} (
          grammar_id,
          author_user_id,
          body
        )
        VALUES ($1, $2, $3)
        RETURNING id, grammar_id, author_user_id, body, created_at
        `,
        [grammarId, req.userId, body],
      );

      const created = result.rows[0];
      const authorResult = await pool.query(
        `
        SELECT id, email, display_name
        FROM users
        WHERE id = $1
        LIMIT 1
        `,
        [req.userId],
      );
      const author = authorResult.rows[0];

      res.status(201).json({
        id: Number(created.id),
        grammarId: created.grammar_id,
        authorUserId: Number(created.author_user_id),
        body: created.body,
        createdAt: created.created_at,
        author: author
          ? {
              id: Number(author.id),
              email: author.email,
              display_name: author.display_name ?? null,
            }
          : null,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to add lesson comment";
      console.error("Failed to create lesson comment:", err);
      res.status(400).json({ error: message });
    }
  },
);

app.patch(
  "/review/examples/:exampleId/audit",
  authMiddleware,
  reviewContentMiddleware,
  async (req, res) => {
    const client = await pool.connect();
    let transactionStarted = false;

    try {
      const exampleId = Number.parseInt(req.params.exampleId, 10);
      if (!Number.isInteger(exampleId) || exampleId <= 0) {
        return res.status(400).json({ error: "Invalid example id" });
      }

      const existingResult = await client.query(
        `
        SELECT
          id,
          grammar_id,
          thai,
          romanization,
          english,
          breakdown,
          difficulty,
          sort_order,
          tone_confidence,
          tone_status,
          tone_analysis,
          review_status,
          review_assignee_user_id,
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
        FROM ${GRAMMAR_EXAMPLES_TABLE}
        WHERE id = $1
        LIMIT 1
        `,
        [exampleId],
      );

      if (existingResult.rows.length === 0) {
        return res.status(404).json({ error: "Example row not found" });
      }

      const existing = existingResult.rows[0];
      if (normalizePublishState(existing.publish_state, "published") !== "published") {
        return res.status(400).json({
          error: "Only live published rows can be audited for the next wave",
        });
      }

      const beforeRow = serializeGrammarExampleRow(
        existing,
        Number(existing.sort_order ?? 0),
      );
      const beforeSnapshot = buildExampleRevisionSnapshot(beforeRow);
      const nextWaveDecision = normalizeOptionalNextWaveDecision(
        req.body?.nextWaveDecision,
      );
      const nextWaveAuditNote = normalizeOptionalAuditNote(
        req.body?.nextWaveAuditNote,
      );
      const shouldStampAudit =
        nextWaveDecision !== null || nextWaveAuditNote !== null;

      await client.query("BEGIN");
      transactionStarted = true;

      const updateResult = await client.query(
        `
        UPDATE ${GRAMMAR_EXAMPLES_TABLE}
        SET
          next_wave_decision = $2,
          next_wave_audit_note = $3,
          next_wave_audited_by_user_id = $4::bigint,
          next_wave_audited_at = CASE
            WHEN $4::bigint IS NOT NULL THEN NOW()
            ELSE NULL
          END,
          updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          grammar_id,
          thai,
          romanization,
          english,
          breakdown,
          difficulty,
          sort_order,
          tone_confidence,
          tone_status,
          tone_analysis,
          review_status,
          review_assignee_user_id,
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
        `,
        [
          exampleId,
          nextWaveDecision,
          nextWaveAuditNote,
          shouldStampAudit ? req.userId : null,
        ],
      );

      const updatedRow = serializeGrammarExampleRow(
        updateResult.rows[0],
        Number(updateResult.rows[0]?.sort_order ?? existing.sort_order ?? 0),
      );
      const afterSnapshot = buildExampleRevisionSnapshot(updatedRow);
      const changedFields = diffExampleRevisionSnapshots(
        beforeSnapshot,
        afterSnapshot,
      );

      await client.query(
        `
        INSERT INTO ${GRAMMAR_EXAMPLE_REVISIONS_TABLE} (
          example_id,
          grammar_id,
          action,
          edited_by_user_id,
          changed_fields,
          before_snapshot,
          after_snapshot
        )
        VALUES ($1, $2, 'audited', $3::bigint, $4::jsonb, $5::jsonb, $6::jsonb)
        `,
        [
          updatedRow.id,
          updatedRow.grammarId,
          req.userId,
          JSON.stringify(changedFields),
          JSON.stringify(beforeSnapshot),
          JSON.stringify(afterSnapshot),
        ],
      );

      await client.query("COMMIT");
      await refreshGrammarRowsForGrammarId(updatedRow.grammarId);

      res.json({
        success: true,
        row: updatedRow,
      });
    } catch (err) {
      if (transactionStarted) {
        await client.query("ROLLBACK");
      }
      console.error("Failed to audit example row:", err);
      res.status(400).json({
        error: err instanceof Error ? err.message : "Failed to audit example row",
      });
    } finally {
      client.release();
    }
  },
);

app.post(
  "/review/grammar/:grammarId/seed-wave",
  authMiddleware,
  reviewContentMiddleware,
  async (req, res) => {
    const client = await pool.connect();
    let transactionStarted = false;

    try {
      const { grammarId } = req.params;

      if (!isValidGrammarId(grammarId)) {
        return res.status(400).json({ error: "Invalid grammar id" });
      }

      const stage =
        typeof req.body?.stage === "string" ? req.body.stage.trim() : "";
      if (!["B1.1", "B1.2"].includes(stage)) {
        return res.status(400).json({
          error: "Seed-from-audit is only available for B1.1 and B1.2 lessons",
        });
      }

      const productionBefore =
        (await fetchLessonProductionSummaryMap([grammarId])).get(grammarId) ?? null;

      if (
        productionBefore &&
        (productionBefore.stagedRowCount > 0 || productionBefore.currentRewriteWaveId)
      ) {
        return res.status(400).json({
          error: "This lesson already has a staged rewrite wave. Publish or clear it first.",
        });
      }

      const publishedResult = await client.query(
        `
        SELECT
          id,
          grammar_id,
          thai,
          romanization,
          english,
          breakdown,
          difficulty,
          sort_order,
          tone_confidence,
          tone_status,
          tone_analysis,
          review_status,
          review_assignee_user_id,
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
        FROM ${GRAMMAR_EXAMPLES_TABLE}
        WHERE grammar_id = $1
          AND publish_state = 'published'
        ORDER BY sort_order ASC, id ASC
        `,
        [grammarId],
      );

      if (publishedResult.rows.length === 0) {
        return res.status(400).json({
          error: "No live published rows are available to seed from.",
        });
      }

      const publishedRows = publishedResult.rows.map((row, index) =>
        serializeGrammarExampleRow(row, Number(row.sort_order ?? index)),
      );
      const carryRows = publishedRows.filter(
        (row) => row.nextWaveDecision === "carry",
      );
      const reviseRows = publishedRows.filter(
        (row) => row.nextWaveDecision === "revise",
      );
      const reusableRows = [...carryRows, ...reviseRows].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );

      if (reusableRows.length < 15) {
        return res.status(400).json({
          error:
            "Fewer than 15 live rows survived audit. Convert this lesson to a full rewrite instead of salvage.",
        });
      }

      const waveId = createRewriteWaveId(grammarId);

      await client.query("BEGIN");
      transactionStarted = true;

      await ensureLessonProductionRecord(grammarId, stage, client);
      await client.query(
        `
        UPDATE ${GRAMMAR_LESSON_PRODUCTION_TABLE}
        SET
          current_rewrite_wave_id = $2,
          last_generated_at = NOW(),
          updated_at = NOW()
        WHERE grammar_id = $1
        `,
        [grammarId, waveId],
      );

      const seededRows = [];
      for (const [index, sourceRow] of reusableRows.entries()) {
        const shouldCarry = sourceRow.nextWaveDecision === "carry";
        const seededReviewStatus = shouldCarry ? "approved" : "needs_changes";
        const seededApprovedByUserId = shouldCarry
          ? sourceRow.approvedByUserId ?? req.userId
          : null;
        const seededReviewNote = shouldCarry
          ? sourceRow.reviewNote ?? null
          : `Seeded from live row #${sourceRow.id} for revision.`;

        const insertResult = await client.query(
          `
          INSERT INTO ${GRAMMAR_EXAMPLES_TABLE} (
            grammar_id,
            thai,
            romanization,
            english,
            breakdown,
            difficulty,
            sort_order,
            tone_confidence,
            tone_status,
            tone_analysis,
            review_status,
            review_assignee_user_id,
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
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5::jsonb,
            $6,
            $7,
            $8,
            $9,
            $10::jsonb,
            $11,
            $12::bigint,
            $13,
            'staged',
            $14,
            $15::bigint,
            $16::jsonb,
            NULL,
            NULL,
            NULL,
            NULL,
            $17::bigint,
            NOW(),
            $18::bigint,
            CASE WHEN $18::bigint IS NOT NULL THEN NOW() ELSE NULL END
          )
          RETURNING
            id,
            grammar_id,
            thai,
            romanization,
            english,
            breakdown,
            difficulty,
            sort_order,
            tone_confidence,
            tone_status,
            tone_analysis,
            review_status,
            review_assignee_user_id,
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
          `,
          [
            grammarId,
            sourceRow.thai,
            sourceRow.romanization,
            sourceRow.english,
            JSON.stringify(sourceRow.breakdown),
            sourceRow.difficulty,
            index,
            sourceRow.toneConfidence,
            sourceRow.toneStatus,
            JSON.stringify(sourceRow.toneAnalysis ?? {}),
            seededReviewStatus,
            sourceRow.reviewAssigneeUserId,
            seededReviewNote,
            waveId,
            sourceRow.id,
            JSON.stringify(sourceRow.qualityFlags ?? []),
            req.userId,
            seededApprovedByUserId,
          ],
        );

        const seededRow = serializeGrammarExampleRow(
          insertResult.rows[0],
          Number(insertResult.rows[0]?.sort_order ?? index),
        );
        seededRows.push(seededRow);

        const afterSnapshot = buildExampleRevisionSnapshot(seededRow);
        const changedFields = diffExampleRevisionSnapshots(null, afterSnapshot);
        await client.query(
          `
          INSERT INTO ${GRAMMAR_EXAMPLE_REVISIONS_TABLE} (
            example_id,
            grammar_id,
            action,
            edited_by_user_id,
            changed_fields,
            before_snapshot,
            after_snapshot
          )
          VALUES ($1, $2, 'seeded_from_live', $3::bigint, $4::jsonb, $5::jsonb, $6::jsonb)
          `,
          [
            seededRow.id,
            grammarId,
            req.userId,
            JSON.stringify(changedFields),
            JSON.stringify(null),
            JSON.stringify(afterSnapshot),
          ],
        );
      }

      await client.query("COMMIT");
      await refreshGrammarRowsForGrammarId(grammarId);
      const refreshedProduction =
        (await fetchLessonProductionSummaryMap([grammarId])).get(grammarId) ?? null;

      res.json({
        success: true,
        grammarId,
        waveId,
        carryCount: carryRows.length,
        reviseCount: reviseRows.length,
        seededCount: seededRows.length,
        production: refreshedProduction,
      });
    } catch (err) {
      if (transactionStarted) {
        await client.query("ROLLBACK");
      }
      console.error("Failed to seed rewrite wave from audit:", err);
      res.status(400).json({
        error:
          err instanceof Error
            ? err.message
            : "Failed to seed rewrite wave from audit",
      });
    } finally {
      client.release();
    }
  },
);

app.post(
  "/review/grammar/:grammarId/examples",
  authMiddleware,
  reviewContentMiddleware,
  async (req, res) => {
    const client = await pool.connect();
    let transactionStarted = false;
    try {
      const { grammarId } = req.params;

      if (!isValidGrammarId(grammarId)) {
        return res.status(400).json({ error: "Invalid grammar id" });
      }

      const normalizedRow = normalizeGrammarRow(
        {
          thai: req.body?.thai,
          romanization: req.body?.romanization,
          english: req.body?.english,
          breakdown: req.body?.breakdown,
          difficulty: req.body?.difficulty,
        },
        0,
        { trustProvidedTones: true },
      );

      const reviewAssigneeUserId = await ensureReviewAssigneeExists(
        normalizeOptionalAssigneeId(req.body?.reviewAssigneeUserId),
      );
      const reviewStatus = normalizeReviewStatus(
        req.body?.reviewStatus,
        deriveInitialReviewStatus(normalizedRow),
      );
      const approvedByUserId = reviewStatus === "approved" ? req.userId : null;
      const publishState = normalizePublishState(req.body?.publishState, "staged");
      const rewriteWaveId = normalizeOptionalRewriteWaveId(req.body?.rewriteWaveId);
      const qualityFlags = normalizeQualityFlags(req.body?.qualityFlags);
      const sortOrder =
        Number.isInteger(req.body?.sortOrder) && req.body.sortOrder >= 0
          ? req.body.sortOrder
          : null;

      const sortResult = await client.query(
        `
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order
        FROM ${GRAMMAR_EXAMPLES_TABLE}
        WHERE grammar_id = $1
        `,
        [grammarId],
      );

      await client.query("BEGIN");
      transactionStarted = true;

      const result = await client.query(
        `
        INSERT INTO ${GRAMMAR_EXAMPLES_TABLE} (
          grammar_id,
          thai,
          romanization,
          english,
          breakdown,
          difficulty,
          sort_order,
          tone_confidence,
          tone_status,
          tone_analysis,
          review_status,
          review_assignee_user_id,
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
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5::jsonb,
          $6,
          $7,
          $8,
          $9,
          $10::jsonb,
          $11,
          $12::bigint,
          $13,
          $14,
          $15,
          $16::bigint,
          $17::jsonb,
          $18,
          $19,
          $20::bigint,
          $21,
          NOW(),
          $23::bigint,
          CASE WHEN $23::bigint IS NOT NULL THEN NOW() ELSE NULL END
        )
        RETURNING
          id,
          grammar_id,
          thai,
          romanization,
          english,
          breakdown,
          difficulty,
          sort_order,
          tone_confidence,
          tone_status,
          tone_analysis,
          review_status,
          review_assignee_user_id,
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
        `,
        [
          grammarId,
          normalizedRow.thai,
          normalizedRow.romanization,
          normalizedRow.english,
          JSON.stringify(normalizedRow.breakdown),
          normalizedRow.difficulty,
          sortOrder ?? Number(sortResult.rows[0]?.next_sort_order ?? 0),
          normalizedRow.toneConfidence,
          normalizedRow.toneStatus,
          JSON.stringify(normalizedRow.toneAnalysis),
          reviewStatus,
          reviewAssigneeUserId,
          normalizeOptionalReviewNote(req.body?.reviewNote),
          publishState,
          rewriteWaveId,
          null,
          JSON.stringify(qualityFlags),
          null,
          null,
          null,
          null,
          req.userId,
          approvedByUserId,
        ],
      );

      const createdRow = serializeGrammarExampleRow(
        result.rows[0],
        Number(result.rows[0]?.sort_order ?? 0),
      );
      const afterSnapshot = buildExampleRevisionSnapshot(createdRow);
      const changedFields = diffExampleRevisionSnapshots(null, afterSnapshot);

      await client.query(
        `
        INSERT INTO ${GRAMMAR_EXAMPLE_REVISIONS_TABLE} (
          example_id,
          grammar_id,
          action,
          edited_by_user_id,
          changed_fields,
          before_snapshot,
          after_snapshot
        )
        VALUES ($1, $2, 'created', $3::bigint, $4::jsonb, $5::jsonb, $6::jsonb)
        `,
        [
          createdRow.id,
          grammarId,
          req.userId,
          JSON.stringify(changedFields),
          JSON.stringify(null),
          JSON.stringify(afterSnapshot),
        ],
      );

      await client.query("COMMIT");
      await refreshGrammarRowsForGrammarId(grammarId);

      res.status(201).json({
        success: true,
        row: createdRow,
      });
    } catch (err) {
      if (transactionStarted) {
        await client.query("ROLLBACK");
      }
      const message =
        err instanceof Error ? err.message : "Failed to create example row";
      console.error("Failed to create review example row:", err);
      res.status(400).json({ error: message });
    } finally {
      client.release();
    }
  },
);

app.patch(
  "/review/examples/:exampleId",
  authMiddleware,
  reviewContentMiddleware,
  async (req, res) => {
    const client = await pool.connect();
    let transactionStarted = false;
    try {
      const exampleId = Number.parseInt(req.params.exampleId, 10);
      if (!Number.isInteger(exampleId) || exampleId <= 0) {
        return res.status(400).json({ error: "Invalid example id" });
      }

      const existingResult = await client.query(
        `
        SELECT
          id,
          grammar_id,
          thai,
          romanization,
          english,
          breakdown,
          difficulty,
          sort_order,
          tone_confidence,
          tone_status,
          tone_analysis,
          review_status,
          review_assignee_user_id,
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
        FROM ${GRAMMAR_EXAMPLES_TABLE}
        WHERE id = $1
        LIMIT 1
        `,
        [exampleId],
      );

      if (existingResult.rows.length === 0) {
        return res.status(404).json({ error: "Example row not found" });
      }

      const existing = existingResult.rows[0];
      const beforeRow = serializeGrammarExampleRow(
        existing,
        Number(existing.sort_order ?? 0),
      );
      const beforeSnapshot = buildExampleRevisionSnapshot(beforeRow);
      const normalizedRow = normalizeGrammarRow(
        {
          thai: req.body?.thai,
          romanization: req.body?.romanization,
          english: req.body?.english,
          breakdown: req.body?.breakdown,
          difficulty: req.body?.difficulty,
        },
        0,
        { trustProvidedTones: true },
      );
      const reviewAssigneeUserId = await ensureReviewAssigneeExists(
        normalizeOptionalAssigneeId(req.body?.reviewAssigneeUserId),
      );
      const reviewStatus = normalizeReviewStatus(
        req.body?.reviewStatus,
        deriveInitialReviewStatus(normalizedRow),
      );
      const approvedByUserId = reviewStatus === "approved" ? req.userId : null;
      const publishState = normalizePublishState(
        req.body?.publishState,
        existing.publish_state,
      );
      const rewriteWaveId = normalizeOptionalRewriteWaveId(
        req.body?.rewriteWaveId ?? existing.rewrite_wave_id,
      );
      const sourceExampleId = normalizeOptionalAssigneeId(
        req.body?.sourceExampleId ?? existing.source_example_id,
      );
      const qualityFlags = normalizeQualityFlags(
        req.body?.qualityFlags ?? existing.quality_flags,
      );
      const nextWaveDecision = normalizeOptionalNextWaveDecision(
        req.body?.nextWaveDecision ?? existing.next_wave_decision,
      );
      const nextWaveAuditNote = normalizeOptionalAuditNote(
        req.body?.nextWaveAuditNote ?? existing.next_wave_audit_note,
      );
      const nextWaveAuditedByUserId = normalizeOptionalAssigneeId(
        req.body?.nextWaveAuditedByUserId ?? existing.next_wave_audited_by_user_id,
      );
      const nextWaveAuditedAt =
        typeof req.body?.nextWaveAuditedAt === "string"
          ? req.body.nextWaveAuditedAt
          : existing.next_wave_audited_at;
      const sortOrder =
        Number.isInteger(req.body?.sortOrder) && req.body.sortOrder >= 0
          ? req.body.sortOrder
          : Number(existing.sort_order ?? 0);

      await client.query("BEGIN");
      transactionStarted = true;

      const updateResult = await client.query(
        `
        UPDATE ${GRAMMAR_EXAMPLES_TABLE}
        SET
          thai = $2,
          romanization = $3,
          english = $4,
          breakdown = $5::jsonb,
          difficulty = $6,
          sort_order = $7,
          tone_confidence = $8,
          tone_status = $9,
          tone_analysis = $10::jsonb,
          review_status = $11,
          review_assignee_user_id = $12::bigint,
          review_note = $13,
          publish_state = $14,
          rewrite_wave_id = $15,
          source_example_id = $16::bigint,
          quality_flags = $17::jsonb,
          next_wave_decision = $18,
          next_wave_audit_note = $19,
          next_wave_audited_by_user_id = $20::bigint,
          next_wave_audited_at = $21,
          last_edited_by_user_id = $22::bigint,
          last_edited_at = NOW(),
          approved_by_user_id = $23::bigint,
          approved_at = CASE WHEN $23::bigint IS NOT NULL THEN NOW() ELSE NULL END
        WHERE id = $1
        RETURNING
          id,
          grammar_id,
          thai,
          romanization,
          english,
          breakdown,
          difficulty,
          sort_order,
          tone_confidence,
          tone_status,
          tone_analysis,
          review_status,
          review_assignee_user_id,
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
        `,
        [
          exampleId,
          normalizedRow.thai,
          normalizedRow.romanization,
          normalizedRow.english,
          JSON.stringify(normalizedRow.breakdown),
          normalizedRow.difficulty,
          sortOrder,
          normalizedRow.toneConfidence,
          normalizedRow.toneStatus,
          JSON.stringify(normalizedRow.toneAnalysis),
          reviewStatus,
          reviewAssigneeUserId,
          normalizeOptionalReviewNote(req.body?.reviewNote),
          publishState,
          rewriteWaveId,
          sourceExampleId,
          JSON.stringify(qualityFlags),
          nextWaveDecision,
          nextWaveAuditNote,
          nextWaveAuditedByUserId,
          nextWaveAuditedAt,
          req.userId,
          approvedByUserId,
        ],
      );

      const updatedRow = serializeGrammarExampleRow(
        updateResult.rows[0],
        Number(updateResult.rows[0]?.sort_order ?? sortOrder),
      );
      const afterSnapshot = buildExampleRevisionSnapshot(updatedRow);
      const changedFields = diffExampleRevisionSnapshots(
        beforeSnapshot,
        afterSnapshot,
      );

      await client.query(
        `
        INSERT INTO ${GRAMMAR_EXAMPLE_REVISIONS_TABLE} (
          example_id,
          grammar_id,
          action,
          edited_by_user_id,
          changed_fields,
          before_snapshot,
          after_snapshot
        )
        VALUES ($1, $2, 'updated', $3::bigint, $4::jsonb, $5::jsonb, $6::jsonb)
        `,
        [
          exampleId,
          existing.grammar_id,
          req.userId,
          JSON.stringify(changedFields),
          JSON.stringify(beforeSnapshot),
          JSON.stringify(afterSnapshot),
        ],
      );

      await client.query("COMMIT");
      await refreshGrammarRowsForGrammarId(existing.grammar_id);

      res.json({
        success: true,
        row: updatedRow,
      });
    } catch (err) {
      if (transactionStarted) {
        await client.query("ROLLBACK");
      }
      const message =
        err instanceof Error ? err.message : "Failed to update example row";
      console.error("Failed to update review example row:", err);
      res.status(400).json({ error: message });
    } finally {
      client.release();
    }
  },
);

app.delete(
  "/review/examples/:exampleId",
  authMiddleware,
  reviewContentMiddleware,
  async (req, res) => {
    try {
      const exampleId = Number.parseInt(req.params.exampleId, 10);
      if (!Number.isInteger(exampleId) || exampleId <= 0) {
        return res.status(400).json({ error: "Invalid example id" });
      }

      const existingResult = await pool.query(
        `
        SELECT grammar_id
        FROM ${GRAMMAR_EXAMPLES_TABLE}
        WHERE id = $1
        LIMIT 1
        `,
        [exampleId],
      );

      if (existingResult.rows.length === 0) {
        return res.status(404).json({ error: "Example row not found" });
      }

      const grammarId = existingResult.rows[0].grammar_id;
      await pool.query(
        `
        DELETE FROM ${GRAMMAR_EXAMPLES_TABLE}
        WHERE id = $1
        `,
        [exampleId],
      );

      const rows = await refreshGrammarRowsForGrammarId(grammarId);
      res.json({
        success: true,
        grammarId,
        rowCount: rows.length,
      });
    } catch (err) {
      console.error("Failed to delete review example row:", err);
      res.status(500).json({ error: "Failed to delete example row" });
    }
  },
);

app.post(
  "/review/examples/:exampleId/comments",
  authMiddleware,
  reviewContentMiddleware,
  async (req, res) => {
    try {
      const exampleId = Number.parseInt(req.params.exampleId, 10);
      if (!Number.isInteger(exampleId) || exampleId <= 0) {
        return res.status(400).json({ error: "Invalid example id" });
      }

      const existingResult = await pool.query(
        `
        SELECT id
        FROM ${GRAMMAR_EXAMPLES_TABLE}
        WHERE id = $1
        LIMIT 1
        `,
        [exampleId],
      );

      if (existingResult.rows.length === 0) {
        return res.status(404).json({ error: "Example row not found" });
      }

      const body = normalizeReviewCommentBody(req.body?.body, "Example comment");
      const result = await pool.query(
        `
        INSERT INTO ${GRAMMAR_EXAMPLE_COMMENTS_TABLE} (
          example_id,
          author_user_id,
          body
        )
        VALUES ($1, $2, $3)
        RETURNING id, example_id, author_user_id, body, created_at
        `,
        [exampleId, req.userId, body],
      );

      const created = result.rows[0];
      const authorResult = await pool.query(
        `
        SELECT id, email, display_name
        FROM users
        WHERE id = $1
        LIMIT 1
        `,
        [req.userId],
      );
      const author = authorResult.rows[0];

      res.status(201).json({
        id: Number(created.id),
        exampleId: Number(created.example_id),
        authorUserId: Number(created.author_user_id),
        body: created.body,
        createdAt: created.created_at,
        author: author
          ? {
              id: Number(author.id),
              email: author.email,
              display_name: author.display_name ?? null,
            }
          : null,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to add example comment";
      console.error("Failed to create example comment:", err);
      res.status(400).json({ error: message });
    }
  },
);

/* =============================== */
/* USER VOCABULARY */
/* =============================== */

app.post("/track-words", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { words } = req.body;
    const preferenceResult = await pool.query(
      `
      SELECT track_practice_vocab
      FROM user_preferences
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId],
    );
    const trackPracticeVocab =
      preferenceResult.rows.length > 0
        ? preferenceResult.rows[0].track_practice_vocab
        : true;

    if (!trackPracticeVocab) {
      return res.json({
        success: true,
        added: 0,
        limit: SRS_CONFIG.dailyNewWordLimit,
        trackPracticeVocab: false,
      });
    }

    const practiceNewBacklogLimit = 50;
    const newBacklogResult = await pool.query(
      `
      SELECT COUNT(*)
      FROM user_vocab
      WHERE user_id = $1
      AND COALESCE(state, 'new') = 'new'
      `,
      [userId],
    );

    const newBacklog = parseInt(newBacklogResult.rows[0].count, 10) || 0;

    if (newBacklog >= practiceNewBacklogLimit) {
      return res.json({
        success: true,
        added: 0,
        limit: SRS_CONFIG.dailyNewWordLimit,
        newBacklog,
        newBacklogLimit: practiceNewBacklogLimit,
        blockedByNewBacklog: true,
      });
    }

    const todayResult = await pool.query(
      `
      SELECT COUNT(*)
      FROM user_vocab
      WHERE user_id = $1
      AND DATE(first_seen) = CURRENT_DATE
      `,
      [userId],
    );

    const learnedToday = parseInt(todayResult.rows[0].count, 10) || 0;
    let added = 0;
    let backlogAdded = 0;

    for (const word of words) {
      if (learnedToday + added >= SRS_CONFIG.dailyNewWordLimit) {
        break;
      }

      if (newBacklog + backlogAdded >= practiceNewBacklogLimit) {
        break;
      }

      const result = await pool.query(
        `
        INSERT INTO user_vocab (user_id, thai, english, romanization, next_review)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (user_id, thai) DO UPDATE SET romanization = COALESCE(NULLIF($4, ''), user_vocab.romanization)
        RETURNING thai, (xmax = 0) AS inserted
        `,
        [userId, word.thai, word.english, word.romanization || ""],
      );

      if (result.rowCount > 0 && result.rows[0].inserted) {
        added++;
        backlogAdded++;
      }
    }

    res.json({
      success: true,
      added,
      limit: SRS_CONFIG.dailyNewWordLimit,
      newBacklog: newBacklog + backlogAdded,
      newBacklogLimit: practiceNewBacklogLimit,
      blockedByNewBacklog: false,    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to track words" });
  }
});

const THAI_CONS = "[\u0E01-\u0E2E]";
const TRAINER_VOWEL_PLACEHOLDER = "\u25CC";

/**
 * Convert a vowel symbol (with Ã¢â€”Å’ placeholder) into a regex
 * that matches the vowel wrapped around any Thai consonant(s).
 *
 * Examples:
 *   "Ã Â¹â‚¬Ã¢â€”Å’Ã Â¸ÂµÃ Â¸Â¢"  Ã¢â€ â€™ /Ã Â¹â‚¬[Ã Â¸Â-Ã Â¸Â®]+Ã Â¸ÂµÃ Â¸Â¢/    matches Ã Â¹â‚¬Ã Â¸ÂÃ Â¸ÂµÃ Â¸Â¢, Ã Â¹â‚¬Ã Â¸â€žÃ Â¸Â£Ã Â¸ÂµÃ Â¸Â¢
 *   "Ã¢â€”Å’Ã Â¸Â±Ã Â¸Â§"   Ã¢â€ â€™ /[Ã Â¸Â-Ã Â¸Â®]+Ã Â¸Â±Ã Â¸Â§/     matches Ã Â¸ÂÃ Â¸Â±Ã Â¸Â§, Ã Â¸â€¢Ã Â¸Â±Ã Â¸Â§
 *   "Ã Â¸Â²"     Ã¢â€ â€™ /Ã Â¸Â²/             simple presence check
 */
function vowelToRegex(symbol) {
  if (symbol.includes(TRAINER_VOWEL_PLACEHOLDER)) {
    const parts = symbol.split(TRAINER_VOWEL_PLACEHOLDER);
    const escaped = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return new RegExp(escaped.join(THAI_CONS + "+"));
  }

  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped);
}

function buildVowelPatterns(vowelSymbols) {
  return vowelSymbols.map((symbol) => ({
    symbol,
    regex: vowelToRegex(symbol),
  }));
}

/* =============================== */
/* CORE LENGTH (ignore diacritics) */
/* =============================== */

const THAI_DIACRITICS = new Set([
  "\u0E48", // Ã Â¹Ë† mai ek
  "\u0E49", // Ã Â¹â€° mai tho
  "\u0E4A", // Ã Â¹Å  mai tri
  "\u0E4B", // Ã Â¹â€¹ mai chattawa
  "\u0E4C", // Ã Â¹Å’ thanthakhat (silent)
  "\u0E4D", // Ã Â¹â€¡ nikhahit
  "\u0E47", // Ã Â¹â€¡ maitaikhu
]);

function coreLength(word) {
  let len = 0;
  for (const ch of word) {
    if (!THAI_DIACRITICS.has(ch)) len++;
  }
  return len;
}

/* =============================== */
/* ALPHABET TRAINER ROUTE          */
/* =============================== */

app.post("/alphabet-trainer", (req, res) => {
  const { consonants, vowels, difficulty } = req.body;

  if (
    !consonants ||
    !vowels ||
    consonants.length === 0 ||
    vowels.length === 0
  ) {
    return res.status(400).json({ error: "consonants and vowels required" });
  }

  const consonantSet = new Set(consonants);
  const vowelPatterns = buildVowelPatterns(vowels);

  /*
   * Difficulty criteria (syllables + core character length):
   *
   * EASY:   1 syllable, max 4 core chars  Ã¢â€ â€™ Ã Â¸ÂÃ Â¸Â², Ã Â¸â€Ã Â¸Âµ, Ã Â¸ÂÃ Â¸Â´Ã Â¸â„¢, Ã Â¸Å¡Ã Â¹â€°Ã Â¸Â²Ã Â¸â„¢, Ã Â¹â‚¬Ã Â¸ÂÃ Â¹Ë†Ã Â¸â€¡
   * MEDIUM: 1-2 syllables, max 6 chars     Ã¢â€ â€™ Ã Â¸Â­Ã Â¸Â£Ã Â¹Ë†Ã Â¸Â­Ã Â¸Â¢, Ã Â¸ÂªÃ Â¸Â§Ã Â¸Â±Ã Â¸ÂªÃ Â¸â€Ã Â¸Âµ, Ã Â¸Â¥Ã Â¸Â«Ã Â¸Â¸Ã Â¹â€šÃ Â¸â€”Ã Â¸Â©
   * HARD:   anything bigger                Ã¢â€ â€™ Ã Â¸â€ºÃ Â¸Â£Ã Â¸Â°Ã Â¸Å Ã Â¸Â²Ã Â¸ËœÃ Â¸Â´Ã Â¸â€ºÃ Â¹â€žÃ Â¸â€¢Ã Â¸Â¢, Ã Â¸ÂªÃ Â¸Â±Ã Â¸â„¢Ã Â¸â„¢Ã Â¸Â´Ã Â¸Â©Ã Â¸ÂÃ Â¸Â²Ã Â¸â„¢
   */
  function matchesDifficulty(word) {
    const syllables = countThaiSyllables(word);
    const chars = coreLength(word);

    switch (difficulty) {
      case "easy":
        return syllables <= 1 && chars <= 4;
      case "medium":
        return (
          (syllables === 2 && chars <= 6) ||
          (syllables === 1 && chars > 4 && chars <= 6)
        );
      case "hard":
        return syllables >= 3 || chars > 6;
      default:
        return true;
    }
  }

  // Filter dictionary
  const matches = dictionary.filter((entry) => {
    const word = entry.thai;

    // Check difficulty
    if (!matchesDifficulty(word)) return false;

    // Check word contains at least one selected consonant
    let hasConsonant = false;
    for (const char of word) {
      if (consonantSet.has(char)) {
        hasConsonant = true;
        break;
      }
    }
    if (!hasConsonant) return false;

    // Check word matches at least one selected vowel pattern
    let hasVowel = false;
    for (const pattern of vowelPatterns) {
      if (pattern.regex.test(word)) {
        hasVowel = true;
        break;
      }
    }
    if (!hasVowel) return false;

    return true;
  });

  // Shuffle and pick up to 10
  const shuffled = matches.sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, 10);

  const words = picked.map((entry) => ({
    thai: entry.thai,
    english: entry.english,
    romanization: "",
  }));

  res.json({ words });
});

/* =============================== */
/* VOCAB LIST */
/* =============================== */

app.get("/debug-user-vocab", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM user_vocab");

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to read vocab");
  }
});

app.get("/vocab/today", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const result = await pool.query(
      `
      SELECT thai, english
      FROM user_vocab
      WHERE user_id = $1
      AND first_seen >= CURRENT_DATE
      ORDER BY first_seen DESC
      LIMIT 20
      `,
      [userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to fetch today's vocab");
  }
});

/* =============================== */
/* START SERVER */
/* =============================== */

async function startServer() {
  try {
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'display_name'
        ) THEN
          ALTER TABLE users ADD COLUMN display_name TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'google_sub'
        ) THEN
          ALTER TABLE users ADD COLUMN google_sub TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'terms_accepted_at'
        ) THEN
          ALTER TABLE users ADD COLUMN terms_accepted_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'privacy_accepted_at'
        ) THEN
          ALTER TABLE users ADD COLUMN privacy_accepted_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'consent_source'
        ) THEN
          ALTER TABLE users ADD COLUMN consent_source TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'is_admin'
        ) THEN
          ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'has_keystone_access'
        ) THEN
          ALTER TABLE users ADD COLUMN has_keystone_access BOOLEAN NOT NULL DEFAULT FALSE;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'can_review_content'
        ) THEN
          ALTER TABLE users ADD COLUMN can_review_content BOOLEAN NOT NULL DEFAULT FALSE;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'keystone_access_updated_at'
        ) THEN
          ALTER TABLE users ADD COLUMN keystone_access_updated_at TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'paddle_customer_id'
        ) THEN
          ALTER TABLE users ADD COLUMN paddle_customer_id TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'paddle_subscription_id'
        ) THEN
          ALTER TABLE users ADD COLUMN paddle_subscription_id TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'paddle_subscription_status'
        ) THEN
          ALTER TABLE users ADD COLUMN paddle_subscription_status TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'paddle_price_id'
        ) THEN
          ALTER TABLE users ADD COLUMN paddle_price_id TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'paddle_keystone_access'
        ) THEN
          ALTER TABLE users ADD COLUMN paddle_keystone_access BOOLEAN NOT NULL DEFAULT FALSE;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'paddle_access_updated_at'
        ) THEN
          ALTER TABLE users ADD COLUMN paddle_access_updated_at TIMESTAMPTZ;
        END IF;
      END $$;
    `);
    await pool.query(`
      UPDATE users
      SET display_name = LEFT(split_part(email, '@', 1), 40)
      WHERE (display_name IS NULL OR BTRIM(display_name) = '')
        AND email IS NOT NULL
        AND POSITION('@' IN email) > 1;
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub_unique
        ON users (google_sub)
        WHERE google_sub IS NOT NULL;
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_paddle_customer_id_unique
        ON users (paddle_customer_id)
        WHERE paddle_customer_id IS NOT NULL;
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_paddle_subscription_id_unique
        ON users (paddle_subscription_id)
        WHERE paddle_subscription_id IS NOT NULL;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        track_practice_vocab BOOLEAN NOT NULL DEFAULT TRUE
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS grammar_progress (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        grammar_id TEXT NOT NULL,
        rounds INTEGER NOT NULL DEFAULT 0,
        correct INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL DEFAULT 0,
        last_practiced TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, grammar_id)
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_grammar_progress_user_last_practiced
        ON grammar_progress (user_id, last_practiced DESC);
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sentence_explanation_cache (
        cache_key TEXT PRIMARY KEY,
        cache_version TEXT NOT NULL,
        grammar_id TEXT,
        sentence_thai TEXT NOT NULL,
        model TEXT NOT NULL,
        explanation TEXT NOT NULL,
        hit_count INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sentence_explanation_cache_last_used
        ON sentence_explanation_cache (last_used_at DESC);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sentence_explanation_cache_grammar
        ON sentence_explanation_cache (grammar_id, last_used_at DESC);
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${GRAMMAR_EXAMPLES_TABLE} (
        id BIGSERIAL PRIMARY KEY,
        grammar_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        thai TEXT NOT NULL,
        romanization TEXT NOT NULL,
        english TEXT NOT NULL,
        breakdown JSONB NOT NULL,
        difficulty TEXT NOT NULL,
        tone_confidence INTEGER NOT NULL DEFAULT 0,
        tone_status TEXT NOT NULL DEFAULT 'review',
        tone_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (grammar_id, sort_order)
      );
    `);
    await pool.query(`
      ALTER TABLE ${GRAMMAR_EXAMPLES_TABLE}
      ADD COLUMN IF NOT EXISTS tone_confidence INTEGER NOT NULL DEFAULT 0
    `);
    await pool.query(`
      ALTER TABLE ${GRAMMAR_EXAMPLES_TABLE}
      ADD COLUMN IF NOT EXISTS tone_status TEXT NOT NULL DEFAULT 'review'
    `);
    await pool.query(`
      ALTER TABLE ${GRAMMAR_EXAMPLES_TABLE}
      ADD COLUMN IF NOT EXISTS tone_analysis JSONB NOT NULL DEFAULT '{}'::jsonb
    `);
    await pool.query(`
      ALTER TABLE ${GRAMMAR_EXAMPLES_TABLE}
      ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'flagged'
    `);
    await pool.query(`
      ALTER TABLE ${GRAMMAR_EXAMPLES_TABLE}
      ADD COLUMN IF NOT EXISTS review_assignee_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
    `);
    await pool.query(`
      ALTER TABLE ${GRAMMAR_EXAMPLES_TABLE}
      ADD COLUMN IF NOT EXISTS review_note TEXT
    `);
    await pool.query(`
      ALTER TABLE ${GRAMMAR_EXAMPLES_TABLE}
      ADD COLUMN IF NOT EXISTS last_edited_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
    `);
    await pool.query(`
      ALTER TABLE ${GRAMMAR_EXAMPLES_TABLE}
      ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ
    `);
    await pool.query(`
      ALTER TABLE ${GRAMMAR_EXAMPLES_TABLE}
      ADD COLUMN IF NOT EXISTS approved_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
    `);
    await pool.query(`
      ALTER TABLE ${GRAMMAR_EXAMPLES_TABLE}
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ
    `);
    await pool.query(`
      ALTER TABLE ${GRAMMAR_EXAMPLES_TABLE}
      ADD COLUMN IF NOT EXISTS publish_state TEXT NOT NULL DEFAULT 'published'
    `);
    await pool.query(`
      ALTER TABLE ${GRAMMAR_EXAMPLES_TABLE}
      ADD COLUMN IF NOT EXISTS rewrite_wave_id TEXT
    `);
    await pool.query(`
      ALTER TABLE ${GRAMMAR_EXAMPLES_TABLE}
      ADD COLUMN IF NOT EXISTS source_example_id BIGINT REFERENCES ${GRAMMAR_EXAMPLES_TABLE}(id) ON DELETE SET NULL
    `);
    await pool.query(`
      ALTER TABLE ${GRAMMAR_EXAMPLES_TABLE}
      ADD COLUMN IF NOT EXISTS quality_flags JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
    await pool.query(`
      ALTER TABLE ${GRAMMAR_EXAMPLES_TABLE}
      ADD COLUMN IF NOT EXISTS next_wave_decision TEXT
    `);
    await pool.query(`
      ALTER TABLE ${GRAMMAR_EXAMPLES_TABLE}
      ADD COLUMN IF NOT EXISTS next_wave_audit_note TEXT
    `);
    await pool.query(`
      ALTER TABLE ${GRAMMAR_EXAMPLES_TABLE}
      ADD COLUMN IF NOT EXISTS next_wave_audited_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
    `);
    await pool.query(`
      ALTER TABLE ${GRAMMAR_EXAMPLES_TABLE}
      ADD COLUMN IF NOT EXISTS next_wave_audited_at TIMESTAMPTZ
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_grammar_examples_grammar_sort
        ON ${GRAMMAR_EXAMPLES_TABLE} (grammar_id, sort_order);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_grammar_examples_publish
        ON ${GRAMMAR_EXAMPLES_TABLE} (grammar_id, publish_state, sort_order);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_grammar_examples_rewrite_wave
        ON ${GRAMMAR_EXAMPLES_TABLE} (grammar_id, rewrite_wave_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_grammar_examples_source
        ON ${GRAMMAR_EXAMPLES_TABLE} (source_example_id);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_grammar_examples_next_wave_decision
        ON ${GRAMMAR_EXAMPLES_TABLE} (grammar_id, publish_state, next_wave_decision);
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${GRAMMAR_LESSON_OVERRIDES_TABLE} (
        grammar_id TEXT PRIMARY KEY,
        stage TEXT NOT NULL,
        lesson_order INTEGER,
        content JSONB NOT NULL,
        review_status TEXT NOT NULL DEFAULT 'flagged',
        review_assignee_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        review_note TEXT,
        last_edited_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        last_edited_at TIMESTAMPTZ,
        approved_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        approved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      ALTER TABLE ${GRAMMAR_LESSON_OVERRIDES_TABLE}
      ADD COLUMN IF NOT EXISTS lesson_order INTEGER
    `);
    await pool.query(`
      UPDATE ${GRAMMAR_LESSON_OVERRIDES_TABLE}
      SET lesson_order = (content->>'lessonOrder')::integer
      WHERE lesson_order IS NULL
        AND content ? 'lessonOrder'
        AND (content->>'lessonOrder') ~ '^[0-9]+$'
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_grammar_lesson_overrides_status
        ON ${GRAMMAR_LESSON_OVERRIDES_TABLE} (review_status, stage);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_grammar_lesson_overrides_stage_order
        ON ${GRAMMAR_LESSON_OVERRIDES_TABLE} (stage, lesson_order, grammar_id);
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${GRAMMAR_LESSON_COMMENTS_TABLE} (
        id BIGSERIAL PRIMARY KEY,
        grammar_id TEXT NOT NULL REFERENCES ${GRAMMAR_LESSON_OVERRIDES_TABLE}(grammar_id) ON DELETE CASCADE,
        author_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_grammar_lesson_comments_grammar
        ON ${GRAMMAR_LESSON_COMMENTS_TABLE} (grammar_id, created_at);
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${GRAMMAR_EXAMPLE_COMMENTS_TABLE} (
        id BIGSERIAL PRIMARY KEY,
        example_id BIGINT NOT NULL REFERENCES ${GRAMMAR_EXAMPLES_TABLE}(id) ON DELETE CASCADE,
        author_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_grammar_example_comments_example
        ON ${GRAMMAR_EXAMPLE_COMMENTS_TABLE} (example_id, created_at);
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${GRAMMAR_EXAMPLE_REVISIONS_TABLE} (
        id BIGSERIAL PRIMARY KEY,
        example_id BIGINT NOT NULL REFERENCES ${GRAMMAR_EXAMPLES_TABLE}(id) ON DELETE CASCADE,
        grammar_id TEXT NOT NULL,
        action TEXT NOT NULL,
        edited_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
        changed_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
        before_snapshot JSONB,
        after_snapshot JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_grammar_example_revisions_example
        ON ${GRAMMAR_EXAMPLE_REVISIONS_TABLE} (example_id, created_at DESC);
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${GRAMMAR_LESSON_PRODUCTION_TABLE} (
        grammar_id TEXT PRIMARY KEY,
        stage TEXT NOT NULL,
        final_target_count INTEGER NOT NULL DEFAULT ${DEFAULT_FINAL_APPROVED_TARGET},
        first_pass_candidate_target INTEGER NOT NULL DEFAULT ${DEFAULT_FIRST_PASS_CANDIDATE_TARGET},
        supplemental_candidate_batch_size INTEGER NOT NULL DEFAULT ${DEFAULT_SUPPLEMENTAL_BATCH_SIZE},
        current_rewrite_wave_id TEXT,
        notes TEXT,
        last_generated_at TIMESTAMPTZ,
        last_published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      UPDATE ${GRAMMAR_EXAMPLES_TABLE}
      SET review_status = 'approved'
      WHERE review_status = 'flagged'
        AND last_edited_at IS NULL
        AND approved_at IS NULL
        AND tone_status = 'approved'
        AND tone_confidence >= ${APPROVED_TONE_CONFIDENCE}
    `);
    await pool.query(`
      UPDATE ${GRAMMAR_EXAMPLES_TABLE}
      SET publish_state = 'published'
      WHERE publish_state IS NULL OR publish_state = ''
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
        ON password_reset_tokens (user_id, created_at DESC);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expiry
        ON password_reset_tokens (expires_at);
    `);
    // Run SRS v3 migration: add state and step_index columns
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'user_vocab' AND column_name = 'state'
        ) THEN
          ALTER TABLE user_vocab ADD COLUMN state TEXT DEFAULT 'new';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'user_vocab' AND column_name = 'step_index'
        ) THEN
          ALTER TABLE user_vocab ADD COLUMN step_index INTEGER DEFAULT 0;
        END IF;
      END $$;
    `);
    // Backfill existing cards: cards with mastery >= 2 are already graduated
    await pool.query(`
      UPDATE user_vocab SET state = 'review', step_index = 0
      WHERE state IS NULL AND mastery >= 2
    `);
    await pool.query(`
      UPDATE user_vocab SET state = 'new', step_index = 0
      WHERE state IS NULL
    `);
    // Create indexes for SRS query performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_vocab_state_review
        ON user_vocab (user_id, state, next_review);
      CREATE INDEX IF NOT EXISTS idx_user_vocab_next_review
        ON user_vocab (user_id, next_review);
    `);
    // Create activity_log table for heatmap (grammar + other non-vocab activity)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        user_id INTEGER NOT NULL,
        activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
        source TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, activity_date, source)
      );
    `);
    console.log("SRS v3 migration complete");
    ensureAdminDataFiles();
    await syncConfiguredAdminEmails();
    await migrateGrammarOverridesFileToDatabase();
    await backfillGrammarLessonOrderFromSeed();

    await loadDictionary();
    await loadGrammarSentencesIntoMemory();

    const wordMap = buildWordRomanizationMap();
    await backfillRomanization(wordMap);

    app.listen(PORT, () => {
      console.log(`AI server running on port ${PORT}`);
      printStartupSummary();
    });
  } catch (err) {
    console.error("Server startup failed:", err);
  }
}

app.post("/practice-csv", async (req, res) => {
  try {
    const { grammar, preview } = req.body;

    const getPublishedApprovedRows = (rows) =>
      (Array.isArray(rows) ? rows : []).filter(
        (row) =>
          row?.publishState === "published" &&
          row?.reviewStatus === "approved",
      );

    // Exercises should prefer the current published non-legacy lesson rows from
    // Postgres so newly QA'd/published content wins over any stale boot-time
    // cache. Only fall back to the in-memory cache when a lesson has no current
    // non-legacy published rows yet.
    let matches = [];

    if (typeof grammar === "string" && grammar.trim()) {
      const currentRows = await fetchGrammarRowsForGrammarId(grammar.trim(), {
        includeLegacy: false,
      });
      matches = getPublishedApprovedRows(currentRows);
    }

    if (matches.length === 0) {
      matches = getPublishedApprovedRows(grammarSentences[grammar]);
    }

    // Direct DB publish flows can leave the in-memory lesson cache stale until
    // the next explicit refresh. Rehydrate this lesson on demand before we
    // report that no practice rows exist.
    if (matches.length === 0 && typeof grammar === "string" && grammar.trim()) {
      const refreshedRows = await refreshGrammarRowsForGrammarId(grammar.trim());
      matches = getPublishedApprovedRows(refreshedRows);
    }

    if (matches.length === 0) {
      return res.status(404).json({
        error: "No review-approved sentences found",
        needsToneReview: true,
      });
    }

    if (preview) {
      return res.json(matches[0]);
    }

    const random = matches[Math.floor(Math.random() * matches.length)];

    res.json(random);
  } catch (err) {
    console.error("Failed to load practice CSV row:", err);
    res.status(500).json({ error: "Failed to load practice sentences" });
  }
});

app.post("/tts/sentence", sentenceTtsRateLimiter, async (req, res) => {
  try {
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    const speakingRate = req.body?.speakingRate;
    const languageCode =
      typeof req.body?.languageCode === "string" ? req.body.languageCode : "";

    const result = await synthesizeSentenceAudio(text, speakingRate, languageCode);

    res.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate sentence audio";
    const status =
      message.includes("required") || message.includes("limited") ? 400 : 503;

    console.error("Sentence TTS failed:", err);
    res.status(status).json({ error: message });
  }
});

app.get("/grammar/overrides", async (_req, res) => {
  try {
    res.json(await fetchPublishedGrammarOverridesMap());
  } catch (err) {
    console.error("Failed to fetch grammar overrides:", err);
    res.status(500).json({ error: "Failed to fetch grammar overrides" });
  }
});

app.get("/grammar/catalog", async (_req, res) => {
  try {
    res.json({
      lessons: await fetchPublishedGrammarCatalogEntries(),
    });
  } catch (err) {
    console.error("Failed to fetch grammar catalog:", err);
    res.status(500).json({ error: "Failed to fetch grammar catalog" });
  }
});

app.get("/grammar/catalog/:grammarId", async (req, res) => {
  try {
    const { grammarId } = req.params;

    if (!isValidGrammarId(grammarId)) {
      return res.status(400).json({ error: "Invalid grammar id" });
    }

    const lesson = await fetchPublishedGrammarCatalogEntry(grammarId);

    if (!lesson) {
      return res.status(404).json({ error: "Grammar point not found" });
    }

    res.json({ lesson });
  } catch (err) {
    console.error("Failed to fetch grammar catalog lesson:", err);
    res.status(500).json({ error: "Failed to fetch grammar catalog lesson" });
  }
});

/* =============================== */
/* SIGNUP */
/* =============================== */

app.post("/signup", authRateLimiter, async (req, res) => {
  try {
    const { password } = req.body;
    const email = req.body.email?.toLowerCase().trim();
    const acceptedTerms = req.body.acceptedTerms === true;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    if (!acceptedTerms) {
      return res.status(400).json({
        error: "You must agree to the Terms and Conditions and Privacy Policy",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        error:
          "Password must be at least 8 characters and include uppercase, lowercase, and a number",
      });
    }

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const isAdmin = isConfiguredAdminEmail(email);
    const displayName = getDefaultDisplayName(email);

    const result = await pool.query(
      `
      INSERT INTO users (
        email,
        password_hash,
        display_name,
        is_admin,
        terms_accepted_at,
        privacy_accepted_at,
        consent_source
      )
      VALUES ($1, $2, $3, $4, NOW(), NOW(), 'email_signup')
      RETURNING id
      `,
      [email, passwordHash, displayName, isAdmin],
    );

    const token = createSessionToken({ id: result.rows[0].id, email });

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Signup failed" });
  }
});

/* =============================== */
/* LOGIN */
/* =============================== */

app.post("/login", authRateLimiter, async (req, res) => {
  try {
    const { password } = req.body;
    const email = req.body.email?.toLowerCase().trim();

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = createSessionToken(user);

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/password/forgot", authRateLimiter, async (req, res) => {
  try {
    const email = req.body.email?.toLowerCase().trim();

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }

    const result = await pool.query(
      `
      SELECT id, email
      FROM users
      WHERE email = $1
      LIMIT 1
      `,
      [email],
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        message: "If an account exists for that email, we sent a reset link.",
      });
    }

    if (!isEmailTransportConfigured()) {
      return res.status(500).json({
        error: "Password reset email is not configured on the server",
      });
    }

    const user = result.rows[0];
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashPasswordResetToken(rawToken);

    await pool.query(
      `
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE user_id = $1
        AND used_at IS NULL
      `,
      [user.id],
    );

    await pool.query(
      `
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 minute'))
      `,
      [user.id, tokenHash, PASSWORD_RESET_EXPIRY_MINUTES],
    );

    const resetUrl = buildPasswordResetUrl(req, rawToken);

    try {
      await sendPasswordResetEmail({
        email: user.email,
        resetUrl,
      });
    } catch (err) {
      await pool.query(
        `
        DELETE FROM password_reset_tokens
        WHERE token_hash = $1
        `,
        [tokenHash],
      );
      throw err;
    }

    res.json({
      success: true,
      message: "If an account exists for that email, we sent a reset link.",
    });
  } catch (err) {
    console.error("Password reset request failed:", err);
    res.status(500).json({ error: "Failed to send password reset email" });
  }
});

app.post("/password/reset/validate", authRateLimiter, async (req, res) => {
  try {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";

    if (!token) {
      return res.status(400).json({ error: "Reset token is required" });
    }

    const result = await pool.query(
      `
      SELECT id
      FROM password_reset_tokens
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
      `,
      [hashPasswordResetToken(token)],
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "This reset link is invalid or has expired." });
    }

    res.json({ valid: true });
  } catch (err) {
    console.error("Password reset token validation failed:", err);
    res.status(500).json({ error: "Failed to validate reset link" });
  }
});

app.post("/password/reset", authRateLimiter, async (req, res) => {
  const client = await pool.connect();

  try {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!token) {
      return res.status(400).json({ error: "Reset token is required" });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        error:
          "Password must be at least 8 characters and include uppercase, lowercase, and a number",
      });
    }

    await client.query("BEGIN");

    const tokenResult = await client.query(
      `
      SELECT id, user_id
      FROM password_reset_tokens
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
      FOR UPDATE
      `,
      [hashPasswordResetToken(token)],
    );

    if (tokenResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "This reset link is invalid or has expired." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const resetRow = tokenResult.rows[0];

    await client.query(
      `
      UPDATE users
      SET password_hash = $2
      WHERE id = $1
      `,
      [resetRow.user_id, passwordHash],
    );

    await client.query(
      `
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE user_id = $1
        AND used_at IS NULL
      `,
      [resetRow.user_id],
    );

    await client.query("COMMIT");

    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Password reset failed:", err);
    res.status(500).json({ error: "Failed to reset password" });
  } finally {
    client.release();
  }
});

app.get("/reset-password", (_req, res) => {
  res.type("html").send(renderPasswordResetPage());
});

app.post("/auth/google", authRateLimiter, async (req, res) => {
  const idToken = typeof req.body?.idToken === "string" ? req.body.idToken : "";
  const acceptedTerms = req.body?.acceptedTerms === true;

  if (!idToken) {
    return res.status(400).json({ error: "Google ID token required" });
  }

  let googleUser;

  try {
    googleUser = await verifyGoogleIdToken(idToken);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Google sign-in failed";
    const status = message.includes("configured") ? 500 : 401;
    return res.status(status).json({ error: message });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const isAdmin = isConfiguredAdminEmail(googleUser.email);
    const resolvedDisplayName = resolveDisplayName(
      googleUser.displayName,
      googleUser.email,
    );

    let userResult = await client.query(
      `
      SELECT id, email, display_name, google_sub
      FROM users
      WHERE google_sub = $1
      LIMIT 1
      `,
      [googleUser.sub],
    );

    let user = userResult.rows[0] ?? null;

    if (!user) {
      userResult = await client.query(
        `
        SELECT id, email, display_name, google_sub
        FROM users
        WHERE email = $1
        LIMIT 1
        `,
        [googleUser.email],
      );

      user = userResult.rows[0] ?? null;

      if (user) {
        if (user.google_sub && user.google_sub !== googleUser.sub) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            error: "This email is already linked to a different Google account",
          });
        }

        const linkedResult = await client.query(
          `
          UPDATE users
          SET google_sub = $2,
              display_name = COALESCE(display_name, $3),
              is_admin = CASE WHEN $4 THEN TRUE ELSE is_admin END
          WHERE id = $1
          RETURNING id, email, display_name, google_sub, is_admin
          `,
          [user.id, googleUser.sub, resolvedDisplayName, isAdmin],
        );

        user = linkedResult.rows[0];
      } else {
        if (!acceptedTerms) {
          await client.query("ROLLBACK");
          return res.json({
            requiresTerms: true,
            email: googleUser.email,
            displayName: googleUser.displayName,
          });
        }

        const passwordHash = await bcrypt.hash(randomUUID(), 10);
        const insertedResult = await client.query(
          `
          INSERT INTO users (
            email,
            password_hash,
            display_name,
            google_sub,
            is_admin,
            terms_accepted_at,
            privacy_accepted_at,
            consent_source
          )
          VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), 'google_signup')
          RETURNING id, email, display_name, google_sub, is_admin
          `,
          [
            googleUser.email,
            passwordHash,
            resolvedDisplayName,
            googleUser.sub,
            isAdmin,
          ],
        );

        user = insertedResult.rows[0];
      }
    }

    await client.query("COMMIT");

    res.json({ token: createSessionToken(user) });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Google sign-in failed:", err);
    res.status(500).json({ error: "Google sign-in failed" });
  } finally {
    client.release();
  }
});

startServer();

