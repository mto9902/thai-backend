import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { pool } from "../db.js";
import { analyzeBreakdownTones } from "../breakdownTone.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const GENERATED_DIR = path.join(ROOT, "admin-data", "generated-candidates");
const SOURCE_DIR = path.join(ROOT, "admin-data", "manual-source-lessons");
const GRAMMAR_EXAMPLES_TABLE = "grammar_examples";
const GRAMMAR_LESSON_PRODUCTION_TABLE = "grammar_lesson_production";
const STAGE = "A1.1";
const NOTE = "Manual New Gen staged 2026-04-06";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function t(value) {
  return String(value ?? "").trim();
}

function item(thai, english, romanization, options = {}) {
  const cleanedThai = t(thai);
  const cleanedEnglish = t(english);
  const cleanedRomanization = t(romanization);
  let tones = Array.isArray(options.tones)
    ? options.tones.map((tone) => t(tone).toLowerCase()).filter(Boolean)
    : [];

  if (tones.length === 0) {
    const inferred = analyzeBreakdownTones({
      thai: cleanedThai,
      romanization: cleanedRomanization,
    });
    tones = Array.isArray(inferred.tones) ? inferred.tones : [];
  }

  if (tones.length === 0) {
    throw new Error(`Missing tones for breakdown item "${cleanedThai}"`);
  }

  const next = {
    thai: cleanedThai,
    english: cleanedEnglish,
    romanization: cleanedRomanization,
    tones,
  };

  if (options.grammar === true) {
    next.grammar = true;
  }

  return next;
}

function row(thai, romanization, english, breakdown) {
  return {
    thai: t(thai),
    romanization: t(romanization),
    english: t(english),
    difficulty: "easy",
    breakdown,
  };
}

const LESSONS = {
  "go-come-pai-maa": {
    lessonTitle: "Movement with ไป / มา",
    rows: [
      row("ฉันไปตลาด", "chǎn bpai dtà-làat", "I'm going to the market.", [
        item("ฉัน", "I", "chǎn"),
        item("ไป", "go", "bpai"),
        item("ตลาด", "market", "dtà-làat", { tones: ["low", "low"] }),
      ]),
      row("ผมไปทำงาน", "phǒm bpai tham-ngaan", "I'm going to work.", [
        item("ผม", "I (male speaker)", "phǒm"),
        item("ไป", "go", "bpai"),
        item("ทำงาน", "work", "tham-ngaan", { tones: ["mid", "mid"] }),
      ]),
      row("คุณไปไหน", "khun bpai nǎi", "Where are you going?", [
        item("คุณ", "you", "khun"),
        item("ไป", "go", "bpai"),
        item("ไหน", "where", "nǎi", { grammar: true }),
      ]),
      row("เขาไปโรงเรียน", "khǎo bpai roong-rian", "He's going to school.", [
        item("เขา", "he", "khǎo"),
        item("ไป", "go", "bpai"),
        item("โรงเรียน", "school", "roong-rian", { tones: ["mid", "mid"] }),
      ]),
      row("เธอไปห้องน้ำ", "thoe bpai hâwng-náam", "She's going to the bathroom.", [
        item("เธอ", "she", "thoe"),
        item("ไป", "go", "bpai"),
        item("ห้องน้ำ", "bathroom", "hâwng-náam", { tones: ["falling", "high"] }),
      ]),
      row("เราไปกินข้าว", "rao bpai kin khâao", "We're going to eat.", [
        item("เรา", "we", "rao"),
        item("ไป", "go", "bpai"),
        item("กินข้าว", "eat", "kin-khâao", { tones: ["mid", "falling"] }),
      ]),
      row("พ่อไปที่ร้าน", "phâw bpai thîi ráan", "Dad is going to the shop.", [
        item("พ่อ", "Dad", "phâw"),
        item("ไป", "go", "bpai"),
        item("ที่", "to / at", "thîi"),
        item("ร้าน", "shop", "ráan"),
      ]),
      row("แม่ไปธนาคาร", "mâe bpai thá-naa-khaan", "Mom is going to the bank.", [
        item("แม่", "Mom", "mâe"),
        item("ไป", "go", "bpai"),
        item("ธนาคาร", "bank", "thá-naa-khaan", { tones: ["high", "mid", "mid"] }),
      ]),
      row("เด็กไปหาครู", "dèk bpai hǎa khruu", "The child is going to see the teacher.", [
        item("เด็ก", "child", "dèk"),
        item("ไป", "go", "bpai"),
        item("หา", "see / meet", "hǎa"),
        item("ครู", "teacher", "khruu"),
      ]),
      row("เพื่อนไปบ้านฉัน", "phûean bpai bâan chǎn", "My friend is going to my house.", [
        item("เพื่อน", "my friend", "phûean"),
        item("ไป", "go", "bpai"),
        item("บ้าน", "house", "bâan"),
        item("ฉัน", "my / I", "chǎn"),
      ]),
      row("ฉันมาที่ร้าน", "chǎn maa thîi ráan", "I'm coming to the shop.", [
        item("ฉัน", "I", "chǎn"),
        item("มา", "come", "maa"),
        item("ที่", "to / at", "thîi"),
        item("ร้าน", "shop", "ráan"),
      ]),
      row("ผมมาที่บ้าน", "phǒm maa thîi bâan", "I'm coming home.", [
        item("ผม", "I (male speaker)", "phǒm"),
        item("มา", "come", "maa"),
        item("ที่", "to / at", "thîi"),
        item("บ้าน", "home", "bâan"),
      ]),
      row("คุณมาวันนี้ไหม", "khun maa wan-níi mái", "Are you coming today?", [
        item("คุณ", "you", "khun"),
        item("มา", "come", "maa"),
        item("วันนี้", "today", "wan-níi", { tones: ["mid", "high"] }),
        item("ไหม", "question particle", "mái", { grammar: true }),
      ]),
      row("เขามาที่นี่", "khǎo maa thîi nîi", "He's coming here.", [
        item("เขา", "he", "khǎo"),
        item("มา", "come", "maa"),
        item("ที่", "to / at", "thîi"),
        item("นี่", "here", "nîi"),
      ]),
      row("เธอมาหาเรา", "thoe maa hǎa rao", "She's coming to see us.", [
        item("เธอ", "she", "thoe"),
        item("มา", "come", "maa"),
        item("หา", "see / visit", "hǎa"),
        item("เรา", "us / we", "rao"),
      ]),
      row("พ่อมารับ", "phâw maa ráp", "Dad is coming to pick me up.", [
        item("พ่อ", "Dad", "phâw"),
        item("มา", "come", "maa"),
        item("รับ", "pick up", "ráp"),
      ]),
      row("แม่มาที่โรงเรียน", "mâe maa thîi roong-rian", "Mom is coming to the school.", [
        item("แม่", "Mom", "mâe"),
        item("มา", "come", "maa"),
        item("ที่", "to / at", "thîi"),
        item("โรงเรียน", "school", "roong-rian", { tones: ["mid", "mid"] }),
      ]),
      row("ครูมาที่ห้องเรียน", "khruu maa thîi hâwng-rian", "The teacher is coming to the classroom.", [
        item("ครู", "teacher", "khruu"),
        item("มา", "come", "maa"),
        item("ที่", "to / at", "thîi"),
        item("ห้องเรียน", "classroom", "hâwng-rian", { tones: ["falling", "mid"] }),
      ]),
      row("เพื่อนมาที่บ้าน", "phûean maa thîi bâan", "My friend is coming over.", [
        item("เพื่อน", "my friend", "phûean"),
        item("มา", "come", "maa"),
        item("ที่", "to / at", "thîi"),
        item("บ้าน", "house", "bâan"),
      ]),
      row("วันนี้เขาไม่มา", "wan-níi khǎo mâi maa", "He isn't coming today.", [
        item("วันนี้", "today", "wan-níi", { tones: ["mid", "high"] }),
        item("เขา", "he", "khǎo"),
        item("ไม่", "not", "mâi", { grammar: true }),
        item("มา", "come", "maa"),
      ]),
      row("เดี๋ยวฉันมา", "dĭao chǎn maa", "I'll be right back.", [
        item("เดี๋ยว", "in a moment", "dĭao"),
        item("ฉัน", "I", "chǎn"),
        item("มา", "come back", "maa"),
      ]),
      row("มานั่งตรงนี้", "maa nâng dtrong níi", "Come sit here.", [
        item("มา", "come", "maa"),
        item("นั่ง", "sit", "nâng"),
        item("ตรงนี้", "right here", "dtrong-níi", { tones: ["mid", "high"] }),
      ]),
      row("ไปก่อนนะ", "bpai gàwn ná", "I'm heading out first.", [
        item("ไป", "go", "bpai"),
        item("ก่อน", "first", "gàwn"),
        item("นะ", "soft particle", "ná"),
      ]),
      row("ไปกับฉันไหม", "bpai gàp chǎn mái", "Do you want to come with me?", [
        item("ไป", "go", "bpai"),
        item("กับ", "with", "gàp"),
        item("ฉัน", "me / I", "chǎn"),
        item("ไหม", "question particle", "mái", { grammar: true }),
      ]),
      row("พวกเขามาด้วย", "phûak-khǎo maa dûuay", "They're coming too.", [
        item("พวกเขา", "they", "phûak-khǎo", { tones: ["falling", "rising"] }),
        item("มา", "come", "maa"),
        item("ด้วย", "too", "dûuay"),
      ]),
    ],
  },
  "origin-maa-jaak": {
    lessonTitle: "Origin with มาจาก",
    rows: [
      row("ฉันมาจากกรุงเทพฯ", "chǎn maa jàak grung-thêep", "I'm from Bangkok.", [
        item("ฉัน", "I", "chǎn"),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("กรุงเทพฯ", "Bangkok", "grung-thêep", { tones: ["mid", "falling"] }),
      ]),
      row("ผมมาจากเชียงใหม่", "phǒm maa jàak chiang-mài", "I'm from Chiang Mai.", [
        item("ผม", "I (male speaker)", "phǒm"),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("เชียงใหม่", "Chiang Mai", "chiang-mài", { tones: ["mid", "falling"] }),
      ]),
      row("คุณมาจากภูเก็ต", "khun maa jàak phuu-gèt", "You're from Phuket.", [
        item("คุณ", "you", "khun"),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("ภูเก็ต", "Phuket", "phuu-gèt", { tones: ["mid", "low"] }),
      ]),
      row("เขามาจากขอนแก่น", "khǎo maa jàak khǎawn-gàen", "He's from Khon Kaen.", [
        item("เขา", "he", "khǎo"),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("ขอนแก่น", "Khon Kaen", "khǎawn-gàen", { tones: ["rising", "low"] }),
      ]),
      row("เธอมาจากญี่ปุ่น", "thoe maa jàak yîi-bpùn", "She's from Japan.", [
        item("เธอ", "she", "thoe"),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("ญี่ปุ่น", "Japan", "yîi-bpùn", { tones: ["falling", "low"] }),
      ]),
      row("เรามาจากเกาหลี", "rao maa jàak gao-lǐi", "We're from Korea.", [
        item("เรา", "we", "rao"),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("เกาหลี", "Korea", "gao-lǐi", { tones: ["mid", "rising"] }),
      ]),
      row("ครูมาจากลาว", "khruu maa jàak laao", "The teacher is from Laos.", [
        item("ครู", "teacher", "khruu"),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("ลาว", "Laos", "laao", { tones: ["mid"] }),
      ]),
      row("เพื่อนฉันมาจากพม่า", "phûean chǎn maa jàak phá-mâa", "My friend is from Myanmar.", [
        item("เพื่อน", "friend", "phûean"),
        item("ฉัน", "my / I", "chǎn"),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("พม่า", "Myanmar", "phá-mâa", { tones: ["high", "falling"] }),
      ]),
      row("พ่อมาจากอยุธยา", "phâw maa jàak à-yút-thá-yaa", "Dad is from Ayutthaya.", [
        item("พ่อ", "Dad", "phâw"),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("อยุธยา", "Ayutthaya", "à-yút-thá-yaa", { tones: ["low", "high", "high", "mid"] }),
      ]),
      row("แม่มาจากอุดรธานี", "mâe maa jàak ù-dawn-thaa-nii", "Mom is from Udon Thani.", [
        item("แม่", "Mom", "mâe"),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("อุดรธานี", "Udon Thani", "ù-dawn-thaa-nii", { tones: ["low", "mid", "mid", "mid"] }),
      ]),
      row("นักเรียนคนนี้มาจากเชียงราย", "nák-rian khon níi maa jàak chiang-raai", "This student is from Chiang Rai.", [
        item("นักเรียน", "student", "nák-rian", { tones: ["high", "mid"] }),
        item("คน", "person", "khon"),
        item("นี้", "this", "níi"),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("เชียงราย", "Chiang Rai", "chiang-raai", { tones: ["mid", "mid"] }),
      ]),
      row("เพื่อนใหม่ของฉันมาจากจีน", "phûean mài khǎawng chǎn maa jàak jiin", "My new friend is from China.", [
        item("เพื่อน", "friend", "phûean"),
        item("ใหม่", "new", "mài"),
        item("ของ", "of", "khǎawng"),
        item("ฉัน", "my / I", "chǎn"),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("จีน", "China", "jiin", { tones: ["mid"] }),
      ]),
      row("เขามาจากอินเดีย", "khǎo maa jàak in-dii-a", "He's from India.", [
        item("เขา", "he", "khǎo"),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("อินเดีย", "India", "in-dii-a", { tones: ["mid", "mid", "mid"] }),
      ]),
      row("พี่มาจากโคราช", "phîi maa jàak khoo-râat", "My older sibling is from Korat.", [
        item("พี่", "older sibling", "phîi"),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("โคราช", "Korat", "khoo-râat", { tones: ["mid", "falling"] }),
      ]),
      row("น้องมาจากสงขลา", "nóng maa jàak sǒng-khà-laa", "My younger sibling is from Songkhla.", [
        item("น้อง", "younger sibling", "nóng"),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("สงขลา", "Songkhla", "sǒng-khà-laa", { tones: ["rising", "low", "mid"] }),
      ]),
      row("กาแฟนี้มาจากเชียงราย", "gaa-fae níi maa jàak chiang-raai", "This coffee is from Chiang Rai.", [
        item("กาแฟ", "coffee", "gaa-fae", { tones: ["mid", "mid"] }),
        item("นี้", "this", "níi"),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("เชียงราย", "Chiang Rai", "chiang-raai", { tones: ["mid", "mid"] }),
      ]),
      row("ชานี้มาจากเชียงใหม่", "chaa níi maa jàak chiang-mài", "This tea is from Chiang Mai.", [
        item("ชา", "tea", "chaa"),
        item("นี้", "this", "níi"),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("เชียงใหม่", "Chiang Mai", "chiang-mài", { tones: ["mid", "falling"] }),
      ]),
      row("ผ้าไหมนี้มาจากขอนแก่น", "phâa-mǎi níi maa jàak khǎawn-gàen", "This silk is from Khon Kaen.", [
        item("ผ้าไหม", "silk", "phâa-mǎi", { tones: ["falling", "rising"] }),
        item("นี้", "this", "níi"),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("ขอนแก่น", "Khon Kaen", "khǎawn-gàen", { tones: ["rising", "low"] }),
      ]),
      row("มะม่วงพวกนี้มาจากสวนหลังบ้าน", "má-mûang phûak níi maa jàak sǔan lǎng bâan", "These mangoes are from the backyard garden.", [
        item("มะม่วง", "mangoes", "má-mûang", { tones: ["high", "falling"] }),
        item("พวกนี้", "these", "phûak-níi", { tones: ["falling", "high"] }),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("สวนหลังบ้าน", "backyard garden", "sǔan-lǎng-bâan", { tones: ["rising", "rising", "falling"] }),
      ]),
      row("ของฝากนี้มาจากภูเก็ต", "khǎawng-fàak níi maa jàak phuu-gèt", "This souvenir is from Phuket.", [
        item("ของฝาก", "souvenir", "khǎawng-fàak", { tones: ["rising", "low"] }),
        item("นี้", "this", "níi"),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("ภูเก็ต", "Phuket", "phuu-gèt", { tones: ["mid", "low"] }),
      ]),
      row("คุณมาจากไหน", "khun maa jàak nǎi", "Where are you from?", [
        item("คุณ", "you", "khun"),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("ไหน", "where", "nǎi", { grammar: true }),
      ]),
      row("เขามาจากไหน", "khǎo maa jàak nǎi", "Where is he from?", [
        item("เขา", "he", "khǎo"),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("ไหน", "where", "nǎi", { grammar: true }),
      ]),
      row("เพื่อนคุณมาจากไหน", "phûean khun maa jàak nǎi", "Where is your friend from?", [
        item("เพื่อน", "friend", "phûean"),
        item("คุณ", "your / you", "khun"),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("ไหน", "where", "nǎi", { grammar: true }),
      ]),
      row("กาแฟนี้มาจากไหน", "gaa-fae níi maa jàak nǎi", "Where is this coffee from?", [
        item("กาแฟ", "coffee", "gaa-fae", { tones: ["mid", "mid"] }),
        item("นี้", "this", "níi"),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("ไหน", "where", "nǎi", { grammar: true }),
      ]),
      row("ชานี้มาจากไหน", "chaa níi maa jàak nǎi", "Where is this tea from?", [
        item("ชา", "tea", "chaa"),
        item("นี้", "this", "níi"),
        item("มา", "come", "maa"),
        item("จาก", "from", "jàak"),
        item("ไหน", "where", "nǎi", { grammar: true }),
      ]),
    ],
  },
  "not-identity-mai-chai": {
    lessonTitle: "Noun Negation with ไม่ใช่",
    rows: [
      row("นี่ไม่ใช่น้ำ", "nîi mâi-châi náam", "This isn't water.", [
        item("นี่", "this", "nîi"),
        item("ไม่ใช่", "is not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("น้ำ", "water", "náam"),
      ]),
      row("นี่ไม่ใช่ชา", "nîi mâi-châi chaa", "This isn't tea.", [
        item("นี่", "this", "nîi"),
        item("ไม่ใช่", "is not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("ชา", "tea", "chaa"),
      ]),
      row("นี่ไม่ใช่กาแฟ", "nîi mâi-châi gaa-fae", "This isn't coffee.", [
        item("นี่", "this", "nîi"),
        item("ไม่ใช่", "is not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("กาแฟ", "coffee", "gaa-fae", { tones: ["mid", "mid"] }),
      ]),
      row("นั่นไม่ใช่ห้องน้ำ", "nân mâi-châi hâwng-náam", "That's not the bathroom.", [
        item("นั่น", "that", "nân"),
        item("ไม่ใช่", "is not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("ห้องน้ำ", "bathroom", "hâwng-náam", { tones: ["falling", "high"] }),
      ]),
      row("นั่นไม่ใช่ทางออก", "nân mâi-châi thaang-òk", "That's not the exit.", [
        item("นั่น", "that", "nân"),
        item("ไม่ใช่", "is not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("ทางออก", "exit", "thaang-òk", { tones: ["mid", "low"] }),
      ]),
      row("อันนี้ไม่ใช่ของฉัน", "an níi mâi-châi khǎawng chǎn", "This isn't mine.", [
        item("อัน", "one / thing", "an"),
        item("นี้", "this", "níi"),
        item("ไม่ใช่", "is not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("ของ", "belonging to", "khǎawng"),
        item("ฉัน", "me / I", "chǎn"),
      ]),
      row("อันนั้นไม่ใช่กระเป๋าของผม", "an nán mâi-châi grà-bpǎo khǎawng phǒm", "That's not my bag.", [
        item("อัน", "one / thing", "an"),
        item("นั้น", "that", "nán"),
        item("ไม่ใช่", "is not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("กระเป๋า", "bag", "grà-bpǎo", { tones: ["low", "rising"] }),
        item("ของ", "belonging to", "khǎawng"),
        item("ผม", "me / I (male)", "phǒm"),
      ]),
      row("คนนี้ไม่ใช่ครู", "khon níi mâi-châi khruu", "This person isn't the teacher.", [
        item("คน", "person", "khon"),
        item("นี้", "this", "níi"),
        item("ไม่ใช่", "is not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("ครู", "teacher", "khruu"),
      ]),
      row("เขาไม่ใช่พ่อฉัน", "khǎo mâi-châi phâw chǎn", "He's not my dad.", [
        item("เขา", "he", "khǎo"),
        item("ไม่ใช่", "is not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("พ่อ", "dad", "phâw"),
        item("ฉัน", "my / I", "chǎn"),
      ]),
      row("เธอไม่ใช่พี่สาวฉัน", "thoe mâi-châi phîi-sǎao chǎn", "She's not my older sister.", [
        item("เธอ", "she", "thoe"),
        item("ไม่ใช่", "is not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("พี่สาว", "older sister", "phîi-sǎao", { tones: ["falling", "rising"] }),
        item("ฉัน", "my / I", "chǎn"),
      ]),
      row("ผมไม่ใช่หมอ", "phǒm mâi-châi mǎw", "I'm not a doctor.", [
        item("ผม", "I (male speaker)", "phǒm"),
        item("ไม่ใช่", "am not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("หมอ", "doctor", "mǎw"),
      ]),
      row("ฉันไม่ใช่ครู", "chǎn mâi-châi khruu", "I'm not a teacher.", [
        item("ฉัน", "I", "chǎn"),
        item("ไม่ใช่", "am not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("ครู", "teacher", "khruu"),
      ]),
      row("เขาไม่ใช่หมอ", "khǎo mâi-châi mǎw", "He isn't a doctor.", [
        item("เขา", "he", "khǎo"),
        item("ไม่ใช่", "is not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("หมอ", "doctor", "mǎw"),
      ]),
      row("เธอไม่ใช่นักเรียนใหม่", "thoe mâi-châi nák-rian mài", "She's not a new student.", [
        item("เธอ", "she", "thoe"),
        item("ไม่ใช่", "is not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("นักเรียน", "student", "nák-rian", { tones: ["high", "mid"] }),
        item("ใหม่", "new", "mài"),
      ]),
      row("คนนั้นไม่ใช่ครูใหม่", "khon nán mâi-châi khruu mài", "That person isn't the new teacher.", [
        item("คน", "person", "khon"),
        item("นั้น", "that", "nán"),
        item("ไม่ใช่", "is not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("ครู", "teacher", "khruu"),
        item("ใหม่", "new", "mài"),
      ]),
      row("นี่ไม่ใช่เมนูภาษาไทย", "nîi mâi-châi mee-nuu phaa-sǎa thai", "This isn't the Thai menu.", [
        item("นี่", "this", "nîi"),
        item("ไม่ใช่", "is not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("เมนู", "menu", "mee-nuu", { tones: ["mid", "mid"] }),
        item("ภาษาไทย", "Thai language", "phaa-sǎa-thai", { tones: ["mid", "rising", "mid"] }),
      ]),
      row("นี่ไม่ใช่โต๊ะของเรา", "nîi mâi-châi dtó khǎawng rao", "This isn't our table.", [
        item("นี่", "this", "nîi"),
        item("ไม่ใช่", "is not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("โต๊ะ", "table", "dtó"),
        item("ของ", "belonging to", "khǎawng"),
        item("เรา", "us / we", "rao"),
      ]),
      row("ห้องนี้ไม่ใช่ห้องเรียน", "hâwng níi mâi-châi hâwng-rian", "This room isn't a classroom.", [
        item("ห้อง", "room", "hâwng"),
        item("นี้", "this", "níi"),
        item("ไม่ใช่", "is not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("ห้องเรียน", "classroom", "hâwng-rian", { tones: ["falling", "mid"] }),
      ]),
      row("วันนี้ไม่ใช่วันหยุด", "wan-níi mâi-châi wan-yùt", "Today isn't a holiday.", [
        item("วันนี้", "today", "wan-níi", { tones: ["mid", "high"] }),
        item("ไม่ใช่", "is not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("วันหยุด", "holiday", "wan-yùt", { tones: ["mid", "low"] }),
      ]),
      row("ร้านนี้ไม่ใช่ร้านกาแฟ", "ráan níi mâi-châi ráan gaa-fae", "This isn't a cafe.", [
        item("ร้าน", "shop", "ráan"),
        item("นี้", "this", "níi"),
        item("ไม่ใช่", "is not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("ร้านกาแฟ", "cafe", "ráan-gaa-fae", { tones: ["high", "mid", "mid"] }),
      ]),
      row("อันนี้ไม่ใช่บัตรรถไฟฟ้า", "an níi mâi-châi bàt rót-fai-fáa", "This isn't a train card.", [
        item("อัน", "one / thing", "an"),
        item("นี้", "this", "níi"),
        item("ไม่ใช่", "is not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("บัตร", "card", "bàt"),
        item("รถไฟฟ้า", "train", "rót-fai-fáa", { tones: ["high", "mid", "high"] }),
      ]),
      row("นั่นไม่ใช่รูปผม", "nân mâi-châi rûup phǒm", "That's not my photo.", [
        item("นั่น", "that", "nân"),
        item("ไม่ใช่", "is not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("รูป", "photo", "rûup"),
        item("ผม", "my / I (male)", "phǒm"),
      ]),
      row("นี่ไม่ใช่ที่นั่งของคุณ", "nîi mâi-châi thîi-nâng khǎawng khun", "This isn't your seat.", [
        item("นี่", "this", "nîi"),
        item("ไม่ใช่", "is not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("ที่นั่ง", "seat", "thîi-nâng", { tones: ["falling", "falling"] }),
        item("ของ", "belonging to", "khǎawng"),
        item("คุณ", "you / your", "khun"),
      ]),
      row("คนนั้นไม่ใช่คนขับรถ", "khon nán mâi-châi khon-khàp-rót", "That person isn't the driver.", [
        item("คน", "person", "khon"),
        item("นั้น", "that", "nán"),
        item("ไม่ใช่", "is not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("คนขับรถ", "driver", "khon-khàp-rót", { tones: ["mid", "low", "high"] }),
      ]),
      row("บ้านหลังนั้นไม่ใช่บ้านฉัน", "bâan lǎng nán mâi-châi bâan chǎn", "That house isn't my house.", [
        item("บ้าน", "house", "bâan"),
        item("หลัง", "classifier", "lǎng"),
        item("นั้น", "that", "nán"),
        item("ไม่ใช่", "is not", "mâi-châi", { tones: ["falling", "falling"], grammar: true }),
        item("บ้าน", "house", "bâan"),
        item("ฉัน", "my / I", "chǎn"),
      ]),
    ],
  },
};

function writeLessonFiles(grammarId, lesson) {
  ensureDir(GENERATED_DIR);
  ensureDir(SOURCE_DIR);

  const finalLesson = {
    lessonId: grammarId,
    stage: STAGE,
    lessonTitle: lesson.lessonTitle,
    rows: lesson.rows.map((entry) => ({
      thai: entry.thai,
      english: entry.english,
    })),
  };

  const sourceLesson = {
    grammarId,
    rows: lesson.rows,
  };

  fs.writeFileSync(
    path.join(GENERATED_DIR, `${grammarId}-final25-reviewed.json`),
    `${JSON.stringify(finalLesson, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(SOURCE_DIR, `${grammarId}-source.json`),
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

async function stageLesson(client, grammarId, lesson) {
  const waveId = `${grammarId}-manual-${Date.now()}`;
  const sortResult = await client.query(
    `
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order
    FROM ${GRAMMAR_EXAMPLES_TABLE}
    WHERE grammar_id = $1
    `,
    [grammarId],
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
    [grammarId, STAGE, waveId, NOTE],
  );

  await client.query(
    `
    UPDATE ${GRAMMAR_EXAMPLES_TABLE}
    SET publish_state = 'retired', updated_at = NOW()
    WHERE grammar_id = $1
      AND publish_state = 'staged'
    `,
    [grammarId],
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
        grammarId,
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
}

async function main() {
  const client = await pool.connect();
  try {
    for (const [grammarId, lesson] of Object.entries(LESSONS)) {
      writeLessonFiles(grammarId, lesson);
      await client.query("BEGIN");
      try {
        await stageLesson(client, grammarId, lesson);
        await client.query("COMMIT");
        console.log(`Staged ${grammarId} (${lesson.rows.length} rows)`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
