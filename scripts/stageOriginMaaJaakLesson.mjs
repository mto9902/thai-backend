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
const GRAMMAR_ID = "origin-maa-jaak";
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
  lessonTitle: "Origin with มาจาก",
  rows: [
    r("ฉันมาจากกรุงเทพฯ", "chǎn maa jàak grung-thêep", "I'm from Bangkok.", [
      b("ฉัน", "I", "chǎn", ["rising"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("กรุงเทพฯ", "Bangkok", "grung-thêep", ["mid", "falling"]),
    ]),
    r("ผมมาจากเชียงใหม่", "phǒm maa jàak chiiang-mài", "I'm from Chiang Mai.", [
      b("ผม", "I (male speaker)", "phǒm", ["rising"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("เชียงใหม่", "Chiang Mai", "chiiang-mài", ["mid", "falling"]),
    ]),
    r("คุณมาจากไหน", "khun maa jàak nǎi", "Where are you from?", [
      b("คุณ", "you", "khun", ["mid"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("ไหน", "where", "nǎi", ["rising"], true),
    ]),
    r("เขามาจากญี่ปุ่น", "khǎo maa jàak yîi-bpùn", "He's from Japan.", [
      b("เขา", "he", "khǎo", ["rising"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("ญี่ปุ่น", "Japan", "yîi-bpùn", ["falling", "low"]),
    ]),
    r("เธอมาจากเกาหลี", "thoe maa jàak gao-lǐi", "She's from Korea.", [
      b("เธอ", "she", "thoe", ["mid"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("เกาหลี", "Korea", "gao-lǐi", ["mid", "rising"]),
    ]),
    r("เรามาจากไทย", "rao maa jàak thai", "We're from Thailand.", [
      b("เรา", "we", "rao", ["mid"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("ไทย", "Thailand", "thai", ["mid"]),
    ]),
    r("พ่อมาจากลาว", "phâw maa jàak laao", "Dad is from Laos.", [
      b("พ่อ", "Dad", "phâw", ["falling"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("ลาว", "Laos", "laao", ["mid"]),
    ]),
    r("แม่มาจากพม่า", "mâe maa jàak phá-mâa", "Mom is from Myanmar.", [
      b("แม่", "Mom", "mâe", ["falling"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("พม่า", "Myanmar", "phá-mâa", ["high", "falling"]),
    ]),
    r("ครูมาจากอเมริกา", "khruu maa jàak à-mee-rí-gaa", "The teacher is from America.", [
      b("ครู", "teacher", "khruu", ["mid"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("อเมริกา", "America", "à-mee-rí-gaa", ["low", "mid", "high", "mid"]),
    ]),
    r("เพื่อนฉันมาจากเวียดนาม", "phûean chǎn maa jàak wîat-naam", "My friend is from Vietnam.", [
      b("เพื่อน", "friend", "phûean", ["falling"]),
      b("ฉัน", "my", "chǎn", ["rising"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("เวียดนาม", "Vietnam", "wîat-naam", ["falling", "mid"]),
    ]),
    r("นักเรียนคนนี้มาจากจีน", "nák-rian khon níi maa jàak jiin", "This student is from China.", [
      b("นักเรียน", "student", "nák-rian", ["high", "mid"]),
      b("คน", "person", "khon", ["mid"]),
      b("นี้", "this", "níi", ["high"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("จีน", "China", "jiin", ["mid"]),
    ]),
    r("พี่มาจากเชียงราย", "phîi maa jàak chiiang-raai", "My older sibling is from Chiang Rai.", [
      b("พี่", "my older sibling", "phîi", ["falling"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("เชียงราย", "Chiang Rai", "chiiang-raai", ["mid", "mid"]),
    ]),
    r("น้องมาจากภูเก็ต", "nóng maa jàak phuu-gèt", "My younger sibling is from Phuket.", [
      b("น้อง", "my younger sibling", "nóng", ["high"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("ภูเก็ต", "Phuket", "phuu-gèt", ["mid", "low"]),
    ]),
    r("เขามาจากอินเดีย", "khǎo maa jàak in-dia", "He's from India.", [
      b("เขา", "he", "khǎo", ["rising"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("อินเดีย", "India", "in-dia", ["mid", "mid"]),
    ]),
    r("เพื่อนใหม่ของฉันมาจากอังกฤษ", "phûean mài khǎawng chǎn maa jàak ang-grìt", "My new friend is from England.", [
      b("เพื่อน", "friend", "phûean", ["falling"]),
      b("ใหม่", "new", "mài", ["falling"]),
      b("ของ", "of", "khǎawng", ["rising"]),
      b("ฉัน", "my", "chǎn", ["rising"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("อังกฤษ", "England", "ang-grìt", ["mid", "low"]),
    ]),
    r("กาแฟนี้มาจากเชียงราย", "gaa-fae níi maa jàak chiiang-raai", "This coffee is from Chiang Rai.", [
      b("กาแฟ", "coffee", "gaa-fae", ["mid", "mid"]),
      b("นี้", "this", "níi", ["high"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("เชียงราย", "Chiang Rai", "chiiang-raai", ["mid", "mid"]),
    ]),
    r("ชานี้มาจากเชียงใหม่", "chaa níi maa jàak chiiang-mài", "This tea is from Chiang Mai.", [
      b("ชา", "tea", "chaa", ["mid"]),
      b("นี้", "this", "níi", ["high"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("เชียงใหม่", "Chiang Mai", "chiiang-mài", ["mid", "falling"]),
    ]),
    r("เสื้อตัวนี้มาจากญี่ปุ่น", "sʉ̂a dtuaa níi maa jàak yîi-bpùn", "This shirt is from Japan.", [
      b("เสื้อ", "shirt", "sʉ̂a", ["falling"]),
      b("ตัว", "classifier", "dtuaa", ["mid"]),
      b("นี้", "this", "níi", ["high"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("ญี่ปุ่น", "Japan", "yîi-bpùn", ["falling", "low"]),
    ]),
    r("กระเป๋าใบนี้มาจากเกาหลี", "grà-bpǎo bai níi maa jàak gao-lǐi", "This bag is from Korea.", [
      b("กระเป๋า", "bag", "grà-bpǎo", ["low", "rising"]),
      b("ใบ", "classifier", "bai", ["mid"]),
      b("นี้", "this", "níi", ["high"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("เกาหลี", "Korea", "gao-lǐi", ["mid", "rising"]),
    ]),
    r("ของฝากนี้มาจากภูเก็ต", "khǎawng-fàak níi maa jàak phuu-gèt", "This souvenir is from Phuket.", [
      b("ของฝาก", "souvenir", "khǎawng-fàak", ["rising", "low"]),
      b("นี้", "this", "níi", ["high"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("ภูเก็ต", "Phuket", "phuu-gèt", ["mid", "low"]),
    ]),
    r("คุณมาจากประเทศไหน", "khun maa jàak bprà-thêet nǎi", "Which country are you from?", [
      b("คุณ", "you", "khun", ["mid"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("ประเทศ", "country", "bprà-thêet", ["low", "falling"]),
      b("ไหน", "which", "nǎi", ["rising"], true),
    ]),
    r("เขามาจากไหน", "khǎo maa jàak nǎi", "Where is he from?", [
      b("เขา", "he", "khǎo", ["rising"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("ไหน", "where", "nǎi", ["rising"], true),
    ]),
    r("เพื่อนคุณมาจากไหน", "phûean khun maa jàak nǎi", "Where is your friend from?", [
      b("เพื่อน", "friend", "phûean", ["falling"]),
      b("คุณ", "your", "khun", ["mid"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("ไหน", "where", "nǎi", ["rising"], true),
    ]),
    r("กาแฟนี้มาจากไหน", "gaa-fae níi maa jàak nǎi", "Where is this coffee from?", [
      b("กาแฟ", "coffee", "gaa-fae", ["mid", "mid"]),
      b("นี้", "this", "níi", ["high"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("ไหน", "where", "nǎi", ["rising"], true),
    ]),
    r("ของฝากนี้มาจากไหน", "khǎawng-fàak níi maa jàak nǎi", "Where is this souvenir from?", [
      b("ของฝาก", "souvenir", "khǎawng-fàak", ["rising", "low"]),
      b("นี้", "this", "níi", ["high"]),
      b("มา", "come", "maa", ["mid"], true),
      b("จาก", "from", "jàak", ["low"], true),
      b("ไหน", "where", "nǎi", ["rising"], true),
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
