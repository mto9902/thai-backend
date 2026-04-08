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
const GRAMMAR_ID = "question-words";
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
  lessonTitle: "Basic Question Words",
  rows: [
    r("ใครอยู่ที่บ้าน", "khrai yùu thîi bâan", "Who's at home?", [
      b("ใคร", "who", "khrai", ["mid"], true),
      b("อยู่", "be / stay", "yùu", ["low"]),
      b("ที่", "at", "thîi", ["falling"]),
      b("บ้าน", "home", "bâan", ["falling"]),
    ]),
    r("ใครโทรมา", "khrai thoo maa", "Who called?", [
      b("ใคร", "who", "khrai", ["mid"], true),
      b("โทร", "call", "thoo", ["mid"]),
      b("มา", "come", "maa", ["mid"]),
    ]),
    r("ใครชอบกาแฟ", "khrai chôop gaa-fae", "Who likes coffee?", [
      b("ใคร", "who", "khrai", ["mid"], true),
      b("ชอบ", "like", "chôop", ["falling"]),
      b("กาแฟ", "coffee", "gaa-fae", ["mid", "mid"]),
    ]),
    r("เมื่อวานใครโทรมา", "mʉ̂a-waan khrai thoo maa", "Who called yesterday?", [
      b("เมื่อวาน", "yesterday", "mʉ̂a-waan", ["falling", "mid"]),
      b("ใคร", "who", "khrai", ["mid"], true),
      b("โทร", "call", "thoo", ["mid"]),
      b("มา", "come", "maa", ["mid"]),
    ]),
    r("คุณชื่ออะไร", "khun chʉ̂ʉ à-rai", "What's your name?", [
      b("คุณ", "you", "khun", ["mid"]),
      b("ชื่อ", "name / are named", "chʉ̂ʉ", ["falling"], true),
      b("อะไร", "what", "à-rai", ["low", "mid"], true),
    ]),
    r("เขากำลังทำอะไร", "khǎo gam-lang tham à-rai", "What's he doing?", [
      b("เขา", "he", "khǎo", ["rising"]),
      b("กำลัง", "currently", "gam-lang", ["mid", "mid"]),
      b("ทำ", "do", "tham", ["mid"]),
      b("อะไร", "what", "à-rai", ["low", "mid"], true),
    ]),
    r("แม่ซื้ออะไรมา", "mâe súue à-rai maa", "What did Mom buy?", [
      b("แม่", "Mom", "mâe", ["falling"]),
      b("ซื้อ", "buy", "súue", ["high"]),
      b("อะไร", "what", "à-rai", ["low", "mid"], true),
      b("มา", "come / bring here", "maa", ["mid"]),
    ]),
    r("พ่ออ่านอะไรอยู่", "phâw àan à-rai yùu", "What's Dad reading?", [
      b("พ่อ", "Dad", "phâw", ["falling"]),
      b("อ่าน", "read", "àan", ["low"]),
      b("อะไร", "what", "à-rai", ["low", "mid"], true),
      b("อยู่", "currently", "yùu", ["low"]),
    ]),
    r("นี่คืออะไร", "nîi khʉʉ à-rai", "What is this?", [
      b("นี่", "this", "nîi", ["falling"]),
      b("คือ", "is", "khʉʉ", ["mid"]),
      b("อะไร", "what", "à-rai", ["low", "mid"], true),
    ]),
    r("นั่นคืออะไร", "nân khʉʉ à-rai", "What is that?", [
      b("นั่น", "that", "nân", ["falling"]),
      b("คือ", "is", "khʉʉ", ["mid"]),
      b("อะไร", "what", "à-rai", ["low", "mid"], true),
    ]),
    r("อะไรอยู่ในกล่อง", "à-rai yùu nai glòng", "What's in the box?", [
      b("อะไร", "what", "à-rai", ["low", "mid"], true),
      b("อยู่", "be / stay", "yùu", ["low"]),
      b("ใน", "in", "nai", ["mid"]),
      b("กล่อง", "box", "glòng", ["low"]),
    ]),
    r("คุณอยู่ที่ไหน", "khun yùu thîi nǎi", "Where are you?", [
      b("คุณ", "you", "khun", ["mid"]),
      b("อยู่", "be / stay", "yùu", ["low"]),
      b("ที่", "at", "thîi", ["falling"]),
      b("ไหน", "where", "nǎi", ["rising"], true),
    ]),
    r("ห้องน้ำอยู่ที่ไหน", "hâwng-náam yùu thîi nǎi", "Where's the bathroom?", [
      b("ห้องน้ำ", "bathroom", "hâwng-náam", ["falling", "high"]),
      b("อยู่", "be / stay", "yùu", ["low"]),
      b("ที่", "at", "thîi", ["falling"]),
      b("ไหน", "where", "nǎi", ["rising"], true),
    ]),
    r("พ่อไปไหน", "phâw bpai nǎi", "Where did Dad go?", [
      b("พ่อ", "Dad", "phâw", ["falling"]),
      b("ไป", "go", "bpai", ["mid"]),
      b("ไหน", "where", "nǎi", ["rising"], true),
    ]),
    r("เราจะไปไหนกัน", "rao jà bpai nǎi gan", "Where are we going?", [
      b("เรา", "we", "rao", ["mid"]),
      b("จะ", "will / going to", "jà", ["low"]),
      b("ไป", "go", "bpai", ["mid"]),
      b("ไหน", "where", "nǎi", ["rising"], true),
      b("กัน", "together / particle", "gan", ["mid"]),
    ]),
    r("คุณมาจากไหน", "khun maa jàak nǎi", "Where are you from?", [
      b("คุณ", "you", "khun", ["mid"]),
      b("มา", "come", "maa", ["mid"]),
      b("จาก", "from", "jàak", ["low"]),
      b("ไหน", "where", "nǎi", ["rising"], true),
    ]),
    r("เขามาจากไหน", "khǎo maa jàak nǎi", "Where is he from?", [
      b("เขา", "he", "khǎo", ["rising"]),
      b("มา", "come", "maa", ["mid"]),
      b("จาก", "from", "jàak", ["low"]),
      b("ไหน", "where", "nǎi", ["rising"], true),
    ]),
    r("เราจะเจอกันตอนไหน", "rao jà jəə gan dtawn nǎi", "When are we meeting?", [
      b("เรา", "we", "rao", ["mid"]),
      b("จะ", "will / going to", "jà", ["low"]),
      b("เจอ", "meet", "jəə", ["mid"]),
      b("กัน", "each other", "gan", ["mid"]),
      b("ตอน", "time / point", "dtawn", ["mid"]),
      b("ไหน", "which / when", "nǎi", ["rising"], true),
    ]),
    r("ร้านเปิดกี่โมง", "ráan bpə̀ət gìi moong", "What time does the shop open?", [
      b("ร้าน", "shop", "ráan", ["high"]),
      b("เปิด", "open", "bpə̀ət", ["low"]),
      b("กี่โมง", "what time", "gìi moong", ["low", "mid"], true),
    ]),
    r("ตอนนี้กี่โมง", "dtawn-níi gìi moong", "What time is it now?", [
      b("ตอนนี้", "right now", "dtawn-níi", ["mid", "high"]),
      b("กี่โมง", "what time", "gìi moong", ["low", "mid"], true),
    ]),
    r("วันนี้วันอะไร", "wan-níi wan à-rai", "What day is it today?", [
      b("วันนี้", "today", "wan-níi", ["mid", "high"]),
      b("วัน", "day", "wan", ["mid"]),
      b("อะไร", "what", "à-rai", ["low", "mid"], true),
    ]),
    r("คุณเอาอันไหน", "khun ao an nǎi", "Which one do you want?", [
      b("คุณ", "you", "khun", ["mid"]),
      b("เอา", "want / take", "ao", ["mid"]),
      b("อัน", "one / item", "an", ["mid"]),
      b("ไหน", "which", "nǎi", ["rising"], true),
    ]),
    r("อันไหนของคุณ", "an nǎi khǎawng khun", "Which one is yours?", [
      b("อัน", "one / item", "an", ["mid"]),
      b("ไหน", "which", "nǎi", ["rising"], true),
      b("ของ", "belonging to", "khǎawng", ["rising"]),
      b("คุณ", "you", "khun", ["mid"]),
    ]),
    r("โต๊ะไหนว่าง", "dtó nǎi wâang", "Which table is free?", [
      b("โต๊ะ", "table", "dtó", ["high"]),
      b("ไหน", "which", "nǎi", ["rising"], true),
      b("ว่าง", "free / available", "wâang", ["falling"]),
    ]),
    r("คนไหนคือครู", "khon nǎi khʉʉ khruu", "Which person is the teacher?", [
      b("คน", "person", "khon", ["mid"]),
      b("ไหน", "which", "nǎi", ["rising"], true),
      b("คือ", "is", "khʉʉ", ["mid"]),
      b("ครู", "teacher", "khruu", ["mid"]),
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
