import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(SERVER_ROOT, ".env"), quiet: true });

const DEFAULT_LESSON = "svo";
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-pro-preview";
const DEFAULT_OUTPUT_DIR = path.join(SERVER_ROOT, "admin-data", "qa-exports");

function readFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0 || index >= args.length - 1) {
    return null;
  }
  return args[index + 1];
}

function normalizeModelName(model) {
  const value = String(model || "").trim();
  if (!value) {
    return DEFAULT_MODEL;
  }
  return value.startsWith("models/") ? value.slice("models/".length) : value;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const lessonId = String(readFlag(args, "--lesson") || DEFAULT_LESSON).trim();
  const model = normalizeModelName(readFlag(args, "--model") || DEFAULT_MODEL);
  const rowsLimit = Number.parseInt(readFlag(args, "--rows") || "", 10);
  const outputPath =
    readFlag(args, "--output") ||
    path.join(DEFAULT_OUTPUT_DIR, `gemini-tone-qa-${lessonId}.json`);

  return {
    lessonId,
    model,
    rowsLimit: Number.isFinite(rowsLimit) && rowsLimit > 0 ? rowsLimit : null,
    outputPath: path.resolve(SERVER_ROOT, outputPath),
  };
}

function loadLessonRows(lessonId) {
  const sourcePath = path.join(
    SERVER_ROOT,
    "admin-data",
    "manual-source-lessons",
    `${lessonId}-source.json`,
  );

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Could not find lesson source: ${sourcePath}`);
  }

  const parsed = JSON.parse(
    fs.readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, ""),
  );
  const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`Lesson source ${lessonId} has no rows`);
  }

  return rows;
}

function compactRows(rows) {
  return rows.map((row, index) => ({
    row: index + 1,
    thai: String(row.thai ?? "").trim(),
    english: String(row.english ?? "").trim(),
    breakdown: (Array.isArray(row.breakdown) ? row.breakdown : []).map((item) => ({
      thai: String(item?.thai ?? "").trim(),
      romanization: String(item?.romanization ?? "").trim(),
      current_tones: Array.isArray(item?.tones)
        ? item.tones.map((tone) => String(tone ?? "").trim()).filter(Boolean)
        : typeof item?.tone === "string" && item.tone.trim()
          ? [item.tone.trim()]
          : [],
      english: String(item?.english ?? "").trim(),
    })),
  }));
}

function buildPrompt(lessonId, rows) {
  return [
    "You are checking Thai word-breakdown tone labels for curriculum data.",
    "Use the provided Thai, romanization, and current tone sequence.",
    "Return JSON only.",
    "Only include breakdown items whose current tones are incorrect or uncertain.",
    "",
    "Output schema:",
    "{",
    '  "lesson_id": string,',
    '  "checked_rows": number,',
    '  "checked_items": number,',
    '  "findings": [',
    "    {",
    '      "row": number,',
    '      "thai": string,',
    '      "romanization": string,',
    '      "current_tones": string[],',
    '      "status": "corrected" | "uncertain",',
    '      "corrected_tones": string[],',
    '      "reason": string',
    "    }",
    "  ]",
    "}",
    "",
    `Lesson: ${lessonId}`,
    `Rows JSON: ${JSON.stringify(rows)}`,
  ].join("\n");
}

async function callGemini({ apiKey, model, prompt }) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
        },
      }),
    },
  );

  const json = await response.json().catch(async () => ({
    raw: await response.text(),
  }));

  if (!response.ok) {
    throw new Error(
      `Gemini request failed (${response.status}): ${JSON.stringify(json)}`,
    );
  }

  return json;
}

function extractText(responseJson) {
  const candidate = Array.isArray(responseJson?.candidates)
    ? responseJson.candidates[0]
    : null;
  const parts = Array.isArray(candidate?.content?.parts)
    ? candidate.content.parts
    : [];
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

async function main() {
  const { lessonId, model, rowsLimit, outputPath } = parseArgs();
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in environment");
  }

  const allRows = loadLessonRows(lessonId);
  const selectedRows = rowsLimit ? allRows.slice(0, rowsLimit) : allRows;
  const compact = compactRows(selectedRows);
  const prompt = buildPrompt(lessonId, compact);
  const responseJson = await callGemini({ apiKey, model, prompt });
  const responseText = extractText(responseJson);

  let parsed = null;
  try {
    parsed = responseText ? JSON.parse(responseText) : null;
  } catch {
    parsed = null;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        requestedModel: model,
        responseModelVersion: responseJson?.modelVersion ?? null,
        lessonId,
        rowCount: selectedRows.length,
        output: parsed,
        rawText: responseText,
        usageMetadata: responseJson?.usageMetadata ?? null,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        requestedModel: model,
        responseModelVersion: responseJson?.modelVersion ?? null,
        lessonId,
        rowCount: selectedRows.length,
        findingsCount: Array.isArray(parsed?.findings) ? parsed.findings.length : null,
        outputPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("Failed to run Gemini tone QA sample:", error.message);
  process.exitCode = 1;
});
