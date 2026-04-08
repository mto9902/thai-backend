import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { analyzeBreakdownTones } from "../../breakdownTone.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const SERVER_ROOT = path.resolve(__dirname, "..", "..");
export const FRONTEND_ROOT = path.resolve(SERVER_ROOT, "..", "thaiApp-2");
export const MANUAL_SOURCE_DIR = path.join(
  SERVER_ROOT,
  "admin-data",
  "manual-source-lessons",
);
export const ORDER_SEED_PATH = path.join(
  SERVER_ROOT,
  "admin-data",
  "grammar-order-seed.json",
);
export const DEFAULT_AUDIT_STAGES = [
  "A1.1",
  "A1.2",
  "A2.1",
  "A2.2",
  "B1.1",
  "B1.2",
  "B2.1",
  "B2.2",
];
export const ROMANIZATION_AUDIT_OUTPUT_ROOT = path.join(
  SERVER_ROOT,
  "admin-data",
  "qa-exports",
  "romanization-audits",
);

const COMMON_ENGLISH_LEAK_WORDS = new Set([
  "a",
  "about",
  "again",
  "alone",
  "also",
  "an",
  "and",
  "answer",
  "ask",
  "by",
  "care",
  "client",
  "come",
  "confused",
  "decide",
  "faster",
  "frequent",
  "he",
  "i",
  "if",
  "important",
  "in",
  "is",
  "it",
  "let",
  "long",
  "lot",
  "make",
  "many",
  "more",
  "of",
  "other",
  "people",
  "project",
  "repairs",
  "respond",
  "resulted",
  "short",
  "slow",
  "some",
  "stopped",
  "summary",
  "taking",
  "than",
  "the",
  "this",
  "too",
  "trying",
  "up",
  "while",
  "with",
]);

function repair(value) {
  return String(value ?? "").replace(/^\uFEFF/, "").replace(/\u0000/g, "").trim();
}

export function sanitizeRomanizationText(value) {
  return repair(value)
    .normalize("NFC")
    .replace(/\s+/g, " ");
}

export function containsThai(value) {
  return /[\u0E00-\u0E7F]/u.test(repair(value));
}

export function containsRomanizationPlaceholder(value) {
  return /[?\uFFFD]/u.test(repair(value));
}

export function normalizeRomanizationBasic(value) {
  return sanitizeRomanizationText(value)
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B]/gu, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/gu, '"')
    .replace(/-/g, " ")
    .replace(/[.,!?;:(){}\[\]"/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeRomanizationRelaxed(value) {
  return normalizeRomanizationBasic(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const ALLOWED_OVERSIZED_CHUNKS = new Set([
  "กระเป๋าเดินทาง",
  "พนักงานส่งของ",
  "การออกกำลังกาย",
  "สวนสาธารณะ",
  "ทะเลาะกัน",
]);
const BREAKDOWN_OVERSIZED_SYLLABLE_THRESHOLD = 10;
const BREAKDOWN_SENTENCE_LIKE_SYLLABLE_THRESHOLD = 8;
const BREAKDOWN_HEAVY_ROMAN_TOKEN_THRESHOLD = 10;

export function romanizationTokenCount(value) {
  return sanitizeRomanizationText(value)
    .split(/[\s/-]+/u)
    .map((token) => token.trim())
    .filter(Boolean).length;
}

export function tokenizeLatinWords(value) {
  return normalizeRomanizationRelaxed(value)
    .split(/[\s/-]+/u)
    .map((token) => token.replace(/[^a-z]/g, "").trim())
    .filter((token) => token.length >= 2);
}

export function looksLikeEnglishLeak(value, english = "") {
  const romanTokens = tokenizeLatinWords(value);
  if (romanTokens.length < 2) {
    return false;
  }

  const englishTokens = new Set(tokenizeLatinWords(english));
  let commonCount = 0;
  let englishOverlap = 0;

  for (const token of romanTokens) {
    if (COMMON_ENGLISH_LEAK_WORDS.has(token)) {
      commonCount += 1;
    }
    if (englishTokens.has(token)) {
      englishOverlap += 1;
    }
  }

  const commonRatio = commonCount / romanTokens.length;
  const overlapRatio = englishOverlap / romanTokens.length;
  return (
    (commonCount >= 3 && commonRatio >= 0.5) ||
    (!englishGlossLooksLikeProperName(english) &&
      englishOverlap >= 2 &&
      overlapRatio >= 0.5)
  );
}

export function romanizationEqualsEnglish(romanization, english) {
  const roman = normalizeRomanizationRelaxed(romanization);
  const gloss = normalizeRomanizationRelaxed(english);
  return Boolean(roman && gloss && roman === gloss);
}

function englishGlossLooksLikeProperName(english) {
  const value = repair(english);
  if (!value) {
    return false;
  }

  const tokens = value
    .split(/[\s/-]+/u)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0) {
    return false;
  }

  return tokens.every(
    (token) =>
      /^[A-Z][A-Za-z'.-]*$/.test(token) ||
      /^[A-Z]{2,}$/.test(token),
  );
}

export function shouldFlagEnglishGlossMatch(romanization, english) {
  if (!romanizationEqualsEnglish(romanization, english)) {
    return false;
  }
  return !englishGlossLooksLikeProperName(english);
}

export function getThaiSyllableCount(thai, romanization = "", tones = []) {
  return analyzeBreakdownTones({
    thai: repair(thai),
    romanization: sanitizeRomanizationText(romanization),
    providedTones: Array.isArray(tones) ? tones : [],
  }).syllableCount;
}

function readGrammarTitles() {
  const regex = /{\s*id:\s*"([^"]+)"[\s\S]*?title:\s*"([^"]+)"/g;
  const titles = new Map();
  const grammarPaths = [
    path.join(FRONTEND_ROOT, "src", "data", "grammar.ts"),
    path.join(FRONTEND_ROOT, "src", "data", "grammarB2.ts"),
  ];

  for (const grammarPath of grammarPaths) {
    if (!fs.existsSync(grammarPath)) {
      continue;
    }
    const source = fs.readFileSync(grammarPath, "utf8").replace(/^\uFEFF/, "");
    for (const match of source.matchAll(regex)) {
      titles.set(match[1], match[2]);
    }
  }

  return titles;
}

let cachedGrammarTitles = null;

export function getGrammarTitles() {
  if (!cachedGrammarTitles) {
    cachedGrammarTitles = readGrammarTitles();
  }
  return cachedGrammarTitles;
}

export function readGrammarOrderSeed() {
  if (!fs.existsSync(ORDER_SEED_PATH)) {
    return new Map();
  }

  const parsed = JSON.parse(fs.readFileSync(ORDER_SEED_PATH, "utf8").replace(/^\uFEFF/, ""));
  return new Map(Object.entries(parsed ?? {}));
}

export function buildStageGrammarMetadata(stages = DEFAULT_AUDIT_STAGES) {
  const wanted = new Set(stages);
  const titles = getGrammarTitles();
  const orderSeed = readGrammarOrderSeed();
  const metadata = [];

  for (const entry of orderSeed.values()) {
    if (!wanted.has(entry.stage)) {
      continue;
    }

    metadata.push({
      grammarId: entry.grammarId,
      stage: entry.stage,
      stageOrder: Number(entry.stageOrder ?? 0),
      lessonOrder: Number(entry.lessonOrder ?? 0),
      lessonTitle: titles.get(entry.grammarId) || entry.grammarId,
      sourcePath: path.join(MANUAL_SOURCE_DIR, `${entry.grammarId}-source.json`),
    });
  }

  metadata.sort(
    (left, right) =>
      left.stageOrder - right.stageOrder ||
      left.lessonOrder - right.lessonOrder ||
      left.grammarId.localeCompare(right.grammarId),
  );

  return metadata;
}

export function normalizeBreakdown(rawBreakdown) {
  if (Array.isArray(rawBreakdown)) {
    return rawBreakdown;
  }
  try {
    return JSON.parse(rawBreakdown ?? "[]");
  } catch {
    return [];
  }
}

export async function fetchPublishedStageRows(pool, stageMetadata, { includeLegacy = false } = {}) {
  const grammarIds = stageMetadata.map((item) => item.grammarId);
  if (grammarIds.length === 0) {
    return [];
  }

  const metadataByGrammar = new Map(stageMetadata.map((item) => [item.grammarId, item]));
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
      quality_flags
    FROM grammar_examples
    WHERE grammar_id = ANY($1::text[])
      AND publish_state = 'published'
      AND review_status = 'approved'
      AND (
        $2::boolean = TRUE
        OR NOT (quality_flags @> '["legacy"]'::jsonb)
      )
    ORDER BY grammar_id ASC, sort_order ASC, id ASC
    `,
    [grammarIds, includeLegacy],
  );

  return result.rows.map((row) => {
    const meta = metadataByGrammar.get(row.grammar_id);
    return {
      id: Number(row.id),
      grammarId: row.grammar_id,
      stage: meta?.stage || "",
      stageOrder: Number(meta?.stageOrder ?? 0),
      lessonOrder: Number(meta?.lessonOrder ?? 0),
      lessonTitle: meta?.lessonTitle || row.grammar_id,
      sourcePath: meta?.sourcePath || "",
      rowNumber: Number(row.sort_order ?? 0) + 1,
      thai: repair(row.thai),
      romanization: sanitizeRomanizationText(row.romanization),
      english: repair(row.english),
      breakdown: normalizeBreakdown(row.breakdown),
    };
  });
}

function buildOccurrence(row, item, itemIndex) {
  return {
    grammar_id: row.grammarId,
    lesson_title: row.lessonTitle,
    lesson_order: row.lessonOrder,
    row: row.rowNumber,
    item_index: itemIndex + 1,
    sentence_thai: row.thai,
    sentence_english: row.english,
    sentence_romanization: row.romanization,
    thai: repair(item.thai),
    english: repair(item.english),
    romanization: sanitizeRomanizationText(item.romanization),
    tones: Array.isArray(item.tones)
      ? item.tones.map((tone) => repair(tone)).filter(Boolean)
      : item.tone
        ? [repair(item.tone)]
        : [],
    grammar: item.grammar === true,
    source_path: row.sourcePath,
  };
}

function summarizeBreakdownFlags(item, sameThaiVariants) {
  const flags = [];
  const syllableCount = getThaiSyllableCount(item.thai, item.romanization, item.tones);
  const romanTokenCountValue = romanizationTokenCount(item.romanization);

  if (!item.romanization) {
    flags.push("blank_romanization");
  }
  if (containsRomanizationPlaceholder(item.romanization)) {
    flags.push("contains_placeholder_characters");
  }
  if (containsThai(item.romanization)) {
    flags.push("contains_thai_characters");
  }
  if (shouldFlagEnglishGlossMatch(item.romanization, item.english)) {
    flags.push("romanization_equals_english");
  }
  if (looksLikeEnglishLeak(item.romanization, item.english)) {
    flags.push("likely_english_leak");
  }
  if (sameThaiVariants.size > 1) {
    flags.push("same_thai_multiple_romanizations");
  }
  if (
    !item.grammar &&
    syllableCount >= BREAKDOWN_OVERSIZED_SYLLABLE_THRESHOLD &&
    !ALLOWED_OVERSIZED_CHUNKS.has(item.thai)
  ) {
    flags.push("oversized_chunk_candidate");
  }
  if (
    !item.grammar &&
    /[\s]/u.test(item.thai) &&
    syllableCount >= BREAKDOWN_SENTENCE_LIKE_SYLLABLE_THRESHOLD
  ) {
    flags.push("sentence_like_chunk_candidate");
  }
  if (
    !item.grammar &&
    romanTokenCountValue >= BREAKDOWN_HEAVY_ROMAN_TOKEN_THRESHOLD &&
    !ALLOWED_OVERSIZED_CHUNKS.has(item.thai)
  ) {
    flags.push("romanization_review_heavy");
  }

  return {
    flags,
    syllableCount,
    romanTokenCount: romanTokenCountValue,
  };
}

export function buildBreakdownInventory(rows, stage) {
  const grouped = new Map();
  const sameThaiRomans = new Map();

  for (const row of rows) {
    for (const [itemIndex, item] of row.breakdown.entries()) {
      const occurrence = buildOccurrence(row, item, itemIndex);
      const key = `${occurrence.thai}||${occurrence.romanization}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          stage,
          thai: occurrence.thai,
          english: occurrence.english,
          romanization: occurrence.romanization,
          tones: occurrence.tones,
          grammar: occurrence.grammar,
          primaryOccurrence: occurrence,
          occurrences: [],
          englishVariants: new Set(),
        });
      }
      const entry = grouped.get(key);
      entry.occurrences.push(occurrence);
      entry.englishVariants.add(occurrence.english);

      if (!sameThaiRomans.has(occurrence.thai)) {
        sameThaiRomans.set(occurrence.thai, new Set());
      }
      sameThaiRomans.get(occurrence.thai).add(occurrence.romanization || "<blank>");
    }
  }

  const items = [...grouped.values()].map((entry, index) => {
    const sameThaiVariants = sameThaiRomans.get(entry.thai) || new Set();
    const { flags, syllableCount, romanTokenCount } = summarizeBreakdownFlags(
      entry,
      sameThaiVariants,
    );
    const representative = entry.primaryOccurrence;

    return {
      item_id: `${stage.toLowerCase().replace(/[^\w]+/g, "_")}-br-${String(index + 1).padStart(4, "0")}`,
      stage,
      grammar_id: representative.grammar_id,
      lesson_title: representative.lesson_title,
      lesson_order: representative.lesson_order,
      row: representative.row,
      item_index: representative.item_index,
      thai: entry.thai,
      english: entry.english,
      romanization: entry.romanization,
      tones: entry.tones,
      grammar: entry.grammar,
      frequency: entry.occurrences.length,
      syllable_count: syllableCount,
      roman_token_count: romanTokenCount,
      system_flags: flags,
      same_thai_romanization_variants: [...sameThaiVariants].sort(),
      english_variants: [...entry.englishVariants].sort(),
      example_sentence_context: {
        thai: representative.sentence_thai,
        english: representative.sentence_english,
        romanization: representative.sentence_romanization,
      },
      occurrences: entry.occurrences,
    };
  });

  items.sort(
    (left, right) =>
      left.lesson_order - right.lesson_order ||
      left.row - right.row ||
      left.item_index - right.item_index ||
      left.thai.localeCompare(right.thai),
  );

  return items;
}

function classifySentenceMatch(sentenceRomanization, joinedBreakdownRomanization) {
  const sentenceBasic = normalizeRomanizationBasic(sentenceRomanization);
  const joinedBasic = normalizeRomanizationBasic(joinedBreakdownRomanization);
  const sentenceRelaxed = normalizeRomanizationRelaxed(sentenceRomanization);
  const joinedRelaxed = normalizeRomanizationRelaxed(joinedBreakdownRomanization);

  if (sentenceBasic === joinedBasic) {
    return "match";
  }

  if (sentenceRelaxed === joinedRelaxed) {
    return "style_mismatch";
  }

  return "content_mismatch";
}

export function buildSentenceInventory(rows, stage) {
  return rows.map((row) => {
    const joinedBreakdownRomanization = row.breakdown
      .map((item) => sanitizeRomanizationText(item.romanization))
      .filter(Boolean)
      .join(" ");
    const oversizedChunks = row.breakdown
      .map((item, index) => ({
        index: index + 1,
        thai: repair(item.thai),
        syllableCount: getThaiSyllableCount(item.thai, item.romanization, item.tones || []),
        grammar: item.grammar === true,
      }))
      .filter(
        (item) =>
          !item.grammar &&
          !ALLOWED_OVERSIZED_CHUNKS.has(item.thai) &&
          (item.syllableCount >= BREAKDOWN_OVERSIZED_SYLLABLE_THRESHOLD ||
            (/[\s]/u.test(item.thai) &&
              !item.thai.includes("ๆ") &&
              item.syllableCount >= BREAKDOWN_SENTENCE_LIKE_SYLLABLE_THRESHOLD)),
      );

    const flags = [];
    if (!row.romanization) {
      flags.push("blank_sentence_romanization");
    }
    if (containsRomanizationPlaceholder(row.romanization)) {
      flags.push("sentence_contains_placeholder_characters");
    }
    if (containsThai(row.romanization)) {
      flags.push("sentence_contains_thai_characters");
    }
    if (shouldFlagEnglishGlossMatch(row.romanization, row.english)) {
      flags.push("sentence_romanization_equals_english");
    }
    if (looksLikeEnglishLeak(row.romanization, row.english)) {
      flags.push("sentence_likely_english_leak");
    }

    let blankBreakdownRomanization = false;
    let breakdownContainsThai = false;
    for (const item of row.breakdown) {
      const roman = sanitizeRomanizationText(item.romanization);
      if (!roman) {
        blankBreakdownRomanization = true;
      }
      if (containsRomanizationPlaceholder(roman)) {
        flags.push("breakdown_contains_placeholder_characters");
      }
      if (containsThai(roman)) {
        breakdownContainsThai = true;
      }
    }

    if (blankBreakdownRomanization) {
      flags.push("blank_breakdown_romanization");
    }
    if (breakdownContainsThai) {
      flags.push("breakdown_contains_thai_characters");
    }
    if (oversizedChunks.length > 0) {
      flags.push("oversized_chunk_candidate");
    }

    const matchType = classifySentenceMatch(row.romanization, joinedBreakdownRomanization);
    if (matchType === "style_mismatch") {
      flags.push("sentence_breakdown_style_mismatch");
    }
    if (matchType === "content_mismatch") {
      flags.push("sentence_breakdown_content_mismatch");
    }

    return {
      row_id: `${stage.toLowerCase().replace(/[^\w]+/g, "_")}-row-${row.grammarId}-${String(
        row.rowNumber,
      ).padStart(2, "0")}`,
      stage,
      grammar_id: row.grammarId,
      lesson_title: row.lessonTitle,
      lesson_order: row.lessonOrder,
      row: row.rowNumber,
      thai: row.thai,
      english: row.english,
      sentence_romanization: row.romanization,
      breakdown_joined_romanization: joinedBreakdownRomanization,
      normalized_sentence_romanization: normalizeRomanizationBasic(row.romanization),
      normalized_breakdown_romanization: normalizeRomanizationBasic(joinedBreakdownRomanization),
      match_type: matchType,
      system_flags: flags,
      oversized_chunks: oversizedChunks,
      source_path: row.sourcePath,
      breakdown_preview: row.breakdown.map((item, index) => ({
        item_index: index + 1,
        thai: repair(item.thai),
        english: repair(item.english),
        romanization: sanitizeRomanizationText(item.romanization),
        grammar: item.grammar === true,
      })),
    };
  });
}

export function buildManualReview(stage, breakdownInventory, sentenceInventory) {
  const flaggedBreakdownItems = breakdownInventory.filter((item) => item.system_flags.length > 0);
  const flaggedSentenceRows = sentenceInventory.filter((row) => row.system_flags.length > 0);

  return {
    stage,
    generated_at: new Date().toISOString(),
    policy: {
      romanization_standard: "house-style",
      chunking_rule: "preserve-unless-broken",
    },
    breakdown: {
      flagged_item_ids: flaggedBreakdownItems.map((item) => item.item_id),
      decisions: Object.fromEntries(
        flaggedBreakdownItems.map((item) => [
          item.item_id,
          {
            decision: null,
            finalRomanization: item.romanization,
            chunkDecision: item.system_flags.includes("oversized_chunk_candidate")
              ? null
              : "chunk_ok",
            replacementBreakdown: null,
            notes: "",
          },
        ]),
      ),
    },
    sentences: {
      flagged_row_ids: flaggedSentenceRows.map((row) => row.row_id),
      decisions: Object.fromEntries(
        flaggedSentenceRows.map((row) => [
          row.row_id,
          {
            decision: null,
            finalRomanization: row.sentence_romanization,
            notes: "",
          },
        ]),
      ),
    },
  };
}

function countFlags(items) {
  const counts = new Map();
  for (const item of items) {
    for (const flag of item.system_flags || []) {
      counts.set(flag, (counts.get(flag) || 0) + 1);
    }
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

export function buildAggregateSummary(stage, breakdownInventory, sentenceInventory) {
  return {
    stage,
    generated_at: new Date().toISOString(),
    totals: {
      breakdown_items: breakdownInventory.length,
      flagged_breakdown_items: breakdownInventory.filter((item) => item.system_flags.length > 0)
        .length,
      sentence_rows: sentenceInventory.length,
      flagged_sentence_rows: sentenceInventory.filter((row) => row.system_flags.length > 0)
        .length,
    },
    breakdown_flag_counts: countFlags(breakdownInventory),
    sentence_flag_counts: countFlags(sentenceInventory),
    sentence_match_counts: sentenceInventory.reduce(
      (accumulator, row) => {
        accumulator[row.match_type] = (accumulator[row.match_type] || 0) + 1;
        return accumulator;
      },
      {},
    ),
  };
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function validateLessonRomanizationRows(rows, { strictSentenceMatch = false } = {}) {
  const errors = [];
  const warnings = [];

  for (const [rowIndex, row] of rows.entries()) {
    const rowLabel = `row ${rowIndex + 1}`;
    if (!repair(row.romanization)) {
      errors.push(`${rowLabel}: missing sentence romanization`);
    } else if (containsRomanizationPlaceholder(row.romanization)) {
      errors.push(`${rowLabel}: sentence romanization contains placeholder characters`);
    } else if (containsThai(row.romanization)) {
      errors.push(`${rowLabel}: sentence romanization contains Thai characters`);
    } else if (shouldFlagEnglishGlossMatch(row.romanization, row.english)) {
      errors.push(`${rowLabel}: sentence romanization matches English gloss`);
    }

    const joinedBreakdown = (row.breakdown || [])
      .map((item) => sanitizeRomanizationText(item.romanization))
      .filter(Boolean)
      .join(" ");
    const matchType = classifySentenceMatch(row.romanization, joinedBreakdown);

    if (strictSentenceMatch && matchType === "content_mismatch") {
      errors.push(`${rowLabel}: sentence romanization diverges from breakdown content`);
    } else if (matchType === "content_mismatch") {
      warnings.push(`${rowLabel}: sentence romanization diverges from breakdown content`);
    } else if (matchType === "style_mismatch") {
      warnings.push(`${rowLabel}: sentence romanization differs stylistically from breakdowns`);
    }

    for (const [itemIndex, item] of (row.breakdown || []).entries()) {
      const itemLabel = `${rowLabel} breakdown ${itemIndex + 1}`;
      if (!repair(item.romanization)) {
        errors.push(`${itemLabel}: missing breakdown romanization`);
      } else if (containsRomanizationPlaceholder(item.romanization)) {
        errors.push(`${itemLabel}: breakdown romanization contains placeholder characters`);
      } else if (containsThai(item.romanization)) {
        errors.push(`${itemLabel}: breakdown romanization contains Thai characters`);
      } else if (shouldFlagEnglishGlossMatch(item.romanization, item.english)) {
        errors.push(`${itemLabel}: breakdown romanization matches English gloss`);
      }
    }
  }

  return { errors, warnings };
}
