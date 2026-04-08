import fs from "fs";
import path from "path";

import { analyzeBreakdownTones } from "../breakdownTone.js";

const SERVER_ROOT = process.cwd();
const SOURCE_DIR = path.join(SERVER_ROOT, "admin-data", "manual-source-lessons");
const AUDIT_DIR = path.join(
  SERVER_ROOT,
  "admin-data",
  "qa-exports",
  "romanization-audits",
  "B1.2",
);
const DRY_RUN = process.argv.includes("--dry-run");

const CANONICAL_ROMANIZATIONS = new Map([
  ["นอน", "nawn"],
  ["ชอบ", "châwp"],
  ["ตัว", "tua"],
  ["เรื่อง", "rûueang"],
  ["ก่อน", "gàawn"],
  ["บริษัท", "baw-ri-sat"],
  ["เธอ", "thoe"],
  ["ขึ้น", "khuen"],
  ["หา", "haa"],
  ["ซื้อ", "sʉ́ʉ"],
  ["ตอบ", "dtɔ̀ɔp"],
  ["ประตู", "prà-dtuu"],
  ["การตัดสินใจ", "gaan-dtàt-sǐn-jai"],
  ["ไว้", "wai"],
  ["กิน", "kin"],
  ["เสร็จ", "set"],
  ["ตรง", "dtrong"],
  ["ถนน", "thà-nǒn"],
  ["ทุกคน", "thuk khon"],
  ["นี้", "nii"],
  ["ช้า", "châa"],
  ["ให้", "hai"],
  ["แล้ว", "láaeo"],
]);

const SUPPLEMENTAL_CHUNKS = [
  ["ทะเลาะกัน", "argue", "thá-láw-gan", ["high", "high", "mid"]],
  ["ระหว่างทาง", "on the way", "rá-wàang thaang", ["high", "low", "mid"]],
  ["คนเดียว", "alone", "khon diao", ["mid", "mid"]],
  ["แถวนี้", "around here", "thǎeo-níi", ["rising", "high"]],
  ["เกือบหมด", "almost all gone", "gʉ̀ap mòt", ["low", "low"]],
  ["รายละเอียด", "details", "raai-lá-ìiat", ["mid", "high", "low"]],
  ["ที่เหลือ", "that remains", "thîi lʉ̌a", ["falling", "rising"]],
  ["ปัญหานี้", "this problem", "bpan-hǎa níi", ["mid", "rising", "high"]],
  ["ลองใหม่", "try again", "lawng mài", ["mid", "low"]],
  ["วันนี้", "today", "wan-níi", ["mid", "high"]],
  ["บริการ", "service", "baw-rí-gaan", ["mid", "high", "mid"]],
  ["ปลอดภัย", "safe", "bplàawt-phai", ["low", "mid"]],
  ["ยากๆ", "very hard", "yâak-yâak", ["falling", "falling"]],
  ["รถติด", "traffic jam", "rót-tìt", ["high", "low"]],
  ["พักผ่อน", "rest", "phák-phàwn", ["high", "low"]],
  ["หลายคน", "many people", "lǎai khon", ["rising", "mid"]],
  ["บ่น", "complain", "bon", ["low"]],
  ["ค่อย", "quite / gradually", "khoi", ["falling"]],
  ["แรก", "first", "raek", ["falling"]],
  ["คาด", "expect", "khaat", ["falling"]],
  ["ขบวน", "train / procession classifier", "khà-buan", ["low", "mid"]],
  ["ช่วง", "period", "chuang", ["falling"]],
  ["ส่วน", "part", "sùan", ["low"]],
];

const REPLACEMENT_PLANS = new Map([
  ["ต้องพาแม่ไปหาหมอ", ["ต้อง", "พา", "แม่", "ไป", "หา", "หมอ"]],
  ["ขึ้นรถไฟขบวนนั้น", ["ขึ้น", "รถไฟ", "ขบวน", "นั้น"]],
  ["เขารออยู่ตรงนี้", ["เขา", "รอ", "อยู่", "ตรง", "นี้"]],
  ["ถนนเส้นนี้รถติด", ["ถนน", "เส้น", "นี้", "รถติด"]],
  ["พ่อพักระหว่างทาง", ["พ่อ", "พัก", "ระหว่างทาง"]],
  ["ฉันรู้สึกกังวล", ["ฉัน", "รู้สึก", "กังวล"]],
  ["คนรอบตัวก็ยิ้มตาม", ["คน", "รอบ", "ตัว", "ก็", "ยิ้ม", "ตาม"]],
  ["ร้านนี้ลดราคา", ["ร้าน", "นี้", "ลด", "ราคา"]],
  ["ตารางของทุกคน", ["ตาราง", "ของ", "ทุกคน"]],
  ["ไม่เจอรถติดมาก", ["ไม่", "เจอ", "รถติด", "มาก"]],
  ["ไม่ต้องรีบพรุ่งนี้", ["ไม่", "ต้อง", "รีบ", "พรุ่งนี้"]],
  ["ไปถึงก่อนเวลา", ["ไป", "ถึง", "ก่อน", "เวลา"]],
  ["กินยาแล้วพักผ่อน", ["กิน", "ยา", "แล้ว", "พักผ่อน"]],
  ["ไม่ต้องไปคนเดียว", ["ไม่", "ต้อง", "ไป", "คนเดียว"]],
  ["เก็บของให้เรียบร้อย", ["เก็บ", "ของ", "ให้", "เรียบร้อย"]],
  ["คนที่พักแถวนี้", ["คน", "ที่", "พัก", "แถวนี้"]],
  ["คนที่มีเวลาน้อย", ["คน", "ที่", "มี", "เวลา", "น้อย"]],
  ["บริการวันนี้", ["บริการ", "วันนี้"]],
  ["ช้ากว่าปกติ", ["ช้า", "กว่า", "ปกติ"]],
  ["ร้านนี้ลูกค้าน้อยลง", ["ร้าน", "นี้", "ลูกค้า", "น้อย", "ลง"]],
  ["ทางนี้ปลอดภัยกว่า", ["ทาง", "นี้", "ปลอดภัย", "กว่า"]],
  ["งานส่วนนี้เสร็จเกือบหมดแล้ว", ["งาน", "ส่วน", "นี้", "เสร็จ", "เกือบหมด", "แล้ว"]],
  ["ผ่านช่วงยากๆได้", ["ผ่าน", "ช่วง", "ยากๆ", "ได้"]],
  ["ฟังให้จบก่อนตอบ", ["ฟัง", "ให้", "จบ", "ก่อน", "ตอบ"]],
  ["ปัญหานี้ไม่คาดไว้", ["ปัญหานี้", "ไม่", "คาด", "ไว้"]],
  ["ฉันก็ยังอ่านก่อนนอน", ["ฉัน", "ก็", "ยัง", "อ่าน", "ก่อน", "นอน"]],
  ["เขาก็ตามงานทัน", ["เขา", "ก็", "ตาม", "งาน", "ทัน"]],
  ["เธอจะไม่เห็นด้วย", ["เธอ", "จะ", "ไม่", "เห็น", "ด้วย"]],
  ["เธอก็ฟังจนจบ", ["เธอ", "ก็", "ฟัง", "จน", "จบ"]],
  ["ฉันก็ยังจำรายละเอียดได้", ["ฉัน", "ก็", "ยัง", "จำ", "รายละเอียด", "ได้"]],
  ["งานก็เดินต่อได้", ["งาน", "ก็", "เดิน", "ต่อ", "ได้"]],
  ["ผลจะยังไม่ชัด", ["ผล", "จะ", "ยัง", "ไม่", "ชัด"]],
  ["ข้อมูลจะยังไม่ครบ", ["ข้อมูล", "จะ", "ยัง", "ไม่", "ครบ"]],
  ["ฉันก็ลองใหม่อีกครั้ง", ["ฉัน", "ก็", "ลองใหม่", "อีก", "ครั้ง"]],
  ["จะต้องใช้เวลาหน่อย", ["จะ", "ต้อง", "ใช้", "เวลา", "หน่อย"]],
  ["พ่อยังช่วยยกของ", ["พ่อ", "ยัง", "ช่วย", "ยก", "ของ"]],
  ["หลายคนก็ทำผิด", ["หลายคน", "ก็", "ทำ", "ผิด"]],
  ["คนก็ยังบ่นว่าร้อน", ["คน", "ก็", "ยัง", "บ่น", "ว่า", "ร้อน"]],
  ["เขาก็กินหมดจาน", ["เขา", "ก็", "กิน", "หมด", "จาน"]],
  ["คนก็ยังไม่ค่อยซื้อ", ["คน", "ก็", "ยัง", "ไม่", "ค่อย", "ซื้อ"]],
  ["ก็ยังไม่ทันรอบแรก", ["ก็", "ยัง", "ไม่", "ทัน", "รอบ", "แรก"]],
  ["เวลาที่เหลือ", ["เวลา", "ที่เหลือ"]],
  ["ไม่เหมาะกับ", ["ไม่", "เหมาะ", "กับ"]],
  ["เราเตรียมตัวดี", ["เรา", "เตรียม", "ตัว", "ดี"]],
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function scoreRomanization(romanization, frequency) {
  let score = Number(frequency || 0) * 100;
  if (/[\u0300-\u036fʉɔɛǎěǒǔâáàêéèîíìôóòûúù]/u.test(romanization)) {
    score += 15;
  }
  if (romanization.includes("-")) {
    score += 5;
  }
  return score;
}

function buildChunkInventory() {
  const inventory = new Map();

  for (const file of fs.readdirSync(SOURCE_DIR)) {
    if (!file.endsWith("-source.json")) {
      continue;
    }
    const source = readJson(path.join(SOURCE_DIR, file));
    for (const row of source.rows || []) {
      for (const item of row.breakdown || []) {
        if (!item?.thai || !item?.romanization || !Array.isArray(item.tones) || item.tones.length === 0) {
          continue;
        }
        const variants = inventory.get(item.thai) || [];
        variants.push({
          thai: item.thai,
          english: item.english || "",
          romanization: item.romanization,
          tones: [...item.tones],
          tone: item.tone || null,
          grammar: item.grammar === true,
          displayThaiSegments: Array.isArray(item.displayThaiSegments)
            ? [...item.displayThaiSegments]
            : null,
          supplemental: false,
        });
        inventory.set(item.thai, variants);
      }
    }
  }

  for (const [thai, english, romanization, tones] of SUPPLEMENTAL_CHUNKS) {
    const variants = inventory.get(thai) || [];
    variants.push({
      thai,
      english,
      romanization,
      tones: [...tones],
      tone: tones.length === 1 ? tones[0] : null,
      grammar: false,
      displayThaiSegments: null,
      supplemental: true,
    });
    inventory.set(thai, variants);
  }

  return inventory;
}

function pickChunkRecord(chunkInventory, thai) {
  const variants = chunkInventory.get(thai);
  if (!variants || variants.length === 0) {
    return null;
  }

  const preferredRomanization = CANONICAL_ROMANIZATIONS.get(thai);
  if (preferredRomanization) {
    const preferred = variants.find((entry) => entry.romanization === preferredRomanization);
    if (preferred) {
      return preferred;
    }
  }

  return variants
    .map((entry) => ({
      entry,
      score: scoreRomanization(entry.romanization, entry.supplemental ? 1 : 5),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.entry.romanization.localeCompare(right.entry.romanization),
    )[0].entry;
}

function cloneChunkRecord(record, thai) {
  const romanization = CANONICAL_ROMANIZATIONS.get(thai) || record.romanization;
  const analysis = analyzeBreakdownTones({
    thai,
    romanization,
    providedTones: Array.isArray(record.tones) ? record.tones : [],
  });

  return {
    thai,
    english: record.english,
    romanization,
    tones: analysis.tones.length ? analysis.tones : [...record.tones],
    ...(analysis.tones.length === 1 ? { tone: analysis.tones[0] } : {}),
    ...(record.grammar ? { grammar: true } : {}),
    ...(record.displayThaiSegments ? { displayThaiSegments: [...record.displayThaiSegments] } : {}),
  };
}

function collectB12Lessons() {
  const inventory = readJson(path.join(AUDIT_DIR, "inventory-sentence.json"));
  return [...new Set(inventory.map((item) => item.grammar_id))].sort();
}

const chunkInventory = buildChunkInventory();
const lessons = collectB12Lessons();
const touched = [];
const missingChunks = new Map();

for (const lesson of lessons) {
  const sourcePath = path.join(SOURCE_DIR, `${lesson}-source.json`);
  const source = readJson(sourcePath);
  let rowChanges = 0;

  for (const row of source.rows || []) {
    let changed = false;
    const nextBreakdown = [];

    for (const item of row.breakdown || []) {
      const splitPlan = item?.grammar ? null : REPLACEMENT_PLANS.get(item.thai);
      if (splitPlan) {
        const replacementItems = [];
        let canReplace = true;
        for (const chunkThai of splitPlan) {
          const record = pickChunkRecord(chunkInventory, chunkThai);
          if (!record) {
            const missKey = `${item.thai} -> ${chunkThai}`;
            missingChunks.set(missKey, {
              lesson,
              source: item.thai,
              missing: chunkThai,
            });
            canReplace = false;
            break;
          }
          replacementItems.push(cloneChunkRecord(record, chunkThai));
        }
        if (!canReplace) {
          nextBreakdown.push(item);
          continue;
        }
        nextBreakdown.push(...replacementItems);
        changed = true;
        continue;
      }

      const nextItem = {
        ...item,
        ...(Array.isArray(item.tones) ? { tones: [...item.tones] } : {}),
        ...(Array.isArray(item.displayThaiSegments)
          ? { displayThaiSegments: [...item.displayThaiSegments] }
          : {}),
      };
      const canonicalRomanization = CANONICAL_ROMANIZATIONS.get(nextItem.thai);
      if (canonicalRomanization && nextItem.romanization !== canonicalRomanization) {
        nextItem.romanization = canonicalRomanization;
        changed = true;
      }
      nextBreakdown.push(nextItem);
    }

    const joinedRomanization = nextBreakdown
      .map((item) => item.romanization || "")
      .filter(Boolean)
      .join(" ");

    if (changed || row.romanization !== joinedRomanization) {
      row.breakdown = nextBreakdown;
      row.romanization = joinedRomanization;
      rowChanges += 1;
    }
  }

  if (rowChanges > 0) {
    touched.push({ lesson, rowChanges });
    if (!DRY_RUN) {
      writeJson(sourcePath, source);
    }
  }
}

const summary = {
  dryRun: DRY_RUN,
  touched,
  missingChunks: [...missingChunks.values()],
};

console.log(JSON.stringify(summary, null, 2));

if (missingChunks.size > 0) {
  process.exitCode = 1;
}
