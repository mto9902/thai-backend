import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { pool } from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const GENERATED_DIR = path.join(ROOT, "admin-data", "generated-candidates");
const SOURCE_DIR = path.join(ROOT, "admin-data", "manual-source-lessons");
const GRAMMAR_EXAMPLES_TABLE = "grammar_examples";
const GRAMMAR_LESSON_PRODUCTION_TABLE = "grammar_lesson_production";
const GRAMMAR_ID = "negative-mai";
const STAGE = "A1.1";
const NOTE = "Manual New Gen staged 2026-04-06";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function t(value) {
  return String(value ?? "").trim();
}

function b(thai, english, romanization, tones, grammar = false) {
  const item = {
    thai: t(thai),
    english: t(english),
    romanization: t(romanization),
    tones,
  };
  if (grammar) {
    item.grammar = true;
  }
  return item;
}

function r(thai, romanization, english, breakdown) {
  return {
    thai: t(thai),
    romanization: t(romanization),
    english: t(english),
    difficulty: "easy",
    breakdown,
  };
}

const lesson = {
  lessonTitle: "Negation with ไม่",
  rows: [
    r("ฉันไม่กินเผ็ด", "chǎn mâi kin phèt", "I don't eat spicy food.", [
      b("ฉัน", "I", "chǎn", ["rising"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("กิน", "eat", "kin", ["mid"]),
      b("เผ็ด", "spicy food", "phèt", ["low"]),
    ]),
    r("ฉันไม่ดื่มชา", "chǎn mâi dùuem chaa", "I don't drink tea.", [
      b("ฉัน", "I", "chǎn", ["rising"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ดื่ม", "drink", "dùuem", ["low"]),
      b("ชา", "tea", "chaa", ["mid"]),
    ]),
    r("แม่ไม่ดื่มกาแฟตอนเย็น", "mâe mâi dùuem gaa-fae dtawn yen", "Mom doesn't drink coffee in the evening.", [
      b("แม่", "Mom", "mâe", ["falling"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ดื่ม", "drink", "dùuem", ["low"]),
      b("กาแฟ", "coffee", "gaa-fae", ["mid", "mid"]),
      b("ตอน", "in / during", "dtawn", ["mid"]),
      b("เย็น", "evening", "yen", ["mid"]),
    ]),
    r("เขาไม่ดูทีวีตอนเช้า", "khǎo mâi duu thii-wii dtawn cháo", "He doesn't watch TV in the morning.", [
      b("เขา", "he", "khǎo", ["rising"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ดู", "watch", "duu", ["mid"]),
      b("ทีวี", "TV", "thii-wii", ["mid", "mid"]),
      b("ตอน", "in / during", "dtawn", ["mid"]),
      b("เช้า", "morning", "cháo", ["high"]),
    ]),
    r("เราไม่อ่านข่าวตอนเช้า", "rao mâi àan khàao dtawn cháo", "We don't read the news in the morning.", [
      b("เรา", "we", "rao", ["mid"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("อ่าน", "read", "àan", ["low"]),
      b("ข่าว", "news", "khàao", ["low"]),
      b("ตอน", "in / during", "dtawn", ["mid"]),
      b("เช้า", "morning", "cháo", ["high"]),
    ]),
    r("พ่อไม่ขับรถไปทำงานวันนี้", "phâw mâi khàp rót bpai tham-ngaan wan-níi", "Dad isn't driving to work today.", [
      b("พ่อ", "Dad", "phâw", ["falling"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ขับ", "drive", "khàp", ["low"]),
      b("รถ", "car", "rót", ["high"]),
      b("ไป", "go", "bpai", ["mid"]),
      b("ทำงาน", "work", "tham-ngaan", ["mid", "mid"]),
      b("วันนี้", "today", "wan-níi", ["mid", "high"]),
    ]),
    r("ครูไม่ใช้ไมค์", "khruu mâi chái mai", "The teacher isn't using a microphone.", [
      b("ครู", "teacher", "khruu", ["mid"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช้", "use", "chái", ["high"]),
      b("ไมค์", "microphone", "mai", ["high"]),
    ]),
    r("เด็กไม่กินผัก", "dèk mâi kin phàk", "The child doesn't eat vegetables.", [
      b("เด็ก", "child", "dèk", ["low"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("กิน", "eat", "kin", ["mid"]),
      b("ผัก", "vegetables", "phàk", ["low"]),
    ]),
    r("เพื่อนไม่ตอบข้อความ", "phûean mâi dtòp khâaw-khwaam", "My friend doesn't reply to messages.", [
      b("เพื่อน", "my friend", "phûean", ["falling"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ตอบ", "reply", "dtòp", ["low"]),
      b("ข้อความ", "messages", "khâaw-khwaam", ["falling", "mid"]),
    ]),
    r("คุณไม่กินหมู", "khun mâi kin mǔu", "You don't eat pork.", [
      b("คุณ", "you", "khun", ["mid"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("กิน", "eat", "kin", ["mid"]),
      b("หมู", "pork", "mǔu", ["rising"]),
    ]),
    r("น้องไม่ดูการ์ตูนแล้ว", "nóng mâi duu gaan-tuun láew", "My younger sibling doesn't watch cartoons anymore.", [
      b("น้อง", "my younger sibling", "nóng", ["high"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ดู", "watch", "duu", ["mid"]),
      b("การ์ตูน", "cartoons", "gaan-tuun", ["mid", "mid"]),
      b("แล้ว", "anymore / already", "láew", ["high"]),
    ]),
    r("ฉันไม่ซื้อของที่ตลาดนี้", "chǎn mâi súue khǎawng thîi dtà-làat níi", "I don't shop at this market.", [
      b("ฉัน", "I", "chǎn", ["rising"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ซื้อ", "buy", "súue", ["high"]),
      b("ของ", "things", "khǎawng", ["rising"]),
      b("ที่", "at", "thîi", ["falling"]),
      b("ตลาด", "market", "dtà-làat", ["low", "low"]),
      b("นี้", "this", "níi", ["high"]),
    ]),
    r("เธอไม่ฟังเพลงในรถ", "thoe mâi fang phleeng nai rót", "She doesn't listen to music in the car.", [
      b("เธอ", "she", "thoe", ["mid"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ฟัง", "listen to", "fang", ["mid"]),
      b("เพลง", "music", "phleeng", ["mid"]),
      b("ใน", "in", "nai", ["mid"]),
      b("รถ", "car", "rót", ["high"]),
    ]),
    r("เขาไม่ยกของหนัก", "khǎo mâi yók khǎawng nàk", "He doesn't lift heavy things.", [
      b("เขา", "he", "khǎo", ["rising"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ยก", "lift", "yók", ["high"]),
      b("ของ", "things", "khǎawng", ["rising"]),
      b("หนัก", "heavy", "nàk", ["low"]),
    ]),
    r("เราไม่กินข้าวในห้องเรียน", "rao mâi kin khâao nai hâwng-rian", "We don't eat in the classroom.", [
      b("เรา", "we", "rao", ["mid"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("กิน", "eat", "kin", ["mid"]),
      b("ข้าว", "food / rice", "khâao", ["falling"]),
      b("ใน", "in", "nai", ["mid"]),
      b("ห้องเรียน", "classroom", "hâwng-rian", ["falling", "mid"]),
    ]),
    r("คืนนี้แม่ไม่ล้างจาน", "kheun-níi mâe mâi láang jaan", "Mom isn't washing the dishes tonight.", [
      b("คืนนี้", "tonight", "kheun-níi", ["mid", "high"]),
      b("แม่", "Mom", "mâe", ["falling"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ล้าง", "wash", "láang", ["high"]),
      b("จาน", "dishes", "jaan", ["mid"]),
    ]),
    r("พ่อไม่ดื่มน้ำหวาน", "phâw mâi dùuem náam-wǎan", "Dad doesn't drink sweet drinks.", [
      b("พ่อ", "Dad", "phâw", ["falling"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ดื่ม", "drink", "dùuem", ["low"]),
      b("น้ำหวาน", "sweet drinks", "náam-wǎan", ["high", "rising"]),
    ]),
    r("คุณไม่ใส่แว่นวันนี้", "khun mâi sài wâen wan-níi", "You're not wearing glasses today.", [
      b("คุณ", "you", "khun", ["mid"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใส่", "wear", "sài", ["low"]),
      b("แว่น", "glasses", "wâen", ["falling"]),
      b("วันนี้", "today", "wan-níi", ["mid", "high"]),
    ]),
    r("เพื่อนไม่เล่นเกมตอนเรียน", "phûean mâi lên geem dtawn rian", "My friend doesn't play games in class.", [
      b("เพื่อน", "my friend", "phûean", ["falling"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("เล่น", "play", "lên", ["falling"]),
      b("เกม", "games", "geem", ["mid"]),
      b("ตอน", "during", "dtawn", ["mid"]),
      b("เรียน", "class", "rian", ["mid"]),
    ]),
    r("ครูไม่ใช้คอมพิวเตอร์เครื่องนี้", "khruu mâi chái khawm-phíu-dtêr khrʉ̂ang níi", "The teacher doesn't use this computer.", [
      b("ครู", "teacher", "khruu", ["mid"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช้", "use", "chái", ["high"]),
      b("คอมพิวเตอร์", "computer", "khawm-phíu-dtêr", ["mid", "high", "falling"]),
      b("เครื่อง", "classifier", "khrʉ̂ang", ["falling"]),
      b("นี้", "this", "níi", ["high"]),
    ]),
    r("เด็กไม่ใส่รองเท้าในบ้าน", "dèk mâi sài rawng-tháao nai bâan", "The child doesn't wear shoes in the house.", [
      b("เด็ก", "child", "dèk", ["low"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใส่", "wear", "sài", ["low"]),
      b("รองเท้า", "shoes", "rawng-tháao", ["mid", "high"]),
      b("ใน", "in", "nai", ["mid"]),
      b("บ้าน", "house", "bâan", ["falling"]),
    ]),
    r("น้องไม่เอาร่มมา", "nóng mâi ao rôm maa", "My younger sibling didn't bring an umbrella.", [
      b("น้อง", "my younger sibling", "nóng", ["high"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("เอา", "bring / take", "ao", ["mid"]),
      b("ร่ม", "umbrella", "rôm", ["falling"]),
      b("มา", "come / bring here", "maa", ["mid"]),
    ]),
    r("เธอไม่เจอกุญแจ", "thoe mâi jəə gun-jaae", "She can't find the key.", [
      b("เธอ", "she", "thoe", ["mid"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("เจอ", "find", "jəə", ["mid"]),
      b("กุญแจ", "key", "gun-jaae", ["mid", "mid"]),
    ]),
    r("ร้านนี้ไม่ขายชาเย็น", "ráan níi mâi khǎai chaa-yen", "This shop doesn't sell iced tea.", [
      b("ร้าน", "shop", "ráan", ["high"]),
      b("นี้", "this", "níi", ["high"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ขาย", "sell", "khǎai", ["rising"]),
      b("ชาเย็น", "iced tea", "chaa-yen", ["mid", "mid"]),
    ]),
    r("พวกเขาไม่เปิดแอร์", "phûak-khǎo mâi bpə̀ət ae", "They don't turn on the air conditioner.", [
      b("พวกเขา", "they", "phûak-khǎo", ["falling", "rising"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("เปิด", "turn on", "bpə̀ət", ["low"]),
      b("แอร์", "air conditioner", "ae", ["mid"]),
    ]),
  ],
};

function writeLessonFiles() {
  ensureDir(GENERATED_DIR);
  ensureDir(SOURCE_DIR);

  const finalLesson = {
    lessonId: GRAMMAR_ID,
    stage: STAGE,
    lessonTitle: lesson.lessonTitle,
    rows: lesson.rows.map((entry) => ({
      thai: entry.thai,
      english: entry.english,
    })),
  };

  const sourceLesson = {
    grammarId: GRAMMAR_ID,
    rows: lesson.rows,
  };

  fs.writeFileSync(
    path.join(GENERATED_DIR, `${GRAMMAR_ID}-final25-reviewed.json`),
    `${JSON.stringify(finalLesson, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(SOURCE_DIR, `${GRAMMAR_ID}-source.json`),
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

async function stageLesson() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const waveId = `${GRAMMAR_ID}-manual-${Date.now()}`;
    const sortResult = await client.query(
      `
      SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order
      FROM ${GRAMMAR_EXAMPLES_TABLE}
      WHERE grammar_id = $1
      `,
      [GRAMMAR_ID],
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
      [GRAMMAR_ID, STAGE, waveId, NOTE],
    );

    await client.query(
      `
      UPDATE ${GRAMMAR_EXAMPLES_TABLE}
      SET publish_state = 'retired', updated_at = NOW()
      WHERE grammar_id = $1
        AND publish_state = 'staged'
      `,
      [GRAMMAR_ID],
    );

    for (const [index, currentRow] of lesson.rows.entries()) {
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
          GRAMMAR_ID,
          currentRow.thai,
          currentRow.romanization,
          currentRow.english,
          JSON.stringify(currentRow.breakdown),
          currentRow.difficulty,
          baseSortOrder + index,
          JSON.stringify(makeToneAnalysis()),
          NOTE,
          waveId,
          JSON.stringify(["new_gen"]),
        ],
      );
    }

    await client.query("COMMIT");
    console.log(`Staged ${GRAMMAR_ID} (${lesson.rows.length} rows)`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

writeLessonFiles();
stageLesson().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
