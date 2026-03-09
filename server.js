import express from "express";
import cors from "cors";
import OpenAI from "openai";
import dotenv from "dotenv";
import { pool } from "./db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import registerTransformRoute from "./transform.js";
import fs from "fs";
import csv from "csv-parser";
import path from "path";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

/* =============================== */
/* REVIEW SESSION MEMORY */
/* =============================== */

let sessionDate = new Date().toDateString();
const reviewSession = {};
let lastCardShown = {};
const MAX_REVIEWS_PER_WORD = 3;
const DAILY_NEW_WORD_LIMIT = 20;

function resetDailySession() {

  for (const key in lastCardShown) {
  delete lastCardShown[key];
}

  const today = new Date().toDateString();

  if (sessionDate !== today) {

    for (const key in reviewSession) {
      delete reviewSession[key];
    }

    sessionDate = today;

    console.log("New daily review session started");
  }

  
}

/* =============================== */
/* THAI VOWEL SYLLABLE DETECTION */
/* =============================== */

const thaiVowels = [
  "ะ","า","ิ","ี","ึ","ื","ุ","ู",
  "เ","แ","โ","ใ","ไ","ำ","ๅ"
];

function countThaiSyllables(word){

  let count = 0;

  for(const v of thaiVowels){
    if(word.includes(v)){
      count += (word.split(v).length - 1);
    }
  }

  return count;

}

/* =============================== */
/* LOAD GRAMMAR CSV FILES */
/* =============================== */

let grammarSentences = {};

function loadGrammarCSVs(){

  const grammarPath = "./grammar";

  const files = fs.readdirSync(grammarPath);

  files.forEach(file => {

    if(!file.endsWith(".csv")) return;

    const grammarId = file.replace(".csv","");

    const temp = [];

    fs.createReadStream(path.join(grammarPath,file))
      .pipe(csv())
      .on("data",(row)=>{

        temp.push({
          thai: row.thai,
          romanization: row.romanization,
          english: row.english,
          breakdown: JSON.parse(row.breakdown),
          difficulty: row.difficulty
        });

      })
      .on("end",()=>{

        grammarSentences[grammarId] = temp;

        console.log("Loaded grammar:",grammarId,temp.length);

      });

  });

}

/* =============================== */
/* LOAD DICTIONARY */
/* =============================== */

let dictionary = [];

function loadDictionary(){

  return new Promise((resolve,reject)=>{

    const temp = [];

    fs.createReadStream("./telex-utf8.csv")
      .pipe(csv())
      .on("data",(row)=>{

        let thai = row["t-entry"];
        const english = row["e-entry"];

        if(!thai || !english) return;

        thai = thai.replace(/\s\d+$/,"").trim();

        const syllables = countThaiSyllables(thai);

        if(syllables > 0){
          temp.push({
            thai,
            english: english.trim()
          });
        }

      })
      .on("end",()=>{

        dictionary = temp;

        console.log("Dictionary loaded:",dictionary.length);

        resolve();

      })
      .on("error",(err)=>{

        console.error("Dictionary load error:",err);
        reject(err);

      });

  });

}

/* =============================== */
/* DB CHECK */
/* =============================== */

pool.query("SELECT NOW()")
  .then(()=>console.log("DB connected"))
  .catch(err=>console.error("DB error:",err));

/* =============================== */
/* OPENAI */
/* =============================== */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =============================== */
/* USER MEMORY */
/* =============================== */

const userMemory = {};
const MAX_MEMORY = 10;

function getUserMemory(sessionId){

  if(!userMemory[sessionId]){
    userMemory[sessionId] = {
      sentences: [],
      transformSentences: [],
      trainerWords: []
    };
  }

  return userMemory[sessionId];

}

registerTransformRoute(app, openai);

/* =============================== */
/* AUTH */
/* =============================== */

function authMiddleware(req,res,next){

  const authHeader = req.headers.authorization;

  if(!authHeader){
    return res.status(401).send("Missing token");
  }

  const token = authHeader.split(" ")[1];

  try{

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "devsecret"
    );

    req.userId = decoded.userId;

    next();

  }catch(err){

    return res.status(401).send("Invalid token");

  }

}

app.post("/bookmark", authMiddleware, async (req, res) => {

  try {

    const userId = req.userId;
    const { grammarId } = req.body;

    await pool.query(
      `
      INSERT INTO bookmarks (user_id, grammar_id)
      VALUES ($1, $2)
      `,
      [userId, grammarId]
    );

    res.json({ success: true });

  } catch (err) {

    console.error(err);
    res.status(500).send("Bookmark failed");

  }

});

app.delete("/bookmark", authMiddleware, async (req, res) => {

  const { grammarId } = req.body;
  const userId = req.userId;

  await pool.query(
    `
    DELETE FROM bookmarks
    WHERE user_id = $1
    AND grammar_id = $2
    `,
    [userId, grammarId]
  );

  res.json({ success: true });

});

app.get("/bookmarks", authMiddleware, async (req, res) => {

  const userId = req.userId;

  const result = await pool.query(
    `
    SELECT grammar_id
    FROM bookmarks
    WHERE user_id = $1
    `,
    [userId]
  );

  res.json(result.rows);

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
      [userId]
    );

    const learnedToday = parseInt(todayResult.rows[0].count);
    let added = 0;

    for (const word of words) {

      if (learnedToday + added >= DAILY_NEW_WORD_LIMIT) {
        break;
      }

      const result = await pool.query(
        `
        INSERT INTO user_vocab (user_id, thai, english, next_review)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id, thai) DO NOTHING
        RETURNING thai
        `,
        [userId, word.thai, word.english]
      );

      if (result.rowCount > 0) {
        added++;
      }

    }

    res.json({
      success: true,
      added,
      limit: DAILY_NEW_WORD_LIMIT
    });

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: "Failed to track words" });

  }

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
      [userId]
    );

    res.json(result.rows);

  } catch (err) {

    console.error(err);
    res.status(500).send("Failed to fetch today's vocab");

  }

});

/* =============================== */
/* VOCAB REVIEW */
/* =============================== */

app.get("/vocab/review", authMiddleware, async (req, res) => {

  resetDailySession();

  try {

    const userId = req.userId;

    const result = await pool.query(
      `
      SELECT thai, english
      FROM user_vocab
      WHERE user_id = $1
      AND mastery < 5
      AND next_review <= NOW()
      ORDER BY mastery ASC, next_review ASC
      LIMIT 20
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({ done: true });
    }

    // pick random card from pool
    let poolSet = result.rows;
    let correct;

do {
  correct = poolSet[Math.floor(Math.random() * poolSet.length)];
} while (
  poolSet.length > 1 &&
  lastCardShown[userId] === correct.thai
);
lastCardShown[userId] = correct.thai;
    let key = `${userId}_${correct.thai}`;

    // initialize session memory
    if (!reviewSession[key]) {
      reviewSession[key] = { seen: 0, correct: 0 };
    }

    // if this card already shown too many times
    if (reviewSession[key].seen >= MAX_REVIEWS_PER_WORD) {

      const nextResult = await pool.query(
        `
        SELECT thai, english
        FROM user_vocab
        WHERE user_id = $1
        AND mastery < 5
        AND next_review <= NOW()
        AND thai != $2
        ORDER BY mastery ASC, next_review ASC
        LIMIT 20
        `,
        [userId, correct.thai]
      );

      if (nextResult.rows.length === 0) {
        return res.json({ done: true });
      }

      poolSet = nextResult.rows;
      do {
  correct = poolSet[Math.floor(Math.random() * poolSet.length)];
} while (
  poolSet.length > 1 &&
  lastCardShown[userId] === correct.thai
);

lastCardShown[userId] = correct.thai;

      key = `${userId}_${correct.thai}`;

      if (!reviewSession[key]) {
        reviewSession[key] = { seen: 0, correct: 0 };
      }
    }

    // track exposure count
    reviewSession[key].seen++;

    const wrongResult = await pool.query(
      `
      SELECT english
      FROM user_vocab
      WHERE user_id = $1
      AND english != $2
      ORDER BY RANDOM()
      LIMIT 3
      `,
      [userId, correct.english]
    );

    const choices = [
      correct.english,
      ...wrongResult.rows.map(r => r.english)
    ];

    choices.sort(() => Math.random() - 0.5);

    res.json({
      thai: correct.thai,
      correct: correct.english,
      choices
    });

  } catch (err) {

    console.error(err);
    res.status(500).send("Failed to generate review");

  }

});
/* =============================== */
/* VOCAB ANSWER */
/* =============================== */

app.post("/vocab/answer", authMiddleware, async (req, res) => {

  try {

    const userId = req.userId;
    const { thai, correct } = req.body;

    if (!thai) {
      return res.status(400).json({ error: "Missing word" });
    }

    const result = await pool.query(
      `
      SELECT mastery, last_mastery_update
      FROM user_vocab
      WHERE user_id = $1
      AND thai = $2
      `,
      [userId, thai]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Word not found" });
    }

    const word = result.rows[0];

    const today = new Date().toDateString();
    const lastDay = word.last_mastery_update
      ? new Date(word.last_mastery_update).toDateString()
      : null;

    if (correct) {

       const key = `${userId}_${thai}`;

  if (!reviewSession[key]) {
    reviewSession[key] = { seen: 0, correct: 0 };
  }

  reviewSession[key].correct++;

  if (reviewSession[key].correct >= 2 && lastDay !== today) {

    let intervalDays = 1;

    if (word.mastery === 1) intervalDays = 1;
    if (word.mastery === 2) intervalDays = 2;
    if (word.mastery === 3) intervalDays = 4;
    if (word.mastery === 4) intervalDays = 7;

    await pool.query(`
      UPDATE user_vocab
      SET mastery = LEAST(mastery + 1, 5),
          last_seen = NOW(),
          last_mastery_update = NOW(),
          next_review = NOW() + ($3 || ' days')::interval
      WHERE user_id = $1
      AND thai = $2
    `,[userId, thai, intervalDays]);

    reviewSession[key].correct = 0;

  } else {

    await pool.query(`
      UPDATE user_vocab
      SET last_seen = NOW()
      WHERE user_id = $1
      AND thai = $2
    `,[userId, thai]);

  }

    } else {

      
  const key = `${userId}_${thai}`;

  if (reviewSession[key]) {
    reviewSession[key].correct = 0;
  }

      await pool.query(
        `
        UPDATE user_vocab
        SET mastery = GREATEST(mastery - 1, 1),
            last_seen = NOW(),
            next_review = NOW() + INTERVAL '1 day'
        WHERE user_id = $1
        AND thai = $2
        `,
        [userId, thai]
      );

    }

    res.json({ success: true });

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: "Answer update failed" });

  }

});

app.get("/vocab/stats", authMiddleware, async (req, res) => {
  try {

    const userId = req.userId;

    const result = await pool.query(
      `
      SELECT
        COUNT(*) AS total_words,
        COUNT(*) FILTER (WHERE mastery = 1) AS new_words,
        COUNT(*) FILTER (WHERE mastery BETWEEN 2 AND 4) AS learning_words,
        COUNT(*) FILTER (WHERE mastery = 5) AS mastered_words,
        COUNT(*) FILTER (
          WHERE mastery < 5
          AND next_review <= NOW()
        ) AS reviews_due
      FROM user_vocab
      WHERE user_id = $1
      `,
      [userId]
    );

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: "Stats failed" });

  }
});


app.get("/vocab/progress", authMiddleware, async (req, res) => {
  try {

    const userId = req.userId;

    const result = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (
          WHERE DATE(last_seen) = CURRENT_DATE
        ) AS reviews_today,

        COUNT(*) FILTER (
          WHERE DATE(first_seen) = CURRENT_DATE
        ) AS words_learned_today,

        COUNT(*) FILTER (
          WHERE mastery = 5
        ) AS mastered_words

      FROM user_vocab
      WHERE user_id = $1
      `,
      [userId]
    );

    res.json(result.rows[0]);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: "Failed to load progress" });

  }
});

/* =============================== */
/* START SERVER */
/* =============================== */

async function startServer(){

  try{

    await loadDictionary();
    loadGrammarCSVs();

    app.listen(3000,()=>{
      console.log("AI server running on port 3000");
    });

  }catch(err){

    console.error("Server startup failed:",err);

  }

}

app.post("/practice-csv", (req, res) => {

  const { grammar } = req.body;

  const matches = grammarSentences[grammar] || [];

  if (matches.length === 0) {
    return res.status(404).json({ error: "No sentences found" });
  }

  const random =
    matches[Math.floor(Math.random() * matches.length)];

  res.json(random);

});


app.post("/login",async(req,res)=>{

  const {email,password} = req.body;

  const result = await pool.query(
    "SELECT * FROM users WHERE email=$1",
    [email]
  );

  if(result.rows.length === 0){
    return res.status(401).send("Invalid credentials");
  }

  const user = result.rows[0];

  const valid = await bcrypt.compare(password,user.password_hash);

  if(!valid){
    return res.status(401).send("Invalid credentials");
  }

  const token = jwt.sign(
    {userId:user.id},
    process.env.JWT_SECRET || "devsecret"
  );

  res.json({token});

});

startServer();