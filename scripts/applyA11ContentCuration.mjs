import { pool } from "../db.js";

const CURATION_DATE = "2026-03-25";
const REVIEW_NOTE = `Manual A1.1 content curation ${CURATION_DATE}`;

function word({ thai, english, romanization, tones = [], grammar = false }) {
  const item = {
    thai,
    english,
    romanization,
  };

  if (grammar) {
    item.grammar = true;
  }

  if (tones.length === 1) {
    item.tone = tones[0];
  }

  if (tones.length > 0) {
    item.tones = tones;
  }

  return item;
}

const PATCHES = {
  7015: {
    thai: "เพื่อนไม่กินปลา",
    english: "My friend does not eat fish.",
    romanization: "phûean mâi gin plaa",
    breakdown: [
      word({ thai: "เพื่อน", english: "my friend", romanization: "phûean", tones: ["falling"] }),
      word({ thai: "ไม่", english: "not", romanization: "mâi", tones: ["falling"], grammar: true }),
      word({ thai: "กิน", english: "eat", romanization: "gin", tones: ["mid"] }),
      word({ thai: "ปลา", english: "fish", romanization: "plaa", tones: ["mid"] }),
    ],
  },
  7018: {
    thai: "ครูไม่ชอบผัก",
    english: "The teacher does not like vegetables.",
    romanization: "khruu mâi chôop phàk",
    breakdown: [
      word({ thai: "ครู", english: "teacher", romanization: "khruu", tones: ["mid"] }),
      word({ thai: "ไม่", english: "not", romanization: "mâi", tones: ["falling"], grammar: true }),
      word({ thai: "ชอบ", english: "like", romanization: "chôop", tones: ["falling"] }),
      word({ thai: "ผัก", english: "vegetables", romanization: "phàk", tones: ["low"] }),
    ],
  },
  7033: {
    thai: "ฉันไม่กินเผ็ด",
    english: "I do not eat spicy food.",
    romanization: "chǎn mâi gin phèt",
    breakdown: [
      word({ thai: "ฉัน", english: "I", romanization: "chǎn", tones: ["rising"] }),
      word({ thai: "ไม่", english: "not", romanization: "mâi", tones: ["falling"], grammar: true }),
      word({ thai: "กิน", english: "eat", romanization: "gin", tones: ["mid"] }),
      word({ thai: "เผ็ด", english: "spicy", romanization: "phèt", tones: ["low"] }),
    ],
  },
  7036: {
    thai: "ฉันไม่ดื่มชา",
    english: "I do not drink tea.",
    romanization: "chǎn mâi dùuem chaa",
    breakdown: [
      word({ thai: "ฉัน", english: "I", romanization: "chǎn", tones: ["rising"] }),
      word({ thai: "ไม่", english: "not", romanization: "mâi", tones: ["falling"], grammar: true }),
      word({ thai: "ดื่ม", english: "drink", romanization: "dùuem", tones: ["low"] }),
      word({ thai: "ชา", english: "tea", romanization: "chaa", tones: ["mid"] }),
    ],
  },
  7563: {
    thai: "ผมชื่อโต้งครับ",
    english: "My name is Tong. (male speaker)",
    romanization: "phǒm chûue Tông khráp",
    breakdown: [
      word({ thai: "ผม", english: "I (male)", romanization: "phǒm", tones: ["rising"], grammar: true }),
      word({ thai: "ชื่อ", english: "name", romanization: "chûue", tones: ["falling"], grammar: true }),
      word({ thai: "โต้ง", english: "Tong", romanization: "Tông", tones: ["falling"] }),
      word({ thai: "ครับ", english: "polite particle", romanization: "khráp", tones: ["high"], grammar: true }),
    ],
  },
  7564: {
    thai: "พี่ไปก่อนนะ",
    english: "I will go first, okay. (older speaker)",
    romanization: "phîi bpai gàwn ná",
    breakdown: [
      word({ thai: "พี่", english: "I / older speaker", romanization: "phîi", tones: ["falling"], grammar: true }),
      word({ thai: "ไป", english: "go", romanization: "bpai", tones: ["mid"] }),
      word({ thai: "ก่อน", english: "first", romanization: "gàwn", tones: ["low"] }),
      word({ thai: "นะ", english: "softening particle", romanization: "ná", tones: ["high"], grammar: true }),
    ],
  },
  7567: {
    thai: "หนูอยู่บ้านค่ะ",
    english: "I am at home. (younger/female speaker)",
    romanization: "nǔu yùu bâan khâ",
    breakdown: [
      word({ thai: "หนู", english: "I (younger speaker)", romanization: "nǔu", tones: ["rising"], grammar: true }),
      word({ thai: "อยู่", english: "be located", romanization: "yùu", tones: ["low"] }),
      word({ thai: "บ้าน", english: "home", romanization: "bâan", tones: ["falling"] }),
      word({ thai: "ค่ะ", english: "polite particle", romanization: "khâ", tones: ["falling"], grammar: true }),
    ],
  },
  7613: {
    thai: "ฉันไม่มีรถ",
    english: "I do not have a car.",
    romanization: "chǎn mâi mii rót",
    breakdown: [
      word({ thai: "ฉัน", english: "I", romanization: "chǎn", tones: ["rising"] }),
      word({ thai: "ไม่มี", english: "do not have", romanization: "mâi mii", tones: ["falling", "mid"], grammar: true }),
      word({ thai: "รถ", english: "car", romanization: "rót", tones: ["high"] }),
    ],
  },
  7615: {
    thai: "ที่นี่ไม่มีชา",
    english: "There is no tea here.",
    romanization: "thîi nîi mâi mii chaa",
    breakdown: [
      word({ thai: "ที่นี่", english: "here", romanization: "thîi nîi", tones: ["falling", "falling"] }),
      word({ thai: "ไม่มี", english: "there is no", romanization: "mâi mii", tones: ["falling", "mid"], grammar: true }),
      word({ thai: "ชา", english: "tea", romanization: "chaa", tones: ["mid"] }),
    ],
  },
  7616: {
    thai: "ฉันไม่มีหมา",
    english: "I do not have a dog.",
    romanization: "chǎn mâi mii mǎa",
    breakdown: [
      word({ thai: "ฉัน", english: "I", romanization: "chǎn", tones: ["rising"] }),
      word({ thai: "ไม่มี", english: "do not have", romanization: "mâi mii", tones: ["falling", "mid"], grammar: true }),
      word({ thai: "หมา", english: "dog", romanization: "mǎa", tones: ["rising"] }),
    ],
  },
  7664: {
    thai: "นี่ไม่ใช่น้ำ",
    english: "This is not water.",
    romanization: "nîi mâi châi náam",
    breakdown: [
      word({ thai: "นี่", english: "this", romanization: "nîi", tones: ["falling"] }),
      word({ thai: "ไม่ใช่", english: "is not", romanization: "mâi châi", tones: ["falling", "falling"], grammar: true }),
      word({ thai: "น้ำ", english: "water", romanization: "náam", tones: ["high"] }),
    ],
  },
  7665: {
    thai: "ฉันไม่ใช่ครู",
    english: "I am not a teacher.",
    romanization: "chǎn mâi châi khruu",
    breakdown: [
      word({ thai: "ฉัน", english: "I", romanization: "chǎn", tones: ["rising"] }),
      word({ thai: "ไม่ใช่", english: "am not", romanization: "mâi châi", tones: ["falling", "falling"], grammar: true }),
      word({ thai: "ครู", english: "teacher", romanization: "khruu", tones: ["mid"] }),
    ],
  },
  7667: {
    thai: "นี่ไม่ใช่บ้าน",
    english: "This is not a house.",
    romanization: "nîi mâi châi bâan",
    breakdown: [
      word({ thai: "นี่", english: "this", romanization: "nîi", tones: ["falling"] }),
      word({ thai: "ไม่ใช่", english: "is not", romanization: "mâi châi", tones: ["falling", "falling"], grammar: true }),
      word({ thai: "บ้าน", english: "house", romanization: "bâan", tones: ["falling"] }),
    ],
  },
  7763: {
    thai: "ผมไปก่อนครับ",
    english: "I will go first. (male speaker)",
    romanization: "phǒm bpai gàwn khráp",
    breakdown: [
      word({ thai: "ผม", english: "I (male)", romanization: "phǒm", tones: ["rising"], grammar: true }),
      word({ thai: "ไป", english: "go", romanization: "bpai", tones: ["mid"] }),
      word({ thai: "ก่อน", english: "first", romanization: "gàwn", tones: ["low"] }),
      word({ thai: "ครับ", english: "polite particle", romanization: "khráp", tones: ["high"], grammar: true }),
    ],
  },
  7764: {
    thai: "หนูหิวค่ะ",
    english: "I am hungry. (younger/female speaker)",
    romanization: "nǔu hǐu khâ",
    breakdown: [
      word({ thai: "หนู", english: "I (younger speaker)", romanization: "nǔu", tones: ["rising"], grammar: true }),
      word({ thai: "หิว", english: "hungry", romanization: "hǐu", tones: ["rising"] }),
      word({ thai: "ค่ะ", english: "polite particle", romanization: "khâ", tones: ["falling"], grammar: true }),
    ],
  },
  7765: {
    thai: "คุณว่างไหมคะ",
    english: "Are you free? (female speaker)",
    romanization: "khun wâang mái khá",
    breakdown: [
      word({ thai: "คุณ", english: "you", romanization: "khun", tones: ["mid"] }),
      word({ thai: "ว่าง", english: "free", romanization: "wâang", tones: ["falling"] }),
      word({ thai: "ไหม", english: "question particle", romanization: "mái", tones: ["rising"], grammar: true }),
      word({ thai: "คะ", english: "polite particle", romanization: "khá", tones: ["high"], grammar: true }),
    ],
  },
  7821: {
    thai: "คุณกินข้าวไหม",
    english: "Do you eat rice?",
    romanization: "khun gin khâao mái",
    breakdown: [
      word({ thai: "คุณ", english: "you", romanization: "khun", tones: ["mid"] }),
      word({ thai: "กิน", english: "eat", romanization: "gin", tones: ["mid"] }),
      word({ thai: "ข้าว", english: "rice", romanization: "khâao", tones: ["falling"] }),
      word({ thai: "ไหม", english: "question particle", romanization: "mái", tones: ["rising"], grammar: true }),
    ],
  },
  7854: {
    thai: "คุณดื่มชาไหม",
    english: "Do you drink tea?",
    romanization: "khun dùuem chaa mái",
    breakdown: [
      word({ thai: "คุณ", english: "you", romanization: "khun", tones: ["mid"] }),
      word({ thai: "ดื่ม", english: "drink", romanization: "dùuem", tones: ["low"] }),
      word({ thai: "ชา", english: "tea", romanization: "chaa", tones: ["mid"] }),
      word({ thai: "ไหม", english: "question particle", romanization: "mái", tones: ["rising"], grammar: true }),
    ],
  },
  7857: {
    thai: "คุณมาไหม",
    english: "Are you coming?",
    romanization: "khun maa mái",
    breakdown: [
      word({ thai: "คุณ", english: "you", romanization: "khun", tones: ["mid"] }),
      word({ thai: "มา", english: "come", romanization: "maa", tones: ["mid"] }),
      word({ thai: "ไหม", english: "question particle", romanization: "mái", tones: ["rising"], grammar: true }),
    ],
  },
  8013: {
    thai: "ฉันมีแมว",
    english: "I have a cat.",
    romanization: "chǎn mii maew",
    breakdown: [
      word({ thai: "ฉัน", english: "I", romanization: "chǎn", tones: ["rising"] }),
      word({ thai: "มี", english: "have", romanization: "mii", tones: ["mid"], grammar: true }),
      word({ thai: "แมว", english: "cat", romanization: "maew", tones: ["mid"] }),
    ],
  },
  8017: {
    thai: "เขามีรถ",
    english: "He has a car.",
    romanization: "khǎo mii rót",
    breakdown: [
      word({ thai: "เขา", english: "he", romanization: "khǎo", tones: ["rising"] }),
      word({ thai: "มี", english: "have", romanization: "mii", tones: ["mid"], grammar: true }),
      word({ thai: "รถ", english: "car", romanization: "rót", tones: ["high"] }),
    ],
  },
  8020: {
    thai: "ฉันมีเพื่อน",
    english: "I have a friend.",
    romanization: "chǎn mii phûean",
    breakdown: [
      word({ thai: "ฉัน", english: "I", romanization: "chǎn", tones: ["rising"] }),
      word({ thai: "มี", english: "have", romanization: "mii", tones: ["mid"], grammar: true }),
      word({ thai: "เพื่อน", english: "friend", romanization: "phûean", tones: ["falling"] }),
    ],
  },
  8113: {
    thai: "ฉันมาจากไทย",
    english: "I am from Thailand.",
    romanization: "chǎn maa jàak thai",
    breakdown: [
      word({ thai: "ฉัน", english: "I", romanization: "chǎn", tones: ["rising"] }),
      word({ thai: "มาจาก", english: "come from", romanization: "maa jàak", tones: ["mid", "low"], grammar: true }),
      word({ thai: "ไทย", english: "Thailand", romanization: "thai", tones: ["mid"] }),
    ],
  },
  8115: {
    thai: "คุณมาจากไหน",
    english: "Where are you from?",
    romanization: "khun maa jàak nǎi",
    breakdown: [
      word({ thai: "คุณ", english: "you", romanization: "khun", tones: ["mid"] }),
      word({ thai: "มาจาก", english: "come from", romanization: "maa jàak", tones: ["mid", "low"], grammar: true }),
      word({ thai: "ไหน", english: "where", romanization: "nǎi", tones: ["rising"], grammar: true }),
    ],
  },
  8118: {
    thai: "คุณมาจากจีน",
    english: "You are from China.",
    romanization: "khun maa jàak jiin",
    breakdown: [
      word({ thai: "คุณ", english: "you", romanization: "khun", tones: ["mid"] }),
      word({ thai: "มาจาก", english: "come from", romanization: "maa jàak", tones: ["mid", "low"], grammar: true }),
      word({ thai: "จีน", english: "China", romanization: "jiin", tones: ["mid"] }),
    ],
  },
  8613: {
    thai: "เธอดื่มน้ำ",
    english: "She drinks water.",
    romanization: "thoe dùuem náam",
    breakdown: [
      word({ thai: "เธอ", english: "she", romanization: "thoe", tones: ["mid"] }),
      word({ thai: "ดื่ม", english: "drink", romanization: "dùuem", tones: ["low"] }),
      word({ thai: "น้ำ", english: "water", romanization: "náam", tones: ["high"] }),
    ],
  },
  8614: {
    thai: "พ่อกินข้าว",
    english: "Dad eats rice.",
    romanization: "phâaw gin khâao",
    breakdown: [
      word({ thai: "พ่อ", english: "dad", romanization: "phâaw", tones: ["falling"] }),
      word({ thai: "กิน", english: "eat", romanization: "gin", tones: ["mid"] }),
      word({ thai: "ข้าว", english: "rice", romanization: "khâao", tones: ["falling"] }),
    ],
  },
  8615: {
    thai: "ฉันซื้อเสื้อ",
    english: "I buy a shirt.",
    romanization: "chǎn súue sûuea",
    breakdown: [
      word({ thai: "ฉัน", english: "I", romanization: "chǎn", tones: ["rising"] }),
      word({ thai: "ซื้อ", english: "buy", romanization: "súue", tones: ["high"] }),
      word({ thai: "เสื้อ", english: "shirt", romanization: "sûuea", tones: ["falling"] }),
    ],
  },
  8635: {
    thai: "ครูกินข้าว",
    english: "The teacher eats rice.",
    romanization: "khruu gin khâao",
    breakdown: [
      word({ thai: "ครู", english: "teacher", romanization: "khruu", tones: ["mid"] }),
      word({ thai: "กิน", english: "eat", romanization: "gin", tones: ["mid"] }),
      word({ thai: "ข้าว", english: "rice", romanization: "khâao", tones: ["falling"] }),
    ],
  },
  8863: {
    thai: "ฉันไปตลาด",
    english: "I go to the market.",
    romanization: "chǎn bpai dtà-làat",
    breakdown: [
      word({ thai: "ฉัน", english: "I", romanization: "chǎn", tones: ["rising"] }),
      word({ thai: "ไป", english: "go", romanization: "bpai", tones: ["mid"], grammar: true }),
      word({ thai: "ตลาด", english: "market", romanization: "dtà-làat", tones: ["low", "low"] }),
    ],
  },
  8864: {
    thai: "เขามาที่นี่",
    english: "He comes here.",
    romanization: "khǎo maa thîi nîi",
    breakdown: [
      word({ thai: "เขา", english: "he", romanization: "khǎo", tones: ["rising"] }),
      word({ thai: "มา", english: "come", romanization: "maa", tones: ["mid"], grammar: true }),
      word({ thai: "ที่นี่", english: "here", romanization: "thîi nîi", tones: ["falling", "falling"] }),
    ],
  },
  8865: {
    thai: "ฉันมาหาแม่",
    english: "I come to see Mom.",
    romanization: "chǎn maa hǎa mâe",
    breakdown: [
      word({ thai: "ฉัน", english: "I", romanization: "chǎn", tones: ["rising"] }),
      word({ thai: "มา", english: "come", romanization: "maa", tones: ["mid"], grammar: true }),
      word({ thai: "หา", english: "see", romanization: "hǎa", tones: ["rising"] }),
      word({ thai: "แม่", english: "Mom", romanization: "mâe", tones: ["falling"] }),
    ],
  },
  8913: {
    thai: "เขาเป็นครู",
    english: "He is a teacher.",
    romanization: "khǎo bpen khruu",
    breakdown: [
      word({ thai: "เขา", english: "he", romanization: "khǎo", tones: ["rising"] }),
      word({ thai: "เป็น", english: "be", romanization: "bpen", tones: ["mid"], grammar: true }),
      word({ thai: "ครู", english: "teacher", romanization: "khruu", tones: ["mid"] }),
    ],
  },
  8914: {
    thai: "ฉันเป็นแม่",
    english: "I am a mother.",
    romanization: "chǎn bpen mâe",
    breakdown: [
      word({ thai: "ฉัน", english: "I", romanization: "chǎn", tones: ["rising"] }),
      word({ thai: "เป็น", english: "be", romanization: "bpen", tones: ["mid"], grammar: true }),
      word({ thai: "แม่", english: "mother", romanization: "mâe", tones: ["falling"] }),
    ],
  },
  8929: {
    thai: "น้องเป็นเด็ก",
    english: "The younger sibling is a child.",
    romanization: "nóng bpen dèk",
    breakdown: [
      word({ thai: "น้อง", english: "younger sibling", romanization: "nóng", tones: ["high"] }),
      word({ thai: "เป็น", english: "be", romanization: "bpen", tones: ["mid"], grammar: true }),
      word({ thai: "เด็ก", english: "child", romanization: "dèk", tones: ["low"] }),
    ],
  },
  8982: {
    thai: "เขาเป็นใคร",
    english: "Who is he?",
    romanization: "khǎo bpen khrai",
    breakdown: [
      word({ thai: "เขา", english: "he", romanization: "khǎo", tones: ["rising"] }),
      word({ thai: "เป็น", english: "be", romanization: "bpen", tones: ["mid"] }),
      word({ thai: "ใคร", english: "who", romanization: "khrai", tones: ["mid"], grammar: true }),
    ],
  },
};

const ROWS_TO_FLAG = [7776, 7794, 7795];

async function assertRowsExist(ids) {
  const result = await pool.query(
    `
    SELECT id
    FROM grammar_examples
    WHERE id = ANY($1::bigint[])
    `,
    [ids],
  );

  if (result.rows.length !== ids.length) {
    const existing = new Set(result.rows.map((row) => Number(row.id)));
    const missing = ids.filter((id) => !existing.has(id));
    throw new Error(`Missing expected grammar_examples rows: ${missing.join(", ")}`);
  }
}

async function main() {
  const patchIds = Object.keys(PATCHES).map(Number);
  const allIds = [...new Set([...patchIds, ...ROWS_TO_FLAG])];
  await assertRowsExist(allIds);

  await pool.query("BEGIN");

  try {
    for (const rowId of ROWS_TO_FLAG) {
      await pool.query(
        `
        UPDATE grammar_examples
        SET
          review_status = 'flagged',
          tone_status = 'review',
          review_note = $1,
          last_edited_at = NOW(),
          tone_analysis = $2::jsonb
        WHERE id = $3
        `,
        [
          `${REVIEW_NOTE} (replaced with simpler sentence set)`,
          JSON.stringify({
            source: "manual-a11-content-curation",
            curatedAt: CURATION_DATE,
            action: "flagged-replaced-row",
          }),
          rowId,
        ],
      );
    }

    for (const [rowIdText, patch] of Object.entries(PATCHES)) {
      const rowId = Number(rowIdText);
      await pool.query(
        `
        UPDATE grammar_examples
        SET
          thai = $1,
          english = $2,
          romanization = $3,
          breakdown = $4::jsonb,
          tone_confidence = 100,
          tone_status = 'approved',
          review_status = 'approved',
          review_note = $5,
          tone_analysis = $6::jsonb,
          approved_at = COALESCE(approved_at, NOW()),
          last_edited_at = NOW()
        WHERE id = $7
        `,
        [
          patch.thai,
          patch.english,
          patch.romanization,
          JSON.stringify(patch.breakdown),
          REVIEW_NOTE,
          JSON.stringify({
            source: "manual-a11-content-curation",
            curatedAt: CURATION_DATE,
            action: "approved-manual-content",
          }),
          rowId,
        ],
      );
    }

    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }

  console.log(
    `Applied manual A1.1 content curation to ${patchIds.length} rows and flagged ${ROWS_TO_FLAG.length} replaced rows.`,
  );
}

main()
  .catch((error) => {
    console.error("Failed to apply manual A1.1 content curation:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
