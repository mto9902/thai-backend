import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { fileURLToPath } from "url";

import { pool } from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
const GRAMMAR_DIR = path.resolve(SERVER_ROOT, "grammar");
const MODEL = process.env.GRAMMAR_EXAMPLE_MODEL || "gpt-4o";
const BATCH_SIZE = Number.parseInt(process.env.GRAMMAR_EXAMPLE_BATCH_SIZE || "25", 10);
const DEFAULT_TARGET = Number.parseInt(
  process.env.GRAMMAR_EXAMPLE_TARGET_COUNT || "50",
  10,
);
const GRAMMAR_EXAMPLES_TABLE = "grammar_examples";
const WRITE_GRAMMAR_CSV_MIRROR = process.env.WRITE_GRAMMAR_CSV_MIRROR !== "false";
const VALID_TONES = new Set(["mid", "low", "falling", "high", "rising"]);
const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const ACCENTED_ROMANIZATION_REGEX =
  /[\u0300-\u036fàáâãäåèéêëìíîïòóôõöùúûüýÿāēīōūǎěǐǒǔḿńňŕśťźžÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝŸĀĒĪŌŪǍĚǏǑǓḾŃŇŔŚŤŹŽ]/u;
const COMMON_SUBJECT_SWAP_TOKENS = new Set([
  "i",
  "you",
  "he",
  "she",
  "we",
  "they",
  "it",
  "mom",
  "mum",
  "mother",
  "dad",
  "father",
  "teacher",
  "student",
  "friend",
  "brother",
  "sister",
  "grandma",
  "grandpa",
  "my",
  "your",
  "his",
  "her",
  "their",
]);
const FORBIDDEN_ROMANIZATION_REGEX = /[ʉɯəɤɔɒɕʔŋɲɳʰːɪʊɜɒ]/u;

const STAGE_CONFIG = {
  "A1.1": [
    {
      id: "svo",
      title: "Basic Sentence Order",
      stage: "A1.1",
      level: "A1",
      explanation:
        "Thai commonly follows a subject-verb-object pattern. This gives learners a reliable default shape for clear everyday statements.",
      pattern: "SUBJECT + VERB + OBJECT",
      focusParticle: "SVO order",
      focusMeaning:
        "The basic building pattern for simple Thai statements.",
    },
    {
      id: "polite-particles",
      title: "Polite Particles ครับ / ค่ะ / คะ",
      stage: "A1.1",
      level: "A1",
      explanation:
        "Thai uses sentence-final politeness particles to manage tone and social warmth. These endings are central to natural beginner speech from the start.",
      pattern: "SENTENCE + ครับ / ค่ะ / คะ",
      focusParticle: "ครับ / ค่ะ / คะ",
      focusMeaning:
        "Sentence endings that add politeness and speaker stance.",
    },
    {
      id: "name-chue",
      title: "Names with ชื่อ",
      stage: "A1.1",
      level: "A1",
      explanation:
        "Thai often states a name directly with ชื่อ. This lets beginners introduce themselves and ask one of the most common personal-detail questions right away.",
      pattern: "SUBJECT + ชื่อ + NAME",
      focusParticle: "ชื่อ",
      focusMeaning:
        "The everyday word used to state or ask a person's name.",
    },
    {
      id: "natural-address-pronouns",
      title: "Natural Address and Pronoun Dropping",
      stage: "A1.1",
      level: "A1",
      explanation:
        "Thai often leaves pronouns out when the context is clear, and speakers may also use names or kinship terms such as ผม, หนู, พี่, and น้อง in place of a neutral textbook pronoun. Learners need this early because it makes everyday Thai sound more natural in both personal and professional interaction.",
      pattern: "ผม / หนู / พี่ / น้อง + VERB / [PRONOUN OMITTED] + VERB",
      focusParticle: "ผม / หนู / พี่ / น้อง",
      focusMeaning:
        "Thai often uses context, names, or kinship terms instead of an explicit subject pronoun.",
    },
    {
      id: "identity-pen",
      title: "Identity with เป็น",
      stage: "A1.1",
      level: "A1",
      explanation:
        "Use เป็น with nouns for identity, profession, role, or type. It is different from adjective sentences, which usually do not need a copula.",
      pattern: "SUBJECT + เป็น + NOUN",
      focusParticle: "เป็น",
      focusMeaning:
        "Identity marker for jobs, labels, and classifications.",
    },
    {
      id: "adjectives",
      title: "Adjectives as Predicates",
      stage: "A1.1",
      level: "A1",
      explanation:
        "Thai adjectives can function like verbs, so no extra word for 'to be' is needed in simple descriptions. This helps learners form useful sentences very early.",
      pattern: "NOUN + ADJECTIVE",
      focusParticle: "No copula",
      focusMeaning:
        "Thai often links a noun directly to an adjective without 'is'.",
    },
    {
      id: "negative-mai",
      title: "Negation with ไม่",
      stage: "A1.1",
      level: "A1",
      explanation:
        "Place ไม่ before a verb or adjective to make the meaning negative. It is one of the first high-frequency grammar markers learners need.",
      pattern: "SUBJECT + ไม่ + VERB / ADJECTIVE",
      focusParticle: "ไม่",
      focusMeaning:
        "The core spoken negation marker used before verbs and adjectives.",
    },
    {
      id: "question-mai",
      title: "Yes or No Questions with ไหม",
      stage: "A1.1",
      level: "A1",
      explanation:
        "Add ไหม at the end of a statement to turn it into a yes or no question. Thai keeps the word order stable and changes the sentence with the final particle.",
      pattern: "STATEMENT + ไหม",
      focusParticle: "ไหม",
      focusMeaning: "Sentence-final particle for yes or no questions.",
    },
    {
      id: "question-words",
      title: "Basic Question Words",
      stage: "A1.1",
      level: "A1",
      explanation:
        "Question words such as อะไร, ใคร, ที่ไหน, and เท่าไร are essential for asking simple personal and practical questions in everyday situations.",
      pattern: "QUESTION WORD + CLAUSE / CLAUSE + QUESTION WORD",
      focusParticle: "อะไร / ใคร / ที่ไหน / เท่าไร",
      focusMeaning:
        "Core question words for asking what, who, where, and how much.",
    },
    {
      id: "have-mii",
      title: "Have / There Is with มี",
      stage: "A1.1",
      level: "A1",
      explanation:
        "มี expresses both possession and existence. It is a must-have everyday verb for talking about what someone has and what exists somewhere.",
      pattern: "SUBJECT + มี + NOUN",
      focusParticle: "มี",
      focusMeaning: "Core verb for possession and existence.",
    },
    {
      id: "no-have-mai-mii",
      title: "Absence with ไม่มี",
      stage: "A1.1",
      level: "A1",
      explanation:
        "ไม่มี is the natural pattern for saying somebody does not have something or something is not available. It is central for survival Thai in shops, homes, and simple planning.",
      pattern: "SUBJECT / PLACE + ไม่มี + NOUN",
      focusParticle: "ไม่มี",
      focusMeaning:
        "The core pattern for not having something or for absence.",
    },
    {
      id: "location-yuu",
      title: "Location with อยู่",
      stage: "A1.1",
      level: "A1",
      explanation:
        "อยู่ places someone or something in a location. It is one of the earliest structures used for daily life descriptions and basic conversation.",
      pattern: "SUBJECT + อยู่ + PLACE",
      focusParticle: "อยู่",
      focusMeaning:
        "Location verb used to say where somebody or something is.",
    },
    {
      id: "origin-maa-jaak",
      title: "Origin with มาจาก",
      stage: "A1.1",
      level: "A1",
      explanation:
        "มาจาก is a high-frequency beginner pattern for saying where somebody comes from. It supports the personal-detail exchanges expected at A1.",
      pattern: "SUBJECT + มาจาก + PLACE",
      focusParticle: "มาจาก",
      focusMeaning:
        "Common expression for origin or where somebody is from.",
    },
    {
      id: "this-that",
      title: "Demonstratives นี้ / นั้น / โน้น",
      stage: "A1.1",
      level: "A1",
      explanation:
        "Thai demonstratives usually come after the noun. This pattern lets learners point out people and things clearly in real situations.",
      pattern: "NOUN + นี้ / นั้น / โน้น",
      focusParticle: "นี้ / นั้น / โน้น",
      focusMeaning:
        "Post-noun demonstratives meaning this, that, and over there.",
    },
    {
      id: "not-identity-mai-chai",
      title: "Noun Negation with ไม่ใช่",
      stage: "A1.1",
      level: "A1",
      explanation:
        "ไม่ใช่ is the standard way to say something is not a person, thing, or category. It fills a core beginner gap that simple ไม่ does not cover on its own.",
      pattern: "SUBJECT + ไม่ใช่ + NOUN",
      focusParticle: "ไม่ใช่",
      focusMeaning:
        "The standard negation pattern for nouns and identity statements.",
    },
    {
      id: "go-come-pai-maa",
      title: "Movement with ไป / มา",
      stage: "A1.1",
      level: "A1",
      explanation:
        "ไป and มา are among the most basic Thai movement verbs. Learners need them early for daily routines, invitations, and simple directions.",
      pattern: "SUBJECT + ไป / มา + PLACE",
      focusParticle: "ไป / มา",
      focusMeaning: "Core movement verbs meaning go and come.",
    },
  ],
  "A1.2": [
    {
      id: "place-words",
      title: "Basic Place Words ใน / บน / ใต้ / ข้าง",
      stage: "A1.2",
      level: "A1",
      explanation:
        "Thai learners need a small set of place words early to describe where things are. These patterns support everyday tasks such as finding items and following simple directions.",
      pattern: "NOUN + อยู่ + ใน / บน / ใต้ / ข้าง + PLACE",
      focusParticle: "ใน / บน / ใต้ / ข้าง",
      focusMeaning:
        "Core place words for saying where people and things are.",
    },
    {
      id: "possession-khong",
      title: "Possession with ของ",
      stage: "A1.2",
      level: "A1",
      explanation:
        "ของ links something to its owner and appears constantly in early conversations about personal belongings, family, and everyday objects.",
      pattern: "THING + ของ + OWNER",
      focusParticle: "ของ",
      focusMeaning:
        "Basic possession marker linking a thing to its owner.",
    },
    {
      id: "want-yaak",
      title: "Want to with อยาก",
      stage: "A1.2",
      level: "A1",
      explanation:
        "อยาก helps learners express simple wants and immediate needs, which fits the concrete, everyday communication expected at A1.",
      pattern: "SUBJECT + อยาก + VERB",
      focusParticle: "อยาก",
      focusMeaning:
        "Common marker for wanting to do something.",
    },
    {
      id: "request-khor",
      title: "Requests with ขอ",
      stage: "A1.2",
      level: "A1",
      explanation:
        "ขอ is a polite request word used for asking for things, permission, or help. It is essential for food orders and basic service interactions.",
      pattern: "ขอ + NOUN / VERB + หน่อย",
      focusParticle: "ขอ",
      focusMeaning:
        "Polite request marker used before the thing or action requested.",
    },
    {
      id: "classifiers",
      title: "Counting with Classifiers",
      stage: "A1.2",
      level: "A1",
      explanation:
        "Thai uses classifiers after numbers, and this pattern appears constantly in shopping, ordering, and everyday quantity questions.",
      pattern: "NOUN + NUMBER + CLASSIFIER",
      focusParticle: "classifier",
      focusMeaning:
        "A counted noun is followed by a number and its classifier.",
    },
    {
      id: "price-thaorai",
      title: "Prices with เท่าไร",
      stage: "A1.2",
      level: "A1",
      explanation:
        "เท่าไร is one of the most practical beginner patterns for asking price. It directly supports A1 shopping and survival situations.",
      pattern: "THING + เท่าไร",
      focusParticle: "เท่าไร",
      focusMeaning:
        "Core price question word meaning how much.",
    },
    {
      id: "time-expressions",
      title: "Basic Time Expressions",
      stage: "A1.2",
      level: "A1",
      explanation:
        "Words such as วันนี้, ตอนนี้, and พรุ่งนี้ are essential from the beginning because learners need to place simple actions in time right away.",
      pattern: "TIME + CLAUSE / CLAUSE + TIME",
      focusParticle: "วันนี้ / ตอนนี้ / พรุ่งนี้",
      focusMeaning:
        "High-frequency time words for saying today, now, and tomorrow.",
    },
    {
      id: "imperatives",
      title: "Commands and Suggestions",
      stage: "A1.2",
      level: "A1",
      explanation:
        "Thai beginners need a few direct action patterns early for everyday interaction, especially simple commands and soft suggestions such as กัน and เถอะ.",
      pattern: "VERB / VERB + กัน / VERB + เถอะ",
      focusParticle: "กัน / เถอะ / เลย",
      focusMeaning:
        "Core suggestion and imperative markers for simple spoken interaction.",
    },
    {
      id: "negative-imperative-ya",
      title: "Negative Commands with อย่า",
      stage: "A1.2",
      level: "A1",
      explanation:
        "อย่า is the core beginner pattern for telling someone not to do something. It is high-frequency survival Thai for warnings, reminders, and simple rules.",
      pattern: "อย่า + VERB",
      focusParticle: "อย่า",
      focusMeaning:
        "Basic negative imperative marker meaning don't.",
    },
    {
      id: "can-dai",
      title: "Ability with ได้",
      stage: "A1.2",
      level: "A1",
      explanation:
        "Placed after a verb, ได้ gives beginners a simple way to talk about what they can do. It is one of the most practical early patterns in spoken Thai.",
      pattern: "SUBJECT + VERB + ได้",
      focusParticle: "ได้",
      focusMeaning:
        "Common post-verb marker for can, manage to, or be able to.",
    },
    {
      id: "future-ja",
      title: "Future with จะ",
      stage: "A1.2",
      level: "A1",
      explanation:
        "จะ marks future reference, plans, or intention. It appears very early because learners need it for simple plans and daily arrangements.",
      pattern: "SUBJECT + จะ + VERB",
      focusParticle: "จะ",
      focusMeaning:
        "Common future or intention marker placed before the verb.",
    },
    {
      id: "very-maak",
      title: "Degree with มาก / น้อย",
      stage: "A1.2",
      level: "A1",
      explanation:
        "Degree words like มาก and น้อย appear in very early Thai because learners need to describe how strong, how much, or how little something is.",
      pattern: "ADJECTIVE / VERB + มาก / น้อย",
      focusParticle: "มาก / น้อย",
      focusMeaning:
        "Basic degree words meaning very / a lot and little / not much.",
    },
    {
      id: "progressive-kamlang",
      title: "Ongoing Action with กำลัง",
      stage: "A1.2",
      level: "A1",
      explanation:
        "กำลัง gives learners a direct way to say something is happening now. It is extremely common in everyday speech and belongs early in the curriculum.",
      pattern: "SUBJECT + กำลัง + VERB",
      focusParticle: "กำลัง",
      focusMeaning:
        "Common marker for actions happening right now.",
    },
    {
      id: "experience-koey",
      title: "Past Experience with เคย",
      stage: "A1.2",
      level: "A1",
      explanation:
        "เคย lets learners talk about simple past experience such as places visited or foods tried before. It often appears around the A1-A2 boundary, and it fits a fuller beginner track well.",
      pattern: "SUBJECT + เคย + VERB",
      focusParticle: "เคย",
      focusMeaning:
        "Marker for prior experience at some point in the past.",
    },
    {
      id: "conjunction-and-but",
      title: "Basic Linkers with และ / หรือ / แต่",
      stage: "A1.2",
      level: "A1",
      explanation:
        "Beginners quickly need a few simple connectors to link choices, additions, and contrast. These are among the first tools for making Thai feel less like isolated phrases.",
      pattern: "WORD / CLAUSE + และ / หรือ / แต่ + WORD / CLAUSE",
      focusParticle: "และ / หรือ / แต่",
      focusMeaning:
        "Basic linkers for addition, choice, and contrast.",
    },
    {
      id: "because-phraw",
      title: "Reasons with เพราะ",
      stage: "A1.2",
      level: "A1",
      explanation:
        "เพราะ gives beginners a simple way to explain a reason. It is common in early conversation once learners move beyond naming and requesting.",
      pattern: "RESULT + เพราะ + REASON",
      focusParticle: "เพราะ",
      focusMeaning:
        "Cause connector meaning because.",
    },
  ],
};

function parseArgs() {
  const args = process.argv.slice(2);
  const getValue = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };

  return {
    stage: getValue("--stage") || "A1.1",
    target: Number.parseInt(getValue("--target") || String(DEFAULT_TARGET), 10),
    grammarId: getValue("--grammar"),
  };
}

function normalizePlainString(value, fieldName, { allowEmpty = false } = {}) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!allowEmpty && !trimmed) {
    throw new Error(`${fieldName} is required`);
  }
  return trimmed;
}

function normalizeWordBreakdownItem(item, index) {
  if (!item || typeof item !== "object") {
    throw new Error(`Breakdown item ${index + 1} must be an object`);
  }

  const tone = normalizePlainString(item.tone, `Breakdown item ${index + 1} tone`);
  if (!VALID_TONES.has(tone)) {
    throw new Error(
      `Breakdown item ${index + 1} tone must be one of: ${Array.from(VALID_TONES).join(", ")}`,
    );
  }

  const normalized = {
    thai: normalizePlainString(item.thai, `Breakdown item ${index + 1} Thai`),
    english: normalizePlainString(item.english, `Breakdown item ${index + 1} English`),
    tone,
  };

  if (item.grammar === true) {
    normalized.grammar = true;
  }

  if (typeof item.romanization === "string" && item.romanization.trim()) {
    normalized.romanization = item.romanization.trim();
  }

  return normalized;
}

function normalizeGrammarRow(row, index, { requireAccents = true } = {}) {
  const difficulty = normalizePlainString(
    row.difficulty ?? "easy",
    `Row ${index + 1} difficulty`,
  ).toLowerCase();

  if (!VALID_DIFFICULTIES.has(difficulty)) {
    throw new Error(
      `Row ${index + 1} difficulty must be one of: ${Array.from(VALID_DIFFICULTIES).join(", ")}`,
    );
  }

  const romanization = normalizePlainString(
    row.romanization,
    `Row ${index + 1} romanization`,
  );
  if (requireAccents && !ACCENTED_ROMANIZATION_REGEX.test(romanization)) {
    throw new Error(`Row ${index + 1} romanization must include learner accents`);
  }
  if (FORBIDDEN_ROMANIZATION_REGEX.test(romanization)) {
    throw new Error(
      `Row ${index + 1} romanization must use Latin learner spelling, not IPA symbols`,
    );
  }

  if (!Array.isArray(row.breakdown) || row.breakdown.length === 0) {
    throw new Error(`Row ${index + 1} must include at least one breakdown item`);
  }

  return {
    thai: normalizePlainString(row.thai, `Row ${index + 1} Thai`),
    romanization,
    english: normalizePlainString(row.english, `Row ${index + 1} English`),
    breakdown: row.breakdown.map((item, breakdownIndex) =>
      normalizeWordBreakdownItem(item, breakdownIndex),
    ),
    difficulty,
  };
}

function normalizeComparableText(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTailSignature(text) {
  const tokens = normalizeComparableText(text).split(" ").filter(Boolean);
  if (tokens.length < 3) {
    return null;
  }

  return {
    first: tokens[0],
    tail: tokens.slice(1).join(" "),
  };
}

function isLazySubjectSwapPair(a, b) {
  const englishA = buildTailSignature(a.english);
  const englishB = buildTailSignature(b.english);

  if (
    englishA &&
    englishB &&
    englishA.tail === englishB.tail &&
    englishA.first !== englishB.first &&
    COMMON_SUBJECT_SWAP_TOKENS.has(englishA.first) &&
    COMMON_SUBJECT_SWAP_TOKENS.has(englishB.first)
  ) {
    return true;
  }

  const romanA = buildTailSignature(a.romanization);
  const romanB = buildTailSignature(b.romanization);
  return Boolean(
    romanA &&
      romanB &&
      romanA.tail === romanB.tail &&
      romanA.first !== romanB.first &&
      romanA.tail.length > 0,
  );
}

function escapeCsvValue(value) {
  const text = String(value ?? "");

  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function serializeGrammarRows(rows) {
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

  return [header.join(","), ...lines].join("\n");
}

async function fetchExistingRows(grammarId) {
  const result = await pool.query(
    `
    SELECT thai, romanization, english, breakdown, difficulty
    FROM ${GRAMMAR_EXAMPLES_TABLE}
    WHERE grammar_id = $1
    ORDER BY sort_order ASC, id ASC
    `,
    [grammarId],
  );

  return result.rows.map((row, index) =>
    normalizeGrammarRow(
      {
        thai: row.thai,
        romanization: row.romanization,
        english: row.english,
        breakdown: typeof row.breakdown === "string" ? JSON.parse(row.breakdown) : row.breakdown,
        difficulty: row.difficulty,
      },
      index,
      { requireAccents: false },
    ),
  );
}

async function saveRows(grammarId, rows) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM ${GRAMMAR_EXAMPLES_TABLE} WHERE grammar_id = $1`,
      [grammarId],
    );

    for (const [index, row] of rows.entries()) {
      await client.query(
        `
        INSERT INTO ${GRAMMAR_EXAMPLES_TABLE}
          (grammar_id, sort_order, thai, romanization, english, breakdown, difficulty)
        VALUES
          ($1, $2, $3, $4, $5, $6::jsonb, $7)
        `,
        [
          grammarId,
          index,
          row.thai,
          row.romanization,
          row.english,
          JSON.stringify(row.breakdown),
          row.difficulty,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  if (WRITE_GRAMMAR_CSV_MIRROR) {
    fs.mkdirSync(GRAMMAR_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(GRAMMAR_DIR, `${grammarId}.csv`),
      serializeGrammarRows(rows),
      "utf8",
    );
  }
}

function getStagePromptNotes(meta) {
  if (meta.stage === "A1.2") {
    return {
      vocab:
        "Use slightly richer everyday vocabulary than bare A1.1 survival Thai while staying understandable to a beginner learner moving into fuller sentence work.",
      novelty:
        "Across the set, introduce a few useful new content words for this grammar point such as places, errands, transport, food, work, study, household items, feelings, and routines.",
      duplication:
        "Do not create lazy substitution families. Avoid sets like 'I buy food', 'Mom buys food', 'Dad buys food'. If two rows share a frame, change the situation and meaning substantially.",
      romanization:
        "Use learner-friendly Thai romanization with accents. Every sentence-level romanization must include accent marks.",
      romanizationStyle:
        "Do not use IPA or specialist phonetic symbols such as ʉ, ə, ɔ, ŋ, or ʔ. Use ordinary Latin letters plus accents only, with digraphs like ae, ue, oe, ng when needed.",
      register:
        "Use common modern Thai vocabulary only. Avoid literary, royal, poetic, archaic, or overly formal words.",
      difficulty:
        "Aim roughly for 55% easy, 30% medium, 15% hard across a larger set. For this batch, keep a sensible mix with a little more variety than A1.1.",
    };
  }

  return {
    vocab: "Keep the vocabulary accessible and useful for the target stage.",
    novelty: "Vary the subject, setting, vocabulary, polarity, and sentence shape.",
    duplication:
      "Avoid duplicates or near-duplicates of existing rows and of other generated rows.",
    romanization:
      "Use learner-friendly Thai romanization with accents. Every sentence-level romanization must include accent marks.",
    romanizationStyle:
      "Do not use IPA or specialist phonetic symbols such as ʉ, ə, ɔ, ŋ, or ʔ. Use ordinary Latin letters plus accents only.",
    register:
      "Use common modern Thai vocabulary only. Avoid literary or overly formal words unless the grammar point explicitly needs them.",
    difficulty:
      "Aim roughly for 70% easy, 20% medium, 10% hard across a larger set. For this batch just keep a sensible mix.",
  };
}

function buildPrompt(meta, existingRows, batchSize) {
  const existingThai = existingRows.map((row) => row.thai);
  const sampleRows = existingRows.slice(0, 6).map((row) => ({
    thai: row.thai,
    romanization: row.romanization,
    english: row.english,
    difficulty: row.difficulty,
  }));
  const notes = getStagePromptNotes(meta);

  return `
You are curating production-quality Thai grammar example sentences for a grammar learning app.

Grammar point
- id: ${meta.id}
- stage: ${meta.stage}
- level: ${meta.level}
- title: ${meta.title}
- explanation: ${meta.explanation}
- pattern: ${meta.pattern}
- focus: ${meta.focusParticle} — ${meta.focusMeaning}

Task
- Generate ${batchSize} NEW example rows for this exact grammar point.
- These rows will be used in a production app, so they must be natural, clear, and directly useful.

Quality rules
- Keep the language aligned with ${meta.stage} beginner Thai.
- Use natural contemporary Thai, not textbook nonsense.
- Each sentence must clearly demonstrate the target grammar point.
- ${notes.duplication}
- ${notes.vocab}
- ${notes.novelty}
- Prefer short to medium sentences that are easy to inspect.
- ${notes.romanization}
- ${notes.romanizationStyle}
- ${notes.register}
- English should be natural but faithful.
- Use difficulty values of only: easy, medium, hard.
- ${notes.difficulty}

Breakdown rules
- "breakdown" must match the Thai sentence in order.
- Each breakdown item must contain:
  - "thai"
  - "english"
  - "tone" (one of mid, low, falling, high, rising)
- "romanization" on a breakdown item is optional.
- Mark the target grammar chunk(s) with "grammar": true when there is an explicit grammar marker.
- If the grammar idea is structural rather than a single particle, mark the most relevant chunk(s) when helpful, but do not force nonsense.

Existing Thai sentences to avoid
${existingThai.map((sentence) => `- ${sentence}`).join("\n")}

Sample existing rows for tone and style reference
${JSON.stringify(sampleRows, null, 2)}

Return ONLY valid JSON in this exact shape:
{
  "rows": [
    {
      "thai": "",
      "romanization": "",
      "english": "",
      "difficulty": "easy",
      "breakdown": [
        {
          "thai": "",
          "english": "",
          "tone": "mid",
          "grammar": true
        }
      ]
    }
  ]
}
`;
}

function parseResponseJson(content) {
  const trimmed = content.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.rows)) {
    throw new Error("Model response did not include a rows array");
  }
  return parsed.rows;
}

function dedupeNewRows(existingRows, candidateRows, grammarId) {
  const seenThai = new Set(existingRows.map((row) => row.thai));
  const uniqueRows = [];

  for (const [index, row] of candidateRows.entries()) {
    let normalized;

    try {
      normalized = normalizeGrammarRow(row, uniqueRows.length);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Invalid generated row";
      console.warn(
        `${grammarId}: skipped invalid generated row ${index + 1}: ${message}`,
      );
      continue;
    }

    const thaiKey = normalized.thai;
    if (seenThai.has(thaiKey)) {
      continue;
    }

    const collidesWithExisting = existingRows.some((existingRow) =>
      isLazySubjectSwapPair(existingRow, normalized),
    );
    if (collidesWithExisting) {
      console.warn(
        `${grammarId}: skipped generated row ${index + 1} because it is too close to an existing subject-swap pattern`,
      );
      continue;
    }

    const collidesWithBatch = uniqueRows.some((existingRow) =>
      isLazySubjectSwapPair(existingRow, normalized),
    );
    if (collidesWithBatch) {
      console.warn(
        `${grammarId}: skipped generated row ${index + 1} because it is too close to another generated row`,
      );
      continue;
    }

    seenThai.add(thaiKey);
    uniqueRows.push(normalized);
  }

  return uniqueRows;
}

async function generateBatch(openai, meta, existingRows, batchSize) {
  const prompt = buildPrompt(meta, existingRows, batchSize);
  const response = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.8,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You generate clean, natural Thai example data for a grammar learning app. Return strict JSON only.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned an empty response");
  }

  const parsedRows = parseResponseJson(content);
  return dedupeNewRows(existingRows, parsedRows, meta.id);
}

async function topUpGrammarPoint(openai, meta, target) {
  const existingRows = await fetchExistingRows(meta.id);
  if (existingRows.length >= target) {
    console.log(`${meta.id}: already at ${existingRows.length}/${target}, skipping`);
    return { grammarId: meta.id, before: existingRows.length, after: existingRows.length };
  }

  const rows = [...existingRows];
  let attempts = 0;

  while (rows.length < target) {
    attempts += 1;
    if (attempts > 8) {
      throw new Error(`${meta.id}: generation stalled after ${attempts} attempts`);
    }

    const missing = target - rows.length;
    const batchTarget = Math.min(BATCH_SIZE, missing);
    console.log(`${meta.id}: generating ${batchTarget} rows (${rows.length}/${target} complete)`);

    const newRows = await generateBatch(openai, meta, rows, batchTarget);
    if (newRows.length === 0) {
      continue;
    }

    rows.push(...newRows);
  }

  const finalRows = rows.slice(0, target);
  await saveRows(meta.id, finalRows);
  console.log(`${meta.id}: saved ${finalRows.length} rows`);

  return { grammarId: meta.id, before: existingRows.length, after: finalRows.length };
}

async function main() {
  const { stage, target, grammarId } = parseArgs();
  const config = STAGE_CONFIG[stage];
  if (!config) {
    throw new Error(
      `No generation config found for stage ${stage}. Add it to generateGrammarExamples.mjs first.`,
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to generate grammar examples");
  }

  const selectedGrammarPoints = grammarId
    ? config.filter((meta) => meta.id === grammarId)
    : config;

  if (selectedGrammarPoints.length === 0) {
    throw new Error(`No grammar point found for ${grammarId || stage}`);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const summary = [];

  try {
    for (const meta of selectedGrammarPoints) {
      const result = await topUpGrammarPoint(openai, meta, target);
      summary.push(result);
    }
  } finally {
    await pool.end();
  }

  console.log("Stage generation complete");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error("Failed to generate grammar examples:", err);
  process.exitCode = 1;
});
