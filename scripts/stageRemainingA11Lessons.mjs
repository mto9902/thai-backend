import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { fileURLToPath } from "url";

import { pool } from "../db.js";
import { analyzeBreakdownTones } from "../breakdownTone.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const GENERATED_DIR = path.join(ROOT, "admin-data", "generated-candidates");
const SOURCE_DIR = path.join(ROOT, "admin-data", "manual-source-lessons");
const GRAMMAR_DIR = path.join(ROOT, "grammar");
const GRAMMAR_EXAMPLES_TABLE = "grammar_examples";
const GRAMMAR_LESSON_PRODUCTION_TABLE = "grammar_lesson_production";
const STAGE = "A1.1";
const NOTE = "Manual New Gen staged 2026-04-06";

const TITLES = {
  "question-words": "Basic Question Words",
  adjectives: "Adjectives as Predicates",
  "this-that": "Demonstratives นี้ / นั้น / โน่น",
  "go-come-pai-maa": "Movement with ไป / มา",
  "origin-maa-jaak": "Origin with มาจาก",
  "not-identity-mai-chai": "Noun Negation with ไม่ใช่",
  "natural-address-pronouns": "Natural Address and Pronoun Dropping",
  "place-words": "Place Words",
};

const TONE_FALLBACKS = new Map([
  ["อะไร", ["low", "mid"]],
  ["มาจาก", ["mid", "low"]],
  ["กาแฟ", ["mid", "mid"]],
  ["อาหาร", ["mid", "rising"]],
  ["ใจดี", ["mid", "mid"]],
  ["ที่ไหน", ["falling", "high"]],
  ["ที่นี่", ["falling", "falling"]],
  ["ที่บ้าน", ["falling", "falling"]],
  ["ที่ร้าน", ["falling", "high"]],
  ["ที่ตลาด", ["falling", "low", "low"]],
  ["เรา", ["mid"]],
  ["อเมริกา", ["low", "mid", "high", "mid"]],
  ["อินเดีย", ["mid", "mid", "mid"]],
  ["ผู้ชาย", ["falling", "mid"]],
  ["คนไทย", ["mid", "mid"]],
  ["นักเรียน", ["high", "mid"]],
  ["ตู้เย็น", ["falling", "mid"]],
  ["ลูกบอล", ["falling", "mid"]],
  ["กระเป๋า", ["low", "rising"]],
  ["เตียง", ["mid"]],
  ["โทรศัพท์", ["mid", "high", "low"]],
  ["บน", ["mid"]],
  ["กระเป๋าสตางค์", ["low", "rising", "low", "mid"]],
  ["โต๊ะอาหาร", ["high", "mid", "rising"]],
  ["นาฬิกา", ["mid", "high", "mid"]],
  ["ผนัง", ["low", "rising"]],
  ["ลูกแมว", ["falling", "mid"]],
  ["กระเป๋าเดินทาง", ["low", "rising", "mid", "mid"]],
  ["แว่นตา", ["falling", "mid"]],
  ["ชั้นวางของ", ["high", "mid", "rising"]],
  ["ปลอกหมอน", ["low", "rising"]],
  ["แปรงสีฟัน", ["high", "rising", "mid"]],
  ["คอมพิวเตอร์", ["mid", "high", "falling"]],
  ["ผงซักฟอก", ["rising", "high", "falling"]],
  ["ซิงค์ล้างจาน", ["mid", "high", "mid"]],
  ["กระป๋องน้ำ", ["low", "rising", "high"]],
  ["ผ้าขนหนู", ["falling", "rising", "rising"]],
  ["นิตยสาร", ["high", "low", "high", "rising"]],
  ["หมอน", ["rising"]],
  ["รองเท้า", ["mid", "high"]],
  ["หนังสือ", ["rising", "rising"]],
]);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanText(value) {
  return String(value ?? "").replace(/^\uFEFF/, "").replace(/\u0000/g, "").trim();
}

function item(thai, english, romanization, tones, options = {}) {
  const next = {
    thai: cleanText(thai),
    english: cleanText(english),
    romanization: cleanText(romanization),
    tones: tones.map((tone) => cleanText(tone).toLowerCase()),
  };
  if (options.grammar === true) {
    next.grammar = true;
  }
  return next;
}

function row(thai, romanization, english, breakdown, difficulty = "easy") {
  return {
    thai: cleanText(thai),
    romanization: cleanText(romanization),
    english: cleanText(english),
    difficulty,
    breakdown,
  };
}

async function readCsvRows(grammarId) {
  const rows = [];
  const filePath = path.join(GRAMMAR_DIR, `${grammarId}.csv`);
  await new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (entry) => rows.push(entry))
      .on("end", resolve)
      .on("error", reject);
  });
  return rows.map((entry) => ({
    thai: cleanText(entry.thai),
    romanization: cleanText(entry.romanization),
    english: cleanText(entry.english),
    difficulty: cleanText(entry.difficulty || "easy") || "easy",
    breakdown: JSON.parse(entry.breakdown).map((part) => ({
      thai: cleanText(part.thai),
      english: cleanText(part.english),
      romanization: cleanText(part.romanization),
      tones: Array.isArray(part.tones)
        ? part.tones.map((tone) => cleanText(tone).toLowerCase()).filter(Boolean)
        : [],
      grammar: part.grammar === true,
    })),
  }));
}

function ensureBreakdownTones(breakdown) {
  return breakdown.map((part) => {
    let tones = Array.isArray(part.tones) ? part.tones.filter(Boolean) : [];
    if (tones.length === 0) {
      const inferred = analyzeBreakdownTones({
        thai: part.thai,
        romanization: part.romanization,
      });
      tones = Array.isArray(inferred.tones) ? inferred.tones : [];
    }
    if (tones.length === 0 && TONE_FALLBACKS.has(part.thai)) {
      tones = TONE_FALLBACKS.get(part.thai);
    }
    if (tones.length === 0) {
      throw new Error(`Missing tones for breakdown item "${part.thai}"`);
    }
    const next = {
      thai: cleanText(part.thai),
      english: cleanText(part.english),
      romanization: cleanText(part.romanization),
      tones,
    };
    if (part.grammar === true) {
      next.grammar = true;
    }
    return next;
  });
}

function finalizeRows(rows) {
  return rows.map((entry) => ({
    ...entry,
    thai: cleanText(entry.thai),
    romanization: cleanText(entry.romanization),
    english: cleanText(entry.english),
    difficulty: cleanText(entry.difficulty || "easy") || "easy",
    breakdown: ensureBreakdownTones(entry.breakdown),
  }));
}

function buildNaturalAddressRows() {
  return [
    row("หนูหิวแล้ว", "nǔu hǐu láew", "I'm hungry.", [
      item("หนู", "I (younger speaker)", "nǔu", ["rising"]),
      item("หิว", "hungry", "hǐu", ["rising"]),
      item("แล้ว", "already", "láew", ["high"]),
    ]),
    row("หนูอยากกลับบ้าน", "nǔu yàak glàp-bâan", "I want to go home.", [
      item("หนู", "I (younger speaker)", "nǔu", ["rising"]),
      item("อยาก", "want", "yàak", ["low"]),
      item("กลับบ้าน", "go home", "glàp-bâan", ["low", "falling"]),
    ]),
    row("พี่ไปก่อนนะ", "phîi bpai gàwn ná", "I'll head out first.", [
      item("พี่", "I / older sibling", "phîi", ["falling"]),
      item("ไป", "go", "bpai", ["mid"]),
      item("ก่อน", "first / ahead", "gàwn", ["low"]),
      item("นะ", "soft particle", "ná", ["high"]),
    ]),
    row("พี่ขอดูเมนูหน่อย", "phîi kǎw duu mee-nuu nòi", "Can I see the menu?", [
      item("พี่", "I / older sibling", "phîi", ["falling"]),
      item("ขอ", "ask to / may I", "kǎw", ["rising"]),
      item("ดู", "look at", "duu", ["mid"]),
      item("เมนู", "menu", "mee-nuu", ["mid", "mid"]),
      item("หน่อย", "a bit / please", "nòi", ["low"]),
    ]),
    row("เราง่วงมาก", "rao ngûang mâak", "I'm really sleepy.", [
      item("เรา", "I / we", "rao", ["mid"]),
      item("ง่วง", "sleepy", "ngûang", ["falling"]),
      item("มาก", "very", "mâak", ["falling"]),
    ]),
    row("เราไม่เอาเผ็ด", "rao mâi ao phèt", "I don't want it spicy.", [
      item("เรา", "I / we", "rao", ["mid"]),
      item("ไม่", "not", "mâi", ["falling"]),
      item("เอา", "want / take", "ao", ["mid"]),
      item("เผ็ด", "spicy", "phèt", ["low"]),
    ]),
    row("แม่กำลังทำกับข้าว", "mâe gam-lang tham gàp-khâao", "I'm cooking right now.", [
      item("แม่", "I / Mom", "mâe", ["falling"]),
      item("กำลัง", "currently", "gam-lang", ["mid", "mid"]),
      item("ทำกับข้าว", "cook", "tham gàp-khâao", ["mid", "low", "falling"]),
    ]),
    row("พ่อกลับดึกหน่อยนะ", "phâw glàp dèuk nòi ná", "I'll be home a little late.", [
      item("พ่อ", "I / Dad", "phâw", ["falling"]),
      item("กลับ", "return", "glàp", ["low"]),
      item("ดึก", "late", "dèuk", ["low"]),
      item("หน่อย", "a bit", "nòi", ["low"]),
      item("นะ", "soft particle", "ná", ["high"]),
    ]),
    row("ครูจะเก็บการบ้านแล้วนะ", "khruu jà gèp gaan-bâan láew ná", "I'm about to collect the homework.", [
      item("ครู", "I / teacher", "khruu", ["mid"]),
      item("จะ", "about to / will", "jà", ["low"]),
      item("เก็บ", "collect", "gèp", ["low"]),
      item("การบ้าน", "homework", "gaan-bâan", ["mid", "falling"]),
      item("แล้ว", "already / now", "láew", ["high"]),
      item("นะ", "soft particle", "ná", ["high"]),
    ]),
    row("หมอขอตรวจแป๊บนึงนะ", "mǎw kǎw dtrùat bpáep-neung ná", "Let me take a quick look.", [
      item("หมอ", "I / doctor", "mǎw", ["rising"]),
      item("ขอ", "ask to / let me", "kǎw", ["rising"]),
      item("ตรวจ", "check / examine", "dtrùat", ["low"]),
      item("แป๊บนึง", "a second", "bpáep-neung", ["high", "mid"]),
      item("นะ", "soft particle", "ná", ["high"]),
    ]),
    row("ไปก่อนนะ", "bpai gàwn ná", "I'm heading out now.", [
      item("ไป", "go", "bpai", ["mid"]),
      item("ก่อน", "first / ahead", "gàwn", ["low"]),
      item("นะ", "soft particle", "ná", ["high"]),
    ]),
    row("ถึงบ้านแล้ว", "thǔeng bâan láew", "I'm home now.", [
      item("ถึง", "arrive", "thǔeng", ["rising"]),
      item("บ้าน", "home", "bâan", ["falling"]),
      item("แล้ว", "already / now", "láew", ["high"]),
    ]),
    row("ยังไม่หิว", "yang mâi hǐu", "I'm not hungry yet.", [
      item("ยัง", "yet / still", "yang", ["mid"]),
      item("ไม่", "not", "mâi", ["falling"]),
      item("หิว", "hungry", "hǐu", ["rising"]),
    ]),
    row("ไม่เอาแล้ว", "mâi ao láew", "I don't want it anymore.", [
      item("ไม่", "not", "mâi", ["falling"]),
      item("เอา", "want / take", "ao", ["mid"]),
      item("แล้ว", "already / anymore", "láew", ["high"]),
    ]),
    row("รอแป๊บนึง", "raw bpáep-neung", "Wait a second.", [
      item("รอ", "wait", "raw", ["mid"]),
      item("แป๊บนึง", "a second", "bpáep-neung", ["high", "mid"]),
    ]),
    row("ขอคิดดูก่อน", "kǎw khít duu gàwn", "Let me think first.", [
      item("ขอ", "ask to / let me", "kǎw", ["rising"]),
      item("คิด", "think", "khít", ["high"]),
      item("ดู", "try / think it over", "duu", ["mid"]),
      item("ก่อน", "first", "gàwn", ["low"]),
    ]),
    row("พี่ยังไม่ว่างนะ", "phîi yang mâi wâang ná", "I'm still busy.", [
      item("พี่", "I / older sibling", "phîi", ["falling"]),
      item("ยัง", "still", "yang", ["mid"]),
      item("ไม่", "not", "mâi", ["falling"]),
      item("ว่าง", "free / available", "wâang", ["falling"]),
      item("นะ", "soft particle", "ná", ["high"]),
    ]),
    row("หนูไม่ชอบผัก", "nǔu mâi chôop phàk", "I don't like vegetables.", [
      item("หนู", "I (younger speaker)", "nǔu", ["rising"]),
      item("ไม่", "not", "mâi", ["falling"]),
      item("ชอบ", "like", "chôop", ["falling"]),
      item("ผัก", "vegetables", "phàk", ["low"]),
    ]),
    row("เราอยู่ตรงนี้", "rao yùu dtrong níi", "I'm right here.", [
      item("เรา", "I / we", "rao", ["mid"]),
      item("อยู่", "be / stay", "yùu", ["low"]),
      item("ตรงนี้", "right here", "dtrong níi", ["mid", "high"]),
    ]),
    row("แม่ทำเสร็จแล้ว", "mâe tham sèt láew", "I'm done cooking.", [
      item("แม่", "I / Mom", "mâe", ["falling"]),
      item("ทำ", "do / make", "tham", ["mid"]),
      item("เสร็จ", "finish", "sèt", ["low"]),
      item("แล้ว", "already", "láew", ["high"]),
    ]),
    row("พ่อเปิดประตูให้แล้ว", "phâw bpə̀ət prà-tuu hâi láew", "I opened the door for you.", [
      item("พ่อ", "I / Dad", "phâw", ["falling"]),
      item("เปิด", "open", "bpə̀ət", ["low"]),
      item("ประตู", "door", "prà-tuu", ["low", "mid"]),
      item("ให้", "for", "hâi", ["falling"]),
      item("แล้ว", "already", "láew", ["high"]),
    ]),
    row("ครูขอชื่อหน่อย", "khruu kǎw chʉ̂ʉ nòi", "Can I have your name?", [
      item("ครู", "I / teacher", "khruu", ["mid"]),
      item("ขอ", "ask for", "kǎw", ["rising"]),
      item("ชื่อ", "name", "chʉ̂ʉ", ["falling"]),
      item("หน่อย", "a bit / please", "nòi", ["low"]),
    ]),
    row("หมอจะอธิบายอีกทีนะ", "mǎw jà à-thí-baai ìik thii ná", "I'll explain it again.", [
      item("หมอ", "I / doctor", "mǎw", ["rising"]),
      item("จะ", "will", "jà", ["low"]),
      item("อธิบาย", "explain", "à-thí-baai", ["low", "high", "mid"]),
      item("อีกที", "again", "ìik thii", ["low", "mid"]),
      item("นะ", "soft particle", "ná", ["high"]),
    ]),
    row("น้องช่วยถือหน่อย", "nóng chûay thǔue nòi", "Can you hold this for a second?", [
      item("น้อง", "younger person", "nóng", ["high"]),
      item("ช่วย", "help", "chûay", ["falling"]),
      item("ถือ", "hold", "thǔue", ["rising"]),
      item("หน่อย", "a bit / please", "nòi", ["low"]),
    ]),
    row("พี่ไปส่งที่หน้าบ้านนะ", "phîi bpai sòng thîi nâa bâan ná", "I'll drop you off in front of the house.", [
      item("พี่", "I / older sibling", "phîi", ["falling"]),
      item("ไปส่ง", "go drop off", "bpai sòng", ["mid", "low"]),
      item("ที่", "at", "thîi", ["falling"]),
      item("หน้าบ้าน", "in front of the house", "nâa bâan", ["falling", "falling"]),
      item("นะ", "soft particle", "ná", ["high"]),
    ]),
  ];
}

function applyQuestionWordOverrides(rows) {
  const next = [...rows];
  next[1] = row("ใครชอบกาแฟ", "khrai chôop gaa-fae", "Who likes coffee?", [
    item("ใคร", "who", "khrai", ["mid"], { grammar: true }),
    item("ชอบ", "like", "chôop", ["falling"]),
    item("กาแฟ", "coffee", "gaa-fae", ["mid", "mid"]),
  ]);
  next[3] = row("ใครมาวันนี้", "khrai maa wan-níi", "Who came today?", [
    item("ใคร", "who", "khrai", ["mid"], { grammar: true }),
    item("มา", "come", "maa", ["mid"]),
    item("วันนี้", "today", "wan-níi", ["mid", "high"]),
  ]);
  next[6] = row("เธอฟังเพลงอะไร", "thoe fang phleeng à-rai", "What song is she listening to?", [
    item("เธอ", "she", "thoe", ["mid"]),
    item("ฟัง", "listen to", "fang", ["mid"]),
    item("เพลง", "song", "phleeng", ["mid"]),
    item("อะไร", "what", "à-rai", ["low", "mid"], { grammar: true }),
  ]);
  next[7] = row("แม่ทำอะไร", "mâe tham à-rai", "What is Mom doing?", [
    item("แม่", "Mom", "mâe", ["falling"]),
    item("ทำ", "do", "tham", ["mid"]),
    item("อะไร", "what", "à-rai", ["low", "mid"], { grammar: true }),
  ]);
  next[8] = row("พ่อดูอะไร", "phâw duu à-rai", "What is Dad watching?", [
    item("พ่อ", "Dad", "phâw", ["falling"]),
    item("ดู", "watch", "duu", ["mid"]),
    item("อะไร", "what", "à-rai", ["low", "mid"], { grammar: true }),
  ]);
  next[22] = row("เพื่อนดูอะไร", "phûean duu à-rai", "What is your friend watching?", [
    item("เพื่อน", "friend", "phûean", ["falling"]),
    item("ดู", "watch", "duu", ["mid"]),
    item("อะไร", "what", "à-rai", ["low", "mid"], { grammar: true }),
  ]);
  return next;
}

function applyNotIdentityOverrides(rows) {
  const next = [...rows];
  next[8] = row("เขาไม่ใช่คนขับรถ", "khǎo mâi-châi khon-khàp-rót", "He isn't the driver.", [
    item("เขา", "he", "khǎo", ["rising"]),
    item("ไม่ใช่", "is not", "mâi-châi", ["falling", "falling"], { grammar: true }),
    item("คนขับรถ", "driver", "khon-khàp-rót", ["mid", "low", "high"]),
  ]);
  next[9] = row("เธอไม่ใช่นักเรียน", "thoe mâi-châi nák-rian", "She isn't a student.", [
    item("เธอ", "she", "thoe", ["mid"]),
    item("ไม่ใช่", "is not", "mâi-châi", ["falling", "falling"], { grammar: true }),
    item("นักเรียน", "student", "nák-rian", ["high", "mid"]),
  ]);
  next[14] = row("ครูไม่ใช่หมอ", "khruu mâi-châi mǎw", "The teacher isn't a doctor.", [
    item("ครู", "teacher", "khruu", ["mid"]),
    item("ไม่ใช่", "is not", "mâi-châi", ["falling", "falling"], { grammar: true }),
    item("หมอ", "doctor", "mǎw", ["rising"]),
  ]);
  next[15] = row("เพื่อนไม่ใช่หมอ", "phûean mâi-châi mǎw", "My friend isn't a doctor.", [
    item("เพื่อน", "my friend", "phûean", ["falling"]),
    item("ไม่ใช่", "is not", "mâi-châi", ["falling", "falling"], { grammar: true }),
    item("หมอ", "doctor", "mǎw", ["rising"]),
  ]);
  return next;
}

async function buildLessons() {
  const questionWords = applyQuestionWordOverrides(
    await readCsvRows("question-words"),
  );
  const adjectives = await readCsvRows("adjectives");
  const thisThat = await readCsvRows("this-that");
  const goCome = await readCsvRows("go-come-pai-maa");
  const origin = await readCsvRows("origin-maa-jaak");
  const notIdentity = applyNotIdentityOverrides(
    await readCsvRows("not-identity-mai-chai"),
  );
  const placeWords = await readCsvRows("place-words");
  const naturalAddress = buildNaturalAddressRows();

  return {
    "question-words": { lessonTitle: TITLES["question-words"], rows: finalizeRows(questionWords) },
    adjectives: { lessonTitle: TITLES.adjectives, rows: finalizeRows(adjectives) },
    "this-that": { lessonTitle: TITLES["this-that"], rows: finalizeRows(thisThat) },
    "go-come-pai-maa": { lessonTitle: TITLES["go-come-pai-maa"], rows: finalizeRows(goCome) },
    "origin-maa-jaak": { lessonTitle: TITLES["origin-maa-jaak"], rows: finalizeRows(origin) },
    "not-identity-mai-chai": { lessonTitle: TITLES["not-identity-mai-chai"], rows: finalizeRows(notIdentity) },
    "natural-address-pronouns": { lessonTitle: TITLES["natural-address-pronouns"], rows: finalizeRows(naturalAddress) },
    "place-words": { lessonTitle: TITLES["place-words"], rows: finalizeRows(placeWords) },
  };
}

function writeLessonFiles(grammarId, lesson) {
  const finalLesson = {
    lessonId: grammarId,
    stage: STAGE,
    lessonTitle: lesson.lessonTitle,
    rows: lesson.rows.map((entry) => ({
      thai: entry.thai,
      english: entry.english,
    })),
  };

  const sourceLesson = {
    grammarId,
    rows: lesson.rows,
  };

  fs.writeFileSync(
    path.join(GENERATED_DIR, `${grammarId}-final25-reviewed.json`),
    `${JSON.stringify(finalLesson, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(SOURCE_DIR, `${grammarId}-source.json`),
    `${JSON.stringify(sourceLesson, null, 2)}\n`,
    "utf8",
  );
}

function makeToneAnalysis() {
  return {
    status: "approved",
    confidence: 100,
    source: "manual-new-gen",
    needsReview: false,
    reasons: [],
    unresolvedItemCount: 0,
    breakdown: [],
  };
}

async function stageLesson(client, grammarId, lesson) {
  const waveId = `${grammarId}-manual-${Date.now()}`;
  const sortResult = await client.query(
    `
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order
    FROM ${GRAMMAR_EXAMPLES_TABLE}
    WHERE grammar_id = $1
    `,
    [grammarId],
  );
  const baseSortOrder = Number(sortResult.rows[0]?.next_sort_order ?? 0);

  await client.query(
    `
    INSERT INTO ${GRAMMAR_LESSON_PRODUCTION_TABLE} (
      grammar_id,
      stage,
      final_target_count,
      first_pass_candidate_target,
      supplemental_candidate_batch_size,
      current_rewrite_wave_id,
      notes,
      last_generated_at,
      created_at,
      updated_at
    ) VALUES ($1, $2, 25, 40, 10, $3, $4, NOW(), NOW(), NOW())
    ON CONFLICT (grammar_id)
    DO UPDATE SET
      stage = EXCLUDED.stage,
      current_rewrite_wave_id = EXCLUDED.current_rewrite_wave_id,
      notes = EXCLUDED.notes,
      last_generated_at = NOW(),
      updated_at = NOW()
    `,
    [grammarId, STAGE, waveId, NOTE],
  );

  await client.query(
    `
    UPDATE ${GRAMMAR_EXAMPLES_TABLE}
    SET publish_state = 'retired', updated_at = NOW()
    WHERE grammar_id = $1
      AND publish_state = 'staged'
    `,
    [grammarId],
  );

  for (const [index, currentRow] of lesson.rows.entries()) {
    const toneAnalysis = makeToneAnalysis();
    await client.query(
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
      ) VALUES (
        $1, $2, $3, $4, $5::jsonb, $6, $7, 100, 'approved', $8::jsonb,
        'approved', $9, 'staged', $10, NULL, $11::jsonb,
        NULL, NULL, NULL, NULL, NULL, NOW(), NULL, NOW()
      )
      `,
      [
        grammarId,
        currentRow.thai,
        currentRow.romanization,
        currentRow.english,
        JSON.stringify(currentRow.breakdown),
        currentRow.difficulty,
        baseSortOrder + index,
        JSON.stringify(toneAnalysis),
        NOTE,
        waveId,
        JSON.stringify(["new_gen"]),
      ],
    );
  }
}

async function main() {
  ensureDir(GENERATED_DIR);
  ensureDir(SOURCE_DIR);

  const lessons = await buildLessons();
  for (const [grammarId, lesson] of Object.entries(lessons)) {
    writeLessonFiles(grammarId, lesson);
  }

  const client = await pool.connect();
  try {
    for (const [grammarId, lesson] of Object.entries(lessons)) {
      await client.query("BEGIN");
      try {
        await stageLesson(client, grammarId, lesson);
        await client.query("COMMIT");
        console.log(`Staged ${grammarId} (${lesson.rows.length} rows)`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
