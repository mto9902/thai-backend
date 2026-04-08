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

const STAGE = "B1.1";
const REFERENCE_STAGES = ["A1.1", "A1.2", "A2.1", "A2.2"];
const LESSONS = [
  "about-concerning-kiaw-kap",
  "also-kor",
  "beneficial-hai",
  "cause-result-jueng",
  "cause-result-phro-wa",
  "cause-result-tham-hai",
  "continuation-aspect",
  "do-in-advance-wai",
  "just-in-time-pho-di",
  "prefer-di-kwa",
  "rather-khon-khang",
  "reciprocal-kan",
  "sequence-jaak-nan",
  "sequence-laew-kor",
  "sequence-nai-thi-sut",
  "tend-to-mak-ja",
  "to-be-khue-vs-pen",
  "too-much-koen-pai",
];

const MANUAL_OVERRIDES = new Map([
  ["ของ", "khǎawng"],
  ["เขา", "khǎo"],
  ["ตอนเช้า", "dtawn-cháo"],
  ["ตอนเย็น", "dtawn-yen"],
  ["พ่อ", "phâw"],
  ["หนังสือ", "nǎng-sǔue"],
  ["ก่อน", "gàawn"],
  ["ของขวัญ", "khǎawng-khwǎn"],
  ["ชอบ", "chôop"],
  ["ซื้อ", "súue"],
  ["ตอบ", "dtɔ̀ɔp"],
  ["เพื่อน", "phûean"],
  ["ออก", "àawk"],
  ["ออกไป", "òrk-bpai"],
  ["ฉัน", "chǎn"],
  ["เดิน", "doen"],
  ["ได้", "dâi"],
  ["พรุ่งนี้", "phrûng-níi"],
  ["โทรศัพท์", "thoo-rá-sàp"],
  ["โทรหา", "thoo-hǎa"],
  ["ช้า", "châa"],
  ["เปียโน", "bpiia-noo"],
  ["วันศุกร์", "wan-sùk"],
  ["วันจันทร์", "wan-jan"],
  ["คุณพ่อ", "khun-phâw"],
  ["ว่ายน้ำ", "wâai-náam"],
  ["วันอาทิตย์", "wan-aa-thít"],
  ["กับครอบครัว", "gàp khrôop-khrua"],
  ["คำถามเดิม", "kham-thǎam deerm"],
  ["น้องชายฉัน", "nóng-chaai chǎn"],
  ["ทำการบ้าน", "tham gaan-bâan"],
  ["ลูกสาว", "lûuk-sǎao"],
  ["ฝึกเปียโน", "fùek bpiia-noo"],
  ["พนักงานใหม่", "phá-nák-ngaan mài"],
  ["เพื่อนร่วมงาน", "phûean-rûam-ngaan"],
  ["ปิดเร็ว", "bpìt reo"],
  ["ร้านอาหาร", "ráan-aa-hǎan"],
  ["มาตรวจ", "maa dtrùat"],
  ["คนไข้", "khon-khâi"],
  ["ไปวิ่ง", "bpai wîng"],
  ["ในวันหยุด", "nai wan yùt"],
  ["เพื่อนของฉัน", "phûean khǎawng chǎn"],
  ["ล่วงหน้า", "lûang nâa"],
  ["ซื้อกาแฟมา", "súue gaa-fae maa"],
  ["ก่อนทำงาน", "gàawn tham-ngaan"],
  ["ไปเดินเล่น", "bpai doen-lên"],
  ["เพื่อนๆ", "phûean-phûean"],
  ["ช่วยกัน", "chûay gan"],
  ["ทำความสะอาด", "tham khwaam sa-àat"],
  ["แก้ไข", "gâe-khǎi"],
  ["ธุรกิจ", "thú-rá-gìt"],
  ["เล็กๆ", "lék lék"],
  ["เชียงใหม่", "chiang-mài"],
  ["อาหาร", "aa-hǎan"],
  ["ได้รับรางวัล", "dâi-ráp rangwan"],
  ["ที่", "thîi"],
  ["สวนสาธารณะ", "sǔan sǎa-thaa-rá-ná"],
  ["ทำ", "tham"],
  ["อาหารเช้า", "aa-hǎan cháo"],
  ["ทำงาน", "tham-ngaan"],
  ["ล่วงเวลา", "lûang-wee-laa"],
]);

const CHUNK_FIXES = [
  {
    lesson: "about-concerning-kiaw-kap",
    thai: "เราฟังพอดแคสต์เกี่ยวกับธุรกิจเล็กๆ",
    apply(row) {
      replaceItem(row, "ธุรกิจเล็กๆ", [
        makeItem("ธุรกิจ", "business", "thú-rá-gìt"),
        makeItem("เล็กๆ", "small", "lék lék"),
      ]);
    },
  },
  {
    lesson: "about-concerning-kiaw-kap",
    thai: "เขาเขียนโพสต์เกี่ยวกับอาหารเชียงใหม่",
    apply(row) {
      replaceItem(row, "อาหารเชียงใหม่", [
        makeItem("อาหาร", "food", "aa-hǎan"),
        makeItem("เชียงใหม่", "Chiang Mai", "chiang-mài"),
      ]);
    },
  },
  {
    lesson: "reciprocal-kan",
    thai: "เราจะทำอาหารเช้ากันพรุ่งนี้",
    apply(row) {
      replaceItem(row, "ทำอาหารเช้า", [
        makeItem("ทำ", "make", "tham"),
        makeItem("อาหารเช้า", "breakfast", "aa-hǎan cháo"),
      ]);
    },
  },
  {
    lesson: "tend-to-mak-ja",
    thai: "เธอมักจะไปวิ่งที่สวนสาธารณะตอนเช้า",
    apply(row) {
      replaceItem(row, "ที่สวนสาธารณะ", [
        makeItem("ที่", "in", "thîi"),
        makeItem("สวนสาธารณะ", "public park", "sǔan sǎa-thaa-rá-ná"),
      ]);
    },
  },
  {
    lesson: "tend-to-mak-ja",
    thai: "พวกเขามักจะทำงานล่วงเวลาวันศุกร์",
    apply(row) {
      replaceItem(row, "ทำงานล่วงเวลา", [
        makeItem("ทำงาน", "work", "tham-ngaan"),
        makeItem("ล่วงเวลา", "overtime", "lûang-wee-laa"),
      ]);
    },
  },
  {
    lesson: "to-be-khue-vs-pen",
    thai: "เจนเป็นนักเขียนที่ได้รับรางวัล",
    apply(row) {
      replaceItem(row, "ที่ได้รับรางวัล", [
        makeItem("ที่", "that", "thîi"),
        makeItem("ได้รับรางวัล", "has won awards", "dâi-ráp rangwan"),
      ]);
    },
  },
];

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
  if (variant.includes("phôe")) score -= 20;
  if (variant.includes("chorp")) score -= 10;
  if (variant.includes("kăo") || variant.includes("khăo")) score -= 10;
  if (variant.includes("năng")) score -= 8;
  return score;
}

function loadReferenceMap() {
  const variants = new Map();
  for (const stage of REFERENCE_STAGES) {
    const inventory = readJson(
      path.join(AUDIT_ROOT, stage, "inventory-breakdown.json"),
    );
    for (const item of inventory) {
      if (!variants.has(item.thai)) {
        variants.set(item.thai, new Set());
      }
      variants.get(item.thai).add(item.romanization);
    }
  }

  const reference = new Map();
  for (const [thai, set] of variants.entries()) {
    if (set.size === 1) {
      reference.set(thai, [...set][0]);
    }
  }
  return reference;
}

function buildStageCanonicalMap() {
  const referenceMap = loadReferenceMap();
  const inventory = readJson(
    path.join(AUDIT_ROOT, STAGE, "inventory-breakdown.json"),
  );
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

  const canonical = new Map(MANUAL_OVERRIDES);
  for (const [thai, variants] of grouped.entries()) {
    if (canonical.has(thai)) {
      continue;
    }
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

function joinRomanization(row) {
  return (row.breakdown || [])
    .map((item) => item.romanization || "")
    .filter(Boolean)
    .join(" ");
}

const ITEM_TONE_OVERRIDES = new Map([
  ["\u0E2D\u0E32\u0E2B\u0E32\u0E23", ["mid", "rising"]],
  ["\u0E40\u0E0A\u0E35\u0E22\u0E07\u0E43\u0E2B\u0E21\u0E48", ["mid", "low"]],
  ["\u0E2D\u0E32\u0E2B\u0E32\u0E23\u0E40\u0E0A\u0E49\u0E32", ["mid", "rising", "high"]],
  [
    "\u0E2A\u0E27\u0E19\u0E2A\u0E32\u0E18\u0E32\u0E23\u0E13\u0E30",
    ["rising", "rising", "mid", "high", "high"],
  ],
  ["\u0E17\u0E33\u0E07\u0E32\u0E19", ["mid", "mid"]],
  ["\u0E25\u0E48\u0E27\u0E07\u0E40\u0E27\u0E25\u0E32", ["falling", "mid", "mid"]],
  [
    "\u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E23\u0E32\u0E07\u0E27\u0E31\u0E25",
    ["falling", "high", "mid", "mid"],
  ],
]);

function makeItem(thai, english, romanization, grammar = false) {
  const analysis = analyzeBreakdownTones({
    thai,
    romanization,
    providedTones: [],
  });
  return {
    thai,
    english,
    romanization,
    tones: analysis.tones.length
      ? analysis.tones
      : ITEM_TONE_OVERRIDES.get(thai) || [],
    ...(grammar ? { grammar: true } : {}),
  };
}

function replaceItem(row, targetThai, replacements) {
  const items = row.breakdown || [];
  const index = items.findIndex((item) => item.thai === targetThai);
  if (index === -1) {
    return false;
  }
  items.splice(index, 1, ...replacements);
  return true;
}

function applyChunkFixes(lesson, row) {
  let changed = false;
  for (const fix of CHUNK_FIXES) {
    if (fix.lesson !== lesson || fix.thai !== row.thai) {
      continue;
    }
    fix.apply(row);
    changed = true;
  }
  return changed;
}

const canonicalMap = buildStageCanonicalMap();
const touched = [];

for (const lesson of LESSONS) {
  const sourcePath = path.join(SOURCE_DIR, `${lesson}-source.json`);
  const source = readJson(sourcePath);
  let fileChanged = false;
  let rowChanges = 0;

  for (const row of source.rows || []) {
    let rowChanged = applyChunkFixes(lesson, row);

    for (const item of row.breakdown || []) {
      const canonical = canonicalMap.get(item.thai);
      if (canonical && item.romanization !== canonical) {
        item.romanization = canonical;
        rowChanged = true;
      }
    }

    const nextRowRomanization = joinRomanization(row);
    if (row.romanization !== nextRowRomanization) {
      row.romanization = nextRowRomanization;
      rowChanged = true;
    }

    if (rowChanged) {
      rowChanges += 1;
      fileChanged = true;
    }
  }

  if (fileChanged) {
    writeJson(sourcePath, source);
    touched.push({ lesson, rowChanges });
  }
}

console.log(JSON.stringify(touched, null, 2));
