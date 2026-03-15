import bcrypt from "bcrypt";
import cors from "cors";
import csv from "csv-parser";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import jwt from "jsonwebtoken";
import OpenAI from "openai";
import path from "path";
import { randomUUID } from "crypto";
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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
}

function createSessionToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET || "devsecret",
  );
}

function getConfiguredGoogleClientIds() {
  return [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_WEB_CLIENT_ID,
    process.env.GOOGLE_EXPO_CLIENT_ID,
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  ].filter(Boolean);
}

async function verifyGoogleIdToken(idToken) {
  const allowedClientIds = getConfiguredGoogleClientIds();

  if (allowedClientIds.length === 0) {
    throw new Error("Google sign-in is not configured on the server");
  }

  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
  );

  if (!response.ok) {
    throw new Error("Google token verification failed");
  }

  const payload = await response.json();
  const email = payload.email?.toLowerCase().trim();
  const iss = payload.iss;
  const aud = payload.aud;
  const sub = payload.sub;
  const emailVerified =
    payload.email_verified === true || payload.email_verified === "true";

  if (
    !email ||
    !sub ||
    !emailVerified ||
    !allowedClientIds.includes(aud) ||
    !["accounts.google.com", "https://accounts.google.com"].includes(iss)
  ) {
    throw new Error("Invalid Google sign-in token");
  }

  return {
    email,
    sub,
    displayName:
      typeof payload.name === "string" && payload.name.trim()
        ? payload.name.trim().slice(0, 40)
        : null,
  };
}

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

app.get("/me", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, email, display_name
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [req.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Failed to fetch user profile:", err);
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

app.patch("/me", authMiddleware, async (req, res) => {
  try {
    const rawDisplayName =
      typeof req.body.displayName === "string" ? req.body.displayName.trim() : "";
    const displayName = rawDisplayName ? rawDisplayName.slice(0, 40) : null;

    const result = await pool.query(
      `
      UPDATE users
      SET display_name = $2
      WHERE id = $1
      RETURNING id, email, display_name
      `,
      [req.userId, displayName],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Failed to update user profile:", err);
    res.status(500).json({ error: "Failed to update user profile" });
  }
});

app.post("/me/reset-progress", authMiddleware, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM review_queue WHERE user_id = $1`, [req.userId]);
    await client.query(`DELETE FROM review_sessions WHERE user_id = $1`, [req.userId]);
    await client.query(`DELETE FROM activity_log WHERE user_id = $1`, [req.userId]);
    await client.query(`DELETE FROM user_vocab WHERE user_id = $1`, [req.userId]);
    await client.query(`DELETE FROM grammar_progress WHERE user_id = $1`, [req.userId]);
    await client.query(`DELETE FROM bookmarks WHERE user_id = $1`, [req.userId]);
    await client.query("COMMIT");

    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed to reset user progress:", err);
    res.status(500).json({ error: "Failed to reset user progress" });
  } finally {
    client.release();
  }
});

app.delete("/me", authMiddleware, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM review_queue WHERE user_id = $1`, [req.userId]);
    await client.query(`DELETE FROM review_sessions WHERE user_id = $1`, [req.userId]);
    await client.query(`DELETE FROM activity_log WHERE user_id = $1`, [req.userId]);
    await client.query(`DELETE FROM user_vocab WHERE user_id = $1`, [req.userId]);
    await client.query(`DELETE FROM grammar_progress WHERE user_id = $1`, [req.userId]);
    await client.query(`DELETE FROM bookmarks WHERE user_id = $1`, [req.userId]);
    await client.query(`DELETE FROM user_preferences WHERE user_id = $1`, [req.userId]);
    await client.query(`DELETE FROM users WHERE id = $1`, [req.userId]);
    await client.query("COMMIT");

    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed to delete account:", err);
    res.status(500).json({ error: "Failed to delete account" });
  } finally {
    client.release();
  }
});

app.get("/user/preferences", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT track_practice_vocab
      FROM user_preferences
      WHERE user_id = $1
      LIMIT 1
      `,
      [req.userId],
    );

    res.json({
      trackPracticeVocab:
        result.rows.length > 0 ? result.rows[0].track_practice_vocab : true,
    });
  } catch (err) {
    console.error("Failed to fetch user preferences:", err);
    res.status(500).json({ error: "Failed to fetch user preferences" });
  }
});

app.patch("/user/preferences", authMiddleware, async (req, res) => {
  try {
    const { trackPracticeVocab } = req.body;

    if (typeof trackPracticeVocab !== "boolean") {
      return res
        .status(400)
        .json({ error: "trackPracticeVocab must be a boolean" });
    }

    const result = await pool.query(
      `
      INSERT INTO user_preferences (user_id, track_practice_vocab)
      VALUES ($1, $2)
      ON CONFLICT (user_id)
      DO UPDATE SET track_practice_vocab = EXCLUDED.track_practice_vocab
      RETURNING track_practice_vocab
      `,
      [req.userId, trackPracticeVocab],
    );

    res.json({
      trackPracticeVocab: result.rows[0].track_practice_vocab,
    });
  } catch (err) {
    console.error("Failed to update user preferences:", err);
    res.status(500).json({ error: "Failed to update user preferences" });
  }
});

/* =============================== */
/* SRS ROUTES (from srs.js) */
/* =============================== */

registerSRSRoutes(app, authMiddleware);

/* =============================== */
/* GRAMMAR PROGRESS */
/* =============================== */

const GRAMMAR_ACTIVITY_MIN_ROUNDS = 10;

function mapGrammarProgressRow(row) {
  return {
    grammarId: row.grammar_id,
    rounds: row.rounds,
    correct: row.correct,
    total: row.total,
    lastPracticed: row.lastPracticed,
  };
}

app.get("/grammar/progress", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        grammar_id,
        rounds,
        correct,
        total,
        last_practiced AS "lastPracticed"
      FROM grammar_progress
      WHERE user_id = $1
      ORDER BY last_practiced DESC
      `,
      [req.userId],
    );

    res.json(result.rows.map(mapGrammarProgressRow));
  } catch (err) {
    console.error("Failed to fetch grammar progress:", err);
    res.status(500).json({ error: "Failed to fetch grammar progress" });
  }
});

app.get("/grammar/progress/:grammarId", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        grammar_id,
        rounds,
        correct,
        total,
        last_practiced AS "lastPracticed"
      FROM grammar_progress
      WHERE user_id = $1 AND grammar_id = $2
      LIMIT 1
      `,
      [req.userId, req.params.grammarId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Grammar progress not found" });
    }

    res.json(mapGrammarProgressRow(result.rows[0]));
  } catch (err) {
    console.error("Failed to fetch grammar progress item:", err);
    res.status(500).json({ error: "Failed to fetch grammar progress" });
  }
});

app.post("/grammar/progress/round", authMiddleware, async (req, res) => {
  try {
    const { grammarId, wasCorrect } = req.body;

    if (!grammarId || typeof wasCorrect !== "boolean") {
      return res
        .status(400)
        .json({ error: "grammarId and wasCorrect are required" });
    }

    const result = await pool.query(
      `
      INSERT INTO grammar_progress (
        user_id,
        grammar_id,
        rounds,
        correct,
        total,
        last_practiced
      )
      VALUES ($1, $2, 1, $3, 1, NOW())
      ON CONFLICT (user_id, grammar_id)
      DO UPDATE SET
        rounds = grammar_progress.rounds + 1,
        correct = grammar_progress.correct + EXCLUDED.correct,
        total = grammar_progress.total + 1,
        last_practiced = NOW()
      RETURNING
        grammar_id,
        rounds,
        correct,
        total,
        last_practiced AS "lastPracticed"
      `,
      [req.userId, grammarId, wasCorrect ? 1 : 0],
    );

    const progress = mapGrammarProgressRow(result.rows[0]);

    if (progress.rounds >= GRAMMAR_ACTIVITY_MIN_ROUNDS) {
      await pool.query(
        `
        INSERT INTO activity_log (user_id, activity_date, source, count)
        VALUES ($1, CURRENT_DATE, 'grammar', 1)
        ON CONFLICT (user_id, activity_date, source)
        DO UPDATE SET count = activity_log.count + 1
        `,
        [req.userId],
      );
    }

    res.json(progress);
  } catch (err) {
    console.error("Failed to save grammar progress:", err);
    res.status(500).json({ error: "Failed to save grammar progress" });
  }
});

app.delete("/grammar/progress/:grammarId", authMiddleware, async (req, res) => {
  try {
    await pool.query(
      `
      DELETE FROM grammar_progress
      WHERE user_id = $1 AND grammar_id = $2
      `,
      [req.userId, req.params.grammarId],
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Failed to reset grammar progress:", err);
    res.status(500).json({ error: "Failed to reset grammar progress" });
  }
});

app.delete("/grammar/progress", authMiddleware, async (req, res) => {
  try {
    await pool.query(
      `
      DELETE FROM grammar_progress
      WHERE user_id = $1
      `,
      [req.userId],
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Failed to clear grammar progress:", err);
    res.status(500).json({ error: "Failed to clear grammar progress" });
  }
});

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
    const preferenceResult = await pool.query(
      `
      SELECT track_practice_vocab
      FROM user_preferences
      WHERE user_id = $1
      LIMIT 1
      `,
      [userId],
    );
    const trackPracticeVocab =
      preferenceResult.rows.length > 0
        ? preferenceResult.rows[0].track_practice_vocab
        : true;

    if (!trackPracticeVocab) {
      return res.json({
        success: true,
        added: 0,
        limit: SRS_CONFIG.dailyNewWordLimit,
        trackPracticeVocab: false,
      });
    }

    const practiceNewBacklogLimit = 50;
    const newBacklogResult = await pool.query(
      `
      SELECT COUNT(*)
      FROM user_vocab
      WHERE user_id = $1
      AND COALESCE(state, 'new') = 'new'
      `,
      [userId],
    );

    const newBacklog = parseInt(newBacklogResult.rows[0].count, 10) || 0;

    if (newBacklog >= practiceNewBacklogLimit) {
      return res.json({
        success: true,
        added: 0,
        limit: SRS_CONFIG.dailyNewWordLimit,
        newBacklog,
        newBacklogLimit: practiceNewBacklogLimit,
        blockedByNewBacklog: true,
      });
    }

    const todayResult = await pool.query(
      `
      SELECT COUNT(*)
      FROM user_vocab
      WHERE user_id = $1
      AND DATE(first_seen) = CURRENT_DATE
      `,
      [userId],
    );

    const learnedToday = parseInt(todayResult.rows[0].count, 10) || 0;
    let added = 0;
    let backlogAdded = 0;

    for (const word of words) {
      if (learnedToday + added >= SRS_CONFIG.dailyNewWordLimit) {
        break;
      }

      if (newBacklog + backlogAdded >= practiceNewBacklogLimit) {
        break;
      }

      const result = await pool.query(
        `
        INSERT INTO user_vocab (user_id, thai, english, romanization, next_review)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (user_id, thai) DO UPDATE SET romanization = COALESCE(NULLIF($4, ''), user_vocab.romanization)
        RETURNING thai, (xmax = 0) AS inserted
        `,
        [userId, word.thai, word.english, word.romanization || ""],
      );

      if (result.rowCount > 0 && result.rows[0].inserted) {
        added++;
        backlogAdded++;
      }
    }

    res.json({
      success: true,
      added,
      limit: SRS_CONFIG.dailyNewWordLimit,
      newBacklog: newBacklog + backlogAdded,
      newBacklogLimit: practiceNewBacklogLimit,
      blockedByNewBacklog: false,    });
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
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'display_name'
        ) THEN
          ALTER TABLE users ADD COLUMN display_name TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'google_sub'
        ) THEN
          ALTER TABLE users ADD COLUMN google_sub TEXT;
        END IF;
      END $$;
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub_unique
        ON users (google_sub)
        WHERE google_sub IS NOT NULL;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        track_practice_vocab BOOLEAN NOT NULL DEFAULT TRUE
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS grammar_progress (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        grammar_id TEXT NOT NULL,
        rounds INTEGER NOT NULL DEFAULT 0,
        correct INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL DEFAULT 0,
        last_practiced TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, grammar_id)
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_grammar_progress_user_last_practiced
        ON grammar_progress (user_id, last_practiced DESC);
    `);
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
    // Create indexes for SRS query performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_vocab_state_review
        ON user_vocab (user_id, state, next_review);
      CREATE INDEX IF NOT EXISTS idx_user_vocab_next_review
        ON user_vocab (user_id, next_review);
    `);
    // Create activity_log table for heatmap (grammar + other non-vocab activity)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        user_id INTEGER NOT NULL,
        activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
        source TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, activity_date, source)
      );
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

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        error:
          "Password must be at least 8 characters and include uppercase, lowercase, and a number",
      });
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

    const token = createSessionToken({ id: result.rows[0].id, email });

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

    const token = createSessionToken(user);

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/auth/google", async (req, res) => {
  const idToken = typeof req.body?.idToken === "string" ? req.body.idToken : "";

  if (!idToken) {
    return res.status(400).json({ error: "Google ID token required" });
  }

  let googleUser;

  try {
    googleUser = await verifyGoogleIdToken(idToken);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Google sign-in failed";
    const status = message.includes("configured") ? 500 : 401;
    return res.status(status).json({ error: message });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let userResult = await client.query(
      `
      SELECT id, email, display_name, google_sub
      FROM users
      WHERE google_sub = $1
      LIMIT 1
      `,
      [googleUser.sub],
    );

    let user = userResult.rows[0] ?? null;

    if (!user) {
      userResult = await client.query(
        `
        SELECT id, email, display_name, google_sub
        FROM users
        WHERE email = $1
        LIMIT 1
        `,
        [googleUser.email],
      );

      user = userResult.rows[0] ?? null;

      if (user) {
        if (user.google_sub && user.google_sub !== googleUser.sub) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            error: "This email is already linked to a different Google account",
          });
        }

        const linkedResult = await client.query(
          `
          UPDATE users
          SET google_sub = $2,
              display_name = COALESCE(display_name, $3)
          WHERE id = $1
          RETURNING id, email, display_name, google_sub
          `,
          [user.id, googleUser.sub, googleUser.displayName],
        );

        user = linkedResult.rows[0];
      } else {
        const passwordHash = await bcrypt.hash(randomUUID(), 10);
        const insertedResult = await client.query(
          `
          INSERT INTO users (email, password_hash, display_name, google_sub)
          VALUES ($1, $2, $3, $4)
          RETURNING id, email, display_name, google_sub
          `,
          [
            googleUser.email,
            passwordHash,
            googleUser.displayName,
            googleUser.sub,
          ],
        );

        user = insertedResult.rows[0];
      }
    }

    await client.query("COMMIT");

    res.json({ token: createSessionToken(user) });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Google sign-in failed:", err);
    res.status(500).json({ error: "Google sign-in failed" });
  } finally {
    client.release();
  }
});

startServer();
