import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { fileURLToPath } from "url";

import { analyzeBreakdownTones } from "../breakdownTone.js";
import { pool } from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(SERVER_ROOT, ".env"), quiet: true });

const GRAMMAR_DIR = path.join(SERVER_ROOT, "grammar");
const GENERATED_DIR = path.join(SERVER_ROOT, "admin-data", "generated-candidates");
const GRAMMAR_EXAMPLES_TABLE = "grammar_examples";
const GRAMMAR_LESSON_PRODUCTION_TABLE = "grammar_lesson_production";
const REVIEW_DATE = "2026-04-06";
const REVIEW_NOTE = `A2.1 sentence QA publish ${REVIEW_DATE}`;
const DEFAULT_LESSONS = [
  "past-laew",
  "recent-past-phoeng",
  "female-particles-kha-kha",
  "frequency-adverbs",
  "like-chorp",
];
const CURATED_FINAL_ROWS = {
  "permission-dai": {
    stage: "A2.1",
    rows: [
      {
        thai: "คุณใช้โทรศัพท์ในห้องประชุมได้ไหม",
        english: "Can you use the phone in the meeting room?",
      },
      {
        thai: "เด็กๆ นอนดึกได้เฉพาะวันศุกร์",
        english: "The kids can stay up late only on Fridays.",
      },
      {
        thai: "ฉันใช้คอมพิวเตอร์ของคุณได้ไหม",
        english: "Can I use your computer?",
      },
      {
        thai: "ฉันเปิดหน้าต่างได้หรือเปล่า",
        english: "Can I open the window?",
      },
      {
        thai: "ที่โรงเรียนเรากินขนมในห้องเรียนได้",
        english: "At school, we can eat snacks in the classroom.",
      },
      {
        thai: "ฉันเสร็จรายงานก่อนมื้อเย็นได้",
        english: "I can finish the report before dinner.",
      },
      {
        thai: "ฉันพาหมาเข้าร้านกาแฟได้ไหม",
        english: "Can I bring my dog into the cafe?",
      },
      {
        thai: "คุณส่งพัสดุตอนเช้าพรุ่งนี้ได้",
        english: "You can send the parcel tomorrow morning.",
      },
      {
        thai: "เขาลองรองเท้าสีดำได้ไหม",
        english: "Can he try on the black shoes?",
      },
      {
        thai: "เราใส่ยีนส์เข้าออฟฟิศวันศุกร์ได้",
        english: "We can wear jeans to the office on Fridays.",
      },
      {
        thai: "เพื่อนฉันเก็บหนังสือไว้สองอาทิตย์ได้",
        english: "My friend can keep the book for two weeks.",
      },
      {
        thai: "พ่อบอกว่าฉันฟังเพลงตอนถูบ้านได้",
        english: "Dad says I can listen to music while I sweep.",
      },
      {
        thai: "แม่คะ ฉันใส่รองเท้าคู่นี้ตอนฝนตกได้ไหม",
        english: "Mom, can I wear these shoes in the rain?",
      },
      {
        thai: "ร้านเล็กจ่ายเงินสดได้",
        english: "You can pay cash at the small shop.",
      },
      {
        thai: "ฉันโทรหาแต่หลังแปดโมงได้",
        english: "I can call you only after eight o'clock.",
      },
      {
        thai: "เราเอาโทรศัพท์เข้าห้องเรียนได้ แต่ต้องปิดเสียง",
        english: "We can bring our phones into class, but they have to be on silent.",
      },
      {
        thai: "เธอยืมบันทึกฉันได้ แต่ต้องคืนพรุ่งนี้",
        english: "You can borrow my notes, but you have to return them tomorrow.",
      },
      {
        thai: "ฉันไปรับเธอที่สถานีได้ถ้าฝนตก",
        english: "I can pick you up at the station if it rains.",
      },
      {
        thai: "เราสลับที่นั่งได้ไหม ฉันจะได้นั่งกับเพื่อน",
        english: "Can we switch seats so I can sit with my friend?",
      },
      {
        thai: "เธอกลับเร็วได้วันนี้ เพราะกะทำงานเลิกสี่โมง",
        english: "She can leave early today because her shift ends at four.",
      },
      {
        thai: "ฉันคืนหนังสือเล่มนี้วันจันทร์ได้ไหม",
        english: "Can I return this book on Monday?",
      },
      {
        thai: "คุณพรินต์สิบหน้าได้ฟรี",
        english: "You can print ten pages for free.",
      },
      {
        thai: "ยืมร่มนี้ได้ พรุ่งนี้เอามาคืน",
        english: "You can borrow this umbrella. Just bring it back tomorrow.",
      },
      {
        thai: "คุณอาบน้ำก่อนได้ ฉันรอ",
        english: "You can shower first. I'll wait.",
      },
      {
        thai: "เราเลือกที่นั่งได้ตอนจองออนไลน์",
        english: "We can choose our seats when we book online.",
      },
    ],
  },
  "skill-pen": {
    stage: "A2.1",
    rows: [
      {
        thai: "เธอว่ายน้ำเป็น",
        english: "She knows how to swim.",
      },
      {
        thai: "ผมซ่อมจักรยานเป็น",
        english: "I know how to fix a bicycle.",
      },
      {
        thai: "เขาเล่นกีตาร์เป็น",
        english: "He knows how to play the guitar.",
      },
      {
        thai: "แม่ทำอาหารไทยเป็น",
        english: "Mom knows how to cook Thai food.",
      },
      {
        thai: "เราพับนกกระดาษเป็น",
        english: "We know how to fold paper cranes.",
      },
      {
        thai: "ย่าถักผ้าพันคอเป็นเก่งมาก",
        english: "Grandma knows how to knit scarves very well.",
      },
      {
        thai: "ลูกชายเราเปลี่ยนจอโทรศัพท์เป็น",
        english: "Our son knows how to replace a phone screen.",
      },
      {
        thai: "เธอตัดผมผู้ชายเป็น",
        english: "She knows how to cut men's hair.",
      },
      {
        thai: "น้องสาวถักเปียเป็นแล้ว",
        english: "My younger sister can braid hair now.",
      },
      {
        thai: "อ่านหนังสือไทยเป็นรึยัง",
        english: "Can you read Thai yet?",
      },
      {
        thai: "พ่อถ่ายยางรถเป็นแล้ว",
        english: "Dad knows how to change a tire now.",
      },
      {
        thai: "เย็บกระดุมเป็นรึยัง",
        english: "Can you sew buttons yet?",
      },
      {
        thai: "ฉันพิมพ์ไทยเป็น",
        english: "I know how to type in Thai.",
      },
      {
        thai: "เขาห่อพัสดุเป็น",
        english: "He knows how to wrap a parcel.",
      },
      {
        thai: "ย่าถักตะกร้าเป็น",
        english: "Grandma knows how to weave baskets.",
      },
      {
        thai: "ผมผูกเน็คไทเป็น",
        english: "I know how to tie a tie.",
      },
      {
        thai: "เธออบเค้กกล้วยเป็น",
        english: "She knows how to bake banana cake.",
      },
      {
        thai: "ลุงซ่อมนาฬิกาเป็น",
        english: "My uncle knows how to repair clocks.",
      },
      {
        thai: "เขาเล่นสเก็ตบอร์ดเป็นแล้ว",
        english: "He knows how to skateboard now.",
      },
      {
        thai: "เพื่อนบ้านพูดภาษาอีสานเป็น",
        english: "The neighbors know how to speak Isaan.",
      },
      {
        thai: "บาริสต้าวาดลาเต้เป็น",
        english: "The barista knows how to make latte art.",
      },
      {
        thai: "ย่าถักถุงเท้าเป็นทุกเย็น",
        english: "Grandma knows how to knit socks every evening.",
      },
      {
        thai: "ผมนวดไทยเป็นระดับพื้นฐาน",
        english: "I can do basic Thai massage.",
      },
      {
        thai: "น้องสาวฉันอ่านโน้ตดนตรีเป็น",
        english: "My younger sister knows how to read sheet music.",
      },
      {
        thai: "เธอห่อเกี๊ยวเป็นมั้ย",
        english: "Can you wrap dumplings?",
      },
    ],
  },
};

function parseArgs() {
  const args = process.argv.slice(2);
  const lessonFlagIndex = args.indexOf("--lessons");
  const lessons =
    lessonFlagIndex >= 0 && lessonFlagIndex < args.length - 1
      ? args[lessonFlagIndex + 1]
          .split(",")
          .map((lesson) => lesson.trim())
          .filter(Boolean)
      : DEFAULT_LESSONS;

  return {
    lessons,
    dryRun: args.includes("--dry-run"),
  };
}

function readFinalLesson(grammarId) {
  const curated = CURATED_FINAL_ROWS[grammarId];
  if (curated) {
    if (!Array.isArray(curated.rows) || curated.rows.length !== 25) {
      throw new Error(`${grammarId} curated lesson must contain exactly 25 rows`);
    }
    return {
      lessonId: grammarId,
      stage: curated.stage,
      lessonTitle: grammarId,
      rows: curated.rows,
    };
  }

  const filePath = path.join(
    GENERATED_DIR,
    `${grammarId}-kimi-final25-reviewed.json`,
  );
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.rows) || parsed.rows.length !== 25) {
    throw new Error(`${grammarId} final reviewed file must contain exactly 25 rows`);
  }
  return parsed;
}

function readSourceRows(grammarId) {
  const filePath = path.join(GRAMMAR_DIR, `${grammarId}.csv`);
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => {
        try {
          rows.push({
            thai: row.thai,
            romanization: row.romanization,
            english: row.english,
            breakdown: JSON.parse(row.breakdown),
            difficulty: row.difficulty,
          });
        } catch (error) {
          reject(error);
        }
      })
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

function withFilledToneMetadata(item) {
  const nextItem = { ...item };
  const existingTones = Array.isArray(nextItem.tones)
    ? nextItem.tones.filter(Boolean)
    : nextItem.tone
      ? [nextItem.tone]
      : [];

  let tones = existingTones;
  if (tones.length === 0) {
    const inferred = analyzeBreakdownTones({
      thai: nextItem.thai,
      romanization: nextItem.romanization,
      providedTones: [],
    }).tones;
    tones = inferred;
  }

  if (tones.length > 0) {
    nextItem.tones = tones;
    if (tones.length === 1) {
      nextItem.tone = tones[0];
    } else {
      delete nextItem.tone;
    }
  }

  return nextItem;
}

function summarizeRowToneState(breakdown) {
  const analyses = breakdown.map((item) => {
    const providedTones = Array.isArray(item.tones)
      ? item.tones.filter(Boolean)
      : item.tone
        ? [item.tone]
        : [];
    return analyzeBreakdownTones({
      thai: item.thai,
      romanization: item.romanization,
      providedTones,
    });
  });

  const unresolvedItemCount = analyses.filter((analysis) => analysis.tones.length === 0).length;
  const allResolved = unresolvedItemCount === 0;

  return {
    confidence: allResolved ? 100 : 99,
    status: allResolved ? "approved" : "review",
    source: allResolved ? "legacy-publish" : "legacy-publish-partial-tone",
    needsReview: !allResolved,
    reasons: allResolved
      ? []
      : ["Published after sentence QA; some breakdown tone dots still need cleanup."],
    unresolvedItemCount,
    breakdown: analyses,
  };
}

function escapeCsvValue(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeCsvMirror(grammarId, rows) {
  const header = ["thai", "romanization", "english", "breakdown", "difficulty"];
  const lines = rows.map((row) =>
    [
      row.thai,
      row.romanization,
      row.english,
      JSON.stringify(row.breakdown),
      row.difficulty,
    ]
      .map(escapeCsvValue)
      .join(","),
  );

  fs.writeFileSync(
    path.join(GRAMMAR_DIR, `${grammarId}.csv`),
    [header.join(","), ...lines].join("\n"),
    "utf8",
  );
}

function buildLessonRows(grammarId, sourceRows, finalRows) {
  const sourceByThai = new Map(sourceRows.map((row) => [row.thai, row]));
  return finalRows.map((finalRow, index) => {
    const sourceRow = sourceByThai.get(finalRow.thai);
    if (!sourceRow) {
      throw new Error(
        `${grammarId} cannot be published yet because "${finalRow.thai}" has no annotated source row`,
      );
    }

    const breakdown = sourceRow.breakdown.map(withFilledToneMetadata);
    const toneAnalysis = summarizeRowToneState(breakdown);

    return {
      grammarId,
      sortOrder: index,
      thai: finalRow.thai,
      romanization: sourceRow.romanization,
      english: finalRow.english,
      breakdown,
      difficulty: sourceRow.difficulty || "medium",
      toneConfidence: toneAnalysis.confidence,
      toneStatus: toneAnalysis.status,
      toneAnalysis,
      reviewStatus: "approved",
      reviewNote: REVIEW_NOTE,
      publishState: "published",
    };
  });
}

async function publishLesson(client, grammarId, stage, rows) {
  await client.query(
    `DELETE FROM ${GRAMMAR_EXAMPLES_TABLE} WHERE grammar_id = $1`,
    [grammarId],
  );

  for (const row of rows) {
    await client.query(
      `
      INSERT INTO ${GRAMMAR_EXAMPLES_TABLE} (
        grammar_id,
        sort_order,
        thai,
        romanization,
        english,
        breakdown,
        difficulty,
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
        $1, $2, $3, $4, $5, $6::jsonb, $7,
        $8, $9, $10::jsonb, $11, $12, $13, NULL, NULL,
        '[]'::jsonb, NULL, NULL, NULL, NULL, NULL, NOW(), NULL, NOW()
      )
      `,
      [
        row.grammarId,
        row.sortOrder,
        row.thai,
        row.romanization,
        row.english,
        JSON.stringify(row.breakdown),
        row.difficulty,
        row.toneConfidence,
        row.toneStatus,
        JSON.stringify(row.toneAnalysis),
        row.reviewStatus,
        row.reviewNote,
        row.publishState,
      ],
    );
  }

  await client.query(
    `
    INSERT INTO ${GRAMMAR_LESSON_PRODUCTION_TABLE} (
      grammar_id,
      stage,
      final_target_count,
      first_pass_candidate_target,
      supplemental_candidate_batch_size,
      current_rewrite_wave_id,
      last_published_at,
      notes,
      created_at,
      updated_at
    ) VALUES ($1, $2, 25, 40, 10, NULL, NOW(), $3, NOW(), NOW())
    ON CONFLICT (grammar_id)
    DO UPDATE SET
      stage = EXCLUDED.stage,
      current_rewrite_wave_id = NULL,
      last_published_at = NOW(),
      notes = EXCLUDED.notes,
      updated_at = NOW()
    `,
    [grammarId, stage, REVIEW_NOTE],
  );
}

async function main() {
  const { lessons, dryRun } = parseArgs();
  const lessonPayloads = [];

  for (const grammarId of lessons) {
    const finalLesson = readFinalLesson(grammarId);
    const sourceRows = await readSourceRows(grammarId);
    const publishedRows = buildLessonRows(grammarId, sourceRows, finalLesson.rows);
    lessonPayloads.push({ grammarId, stage: finalLesson.stage ?? "A2.1", rows: publishedRows });
  }

  if (dryRun) {
    console.log(
      JSON.stringify(
        lessonPayloads.map(({ grammarId, rows }) => ({
          grammarId,
          rowCount: rows.length,
          unresolvedToneItems: rows.reduce(
            (sum, row) => sum + Number(row.toneAnalysis?.unresolvedItemCount ?? 0),
            0,
          ),
        })),
        null,
        2,
      ),
    );
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const { grammarId, stage, rows } of lessonPayloads) {
      await publishLesson(client, grammarId, stage, rows);
      writeCsvMirror(grammarId, rows);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  console.log(
    JSON.stringify(
      lessonPayloads.map(({ grammarId, rows }) => ({
        grammarId,
        rowCount: rows.length,
        unresolvedToneItems: rows.reduce(
          (sum, row) => sum + Number(row.toneAnalysis?.unresolvedItemCount ?? 0),
          0,
        ),
      })),
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("Failed to publish overlap-reviewed A2.1 lessons:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
