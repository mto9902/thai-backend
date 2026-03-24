import { pool } from "../db.js";

const REVIEW_DATE = "2026-03-24";
const REVIEW_NOTE = `Manual A1.1 review completed ${REVIEW_DATE}`;

const REVIEWED_ROW_IDS = [
  8613, 8635, 7776, 7794, 7795, 7513, 7517, 7522, 7523, 7525, 7531, 7536,
  7537, 7542, 7546, 7554, 7566, 7272, 7286, 7288, 7290, 7297, 7303, 7033,
  7036, 7813, 7821, 7826, 7837, 7854, 7857, 8965, 8968, 8970, 8982, 8991,
  9003, 8013, 7463, 7481, 7484, 7493, 7914, 7918, 7936, 7945, 7956,
];

const MAI_QUESTION_ROWS = new Set([
  7776, 7794, 7795, 7813, 7821, 7826, 7837, 7854, 7857,
]);

const ROW_PATCHES = {
  7522: {
    romanization: "dèk chûe Fâa",
  },
  7536: {
    english: "The older sibling is named San.",
  },
  7493: {
    english: "The grandchild is at home.",
  },
  7826: {
    thai: "คุณดูหนังไหม",
    romanization: "khun duu năng mái",
    english: "Do you watch movies?",
    breakdown: [
      { thai: "คุณ", english: "You", romanization: "khun", tones: ["mid"] },
      { thai: "ดู", english: "watch", romanization: "duu", tones: ["mid"] },
      { thai: "หนัง", english: "movies", romanization: "năng", tones: ["rising"] },
      { thai: "ไหม", english: "?", romanization: "mái", tones: ["high"] },
    ],
  },
  7837: {
    thai: "คุณกินปลาไหม",
    romanization: "khun gin plaa mái",
    english: "Do you eat fish?",
    breakdown: [
      { thai: "คุณ", english: "You", romanization: "khun", tones: ["mid"] },
      { thai: "กิน", english: "eat", romanization: "gin", tones: ["mid"] },
      { thai: "ปลา", english: "fish", romanization: "plaa", tones: ["mid"] },
      { thai: "ไหม", english: "?", romanization: "mái", tones: ["high"] },
    ],
  },
  7918: {
    thai: "บ้านโน่นใหญ่",
    romanization: "bâan nôon yài",
    english: "That house over there is big.",
    breakdown: [
      { thai: "บ้าน", english: "house", romanization: "bâan", tones: ["falling"] },
      { thai: "โน่น", english: "over there", romanization: "nôon", tones: ["falling"] },
      { thai: "ใหญ่", english: "is big", romanization: "yài", tones: ["low"] },
    ],
  },
  8982: {
    romanization: "khun pai duu năng thîi năi",
  },
};

function cloneBreakdown(breakdown) {
  return Array.isArray(breakdown)
    ? breakdown.map((item) => ({
        ...item,
        tones: Array.isArray(item?.tones) ? [...item.tones] : [],
      }))
    : [];
}

function patchBreakdown(row) {
  const rowId = Number(row.id);

  if (ROW_PATCHES[rowId]?.breakdown) {
    return cloneBreakdown(ROW_PATCHES[rowId].breakdown);
  }

  const breakdown = cloneBreakdown(row.breakdown);

  for (const item of breakdown) {
    if (rowId === 7522 && item.thai === "ฟ้า") {
      item.romanization = "Fâa";
      item.tone = "falling";
      item.tones = ["falling"];
    }

    if (rowId === 7536 && item.thai === "พี่") {
      item.english = "Older sibling";
    }

    if (rowId === 7493 && item.thai === "หลาน") {
      item.english = "The grandchild";
    }

    if (rowId === 8982 && item.thai === "หนัง") {
      item.romanization = "năng";
    }

    if (MAI_QUESTION_ROWS.has(rowId) && item.thai === "ไหม") {
      item.tone = "high";
      item.tones = ["high"];
    }
  }

  return breakdown;
}

async function main() {
  const result = await pool.query(
    `
    SELECT
      id,
      thai,
      romanization,
      english,
      breakdown
    FROM grammar_examples
    WHERE id = ANY($1::bigint[])
    ORDER BY id ASC
    `,
    [REVIEWED_ROW_IDS],
  );

  if (result.rows.length !== REVIEWED_ROW_IDS.length) {
    throw new Error(
      `Expected ${REVIEWED_ROW_IDS.length} rows, found ${result.rows.length}. Aborting manual review patch.`,
    );
  }

  for (const row of result.rows) {
    const rowId = Number(row.id);
    const patch = ROW_PATCHES[rowId] ?? {};
    const breakdown = patchBreakdown(row);
    const toneAnalysis = {
      source: "manual-a11-review",
      reviewedAt: REVIEW_DATE,
      reviewVersion: 1,
      changed: Boolean(Object.keys(patch).length > 0 || MAI_QUESTION_ROWS.has(rowId)),
    };

    await pool.query(
      `
      UPDATE grammar_examples
      SET
        thai = $1,
        romanization = $2,
        english = $3,
        breakdown = $4::jsonb,
        tone_confidence = 100,
        tone_status = 'approved',
        review_status = 'approved',
        tone_analysis = $5::jsonb,
        review_note = COALESCE(NULLIF(review_note, ''), $6),
        approved_at = COALESCE(approved_at, NOW()),
        last_edited_at = NOW()
      WHERE id = $7
      `,
      [
        patch.thai ?? row.thai,
        patch.romanization ?? row.romanization,
        patch.english ?? row.english,
        JSON.stringify(breakdown),
        JSON.stringify(toneAnalysis),
        REVIEW_NOTE,
        row.id,
      ],
    );
  }

  console.log(`Manually reviewed ${result.rows.length} A1.1 rows.`);
}

main()
  .catch((err) => {
    console.error("Failed to apply manual A1.1 review:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
