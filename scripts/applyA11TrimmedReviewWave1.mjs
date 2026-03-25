import { pool } from "../db.js";

const REVIEW_DATE = "2026-03-25";
const REVIEW_NOTE = `Manual A1.1 trimmed-bank review ${REVIEW_DATE}`;

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

const APPROVE_ONLY_IDS = [
  7830, 7814, 7849, 7828, 7818, 7827, 7842,
  8982, 8976, 8967, 8978, 9011, 9006,
  7503, 7479, 7475, 7490, 7504, 7487, 7494, 7495, 7501, 7499, 7486,
  8017, 8020, 8057, 8033, 8055, 8018, 8037, 8022, 8051, 8027, 8032,
  8913, 8929, 8916, 8921, 8924, 8927, 8935, 8917, 8920, 8944, 8946,
  7664, 7665, 7667, 7687, 7688, 7689, 7694, 7698, 7705, 7710, 7711,
  7669, 7699, 7696, 7691, 7668, 7712, 7695, 7703,
  8863, 8864, 8903, 8869, 8872, 8867, 8888, 8897, 8901, 8906, 8884,
  8879, 8883, 8900, 8866, 8910, 8909, 8908, 8877, 8894, 8898,
];

const ROW_PATCHES = {
  7845: {
    romanization: "khun tham-ngaan mái",
    english: "Do you work?",
    breakdown: [
      word({ thai: "คุณ", english: "you", romanization: "khun", tones: ["mid"] }),
      word({ thai: "ทำงาน", english: "work", romanization: "tham-ngaan", tones: ["mid", "mid"] }),
      word({ thai: "ไหม", english: "question particle", romanization: "mái", tones: ["rising"], grammar: true }),
    ],
  },
  7853: {
    romanization: "khun khâo-jai mái",
    english: "Do you understand?",
    breakdown: [
      word({ thai: "คุณ", english: "you", romanization: "khun", tones: ["mid"] }),
      word({ thai: "เข้าใจ", english: "understand", romanization: "khâo-jai", tones: ["falling", "mid"] }),
      word({ thai: "ไหม", english: "question particle", romanization: "mái", tones: ["rising"], grammar: true }),
    ],
  },
  7815: {
    romanization: "wan-níi rón mái",
    english: "Is it hot today?",
    breakdown: [
      word({ thai: "วันนี้", english: "today", romanization: "wan-níi", tones: ["mid", "high"] }),
      word({ thai: "ร้อน", english: "hot", romanization: "rón", tones: ["high"] }),
      word({ thai: "ไหม", english: "question marker", romanization: "mái", tones: ["rising"], grammar: true }),
    ],
  },
  7858: {
    romanization: "wan-níi wan-yùt mái",
    english: "Is today a day off?",
    breakdown: [
      word({ thai: "วันนี้", english: "today", romanization: "wan-níi", tones: ["mid", "high"] }),
      word({ thai: "วันหยุด", english: "day off", romanization: "wan-yùt", tones: ["mid", "low"] }),
      word({ thai: "ไหม", english: "question marker", romanization: "mái", tones: ["rising"], grammar: true }),
    ],
  },
  7819: {
    romanization: "wan-níi wan-sǎo mái",
    english: "Is today Saturday?",
    breakdown: [
      word({ thai: "วันนี้", english: "today", romanization: "wan-níi", tones: ["mid", "high"] }),
      word({ thai: "วันเสาร์", english: "Saturday", romanization: "wan-sǎo", tones: ["mid", "rising"] }),
      word({ thai: "ไหม", english: "question marker", romanization: "mái", tones: ["rising"], grammar: true }),
    ],
  },
  7859: {
    romanization: "khǎo duu thii-wii mái",
    english: "Does he watch TV?",
    breakdown: [
      word({ thai: "เขา", english: "he", romanization: "khǎo", tones: ["rising"] }),
      word({ thai: "ดู", english: "watch", romanization: "duu", tones: ["mid"] }),
      word({ thai: "ทีวี", english: "TV", romanization: "thii-wii", tones: ["mid", "mid"] }),
      word({ thai: "ไหม", english: "question marker", romanization: "mái", tones: ["rising"], grammar: true }),
    ],
  },
  7816: {
    romanization: "khun chôop gaa-fae mái",
    english: "Do you like coffee?",
    breakdown: [
      word({ thai: "คุณ", english: "you", romanization: "khun", tones: ["mid"] }),
      word({ thai: "ชอบ", english: "like", romanization: "chôop", tones: ["falling"] }),
      word({ thai: "กาแฟ", english: "coffee", romanization: "gaa-fae", tones: ["mid", "mid"] }),
      word({ thai: "ไหม", english: "question marker", romanization: "mái", tones: ["rising"], grammar: true }),
    ],
  },
  7817: {
    romanization: "khǎo bpai tham-ngaan mái",
    english: "Is he going to work?",
    breakdown: [
      word({ thai: "เขา", english: "he", romanization: "khǎo", tones: ["rising"] }),
      word({ thai: "ไป", english: "go", romanization: "bpai", tones: ["mid"] }),
      word({ thai: "ทำงาน", english: "work", romanization: "tham-ngaan", tones: ["mid", "mid"] }),
      word({ thai: "ไหม", english: "question marker", romanization: "mái", tones: ["rising"], grammar: true }),
    ],
  },
  7832: {
    romanization: "wan-níi mii fǒn mái",
    english: "Is there rain today?",
    breakdown: [
      word({ thai: "วันนี้", english: "today", romanization: "wan-níi", tones: ["mid", "high"] }),
      word({ thai: "มี", english: "there is", romanization: "mii", tones: ["mid"] }),
      word({ thai: "ฝน", english: "rain", romanization: "fǒn", tones: ["rising"] }),
      word({ thai: "ไหม", english: "question marker", romanization: "mái", tones: ["rising"], grammar: true }),
    ],
  },
  7843: {
    romanization: "khun tham aa-hǎan mái",
    english: "Do you cook?",
    breakdown: [
      word({ thai: "คุณ", english: "you", romanization: "khun", tones: ["mid"] }),
      word({ thai: "ทำ", english: "cook", romanization: "tham", tones: ["mid"] }),
      word({ thai: "อาหาร", english: "food", romanization: "aa-hǎan", tones: ["mid", "rising"] }),
      word({ thai: "ไหม", english: "question marker", romanization: "mái", tones: ["rising"], grammar: true }),
    ],
  },
  7613: {
    breakdown: [
      word({ thai: "ฉัน", english: "I", romanization: "chǎn", tones: ["rising"] }),
      word({ thai: "ไม่มี", english: "do not have", romanization: "mâi mii", tones: ["falling", "mid"], grammar: true }),
      word({ thai: "รถ", english: "car", romanization: "rót", tones: ["high"] }),
    ],
  },
  7616: {
    breakdown: [
      word({ thai: "ฉัน", english: "I", romanization: "chǎn", tones: ["rising"] }),
      word({ thai: "ไม่มี", english: "do not have", romanization: "mâi mii", tones: ["falling", "mid"], grammar: true }),
      word({ thai: "หมา", english: "dog", romanization: "mǎa", tones: ["rising"] }),
    ],
  },
  7615: {
    breakdown: [
      word({ thai: "ที่นี่", english: "here", romanization: "thîi nîi", tones: ["falling", "falling"] }),
      word({ thai: "ไม่มี", english: "there is no", romanization: "mâi mii", tones: ["falling", "mid"], grammar: true }),
      word({ thai: "ชา", english: "tea", romanization: "chaa", tones: ["mid"] }),
    ],
  },
  7622: {
    romanization: "wan-níi mâi mii fǒn",
    breakdown: [
      word({ thai: "วันนี้", english: "today", romanization: "wan-níi", tones: ["mid", "high"] }),
      word({ thai: "ไม่มี", english: "there is no", romanization: "mâi mii", tones: ["falling", "mid"], grammar: true }),
      word({ thai: "ฝน", english: "rain", romanization: "fǒn", tones: ["rising"] }),
    ],
  },
  7620: {
    romanization: "khǎo mâi mii phûean",
    english: "He does not have a friend.",
    breakdown: [
      word({ thai: "เขา", english: "he", romanization: "khǎo", tones: ["rising"] }),
      word({ thai: "ไม่มี", english: "does not have", romanization: "mâi mii", tones: ["falling", "mid"], grammar: true }),
      word({ thai: "เพื่อน", english: "friend", romanization: "phûean", tones: ["falling"] }),
    ],
  },
  7614: {
    romanization: "wan-níi mâi mii wee-laa",
    breakdown: [
      word({ thai: "วันนี้", english: "today", romanization: "wan-níi", tones: ["mid", "high"] }),
      word({ thai: "ไม่มี", english: "there is no", romanization: "mâi mii", tones: ["falling", "mid"], grammar: true }),
      word({ thai: "เวลา", english: "time", romanization: "wee-laa", tones: ["mid", "mid"] }),
    ],
  },
  7659: {
    breakdown: [
      word({ thai: "ที่ห้อง", english: "in the room", romanization: "thîi hông", tones: ["falling", "falling"] }),
      word({ thai: "ไม่มี", english: "there is no", romanization: "mâi mii", tones: ["falling", "mid"], grammar: true }),
      word({ thai: "น้ำ", english: "water", romanization: "náam", tones: ["high"] }),
    ],
  },
  7656: {
    breakdown: [
      word({ thai: "ที่บ้าน", english: "at home", romanization: "thîi bâan", tones: ["falling", "falling"] }),
      word({ thai: "ไม่มี", english: "there are no", romanization: "mâi mii", tones: ["falling", "mid"], grammar: true }),
      word({ thai: "เด็ก", english: "children", romanization: "dèk", tones: ["low"] }),
    ],
  },
  8113: {
    breakdown: [
      word({ thai: "ฉัน", english: "I", romanization: "chǎn", tones: ["rising"] }),
      word({ thai: "มาจาก", english: "come from", romanization: "maa jàak", tones: ["mid", "low"], grammar: true }),
      word({ thai: "ไทย", english: "Thailand", romanization: "thai", tones: ["mid"] }),
    ],
  },
  8115: {
    breakdown: [
      word({ thai: "คุณ", english: "you", romanization: "khun", tones: ["mid"] }),
      word({ thai: "มาจาก", english: "come from", romanization: "maa jàak", tones: ["mid", "low"], grammar: true }),
      word({ thai: "ไหน", english: "where", romanization: "nǎi", tones: ["rising"], grammar: true }),
    ],
  },
  8118: {
    breakdown: [
      word({ thai: "คุณ", english: "you", romanization: "khun", tones: ["mid"] }),
      word({ thai: "มาจาก", english: "come from", romanization: "maa jàak", tones: ["mid", "low"], grammar: true }),
      word({ thai: "จีน", english: "China", romanization: "jiin", tones: ["mid"] }),
    ],
  },
  8114: {
    romanization: "khǎo maa jàak yîi-bpùn",
    breakdown: [
      word({ thai: "เขา", english: "he", romanization: "khǎo", tones: ["rising"] }),
      word({ thai: "มาจาก", english: "come from", romanization: "maa jàak", tones: ["mid", "low"], grammar: true }),
      word({ thai: "ญี่ปุ่น", english: "Japan", romanization: "yîi-bpùn", tones: ["falling", "low"] }),
    ],
  },
  7586: {
    thai: "หนูไปตลาดค่ะ",
    romanization: "nǔu bpai tà-làat khâ",
    english: "I am going to the market. (younger/female speaker)",
    breakdown: [
      word({ thai: "หนู", english: "I (younger speaker)", romanization: "nǔu", tones: ["rising"], grammar: true }),
      word({ thai: "ไป", english: "go", romanization: "bpai", tones: ["mid"] }),
      word({ thai: "ตลาด", english: "market", romanization: "tà-làat", tones: ["low", "low"] }),
      word({ thai: "ค่ะ", english: "polite particle", romanization: "khâ", tones: ["falling"], grammar: true }),
    ],
  },
  7599: {
    thai: "หนูทำการบ้านค่ะ",
    romanization: "nǔu tham gaan-bâan khâ",
    english: "I am doing homework. (younger/female speaker)",
    breakdown: [
      word({ thai: "หนู", english: "I (younger speaker)", romanization: "nǔu", tones: ["rising"], grammar: true }),
      word({ thai: "ทำ", english: "do", romanization: "tham", tones: ["mid"] }),
      word({ thai: "การบ้าน", english: "homework", romanization: "gaan-bâan", tones: ["mid", "falling"] }),
      word({ thai: "ค่ะ", english: "polite particle", romanization: "khâ", tones: ["falling"], grammar: true }),
    ],
  },
  7590: {
    thai: "หนูชอบฟังเพลงค่ะ",
    romanization: "nǔu chôop fang phleeng khâ",
    english: "I like to listen to music. (younger/female speaker)",
    breakdown: [
      word({ thai: "หนู", english: "I (younger speaker)", romanization: "nǔu", tones: ["rising"], grammar: true }),
      word({ thai: "ชอบ", english: "like", romanization: "chôop", tones: ["falling"] }),
      word({ thai: "ฟัง", english: "listen", romanization: "fang", tones: ["mid"] }),
      word({ thai: "เพลง", english: "music", romanization: "phleeng", tones: ["mid"] }),
      word({ thai: "ค่ะ", english: "polite particle", romanization: "khâ", tones: ["falling"], grammar: true }),
    ],
  },
  7600: {
    thai: "พี่ชอบกินข้าวค่ะ",
    romanization: "phîi chôop gin khâao khâ",
    english: "I like to eat rice. (older/female speaker)",
    breakdown: [
      word({ thai: "พี่", english: "I (older speaker)", romanization: "phîi", tones: ["falling"], grammar: true }),
      word({ thai: "ชอบ", english: "like", romanization: "chôop", tones: ["falling"] }),
      word({ thai: "กิน", english: "eat", romanization: "gin", tones: ["mid"] }),
      word({ thai: "ข้าว", english: "rice", romanization: "khâao", tones: ["falling"] }),
      word({ thai: "ค่ะ", english: "polite particle", romanization: "khâ", tones: ["falling"], grammar: true }),
    ],
  },
  7584: {
    thai: "หนูไปดูหนังค่ะ",
    romanization: "nǔu bpai duu năng khâ",
    english: "I go to watch a movie. (younger/female speaker)",
    breakdown: [
      word({ thai: "หนู", english: "I (younger speaker)", romanization: "nǔu", tones: ["rising"], grammar: true }),
      word({ thai: "ไป", english: "go", romanization: "bpai", tones: ["mid"] }),
      word({ thai: "ดู", english: "watch", romanization: "duu", tones: ["mid"] }),
      word({ thai: "หนัง", english: "movie", romanization: "năng", tones: ["rising"] }),
      word({ thai: "ค่ะ", english: "polite particle", romanization: "khâ", tones: ["falling"], grammar: true }),
    ],
  },
  7574: {
    thai: "หนูไปเล่นกับเพื่อนค่ะ",
    romanization: "nǔu bpai lên gàp phûean khâ",
    english: "I go to play with friends. (younger/female speaker)",
    breakdown: [
      word({ thai: "หนู", english: "I (younger speaker)", romanization: "nǔu", tones: ["rising"], grammar: true }),
      word({ thai: "ไป", english: "go", romanization: "bpai", tones: ["mid"] }),
      word({ thai: "เล่น", english: "play", romanization: "lên", tones: ["falling"] }),
      word({ thai: "กับ", english: "with", romanization: "gàp", tones: ["low"] }),
      word({ thai: "เพื่อน", english: "friends", romanization: "phûean", tones: ["falling"] }),
      word({ thai: "ค่ะ", english: "polite particle", romanization: "khâ", tones: ["falling"], grammar: true }),
    ],
  },
  7582: {
    thai: "หนูพาเพื่อนไปงานค่ะ",
    romanization: "nǔu phaa phûean bpai ngaan khâ",
    english: "I bring my friend to the event. (younger/female speaker)",
    breakdown: [
      word({ thai: "หนู", english: "I (younger speaker)", romanization: "nǔu", tones: ["rising"], grammar: true }),
      word({ thai: "พา", english: "bring", romanization: "phaa", tones: ["mid"] }),
      word({ thai: "เพื่อน", english: "friend", romanization: "phûean", tones: ["falling"] }),
      word({ thai: "ไป", english: "to", romanization: "bpai", tones: ["mid"] }),
      word({ thai: "งาน", english: "event", romanization: "ngaan", tones: ["mid"] }),
      word({ thai: "ค่ะ", english: "polite particle", romanization: "khâ", tones: ["falling"], grammar: true }),
    ],
  },
  7580: {
    thai: "หนูชอบว่ายน้ำค่ะ",
    romanization: "nǔu chôop wâai náam khâ",
    english: "I like to swim. (younger/female speaker)",
    breakdown: [
      word({ thai: "หนู", english: "I (younger speaker)", romanization: "nǔu", tones: ["rising"], grammar: true }),
      word({ thai: "ชอบ", english: "like", romanization: "chôop", tones: ["falling"] }),
      word({ thai: "ว่ายน้ำ", english: "swim", romanization: "wâai náam", tones: ["falling", "high"] }),
      word({ thai: "ค่ะ", english: "polite particle", romanization: "khâ", tones: ["falling"], grammar: true }),
    ],
  },
  7597: {
    thai: "หนูทำการบ้านเสร็จแล้วค่ะ",
    romanization: "nǔu tham gaan-bâan sèt láew khâ",
    english: "I have finished my homework. (younger/female speaker)",
    breakdown: [
      word({ thai: "หนู", english: "I (younger speaker)", romanization: "nǔu", tones: ["rising"], grammar: true }),
      word({ thai: "ทำ", english: "do", romanization: "tham", tones: ["mid"] }),
      word({ thai: "การบ้าน", english: "homework", romanization: "gaan-bâan", tones: ["mid", "falling"] }),
      word({ thai: "เสร็จแล้ว", english: "already finished", romanization: "sèt láew", tones: ["low", "high"] }),
      word({ thai: "ค่ะ", english: "polite particle", romanization: "khâ", tones: ["falling"], grammar: true }),
    ],
  },
  7606: {
    thai: "หนูจะไปว่ายน้ำค่ะ",
    romanization: "nǔu jà bpai wâai náam khâ",
    english: "I will go swimming. (younger/female speaker)",
    breakdown: [
      word({ thai: "หนู", english: "I (younger speaker)", romanization: "nǔu", tones: ["rising"], grammar: true }),
      word({ thai: "จะ", english: "will", romanization: "jà", tones: ["low"] }),
      word({ thai: "ไป", english: "go", romanization: "bpai", tones: ["mid"] }),
      word({ thai: "ว่ายน้ำ", english: "swim", romanization: "wâai náam", tones: ["falling", "high"] }),
      word({ thai: "ค่ะ", english: "polite particle", romanization: "khâ", tones: ["falling"], grammar: true }),
    ],
  },
};

const TARGET_ROW_IDS = Array.from(
  new Set([...APPROVE_ONLY_IDS, ...Object.keys(ROW_PATCHES).map(Number)]),
).sort((a, b) => a - b);

function cloneBreakdown(breakdown) {
  return Array.isArray(breakdown)
    ? breakdown.map((item) => ({
        ...item,
        tones: Array.isArray(item?.tones) ? [...item.tones] : [],
      }))
    : [];
}

function normalizeBreakdownItem(item) {
  const next = {
    ...item,
    tones: Array.isArray(item?.tones) ? [...item.tones] : [],
  };

  if (next.thai === "เขา") {
    next.romanization = "khǎo";
    next.tone = "rising";
    next.tones = ["rising"];
  }

  if (next.thai === "พวกเขา") {
    next.romanization = "phûak-khǎo";
    next.tones = ["falling", "rising"];
    delete next.tone;
  }

  if (next.thai === "เธอ") {
    next.romanization = "thoe";
    next.tone = "mid";
    next.tones = ["mid"];
  }

  if (next.thai === "ผม") {
    next.romanization = "phǒm";
    next.tone = "rising";
    next.tones = ["rising"];
  }

  if (next.thai === "เป็น") {
    next.romanization = "bpen";
    next.tone = "mid";
    next.tones = ["mid"];
  }

  if (next.tone && next.tones.length === 0) {
    next.tones = [next.tone];
  }

  if (next.tones.length === 1) {
    next.tone = next.tones[0];
  }

  return next;
}

function normalizeSentenceRomanization(text) {
  return String(text ?? "")
    .replace(/\bkháo\b/g, "khǎo")
    .replace(/\bkhăo\b/g, "khǎo")
    .replace(/\bkhao\b/g, "khǎo")
    .replace(/phûuak-kháo/g, "phûak-khǎo")
    .replace(/phûak-kháo/g, "phûak-khǎo")
    .replace(/phûuak kháo/g, "phûak-khǎo")
    .replace(/phûak kháo/g, "phûak-khǎo")
    .replace(/\bThoe\b/g, "thoe")
    .replace(/\bNîi\b/g, "nîi")
    .replace(/\bMan\b/g, "man");
}

async function main() {
  const result = await pool.query(
    `
    SELECT id, thai, romanization, english, breakdown
    FROM grammar_examples
    WHERE id = ANY($1::bigint[])
    ORDER BY id ASC
    `,
    [TARGET_ROW_IDS],
  );

  if (result.rows.length !== TARGET_ROW_IDS.length) {
    throw new Error(
      `Expected ${TARGET_ROW_IDS.length} rows, found ${result.rows.length}.`,
    );
  }

  for (const row of result.rows) {
    const rowId = Number(row.id);
    const patch = ROW_PATCHES[rowId] ?? {};
    const breakdown = patch.breakdown
      ? cloneBreakdown(patch.breakdown)
      : cloneBreakdown(row.breakdown).map(normalizeBreakdownItem);
    const toneAnalysis = {
      source: "manual-a11-trimmed-review",
      reviewedAt: REVIEW_DATE,
      reviewVersion: 1,
      changed: Boolean(Object.keys(patch).length > 0),
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
        review_note = $6,
        approved_at = COALESCE(approved_at, NOW()),
        last_edited_at = NOW()
      WHERE id = $7
      `,
      [
        patch.thai ?? row.thai,
        patch.romanization ?? normalizeSentenceRomanization(row.romanization),
        patch.english ?? row.english,
        JSON.stringify(breakdown),
        JSON.stringify(toneAnalysis),
        REVIEW_NOTE,
        row.id,
      ],
    );
  }

  console.log(`Manually reviewed ${result.rows.length} trimmed A1.1 rows.`);
}

main()
  .catch((error) => {
    console.error("Failed to apply trimmed A1.1 review wave 1:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
