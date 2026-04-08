import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(SERVER_ROOT, ".env"), quiet: true });

const DEFAULT_STAGE = "A1.1";
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-pro-preview";
const DEFAULT_OUTPUT_ROOT = path.join(
  SERVER_ROOT,
  "admin-data",
  "qa-exports",
  "gemini-tone-audits",
);

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
  const stage = String(readFlag(args, "--stage") || DEFAULT_STAGE).trim();
  const outputDir =
    readFlag(args, "--output-dir") ||
    path.join(DEFAULT_OUTPUT_ROOT, stage.replace(/[^\w.-]+/g, "_"));

  return {
    stage,
    outputDir: path.resolve(SERVER_ROOT, outputDir),
    model: normalizeModelName(readFlag(args, "--model") || DEFAULT_MODEL),
    force: args.includes("--force"),
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function buildPrompt(stage, batch) {
  return [
    "You are checking Thai word-breakdown tone labels for curriculum data.",
    "Each item is a reusable breakdown unit gathered from lesson content.",
    "Use the Thai text, romanization, current tone variants, and example occurrences as context.",
    "Return JSON only.",
    "Only include items whose tones are incorrect or uncertain.",
    "If all current tone variants are correct, omit the item.",
    "",
    "Output schema:",
    "{",
    '  "stage": string,',
    '  "batch_id": string,',
    '  "checked_items": number,',
    '  "findings": [',
    "    {",
    '      "item_id": string,',
    '      "thai": string,',
    '      "romanization": string,',
    '      "current_tones_variants": string[][],',
    '      "status": "corrected" | "uncertain",',
    '      "corrected_tones": string[],',
    '      "reason": string',
    "    }",
    "  ]",
    "}",
    "",
    `Stage: ${stage}`,
    `Batch ID: ${batch.batch_id}`,
    `Items JSON: ${JSON.stringify(batch.items)}`,
  ].join("\n");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function callGeminiWithRetry({ apiKey, model, prompt, batchId, retries = 4 }) {
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await callGemini({ apiKey, model, prompt });
    } catch (error) {
      lastError = error;
      if (attempt >= retries) {
        break;
      }
      const delayMs = attempt * 5000;
      console.warn(
        `Gemini request retry ${attempt}/${retries - 1} for ${batchId} after error: ${error.message}`,
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
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
  const { stage, outputDir, model, force } = parseArgs();
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in environment");
  }

  const manifestPath = path.join(outputDir, "manifest.json");
  const manifest = readJson(manifestPath);
  const batchDir = path.join(outputDir, "batches");
  const batchFiles = fs
    .readdirSync(batchDir)
    .filter((name) => name.endsWith(".json"))
    .sort();

  const aggregateFindings = [];
  const batchSummaries = [];

  for (const batchFile of batchFiles) {
    const batchPath = path.join(batchDir, batchFile);
    const batch = readJson(batchPath);
    const batchId = batch.batch_id;
    const requestPath = path.join(outputDir, "requests", `${batchId}.json`);
    const responsePath = path.join(outputDir, "responses", `${batchId}.json`);

    if (!force && fs.existsSync(responsePath)) {
      const existing = readJson(responsePath);
      const findings = Array.isArray(existing?.parsedOutput?.findings)
        ? existing.parsedOutput.findings
        : [];
      aggregateFindings.push(...findings);
      batchSummaries.push({
        batch_id: batchId,
        item_count: batch.item_count,
        findings_count: findings.length,
        reused: true,
        responsePath,
      });
      continue;
    }

    const prompt = buildPrompt(stage, batch);
    const requestPayload = {
      requestedModel: model,
      endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      },
      prompt,
    };
    writeJson(requestPath, requestPayload);

    const responseJson = await callGeminiWithRetry({
      apiKey,
      model,
      prompt,
      batchId,
    });
    const responseText = extractText(responseJson);

    let parsedOutput = null;
    try {
      parsedOutput = responseText ? JSON.parse(responseText) : null;
    } catch {
      parsedOutput = null;
    }

    writeJson(responsePath, {
      requestedModel: model,
      responseModelVersion: responseJson?.modelVersion ?? null,
      stage,
      batch_id: batchId,
      item_count: batch.item_count,
      parsedOutput,
      rawText: responseText,
      rawResponse: responseJson,
      usageMetadata: responseJson?.usageMetadata ?? null,
    });

    const findings = Array.isArray(parsedOutput?.findings)
      ? parsedOutput.findings
      : [];
    aggregateFindings.push(...findings);
    batchSummaries.push({
      batch_id: batchId,
      item_count: batch.item_count,
      findings_count: findings.length,
      reused: false,
      responsePath,
    });
  }

  const aggregate = {
    stage,
    manifest,
    requestedModel: model,
    generatedAt: new Date().toISOString(),
    batchSummaries,
    findingsCount: aggregateFindings.length,
    findings: aggregateFindings,
  };

  writeJson(path.join(outputDir, "aggregate-findings.json"), aggregate);

  console.log(
    JSON.stringify(
      {
        stage,
        outputDir,
        requestedModel: model,
        batchCount: batchSummaries.length,
        findingsCount: aggregateFindings.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("Failed to run Gemini tone audit batches:", error.message);
  process.exitCode = 1;
});
