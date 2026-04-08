import fs from "fs";
import path from "path";

import { analyzeBreakdownTones } from "../breakdownTone.js";

const SERVER_ROOT = process.cwd();
const AUDIT_ROOT = path.join(
  SERVER_ROOT,
  "admin-data",
  "qa-exports",
  "romanization-audits",
);
const SOURCE_DIR = path.join(SERVER_ROOT, "admin-data", "manual-source-lessons");
const STAGE = "B2.2";
const REFERENCE_STAGES = ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2", "B2.1"];
const DRY_RUN = process.argv.includes("--dry-run");
const SEGMENTER = new Intl.Segmenter("th", { granularity: "word" });
const SUPPLEMENTAL_CHUNKS = [
  ["สนใจ", "be interested", "sǒn-jai"],
  ["ตัดสินใจ", "decide", "dtàt-sǐn-jai"],
  ["ละเอียด", "detailed", "lá-ìiat"],
  ["เหมาะ", "suit", "mɔ̀ʔ"],
  ["ส่วนใหญ่", "mostly", "sùan-yài"],
  ["น่าสนใจ", "interesting", "nâa-sǒn-jai"],
  ["ทะเลาะกัน", "argue", "thá-láw-gan"],
  ["คนเดียว", "alone", "khon diao"],
  ["ไอเดีย", "idea", "ai-dia"],
  ["เหมือนเดิม", "the same as before", "mʉ̌an deerm"],
  ["ต่างจังหวัด", "another province", "dtàang jang-wàt"],
  ["ระหว่างทาง", "on the way", "rá-wàang thaang"],
  ["ลำบาก", "difficult", "lam-bàak"],
  ["แถวนี้", "around here", "thǎaeo-níi"],
  ["ปัญหาหลัก", "main problem", "bpan-hǎa-làk"],
  ["คึกคัก", "lively", "khʉ́k-khák"],
  ["ปกติ", "normal", "bpòk-gà-dtì"],
  ["เกือบหมด", "almost all gone", "gʉ̀ap mòt"],
  ["ความประทับใจ", "impression", "khwaam prà-tháp-jai"],
  ["สมาธิ", "concentration", "sà-maa-thí"],
  ["พักบ้าง", "rest sometimes", "phák bâang"],
  ["จุดเสี่ยง", "risk point", "jùt sìang"],
  ["ข้อเสนอเดิม", "the original proposal", "khâaw-sà-nǒoe deerm"],
  ["ประสบการณ์", "experience", "prà-sòp-gaan"],
  ["คุ้น", "be familiar", "khún"],
  ["ปัญหานี้", "this problem", "bpan-hǎa níi"],
  ["งานวิจัย", "research work", "ngaan wí-jai"],
  ["ทำได้", "can do", "tham dâi"],
  ["รายละเอียด", "details", "raai-lá-ìiat"],
  ["ปล่อย", "let", "bplɔ̀i"],
  ["เชื่อใจ", "trust", "chʉ̂a-jai"],
  ["ครั้งแรก", "the first time", "khráng râaek"],
  ["ตอนท้าย", "at the end", "dtawn-tháai"],
  ["ครอบครัวใหญ่", "large family", "khrɔ̂ɔp-khrua yài"],
  ["คนต่างจังหวัด", "people from other provinces", "khon dtàang jang-wàt"],
  ["ค่าเช่า", "rent", "khâa-châo"],
  ["การตัดสินใจ", "decision", "gaan-dtàt-sǐn-jai"],
  ["ที่เหลือ", "that remains", "thîi lʉ̌a"],
  ["ไม่หิว", "not hungry", "mâi hǐu"],
  ["ลูกค้าส่วนใหญ่", "most customers", "lûuk-kháa sùan-yài"],
  ["กลุ่มนี้", "this group", "glùm-níi"],
  ["แบบเดิม", "the old version", "bàaep-dəəm"],
  ["ตามงาน", "catch up with work", "dtaam-ngaan"],
  ["ลองใหม่", "try again", "lawng mài"],
];
const SUPPLEMENTAL_TONES = new Map([
  ["สนใจ", ["rising", "mid"]],
  ["ทำได้", ["mid", "falling"]],
  ["ตัดสินใจ", ["low", "rising", "mid"]],
  ["เชื่อใจ", ["falling", "mid"]],
  ["การตัดสินใจ", ["mid", "low", "rising", "mid"]],
  ["ตอนท้าย", ["mid", "high"]],
  ["ข้อเสนอเดิม", ["falling", "low", "rising", "mid"]],
  ["น่าสนใจ", ["falling", "rising", "mid"]],
  ["ประสบการณ์", ["low", "low", "mid"]],
  ["งานวิจัย", ["mid", "high", "mid"]],
  ["ไอเดีย", ["mid", "mid"]],
  ["เหมือนเดิม", ["rising", "mid"]],
  ["ต่างจังหวัด", ["low", "mid", "low"]],
  ["ความประทับใจ", ["mid", "low", "high", "mid"]],
  ["สมาธิ", ["low", "mid", "high"]],
  ["ลำบาก", ["mid", "low"]],
  ["คนเดียว", ["mid", "mid"]],
  ["ระหว่างทาง", ["high", "low", "mid"]],
  ["ปัญหาหลัก", ["mid", "rising", "low"]],
  ["แบบเดิม", ["low", "mid"]],
  ["ปัญหานี้", ["mid", "rising", "high"]],
  ["รายละเอียด", ["mid", "high", "low"]],
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function hasDiacritics(value) {
  return /[\u0300-\u036fǎâáàǒôóòěêéèǐîíìǔûúùəʉɔɛæœ]/u.test(value);
}

function scoreVariant(variant, frequency) {
  let score = frequency * 100;
  if (hasDiacritics(variant)) score += 15;
  if (variant.includes("-")) score += 4;
  if (/^[a-zA-Z\s-]+$/u.test(variant)) score -= 8;
  return score;
}

function collectStageLessons(stage) {
  const aggregate = readJson(path.join(AUDIT_ROOT, stage, "aggregate-summary.json"));
  const manualReview = readJson(path.join(AUDIT_ROOT, stage, "manual-review.json"));
  const lessons = new Set();
  for (const id of manualReview.breakdown.flagged_item_ids || []) {
    const prefix = `${stage.toLowerCase().replace(".", "_")}-br-`;
    if (!id.startsWith(prefix)) continue;
  }
  const sentenceInventory = readJson(path.join(AUDIT_ROOT, stage, "inventory-sentence.json"));
  for (const row of sentenceInventory) {
    lessons.add(row.grammar_id);
  }
  if (lessons.size !== Number(aggregate.lesson_count ?? 0)) {
    // Keep going; sentence inventory still gives the right lesson ids.
  }
  return [...lessons].sort();
}

function buildReferenceMap() {
  const variants = new Map();
  for (const stage of REFERENCE_STAGES) {
    const inventory = readJson(path.join(AUDIT_ROOT, stage, "inventory-breakdown.json"));
    for (const item of inventory) {
      if (!variants.has(item.thai)) {
        variants.set(item.thai, new Map());
      }
      const romanizations = variants.get(item.thai);
      romanizations.set(
        item.romanization,
        (romanizations.get(item.romanization) || 0) + Number(item.frequency || 1),
      );
    }
  }

  const reference = new Map();
  for (const [thai, romanizations] of variants.entries()) {
    const best = [...romanizations.entries()]
      .map(([variant, frequency]) => ({
        variant,
        frequency,
        score: scoreVariant(variant, frequency),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.frequency - left.frequency ||
          left.variant.localeCompare(right.variant),
      )[0];

    if (best) {
      reference.set(thai, best.variant);
    }
  }
  return reference;
}

function buildCanonicalMap(referenceMap) {
  const inventory = readJson(path.join(AUDIT_ROOT, STAGE, "inventory-breakdown.json"));
  const grouped = new Map();

  for (const item of inventory) {
    if (!item.system_flags.includes("same_thai_multiple_romanizations")) {
      continue;
    }
    if (!grouped.has(item.thai)) {
      grouped.set(item.thai, new Map());
    }
    const variants = grouped.get(item.thai);
    variants.set(
      item.romanization,
      (variants.get(item.romanization) || 0) + Number(item.frequency || 1),
    );
  }

  const canonical = new Map();
  for (const [thai, variants] of grouped.entries()) {
    if (referenceMap.has(thai)) {
      canonical.set(thai, referenceMap.get(thai));
      continue;
    }

    const best = [...variants.entries()]
      .map(([variant, frequency]) => ({
        variant,
        frequency,
        score: scoreVariant(variant, frequency),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.frequency - left.frequency ||
          left.variant.localeCompare(right.variant),
      )[0];

    canonical.set(thai, best.variant);
  }

  return canonical;
}

function buildChunkInventory() {
  const records = new Map();

  for (const file of fs.readdirSync(SOURCE_DIR)) {
    if (!file.endsWith("-source.json")) continue;
    const data = readJson(path.join(SOURCE_DIR, file));
    for (const row of data.rows || []) {
      for (const item of row.breakdown || []) {
        if (!item?.thai || !item?.romanization) continue;
        if (!Array.isArray(item.tones) || item.tones.length === 0) continue;
        const list = records.get(item.thai) || [];
        list.push({
          thai: item.thai,
          english: item.english || "",
          romanization: item.romanization,
          tones: item.tones,
          tone: item.tone,
          grammar: item.grammar === true,
          displayThaiSegments: item.displayThaiSegments,
        });
        records.set(item.thai, list);
      }
    }
  }

  const summary = new Map();
  for (const [thai, entries] of records.entries()) {
    const romanGroups = new Map();
    for (const entry of entries) {
      const key = entry.romanization;
      const bucket = romanGroups.get(key) || { count: 0, entry };
      bucket.count += 1;
      romanGroups.set(key, bucket);
    }
    summary.set(thai, {
      freq: entries.length,
      variants: romanGroups,
    });
  }

  for (const [thai, english, romanization] of SUPPLEMENTAL_CHUNKS) {
    const analysis = analyzeBreakdownTones({
      thai,
      romanization,
      providedTones: [],
    });
    const tones = SUPPLEMENTAL_TONES.get(thai) || analysis.tones;
    summary.set(thai, {
      freq: 99,
      variants: new Map([
        [
          romanization,
          {
            count: 99,
            entry: {
              thai,
              english,
              romanization,
              tones,
              grammar: false,
            },
          },
        ],
      ]),
    });
  }

  return summary;
}

function pickChunkRecord(summary, thai, preferredRomanization = null) {
  const entry = summary.get(thai);
  if (!entry) return null;

  if (preferredRomanization && entry.variants.has(preferredRomanization)) {
    return entry.variants.get(preferredRomanization).entry;
  }

  return [...entry.variants.values()]
    .map((variant) => ({
      ...variant,
      score: scoreVariant(variant.entry.romanization, variant.count),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.count - left.count ||
        left.entry.romanization.localeCompare(right.entry.romanization),
    )[0].entry;
}

function buildOversizedChunkSet() {
  const inventory = readJson(path.join(AUDIT_ROOT, STAGE, "inventory-breakdown.json"));
  return new Set(
    inventory
      .filter((item) => item.system_flags.includes("oversized_chunk_candidate"))
      .map((item) => item.thai),
  );
}

function tokenizeThai(text) {
  return [...SEGMENTER.segment(text)]
    .filter((part) => part.isWordLike)
    .map((part) => part.segment);
}

function splitOversizedChunk(thai, chunkSummary, oversizedChunkSet) {
  const tokens = tokenizeThai(thai);
  if (tokens.length <= 1) {
    return null;
  }

  const memo = new Map();
  function dfs(index) {
    if (index === tokens.length) {
      return [];
    }
    if (memo.has(index)) {
      return memo.get(index);
    }

    const candidates = [];
    for (let end = tokens.length; end > index; end -= 1) {
      const candidate = tokens.slice(index, end).join("");
      const info = chunkSummary.get(candidate);
      if (!info) continue;
      const tokenCount = end - index;
      if (index === 0 && end === tokens.length) continue;
      if (tokenCount > 1 && oversizedChunkSet.has(candidate)) {
        continue;
      }
      candidates.push({
        candidate,
        end,
        tokenCount,
        freq: info.freq,
      });
    }

    candidates.sort(
      (left, right) =>
        right.tokenCount - left.tokenCount ||
        right.freq - left.freq ||
        left.candidate.localeCompare(right.candidate),
    );

    for (const candidate of candidates) {
      const rest = dfs(candidate.end);
      if (rest) {
        const split = [candidate.candidate, ...rest];
        memo.set(index, split);
        return split;
      }
    }

    memo.set(index, null);
    return null;
  }

  const result = dfs(0);
  return result && result.length > 1 ? result : null;
}

function cloneChunkRecord(record, preferredRomanization = null) {
  return {
    thai: record.thai,
    english: record.english,
    romanization: preferredRomanization || record.romanization,
    tones: [...record.tones],
    ...(record.tone ? { tone: record.tone } : {}),
    ...(record.grammar ? { grammar: true } : {}),
    ...(record.displayThaiSegments
      ? { displayThaiSegments: [...record.displayThaiSegments] }
      : {}),
  };
}

function joinRomanization(row) {
  return (row.breakdown || [])
    .map((item) => item.romanization || "")
    .filter(Boolean)
    .join(" ");
}

const referenceMap = buildReferenceMap();
const canonicalMap = buildCanonicalMap(referenceMap);
const chunkSummary = buildChunkInventory();
const oversizedChunkSet = buildOversizedChunkSet();
const lessons = collectStageLessons(STAGE);

const touched = [];

for (const lesson of lessons) {
  const sourcePath = path.join(SOURCE_DIR, `${lesson}-source.json`);
  const source = readJson(sourcePath);
  let fileChanged = false;
  let rowChanges = 0;

  for (const row of source.rows || []) {
    let rowChanged = false;
    const nextBreakdown = [];

    for (const item of row.breakdown || []) {
      if (
        item?.thai &&
        !item?.grammar &&
        oversizedChunkSet.has(item.thai)
      ) {
        const split = splitOversizedChunk(item.thai, chunkSummary, oversizedChunkSet);
        if (split) {
          const replacementItems = [];
          let canReplace = true;
          for (const chunkThai of split) {
            const preferredRomanization =
              canonicalMap.get(chunkThai) || referenceMap.get(chunkThai) || null;
            const record = pickChunkRecord(chunkSummary, chunkThai, preferredRomanization);
            if (!record) {
              canReplace = false;
              break;
            }
            replacementItems.push(cloneChunkRecord(record, preferredRomanization));
          }
          if (canReplace) {
            nextBreakdown.push(...replacementItems);
            rowChanged = true;
            continue;
          }
        }
      }

      const nextItem = { ...item };
      const canonicalRomanization =
        canonicalMap.get(nextItem.thai) || referenceMap.get(nextItem.thai) || null;
      if (canonicalRomanization && nextItem.romanization !== canonicalRomanization) {
        nextItem.romanization = canonicalRomanization;
        rowChanged = true;
      }
      if (!Array.isArray(nextItem.tones) || nextItem.tones.length === 0) {
        const record = pickChunkRecord(
          chunkSummary,
          nextItem.thai,
          nextItem.romanization || canonicalRomanization || null,
        );
        if (record?.tones?.length) {
          nextItem.tones = [...record.tones];
          rowChanged = true;
        }
      }
      nextBreakdown.push(nextItem);
    }

    if (rowChanged) {
      row.breakdown = nextBreakdown;
    }

    const nextRomanization = joinRomanization(row);
    if (row.romanization !== nextRomanization) {
      row.romanization = nextRomanization;
      rowChanged = true;
    }

    if (rowChanged) {
      rowChanges += 1;
      fileChanged = true;
    }
  }

  if (fileChanged) {
    if (!DRY_RUN) {
      writeJson(sourcePath, source);
    }
    touched.push({ lesson, rowChanges });
  }
}

console.log(JSON.stringify({ dryRun: DRY_RUN, touched }, null, 2));
