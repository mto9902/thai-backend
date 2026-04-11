import { createHash } from "node:crypto";
import { pool } from "./db.js";

const DEFAULT_EXPLANATION_MODEL = "gpt-4o-mini";
const MAX_BREAKDOWN_ITEMS = 24;
const MAX_TEXT_LENGTH = 900;
const EXPLANATION_CACHE_TABLE = "sentence_explanation_cache";
const EXPLANATION_CACHE_VERSION = "plain-learner-text-v1";
const EXPLANATION_INSTRUCTIONS =
  "Explain this sentence for a learner in English. Write in plain English only. Explain only the final Thai sentence itself, not the exercise, spacing, formatting, or learner answer. Every time you mention a Thai word or Thai phrase, immediately put its romanization in parentheses. Do this every time, with no exceptions. No Markdown, no headings, no bullet points, no hashtags, no asterisks, and no bold formatting. Do not say the sentence is correct or incorrect. Do not offer extra help or say 'if you want'. Start directly with the explanation.";

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function cleanString(value, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeBreakdownItem(item) {
  return {
    thai: cleanString(item?.thai, 120),
    english: cleanString(item?.english, 220),
    romanization: cleanString(item?.romanization || item?.roman, 180),
    tone: cleanString(item?.tone, 40),
    tones: Array.isArray(item?.tones)
      ? item.tones.map((tone) => cleanString(String(tone), 40)).filter(Boolean).slice(0, 8)
      : [],
    grammar: item?.grammar === true,
  };
}

function normalizeBreakdown(rawBreakdown) {
  if (!Array.isArray(rawBreakdown)) return [];
  return rawBreakdown
    .slice(0, MAX_BREAKDOWN_ITEMS)
    .map(normalizeBreakdownItem)
    .filter((item) => item.thai);
}

function normalizeFocus(rawFocus) {
  return {
    particle: cleanString(rawFocus?.particle, 220),
    meaning: cleanString(rawFocus?.meaning, 420),
    romanization: cleanString(rawFocus?.romanization, 220),
  };
}

function normalizeExplanationRequest(body) {
  const grammar = body?.grammar ?? {};
  const sentence = body?.sentence ?? {};
  const exercise = body?.exercise ?? {};

  const normalized = {
    grammar: {
      id: cleanString(grammar.id, 160),
      title: cleanString(grammar.title, 220),
      level: cleanString(grammar.level, 40),
      stage: cleanString(grammar.stage, 40),
      pattern: cleanString(grammar.pattern, 500),
      explanation: cleanString(grammar.explanation, 900),
      focus: normalizeFocus(grammar.focus),
    },
    sentence: {
      thai: cleanString(sentence.thai, 600),
      romanization: cleanString(sentence.romanization, 600),
      english: cleanString(sentence.english, 600),
      breakdown: normalizeBreakdown(sentence.breakdown),
    },
    exercise: {
      mode: cleanString(exercise.mode, 80),
      result: cleanString(exercise.result, 80),
      builtAnswer: cleanString(exercise.builtAnswer, 600),
      selectedMatchOption: exercise.selectedMatchOption
        ? {
            thai: cleanString(exercise.selectedMatchOption.thai, 600),
            romanization: cleanString(exercise.selectedMatchOption.romanization, 600),
            breakdown: normalizeBreakdown(exercise.selectedMatchOption.breakdown),
            isCorrect: exercise.selectedMatchOption.isCorrect === true,
          }
        : null,
    },
  };

  if (!normalized.grammar.id && !normalized.grammar.title) {
    throw httpError(400, "Grammar context is required.");
  }

  if (!normalized.sentence.thai) {
    throw httpError(400, "A Thai sentence is required.");
  }

  return normalized;
}

function buildExplanationInput(context) {
  const lines = [
    `Sentence: ${context.sentence.thai}`,
    context.sentence.romanization ? `Romanization: ${context.sentence.romanization}` : "",
    context.sentence.english ? `English hint: ${context.sentence.english}` : "",
    context.grammar.title ? `Lesson: ${context.grammar.title}` : "",
    context.grammar.pattern ? `Pattern: ${context.grammar.pattern}` : "",
    context.grammar.explanation ? `Lesson note: ${context.grammar.explanation}` : "",
    context.grammar.focus?.particle
      ? `Focus: ${context.grammar.focus.particle}${context.grammar.focus.meaning ? ` (${context.grammar.focus.meaning})` : ""}`
      : "",
    context.sentence.breakdown.length
      ? [
          "Word breakdown:",
          ...context.sentence.breakdown.map((item) => {
            const roman = item.romanization ? ` (${item.romanization})` : "";
            const meaning = item.english ? ` = ${item.english}` : "";
            return `- ${item.thai}${roman}${meaning}`;
          }),
        ].join("\n")
      : "",
  ].filter(Boolean);

  return lines.join("\n\n");
}

function extractResponseText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const output = Array.isArray(response?.output) ? response.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (part?.type === "output_text" && typeof part.text === "string" && part.text.trim()) {
        return part.text.trim();
      }
    }
  }

  return "";
}

function normalizeGeneratedExplanationText(rawText) {
  if (!rawText) {
    throw new Error("OpenAI returned an empty explanation.");
  }

  const cleaned = rawText
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/__+/g, "")
    .replace(/^[ \t]*[-*]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .filter((line) => {
      const normalized = line.trim().toLowerCase();
      if (!normalized) return true;
      if (normalized.startsWith("your sentence is correct")) return false;
      if (normalized.startsWith("the sentence is correct")) return false;
      if (normalized.startsWith("if you want")) return false;
      if (normalized.startsWith("if you'd like")) return false;
      if (normalized.startsWith("if you would like")) return false;
      if (normalized.includes("spaces are just for practice")) return false;
      if (normalized.includes("in normal writing")) return false;
      if (normalized.includes("does not put spaces between")) return false;
      if (normalized.startsWith("your sentence in the exercise")) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned.slice(0, 4000);
}

function buildExplanationCacheKey({ model, input }) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: EXPLANATION_CACHE_VERSION,
        model,
        instructions: EXPLANATION_INSTRUCTIONS,
        input,
      }),
    )
    .digest("hex");
}

async function readCachedExplanation(cacheKey) {
  const result = await pool.query(
    `
      UPDATE ${EXPLANATION_CACHE_TABLE}
      SET last_used_at = NOW(), hit_count = hit_count + 1
      WHERE cache_key = $1
      RETURNING explanation
    `,
    [cacheKey],
  );

  return typeof result.rows[0]?.explanation === "string" ? result.rows[0].explanation : null;
}

async function writeCachedExplanation({
  cacheKey,
  grammarId,
  sentenceThai,
  model,
  explanation,
}) {
  await pool.query(
    `
      INSERT INTO ${EXPLANATION_CACHE_TABLE} (
        cache_key,
        cache_version,
        grammar_id,
        sentence_thai,
        model,
        explanation
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (cache_key)
      DO UPDATE SET
        cache_version = EXCLUDED.cache_version,
        grammar_id = EXCLUDED.grammar_id,
        sentence_thai = EXCLUDED.sentence_thai,
        model = EXCLUDED.model,
        explanation = EXCLUDED.explanation,
        updated_at = NOW(),
        last_used_at = NOW(),
        hit_count = ${EXPLANATION_CACHE_TABLE}.hit_count + 1
    `,
    [
      cacheKey,
      EXPLANATION_CACHE_VERSION,
      grammarId || null,
      sentenceThai,
      model,
      explanation,
    ],
  );
}

export default function registerExplainSentenceRoute(
  app,
  { openai, authMiddleware, rateLimiter } = {},
) {
  const middlewares = [authMiddleware, rateLimiter].filter(Boolean);

  app.post("/grammar/explain-sentence", ...middlewares, async (req, res) => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(503).json({
          error: "AI explanations are not configured yet.",
        });
      }

      if (!openai?.responses?.create) {
        return res.status(503).json({
          error: "AI explanations are not available on this server build.",
        });
      }

      const context = normalizeExplanationRequest(req.body);
      const model =
        cleanString(process.env.OPENAI_EXPLANATION_MODEL, 120) || DEFAULT_EXPLANATION_MODEL;
      const input = buildExplanationInput(context);
      const cacheKey = buildExplanationCacheKey({ model, input });

      try {
        const cachedExplanation = await readCachedExplanation(cacheKey);
        if (cachedExplanation) {
          return res.json({ explanation: cachedExplanation, cached: true });
        }
      } catch (cacheReadError) {
        console.warn("Explain sentence cache read failed:", cacheReadError);
      }

      const response = await openai.responses.create({
        model,
        store: false,
        safety_identifier: req.userId ? String(req.userId) : undefined,
        instructions: EXPLANATION_INSTRUCTIONS,
        input,
        max_output_tokens: 1000,
      });

      const explanation = normalizeGeneratedExplanationText(extractResponseText(response));

      try {
        await writeCachedExplanation({
          cacheKey,
          grammarId: context.grammar.id,
          sentenceThai: context.sentence.thai,
          model,
          explanation,
        });
      } catch (cacheWriteError) {
        console.warn("Explain sentence cache write failed:", cacheWriteError);
      }

      res.json({ explanation, cached: false });
    } catch (err) {
      if (err?.statusCode) {
        return res.status(err.statusCode).json({ error: err.message });
      }

      console.error("Failed to explain grammar sentence:", err);
      res.status(500).json({
        error: "We couldn't generate an explanation right now. Please try again in a moment.",
      });
    }
  });
}
