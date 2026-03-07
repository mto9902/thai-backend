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


dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

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

/* =============================== */
/* AUTH ROUTES */
/* =============================== */

app.post("/signup",async(req,res)=>{

  try{

    const {email,password} = req.body;

    const hash = await bcrypt.hash(password,10);

    const result = await pool.query(
      "INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id",
      [email,hash]
    );

    const token = jwt.sign(
      {userId:result.rows[0].id},
      process.env.JWT_SECRET || "devsecret"
    );

    res.json({token});

  }catch(err){

    console.error(err);
    res.status(500).send("Signup failed");

  }

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

/* =============================== */
/* BOOKMARKS */
/* =============================== */

app.post("/bookmark",authMiddleware,async(req,res)=>{

  try{

    const userId = req.userId;
    const {grammarId} = req.body;

    await pool.query(
      "INSERT INTO bookmarks (user_id,grammar_id) VALUES ($1,$2)",
      [userId,grammarId]
    );

    res.json({success:true});

  }catch(err){

    console.error(err);
    res.status(500).send("Bookmark failed");

  }

});

app.delete("/bookmark",authMiddleware,async(req,res)=>{

  const {grammarId} = req.body;
  const userId = req.userId;

  await pool.query(
    "DELETE FROM bookmarks WHERE user_id=$1 AND grammar_id=$2",
    [userId,grammarId]
  );

  res.json({success:true});

});

app.get("/bookmarks",authMiddleware,async(req,res)=>{

  const userId = req.userId;

  const result = await pool.query(
    "SELECT grammar_id FROM bookmarks WHERE user_id=$1",
    [userId]
  );

  res.json(result.rows);

});

/* =============================== */
/* ALPHABET TRAINER */
/* =============================== */

app.post("/alphabet-trainer",(req,res)=>{

  const {consonants,vowels,difficulty} = req.body;

  if(!consonants || !vowels){
    return res.status(400).json({error:"Missing trainer data"});
  }

  const memory = getUserMemory("trainer");

  try{

    let matches = dictionary.filter(word=>{

      if(!word.thai) return false;

      const syllables = countThaiSyllables(word.thai);
      const length = word.thai.length;

      if(difficulty === "easy"){
        if(syllables !== 1 || length > 3) return false;
      }

      if(difficulty === "medium"){
        if(syllables !== 2 || length > 6) return false;
      }

      if(difficulty === "hard"){
        if(syllables < 3) return false;
      }

      const hasConsonant = consonants.some(c=>word.thai.includes(c));
      const hasVowel = vowels.some(v=>word.thai.includes(v));

      return hasConsonant && hasVowel;

    });

    matches.sort(()=>Math.random()-0.5);

    const unique = [...new Map(matches.map(w=>[w.thai,w])).values()]
      .filter(w=>!memory.trainerWords.includes(w.thai));

    const selected = unique.slice(0,8);

    selected.forEach(w=>memory.trainerWords.push(w.thai));

    if(memory.trainerWords.length > MAX_MEMORY){
      memory.trainerWords = memory.trainerWords.slice(-MAX_MEMORY);
    }

    res.json({words:selected});

  }catch(err){

    console.error("Trainer error:",err);
    res.status(500).json({error:"Trainer generation failed"});

  }

});

/* =============================== */
/* SENTENCE GENERATION */
/* =============================== */

app.post("/generate",async(req,res)=>{

  try{

    const {grammar,sessionId} = req.body;

    const memory = getUserMemory(sessionId);

    const prompt = `
${grammar}

Do NOT repeat these sentences:
${memory.sentences.join("\n")}

Return JSON:
{
"sentence":"",
"romanization":"",
"translation":"",
"breakdown":[{"thai":"","english":""}]
}
`;

    const response = await openai.chat.completions.create({
      model:"gpt-4o-mini",
      temperature:0.7,
      messages:[{role:"user",content:prompt}]
    });

    let content = response.choices[0].message.content;

    content = content.replace(/```json|```/g,"").trim();

    const data = JSON.parse(content);

    memory.sentences.push(data.sentence);

    if(memory.sentences.length > MAX_MEMORY){
      memory.sentences.shift();
    }

    res.json(data);

  }catch(err){

    console.error("Sentence generation error:",err);
    res.status(500).send("Error generating sentence");

  }

});

app.post("/transform", async (req, res) => {

  try {

    const { prompt, sessionId = "default" } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt required" });
    }

    const memory = getUserMemory(sessionId);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        { role: "user", content: prompt }
      ]
    });

    let content = response.choices[0].message.content;

    // remove markdown wrappers if GPT adds them
    content = content.replace(/```json|```/g, "").trim();

    const data = JSON.parse(content);

    if (data?.options && data.correct_index !== undefined) {
      memory.transformSentences.push(data.options[data.correct_index]?.thai || "");
    }

    if (memory.transformSentences.length > MAX_MEMORY) {
      memory.transformSentences.shift();
    }

    res.json(data);

  } catch (err) {

    console.error("Transform error:", err);
    res.status(500).send("Transform generation failed");

  }

});

/* =============================== */
/* START SERVER */
/* =============================== */

async function startServer(){

  try{

    await loadDictionary();

    app.listen(3000,()=>{
      console.log("AI server running on port 3000");
    });

  }catch(err){

    console.error("Server startup failed:",err);

  }

}

startServer();