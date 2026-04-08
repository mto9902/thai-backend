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
const GRAMMAR_ID = "not-identity-mai-chai";
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
  lessonTitle: "Noun Negation with ไม่ใช่",
  rows: [
    r("นี่ไม่ใช่น้ำ", "nîi mâi châi náam", "This isn't water.", [
      b("นี่", "this", "nîi", ["falling"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("น้ำ", "water", "náam", ["high"]),
    ]),
    r("นี่ไม่ใช่กาแฟ", "nîi mâi châi gaa-fae", "This isn't coffee.", [
      b("นี่", "this", "nîi", ["falling"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("กาแฟ", "coffee", "gaa-fae", ["mid", "mid"]),
    ]),
    r("นี่ไม่ใช่ชาของฉัน", "nîi mâi châi chaa khǎawng chǎn", "This isn't my tea.", [
      b("นี่", "this", "nîi", ["falling"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("ชา", "tea", "chaa", ["mid"]),
      b("ของ", "of / belonging to", "khǎawng", ["rising"]),
      b("ฉัน", "me / my", "chǎn", ["rising"]),
    ]),
    r("นั่นไม่ใช่กระเป๋าของผม", "nân mâi châi grà-bpǎo khǎawng phǒm", "That's not my bag.", [
      b("นั่น", "that", "nân", ["falling"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("กระเป๋า", "bag", "grà-bpǎo", ["low", "rising"]),
      b("ของ", "of / belonging to", "khǎawng", ["rising"]),
      b("ผม", "me / my", "phǒm", ["rising"]),
    ]),
    r("อันนี้ไม่ใช่ของคุณ", "an níi mâi châi khǎawng khun", "This isn't yours.", [
      b("อัน", "one / item", "an", ["mid"]),
      b("นี้", "this", "níi", ["high"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("ของ", "belonging to", "khǎawng", ["rising"]),
      b("คุณ", "you", "khun", ["mid"]),
    ]),
    r("อันนั้นไม่ใช่เมนูภาษาไทย", "an nán mâi châi mee-nuu phaa-sǎa thai", "That's not the Thai menu.", [
      b("อัน", "one / item", "an", ["mid"]),
      b("นั้น", "that", "nán", ["high"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("เมนู", "menu", "mee-nuu", ["mid", "mid"]),
      b("ภาษาไทย", "Thai language / Thai", "phaa-sǎa thai", ["mid", "rising", "mid"]),
    ]),
    r("ห้องนี้ไม่ใช่ห้องน้ำ", "hâwng níi mâi châi hâwng-náam", "This room isn't the bathroom.", [
      b("ห้อง", "room", "hâwng", ["falling"]),
      b("นี้", "this", "níi", ["high"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("ห้องน้ำ", "bathroom", "hâwng-náam", ["falling", "high"]),
    ]),
    r("นั่นไม่ใช่ทางออก", "nân mâi châi thaang-òk", "That's not the exit.", [
      b("นั่น", "that", "nân", ["falling"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("ทางออก", "exit", "thaang-òk", ["mid", "low"]),
    ]),
    r("วันนี้ไม่ใช่วันหยุด", "wan-níi mâi châi wan-yùt", "Today isn't a holiday.", [
      b("วันนี้", "today", "wan-níi", ["mid", "high"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("วันหยุด", "holiday", "wan-yùt", ["mid", "low"]),
    ]),
    r("ร้านนี้ไม่ใช่ร้านกาแฟ", "ráan níi mâi châi ráan gaa-fae", "This isn't a cafe.", [
      b("ร้าน", "shop", "ráan", ["high"]),
      b("นี้", "this", "níi", ["high"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("ร้านกาแฟ", "cafe", "ráan gaa-fae", ["high", "mid", "mid"]),
    ]),
    r("เขาไม่ใช่ครู", "khǎo mâi châi khruu", "He's not a teacher.", [
      b("เขา", "he", "khǎo", ["rising"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("ครู", "teacher", "khruu", ["mid"]),
    ]),
    r("เธอไม่ใช่หมอ", "thoe mâi châi mǎw", "She's not a doctor.", [
      b("เธอ", "she", "thoe", ["mid"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("หมอ", "doctor", "mǎw", ["rising"]),
    ]),
    r("ผมไม่ใช่นักเรียนใหม่", "phǒm mâi châi nák-rian mài", "I'm not a new student.", [
      b("ผม", "I (male speaker)", "phǒm", ["rising"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("นักเรียน", "student", "nák-rian", ["high", "mid"]),
      b("ใหม่", "new", "mài", ["falling"]),
    ]),
    r("ฉันไม่ใช่ครูที่นี่", "chǎn mâi châi khruu thîi nîi", "I'm not a teacher here.", [
      b("ฉัน", "I", "chǎn", ["rising"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("ครู", "teacher", "khruu", ["mid"]),
      b("ที่", "at", "thîi", ["falling"]),
      b("นี่", "here", "nîi", ["falling"]),
    ]),
    r("คนนั้นไม่ใช่พ่อฉัน", "khon nán mâi châi phâw chǎn", "That man isn't my dad.", [
      b("คน", "person", "khon", ["mid"]),
      b("นั้น", "that", "nán", ["high"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("พ่อ", "dad", "phâw", ["falling"]),
      b("ฉัน", "my", "chǎn", ["rising"]),
    ]),
    r("เธอไม่ใช่พี่สาวฉัน", "thoe mâi châi phîi-sǎao chǎn", "She's not my older sister.", [
      b("เธอ", "she", "thoe", ["mid"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("พี่สาว", "older sister", "phîi-sǎao", ["falling", "rising"]),
      b("ฉัน", "my", "chǎn", ["rising"]),
    ]),
    r("เขาไม่ใช่คนขับรถ", "khǎo mâi châi khon-khàp-rót", "He's not the driver.", [
      b("เขา", "he", "khǎo", ["rising"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("คนขับรถ", "driver", "khon-khàp-rót", ["mid", "low", "high"]),
    ]),
    r("คนนี้ไม่ใช่ครูใหม่", "khon níi mâi châi khruu mài", "This isn't the new teacher.", [
      b("คน", "person", "khon", ["mid"]),
      b("นี้", "this", "níi", ["high"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("ครู", "teacher", "khruu", ["mid"]),
      b("ใหม่", "new", "mài", ["falling"]),
    ]),
    r("นี่ไม่ใช่โต๊ะของเรา", "nîi mâi châi dtó khǎawng rao", "This isn't our table.", [
      b("นี่", "this", "nîi", ["falling"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("โต๊ะ", "table", "dtó", ["high"]),
      b("ของ", "of / belonging to", "khǎawng", ["rising"]),
      b("เรา", "us / our", "rao", ["mid"]),
    ]),
    r("นั่นไม่ใช่ที่นั่งของคุณ", "nân mâi châi thîi-nâng khǎawng khun", "That's not your seat.", [
      b("นั่น", "that", "nân", ["falling"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("ที่นั่ง", "seat", "thîi-nâng", ["falling", "falling"]),
      b("ของ", "of / belonging to", "khǎawng", ["rising"]),
      b("คุณ", "you / your", "khun", ["mid"]),
    ]),
    r("อันนี้ไม่ใช่บัตรรถไฟฟ้า", "an níi mâi châi bàt rót-fai-fáa", "This isn't a BTS card.", [
      b("อัน", "one / item", "an", ["mid"]),
      b("นี้", "this", "níi", ["high"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("บัตรรถไฟฟ้า", "BTS card", "bàt rót-fai-fáa", ["low", "high", "mid", "high"]),
    ]),
    r("นี่ไม่ใช่รูปฉัน", "nîi mâi châi rûup chǎn", "This isn't a picture of me.", [
      b("นี่", "this", "nîi", ["falling"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("รูป", "picture", "rûup", ["falling"]),
      b("ฉัน", "me", "chǎn", ["rising"]),
    ]),
    r("บ้านหลังนั้นไม่ใช่บ้านฉัน", "bâan lǎng nán mâi châi bâan chǎn", "That house isn't mine.", [
      b("บ้าน", "house", "bâan", ["falling"]),
      b("หลัง", "classifier", "lǎng", ["rising"]),
      b("นั้น", "that", "nán", ["high"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("บ้าน", "house", "bâan", ["falling"]),
      b("ฉัน", "mine / my", "chǎn", ["rising"]),
    ]),
    r("คนนั้นไม่ใช่คนขาย", "khon nán mâi châi khon-khǎai", "That person isn't the seller.", [
      b("คน", "person", "khon", ["mid"]),
      b("นั้น", "that", "nán", ["high"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("คนขาย", "seller", "khon-khǎai", ["mid", "rising"]),
    ]),
    r("นี่ไม่ใช่มือถือฉัน", "nîi mâi châi mʉʉ-thʉ̌ʉ chǎn", "This isn't my phone.", [
      b("นี่", "this", "nîi", ["falling"]),
      b("ไม่", "not", "mâi", ["falling"], true),
      b("ใช่", "be / the correct one", "châi", ["falling"], true),
      b("มือถือ", "phone", "mʉʉ-thʉ̌ʉ", ["mid", "rising"]),
      b("ฉัน", "my", "chǎn", ["rising"]),
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
