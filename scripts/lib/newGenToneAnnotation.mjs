import fs from "fs";
import path from "path";
import { analyzeBreakdownTones } from "../../breakdownTone.js";

export const VALID_TONES = new Set(["mid", "low", "falling", "high", "rising"]);

export function normalizeToneArray(value, fieldLabel) {
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

export function escapeCsvValue(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function writeCsvMirror(grammarDir, grammarId, rows) {
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
    path.join(grammarDir, `${grammarId}.csv`),
    [header.join(","), ...lines].join("\n"),
    "utf8",
  );
}

export function summarizeRowToneState(breakdown) {
  const analyses = breakdown.map((item) =>
    analyzeBreakdownTones({
      thai: item.thai,
      romanization: item.romanization,
      providedTones: Array.isArray(item.tones)
        ? item.tones
        : item.tone
          ? [item.tone]
          : [],
    }),
  );

  const unresolvedItemCount = analyses.filter((analysis) => analysis.tones.length === 0).length;
  const allResolved = unresolvedItemCount === 0;

  return {
    confidence: allResolved ? 100 : 99,
    status: allResolved ? "approved" : "review",
    source: allResolved ? "new-gen-annotated" : "new-gen-annotated-partial",
    needsReview: !allResolved,
    reasons: allResolved ? [] : ["Some breakdown tones still need manual cleanup."],
    unresolvedItemCount,
    breakdown: analyses,
  };
}

export function autoFillResolvableToneItem(item) {
  const existing = Array.isArray(item.tones)
    ? item.tones.filter(Boolean)
    : item.tone
      ? [item.tone]
      : [];

  if (existing.length > 0) {
    return item;
  }

  const analysis = analyzeBreakdownTones({
    thai: item.thai,
    romanization: item.romanization,
    providedTones: [],
  });

  if (!Array.isArray(analysis.tones) || analysis.tones.length === 0) {
    return item;
  }

  return {
    ...item,
    tones: analysis.tones,
    ...(analysis.tones.length === 1 ? { tone: analysis.tones[0] } : {}),
  };
}

export async function fetchPublishedRows(pool, tableName, grammarId) {
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
    FROM ${tableName}
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

export function buildPrompt(grammarId, rows) {
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

Important rules
- Do not browse.
- Do not use tools.
- Do not explain your reasoning.
- Return JSON only.
- Do not use markdown fences.

Grammar point
- id: ${grammarId}

Task
- Keep the SAME row Thai text.
- Keep the SAME breakdown Thai chunks in the SAME order.
- Do not change Thai, English, or romanization.
- Your only job is to return a tones array for every breakdown item.
- Use only these tone names: mid, low, falling, high, rising.
- Return exactly one tone per heard Thai syllable in that chunk, in order.
- Single-syllable chunks must have exactly one tone.
- Multi-syllable chunks such as พวกเรา or เชียงใหม่ must have one tone entry per syllable.
- Keep existing tones if they are already correct.

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
`.trim();
}

export function findUnresolvedItems(rows) {
  const items = [];

  for (const row of rows) {
    row.breakdown.forEach((item, itemIndex) => {
      const existing = Array.isArray(item.tones)
        ? item.tones.filter(Boolean)
        : item.tone
          ? [item.tone]
          : [];
      const analysis = analyzeBreakdownTones({
        thai: item.thai,
        romanization: item.romanization,
        providedTones: existing,
      });

      if (analysis.tones.length > 0) {
        return;
      }

      items.push({
        rowId: row.id,
        rowThai: row.thai,
        itemIndex,
        thai: item.thai,
        english: item.english,
        romanization: item.romanization || "",
        existingTones: existing,
        syllableCount: analysis.syllableCount,
      });
    });
  }

  return items;
}

export function buildMissingItemsPrompt(grammarId, items) {
  return `
Return JSON only.
No explanation.
No markdown.
No tools.
No browsing.
No partial response.

Grammar id: ${grammarId}
You must return all ${items.length} items below.

Task:
- Add only the missing tones arrays.
- Keep rowThai, itemIndex, and thai exactly unchanged.
- Use only: mid, low, falling, high, rising.
- Return exactly one tone per Thai syllable.
- The tones array length must exactly equal syllableCount.
- If syllableCount is 2, return 2 tones.
- If syllableCount is 3, return 3 tones.
- If syllableCount is 4, return 4 tones.

Return this exact JSON shape:
{
  "items": [
    {
      "rowThai": "",
      "itemIndex": 0,
      "thai": "",
      "tones": ["mid"]
    }
  ]
}

Return all ${items.length} items from this list:
${JSON.stringify(items, null, 2)}
`.trim();
}

function stripMarkdownFences(text) {
  return text.replace(/```json/gi, "```").replace(/```/g, "").trim();
}

function tryParseJsonSlice(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function findJsonEnd(text, startIndex) {
  const opener = text[startIndex];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === opener) {
      depth += 1;
      continue;
    }

    if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

export function parseJsonFromText(rawText) {
  const cleaned = stripMarkdownFences(String(rawText ?? "").trim());
  const direct = tryParseJsonSlice(cleaned);
  if (direct !== null) {
    return direct;
  }

  for (let index = 0; index < cleaned.length; index += 1) {
    const char = cleaned[index];
    if (char !== "{" && char !== "[") {
      continue;
    }

    const endIndex = findJsonEnd(cleaned, index);
    if (endIndex < 0) {
      continue;
    }

    const candidate = cleaned.slice(index, endIndex + 1);
    const parsed = tryParseJsonSlice(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  throw new Error("Could not extract valid JSON from model response");
}

export function mergeAnnotatedBatch(originalRows, candidateRows) {
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

  return originalRows.map((row) => {
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

      if (analysis.syllableCount > 0 && analysis.syllableCount !== tones.length) {
        throw new Error(
          `${row.thai} breakdown "${item.thai}" returned ${tones.length} tones for ${analysis.syllableCount} syllables`,
        );
      }

      return {
        ...item,
        tones,
        ...(tones.length === 1 ? { tone: tones[0] } : {}),
      };
    }).map(autoFillResolvableToneItem);

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

export function mergeAnnotatedItems(rows, candidateItems) {
  if (!Array.isArray(candidateItems) || candidateItems.length === 0) {
    throw new Error("Model returned no missing-tone items");
  }

  const itemsByKey = new Map();

  for (const item of candidateItems) {
    const rowThai = String(item?.rowThai ?? "").trim();
    const thai = String(item?.thai ?? "").trim();
    const itemIndex = Number(item?.itemIndex);
    if (!rowThai || !thai || !Number.isInteger(itemIndex) || itemIndex < 0) {
      throw new Error("Model returned a malformed missing-tone item");
    }

    const key = `${rowThai}::${itemIndex}::${thai}`;
    if (itemsByKey.has(key)) {
      throw new Error(`Model returned a duplicate missing-tone item for "${key}"`);
    }
    itemsByKey.set(key, item);
  }

  const nextRows = rows.map((row) => ({
    ...row,
    breakdown: row.breakdown.map((item) => ({ ...item })),
  }));

  for (const row of nextRows) {
    row.breakdown = row.breakdown.map((item, itemIndex) => {
      const key = `${row.thai}::${itemIndex}::${item.thai}`;
      const candidate = itemsByKey.get(key);
      if (!candidate) {
        return item;
      }

      const tones = normalizeToneArray(candidate?.tones, `${row.thai} breakdown ${itemIndex + 1}`);
      const analysis = analyzeBreakdownTones({
        thai: item.thai,
        romanization: item.romanization,
        providedTones: tones,
      });

      if (analysis.syllableCount > 0 && analysis.syllableCount !== tones.length) {
        throw new Error(
          `${row.thai} breakdown "${item.thai}" returned ${tones.length} tones for ${analysis.syllableCount} syllables`,
        );
      }

      return {
        ...item,
        tones,
        ...(tones.length === 1 ? { tone: tones[0] } : {}),
      };
    }).map(autoFillResolvableToneItem);

    const toneAnalysis = summarizeRowToneState(row.breakdown);
    row.toneConfidence = toneAnalysis.confidence;
    row.toneStatus = toneAnalysis.status;
    row.toneAnalysis = toneAnalysis;
  }

  return nextRows;
}

export async function saveAnnotatedRows({
  pool,
  tableName,
  grammarDir,
  reviewNote,
  grammarId,
  rows,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const row of rows) {
      await client.query(
        `
        UPDATE ${tableName}
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
          reviewNote,
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

  const fullLessonRows = await fetchPublishedRows(pool, tableName, grammarId);
  writeCsvMirror(grammarDir, grammarId, fullLessonRows);
}
