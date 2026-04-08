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
const GRAMMAR_ID = "go-come-pai-maa";
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
  lessonTitle: "Movement with ไป / มา",
  rows: [
    r("ฉันไปตลาด", "chǎn bpai dtà-làat", "I'm going to the market.", [
      b("ฉัน", "I", "chǎn", ["rising"]),
      b("ไป", "go", "bpai", ["mid"], true),
      b("ตลาด", "market", "dtà-làat", ["low", "low"]),
    ]),
    r("ผมไปทำงาน", "phǒm bpai tham-ngaan", "I'm going to work.", [
      b("ผม", "I (male speaker)", "phǒm", ["rising"]),
      b("ไป", "go", "bpai", ["mid"], true),
      b("ทำงาน", "work", "tham-ngaan", ["mid", "mid"]),
    ]),
    r("คุณไปไหน", "khun bpai nǎi", "Where are you going?", [
      b("คุณ", "you", "khun", ["mid"]),
      b("ไป", "go", "bpai", ["mid"], true),
      b("ไหน", "where", "nǎi", ["rising"], true),
    ]),
    r("เขาไปโรงเรียน", "khǎo bpai roong-rian", "He's going to school.", [
      b("เขา", "he", "khǎo", ["rising"]),
      b("ไป", "go", "bpai", ["mid"], true),
      b("โรงเรียน", "school", "roong-rian", ["mid", "mid"]),
    ]),
    r("เธอไปห้องน้ำ", "thoe bpai hâwng-náam", "She's going to the bathroom.", [
      b("เธอ", "she", "thoe", ["mid"]),
      b("ไป", "go", "bpai", ["mid"], true),
      b("ห้องน้ำ", "bathroom", "hâwng-náam", ["falling", "high"]),
    ]),
    r("เราไปกินข้าว", "rao bpai kin khâao", "We're going to eat.", [
      b("เรา", "we", "rao", ["mid"]),
      b("ไป", "go", "bpai", ["mid"], true),
      b("กิน", "eat", "kin", ["mid"]),
      b("ข้าว", "food", "khâao", ["falling"]),
    ]),
    r("พ่อไปร้านกาแฟ", "phâw bpai ráan gaa-fae", "Dad is going to the cafe.", [
      b("พ่อ", "Dad", "phâw", ["falling"]),
      b("ไป", "go", "bpai", ["mid"], true),
      b("ร้านกาแฟ", "cafe", "ráan gaa-fae", ["high", "mid", "mid"]),
    ]),
    r("แม่ไปธนาคาร", "mâe bpai thá-naa-khaan", "Mom is going to the bank.", [
      b("แม่", "Mom", "mâe", ["falling"]),
      b("ไป", "go", "bpai", ["mid"], true),
      b("ธนาคาร", "bank", "thá-naa-khaan", ["high", "mid", "mid"]),
    ]),
    r("เด็กไปหาครู", "dèk bpai hǎa khruu", "The child is going to see the teacher.", [
      b("เด็ก", "child", "dèk", ["low"]),
      b("ไป", "go", "bpai", ["mid"], true),
      b("หา", "go see", "hǎa", ["rising"]),
      b("ครู", "teacher", "khruu", ["mid"]),
    ]),
    r("เพื่อนไปบ้านฉัน", "phûean bpai bâan chǎn", "My friend is going to my house.", [
      b("เพื่อน", "my friend", "phûean", ["falling"]),
      b("ไป", "go", "bpai", ["mid"], true),
      b("บ้าน", "house", "bâan", ["falling"]),
      b("ฉัน", "my", "chǎn", ["rising"]),
    ]),
    r("ฉันมาที่ร้าน", "chǎn maa thîi ráan", "I'm coming to the shop.", [
      b("ฉัน", "I", "chǎn", ["rising"]),
      b("มา", "come", "maa", ["mid"], true),
      b("ที่", "to / at", "thîi", ["falling"]),
      b("ร้าน", "shop", "ráan", ["high"]),
    ]),
    r("ผมมาหาคุณ", "phǒm maa hǎa khun", "I'm coming to see you.", [
      b("ผม", "I (male speaker)", "phǒm", ["rising"]),
      b("มา", "come", "maa", ["mid"], true),
      b("หา", "come see", "hǎa", ["rising"]),
      b("คุณ", "you", "khun", ["mid"]),
    ]),
    r("เขามาที่นี่", "khǎo maa thîi nîi", "He's coming here.", [
      b("เขา", "he", "khǎo", ["rising"]),
      b("มา", "come", "maa", ["mid"], true),
      b("ที่", "to / at", "thîi", ["falling"]),
      b("นี่", "here", "nîi", ["falling"]),
    ]),
    r("เธอมารับฉัน", "thoe maa ráp chǎn", "She's coming to pick me up.", [
      b("เธอ", "she", "thoe", ["mid"]),
      b("มา", "come", "maa", ["mid"], true),
      b("รับ", "pick up", "ráp", ["high"]),
      b("ฉัน", "me", "chǎn", ["rising"]),
    ]),
    r("พ่อมารับฉัน", "phâw maa ráp chǎn", "Dad is coming to pick me up.", [
      b("พ่อ", "Dad", "phâw", ["falling"]),
      b("มา", "come", "maa", ["mid"], true),
      b("รับ", "pick up", "ráp", ["high"]),
      b("ฉัน", "me", "chǎn", ["rising"]),
    ]),
    r("แม่มาที่ห้อง", "mâe maa thîi hâwng", "Mom is coming into the room.", [
      b("แม่", "Mom", "mâe", ["falling"]),
      b("มา", "come", "maa", ["mid"], true),
      b("ที่", "to / at", "thîi", ["falling"]),
      b("ห้อง", "room", "hâwng", ["falling"]),
    ]),
    r("ครูมาที่ห้องเรียน", "khruu maa thîi hâwng-rian", "The teacher is coming to the classroom.", [
      b("ครู", "teacher", "khruu", ["mid"]),
      b("มา", "come", "maa", ["mid"], true),
      b("ที่", "to / at", "thîi", ["falling"]),
      b("ห้องเรียน", "classroom", "hâwng-rian", ["falling", "mid"]),
    ]),
    r("เพื่อนมาที่บ้าน", "phûean maa thîi bâan", "My friend is coming over.", [
      b("เพื่อน", "my friend", "phûean", ["falling"]),
      b("มา", "come", "maa", ["mid"], true),
      b("ที่", "to / at", "thîi", ["falling"]),
      b("บ้าน", "home", "bâan", ["falling"]),
    ]),
    r("วันนี้เขาไม่มา", "wan-níi khǎo mâi maa", "He's not coming today.", [
      b("วันนี้", "today", "wan-níi", ["mid", "high"]),
      b("เขา", "he", "khǎo", ["rising"]),
      b("ไม่", "not", "mâi", ["falling"]),
      b("มา", "come", "maa", ["mid"], true),
    ]),
    r("เดี๋ยวฉันมา", "dǐao chǎn maa", "I'll be right back.", [
      b("เดี๋ยว", "in a moment", "dǐao", ["rising"]),
      b("ฉัน", "I", "chǎn", ["rising"]),
      b("มา", "come back", "maa", ["mid"], true),
    ]),
    r("มานั่งตรงนี้", "maa nâng dtrohng níi", "Come sit here.", [
      b("มา", "come", "maa", ["mid"], true),
      b("นั่ง", "sit", "nâng", ["falling"]),
      b("ตรง", "right here", "dtrohng", ["mid"]),
      b("นี้", "this / here", "níi", ["high"]),
    ]),
    r("ไปก่อนนะ", "bpai gàwn ná", "I'm heading out first.", [
      b("ไป", "go", "bpai", ["mid"], true),
      b("ก่อน", "first", "gàwn", ["low"]),
      b("นะ", "softening particle", "ná", ["high"]),
    ]),
    r("ไปกับฉันไหม", "bpai gàp chǎn mái", "Do you want to come with me?", [
      b("ไป", "go", "bpai", ["mid"], true),
      b("กับ", "with", "gàp", ["low"]),
      b("ฉัน", "me", "chǎn", ["rising"]),
      b("ไหม", "question particle", "mái", ["rising"]),
    ]),
    r("พวกเขามาด้วย", "phûak-khǎo maa dûai", "They're coming too.", [
      b("พวกเขา", "they", "phûak-khǎo", ["falling", "rising"]),
      b("มา", "come", "maa", ["mid"], true),
      b("ด้วย", "too", "dûai", ["falling"]),
    ]),
    r("เราไปด้วยกัน", "rao bpai dûai gan", "We're going together.", [
      b("เรา", "we", "rao", ["mid"]),
      b("ไป", "go", "bpai", ["mid"], true),
      b("ด้วย", "together / too", "dûai", ["falling"]),
      b("กัน", "together", "gan", ["mid"]),
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
