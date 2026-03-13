import bcrypt from "bcrypt";
import cors from "cors";
import csv from "csv-parser";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import jwt from "jsonwebtoken";
import OpenAI from "openai";
import path from "path";
import { pool } from "./db.js";
import { registerSRSRoutes, SRS_CONFIG } from "./srs.js";
import registerTransformRoute from "./transform.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

/* =============================== */
/* THAI VOWEL SYLLABLE DETECTION */
/* =============================== */

const thaiVowels = [
  "ะ",
  "า",
  "ิ",
  "ี",
  "ึ",
  "ื",
  "ุ",
  "ู",
  "เ",
  "แ",
  "โ",
  "ใ",
  "ไ",
  "ำ",
  "ๅ",
  "ฤ",
];

function countThaiSyllables(word) {
  let count = 0;

  for (const v of thaiVowels) {
    if (word.includes(v)) {
      count += word.split(v).length - 1;
    }
  }

  return count;
}

/* =============================== */
/* LOAD GRAMMAR CSV FILES */
/* =============================== */

let grammarSentences = {};

function loadGrammarCSVs() {
  const grammarPath = "./grammar";
  const files = fs.readdirSync(grammarPath);
  const promises = [];

  files.forEach((file) => {
    if (!file.endsWith(".csv")) return;

    const grammarId = file.replace(".csv", "");
    const temp = [];

    const p = new Promise((resolve) => {
      fs.createReadStream(path.join(grammarPath, file))
        .pipe(csv())
        .on("data", (row) => {
          temp.push({
            thai: row.thai,
            romanization: row.romanization,
            english: row.english,
            breakdown: JSON.parse(row.breakdown),
            difficulty: row.difficulty,
          });
        })
        .on("end", () => {
          grammarSentences[grammarId] = temp;
          console.log("Loaded grammar:", grammarId, temp.length);
          resolve();
        });
    });
    promises.push(p);
  });

  return Promise.all(promises);
}

function buildWordRomanizationMap() {
  const wordMap = new Map();
  for (const sentences of Object.values(grammarSentences)) {
    for (const sentence of sentences) {
      if (!sentence.romanization || !sentence.breakdown) continue;
      const tokens = sentence.romanization.split(/\s+/);
      sentence.breakdown.forEach((w, i) => {
        if (tokens[i] && !wordMap.has(w.thai)) {
          wordMap.set(w.thai, tokens[i]);
        }
      });
    }
  }
  console.log("Built word romanization map:", wordMap.size, "entries");
  return wordMap;
}

async function backfillRomanization(wordMap) {
  try {
    const result = await pool.query(
      `SELECT DISTINCT thai FROM user_vocab WHERE romanization IS NULL OR romanization = ''`
    );
    let updated = 0;
    for (const row of result.rows) {
      const roman = wordMap.get(row.thai);
      if (roman) {
        await pool.query(
          `UPDATE user_vocab SET romanization = $1 WHERE thai = $2 AND (romanization IS NULL OR romanization = '')`,
          [roman, row.thai]
        );
        updated++;
      }
    }
    console.log("Backfilled romanization for", updated, "words");
  } catch (err) {
    console.error("Romanization backfill error:", err);
  }
}

/* =============================== */
/* LOAD DICTIONARY */
/* =============================== */

let dictionary = [];

function loadDictionary() {
  return new Promise((resolve, reject) => {
    const temp = [];

    fs.createReadStream("./telex-utf8.csv")
      .pipe(csv())
      .on("data", (row) => {
        let thai = row["t-entry"];
        const english = row["e-entry"];

        if (!thai || !english) return;

        thai = thai.replace(/\s\d+$/, "").trim();

        const syllables = countThaiSyllables(thai);

        if (syllables > 0) {
          temp.push({
            thai,
            english: english.trim(),
          });
        }
      })
      .on("end", () => {
        dictionary = temp;

        console.log("Dictionary loaded:", dictionary.length);

        resolve();
      })
      .on("error", (err) => {
        console.error("Dictionary load error:", err);
        reject(err);
      });
  });
}

/* =============================== */
/* DB CHECK */
/* =============================== */

pool
  .query("SELECT NOW()")
  .then(() => console.log("DB connected"))
  .catch((err) => console.error("DB error:", err));

/* =============================== */
/* OPENAI */
/* =============================== */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* =============================== */
/* USER MEMORY */
/* =============================== */

const userMemory = {};
const MAX_MEMORY = 10;

function getUserMemory(sessionId) {
  if (!userMemory[sessionId]) {
    userMemory[sessionId] = {
      sentences: [],
      transformSentences: [],
      trainerWords: [],
    };
  }

  return userMemory[sessionId];
}

registerTransformRoute(app, openai);

/* =============================== */
/* AUTH */
/* =============================== */

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send("Missing token");
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "devsecret");

    req.userId = decoded.userId;

    next();
  } catch (err) {
    return res.status(401).send("Invalid token");
  }
}

/* =============================== */
/* SRS ROUTES (from srs.js) */
/* =============================== */

registerSRSRoutes(app, authMiddleware);

/* =============================== */
/* BOOKMARKS */
/* =============================== */

app.post("/bookmark", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { grammarId } = req.body;

    await pool.query(
      `
      INSERT INTO bookmarks (user_id, grammar_id)
      VALUES ($1, $2)
      `,
      [userId, grammarId],
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send("Bookmark failed");
  }
});

app.delete("/bookmark", authMiddleware, async (req, res) => {
  try {
    const { grammarId } = req.body;
    const userId = req.userId;

    await pool.query(
      `
      DELETE FROM bookmarks
      WHERE user_id = $1
      AND grammar_id = $2
      `,
      [userId, grammarId],
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send("Bookmark delete failed");
  }
});

app.get("/bookmarks", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const result = await pool.query(
      `
      SELECT grammar_id
      FROM bookmarks
      WHERE user_id = $1
      `,
      [userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to fetch bookmarks");
  }
});

/* =============================== */
/* USER VOCABULARY */
/* =============================== */

app.post("/track-words", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { words } = req.body;

    const todayResult = await pool.query(
      `
      SELECT COUNT(*)
      FROM user_vocab
      WHERE user_id = $1
      AND DATE(first_seen) = CURRENT_DATE
      `,
      [userId],
    );

    const learnedToday = parseInt(todayResult.rows[0].count);
    let added = 0;

    for (const word of words) {
      if (learnedToday + added >= SRS_CONFIG.dailyNewWordLimit) {
        break;
      }

      const result = await pool.query(
        `
        INSERT INTO user_vocab (user_id, thai, english, romanization, next_review)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (user_id, thai) DO UPDATE SET romanization = COALESCE(NULLIF($4, ''), user_vocab.romanization)
        RETURNING thai
        `,
        [userId, word.thai, word.english, word.romanization || ""],
      );

      if (result.rowCount > 0) {
        added++;
      }
    }

    res.json({
      success: true,
      added,
      limit: SRS_CONFIG.dailyNewWordLimit,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to track words" });
  }
});

const THAI_CONS = "[ก-ฮ]";

/**
 * Convert a vowel symbol (with ◌ placeholder) into a regex
 * that matches the vowel wrapped around any Thai consonant(s).
 *
 * Examples:
 *   "เ◌ีย"  → /เ[ก-ฮ]+ีย/    matches เกีย, เครีย
 *   "◌ัว"   → /[ก-ฮ]+ัว/     matches กัว, ตัว
 *   "า"     → /า/             simple presence check
 */
function vowelToRegex(symbol) {
  if (symbol.includes("◌")) {
    const parts = symbol.split("◌");
    const escaped = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return new RegExp(escaped.join(THAI_CONS + "+"));
  }

  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped);
}

function buildVowelPatterns(vowelSymbols) {
  return vowelSymbols.map((symbol) => ({
    symbol,
    regex: vowelToRegex(symbol),
  }));
}

/* =============================== */
/* CORE LENGTH (ignore diacritics) */
/* =============================== */

const THAI_DIACRITICS = new Set([
  "\u0E48", // ่ mai ek
  "\u0E49", // ้ mai tho
  "\u0E4A", // ๊ mai tri
  "\u0E4B", // ๋ mai chattawa
  "\u0E4C", // ์ thanthakhat (silent)
  "\u0E4D", // ็ nikhahit
  "\u0E47", // ็ maitaikhu
]);

function coreLength(word) {
  let len = 0;
  for (const ch of word) {
    if (!THAI_DIACRITICS.has(ch)) len++;
  }
  return len;
}

/* =============================== */
/* ALPHABET TRAINER ROUTE          */
/* =============================== */

app.post("/alphabet-trainer", (req, res) => {
  const { consonants, vowels, difficulty } = req.body;

  if (
    !consonants ||
    !vowels ||
    consonants.length === 0 ||
    vowels.length === 0
  ) {
    return res.status(400).json({ error: "consonants and vowels required" });
  }

  const consonantSet = new Set(consonants);
  const vowelPatterns = buildVowelPatterns(vowels);

  /*
   * Difficulty criteria (syllables + core character length):
   *
   * EASY:   1 syllable, max 4 core chars  → กา, ดี, กิน, บ้าน, เก่ง
   * MEDIUM: 1-2 syllables, max 6 chars     → อร่อย, สวัสดี, ลหุโทษ
   * HARD:   anything bigger                → ประชาธิปไตย, สันนิษฐาน
   */
  function matchesDifficulty(word) {
    const syllables = countThaiSyllables(word);
    const chars = coreLength(word);

    switch (difficulty) {
      case "easy":
        return syllables <= 1 && chars <= 4;
      case "medium":
        return (
          (syllables === 2 && chars <= 6) ||
          (syllables === 1 && chars > 4 && chars <= 6)
        );
      case "hard":
        return syllables >= 3 || chars > 6;
      default:
        return true;
    }
  }

  // Filter dictionary
  const matches = dictionary.filter((entry) => {
    const word = entry.thai;

    // Check difficulty
    if (!matchesDifficulty(word)) return false;

    // Check word contains at least one selected consonant
    let hasConsonant = false;
    for (const char of word) {
      if (consonantSet.has(char)) {
        hasConsonant = true;
        break;
      }
    }
    if (!hasConsonant) return false;

    // Check word matches at least one selected vowel pattern
    let hasVowel = false;
    for (const pattern of vowelPatterns) {
      if (pattern.regex.test(word)) {
        hasVowel = true;
        break;
      }
    }
    if (!hasVowel) return false;

    return true;
  });

  // Shuffle and pick up to 10
  const shuffled = matches.sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, 10);

  const words = picked.map((entry) => ({
    thai: entry.thai,
    english: entry.english,
    romanization: "",
  }));

  res.json({ words });
});

/* =============================== */
/* VOCAB LIST */
/* =============================== */

app.get("/debug-user-vocab", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM user_vocab");

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to read vocab");
  }
});

app.get("/vocab/today", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const result = await pool.query(
      `
      SELECT thai, english
      FROM user_vocab
      WHERE user_id = $1
      AND first_seen >= CURRENT_DATE
      ORDER BY first_seen DESC
      LIMIT 20
      `,
      [userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to fetch today's vocab");
  }
});

/* =============================== */
/* START SERVER */
/* =============================== */

async function startServer() {
  try {
    // Run SRS v3 migration: add state and step_index columns
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'user_vocab' AND column_name = 'state'
        ) THEN
          ALTER TABLE user_vocab ADD COLUMN state TEXT DEFAULT 'new';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'user_vocab' AND column_name = 'step_index'
        ) THEN
          ALTER TABLE user_vocab ADD COLUMN step_index INTEGER DEFAULT 0;
        END IF;
      END $$;
    `);
    // Backfill existing cards: cards with mastery >= 2 are already graduated
    await pool.query(`
      UPDATE user_vocab SET state = 'review', step_index = 0
      WHERE state IS NULL AND mastery >= 2
    `);
    await pool.query(`
      UPDATE user_vocab SET state = 'new', step_index = 0
      WHERE state IS NULL
    `);
    console.log("SRS v3 migration complete");

    await loadDictionary();
    await loadGrammarCSVs();

    const wordMap = buildWordRomanizationMap();
    await backfillRomanization(wordMap);

    app.listen(3000, () => {
      console.log("AI server running on port 3000");
    });
  } catch (err) {
    console.error("Server startup failed:", err);
  }
}

app.post("/practice-csv", (req, res) => {
  const { grammar } = req.body;

  const matches = grammarSentences[grammar] || [];

  if (matches.length === 0) {
    return res.status(404).json({ error: "No sentences found" });
  }

  const random = matches[Math.floor(Math.random() * matches.length)];

  res.json(random);
});

/* =============================== */
/* SIGNUP */
/* =============================== */

app.post("/signup", async (req, res) => {
  try {
    const { password } = req.body;
    const email = req.body.email?.toLowerCase().trim();

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id`,
      [email, passwordHash],
    );

    const token = jwt.sign(
      { userId: result.rows[0].id },
      process.env.JWT_SECRET || "devsecret",
    );

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Signup failed" });
  }
});

/* =============================== */
/* LOGIN */
/* =============================== */

app.post("/login", async (req, res) => {
  try {
    const { password } = req.body;
    const email = req.body.email?.toLowerCase().trim();

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || "devsecret",
    );

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

startServer();
