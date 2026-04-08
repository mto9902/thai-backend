import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { pool } from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const GENERATED_DIR = path.join(ROOT, "admin-data", "generated-candidates");
const SOURCE_DIR = path.join(ROOT, "admin-data", "manual-source-lessons");
const GRAMMAR_EXAMPLES_TABLE = "grammar_examples";
const GRAMMAR_LESSON_PRODUCTION_TABLE = "grammar_lesson_production";
const STAGE = "A1.1";
const NOTE = "Manual New Gen staged 2026-04-06";

const repair = (value) =>
  String(value ?? "").replace(/^\uFEFF/, "").replace(/\u0000/g, "");

const b = (thai, english, romanization, tones) => ({
  thai: repair(thai),
  english: repair(english),
  romanization: repair(romanization),
  tones,
});

const r = (thai, romanization, english, breakdown) => ({
  thai: repair(thai),
  romanization: repair(romanization),
  english: repair(english),
  difficulty: "easy",
  breakdown,
});

const LESSONS = {
  "svo": {
    lessonTitle: "Basic Sentence Order",
    rows: [
      r("ฉันดื่มกาแฟ", "chǎn dùuem gaa-fae", "I drink coffee.", [
        b("ฉัน", "I", "chǎn", ["rising"]),
        b("ดื่ม", "drink", "dùuem", ["low"]),
        b("กาแฟ", "coffee", "gaa-fae", ["mid", "mid"]),
      ]),
      r("แม่ทำอาหารเย็น", "mâe tham aa-hǎan-yen", "Mom makes dinner.", [
        b("แม่", "Mom", "mâe", ["falling"]),
        b("ทำ", "make", "tham", ["mid"]),
        b("อาหารเย็น", "dinner", "aa-hǎan-yen", ["mid", "rising", "mid"]),
      ]),
      r("เขาเปิดประตู", "khǎo pə̀ət prà-tuu", "He opens the door.", [
        b("เขา", "he", "khǎo", ["rising"]),
        b("เปิด", "open", "pə̀ət", ["low"]),
        b("ประตู", "door", "prà-tuu", ["low", "mid"]),
      ]),
      r("เราอ่านเมนู", "rao àan mee-nuu", "We read the menu.", [
        b("เรา", "we", "rao", ["mid"]),
        b("อ่าน", "read", "àan", ["low"]),
        b("เมนู", "menu", "mee-nuu", ["mid", "mid"]),
      ]),
      r("พ่อล้างรถ", "phâw láang rót", "Dad washes the car.", [
        b("พ่อ", "Dad", "phâw", ["falling"]),
        b("ล้าง", "wash", "láang", ["high"]),
        b("รถ", "car", "rót", ["high"]),
      ]),
      r("ครูถือหนังสือ", "khruu thǔue nǎng-sǔue", "The teacher holds a book.", [
        b("ครู", "teacher", "khruu", ["mid"]),
        b("ถือ", "hold", "thǔue", ["rising"]),
        b("หนังสือ", "book", "nǎng-sǔue", ["rising", "rising"]),
      ]),
      r("เด็กกินแตงโม", "dèk kin dtɛɛng-moo", "The child eats watermelon.", [
        b("เด็ก", "child", "dèk", ["low"]),
        b("กิน", "eat", "kin", ["mid"]),
        b("แตงโม", "watermelon", "dtɛɛng-moo", ["mid", "mid"]),
      ]),
      r("เพื่อนถือกระเป๋า", "phûean thǔue grà-bpǎo", "My friend carries a bag.", [
        b("เพื่อน", "my friend", "phûean", ["falling"]),
        b("ถือ", "carry", "thǔue", ["rising"]),
        b("กระเป๋า", "bag", "grà-bpǎo", ["low", "rising"]),
      ]),
      r("คุณปิดหน้าต่าง", "khun pìt nâa-dtàang", "You close the window.", [
        b("คุณ", "you", "khun", ["mid"]),
        b("ปิด", "close", "pìt", ["low"]),
        b("หน้าต่าง", "window", "nâa-dtàang", ["falling", "low"]),
      ]),
      r("น้องดูการ์ตูน", "nóng duu gaan-tuun", "My younger sibling watches cartoons.", [
        b("น้อง", "my younger sibling", "nóng", ["high"]),
        b("ดู", "watch", "duu", ["mid"]),
        b("การ์ตูน", "cartoons", "gaan-tuun", ["mid", "mid"]),
      ]),
      r("ฉันซื้อผลไม้", "chǎn súue phǒn-lá-mái", "I buy fruit.", [
        b("ฉัน", "I", "chǎn", ["rising"]),
        b("ซื้อ", "buy", "súue", ["high"]),
        b("ผลไม้", "fruit", "phǒn-lá-mái", ["rising", "high", "high"]),
      ]),
      r("เธอฟังเพลง", "thoe fang phleeng", "She listens to music.", [
        b("เธอ", "she", "thoe", ["mid"]),
        b("ฟัง", "listen to", "fang", ["mid"]),
        b("เพลง", "music", "phleeng", ["mid"]),
      ]),
      r("พี่โทรหาเพื่อน", "phîi thoo-hǎa phûean", "My older sibling calls a friend.", [
        b("พี่", "my older sibling", "phîi", ["falling"]),
        b("โทรหา", "call", "thoo-hǎa", ["mid", "rising"]),
        b("เพื่อน", "friend", "phûean", ["falling"]),
      ]),
      r("หมาเจอกระดูก", "mǎa jəə grà-dùuk", "The dog finds a bone.", [
        b("หมา", "dog", "mǎa", ["rising"]),
        b("เจอ", "find", "jəə", ["mid"]),
        b("กระดูก", "bone", "grà-dùuk", ["low", "low"]),
      ]),
      r("เด็กวาดรูป", "dèk wâat rûup", "The child draws a picture.", [
        b("เด็ก", "child", "dèk", ["low"]),
        b("วาด", "draw", "wâat", ["falling"]),
        b("รูป", "picture", "rûup", ["falling"]),
      ]),
      r("เราเช็ดโต๊ะ", "rao chét dtó", "We wipe the table.", [
        b("เรา", "we", "rao", ["mid"]),
        b("เช็ด", "wipe", "chét", ["high"]),
        b("โต๊ะ", "table", "dtó", ["high"]),
      ]),
      r("แม่รดน้ำต้นไม้", "mâe rót-náam tôn-mái", "Mom waters the plants.", [
        b("แม่", "Mom", "mâe", ["falling"]),
        b("รดน้ำ", "water", "rót-náam", ["high", "high"]),
        b("ต้นไม้", "plants", "tôn-mái", ["falling", "high"]),
      ]),
      r("คุณยกกล่อง", "khun yók glòng", "You lift the box.", [
        b("คุณ", "you", "khun", ["mid"]),
        b("ยก", "lift", "yók", ["high"]),
        b("กล่อง", "box", "glòng", ["low"]),
      ]),
      r("พ่อซ่อมเก้าอี้", "phâw sôm gâo-îi", "Dad fixes the chair.", [
        b("พ่อ", "Dad", "phâw", ["falling"]),
        b("ซ่อม", "fix", "sôm", ["falling"]),
        b("เก้าอี้", "chair", "gâo-îi", ["falling", "falling"]),
      ]),
      r("เธออุ้มลูก", "thoe ûm lûuk", "She holds the baby.", [
        b("เธอ", "she", "thoe", ["mid"]),
        b("อุ้ม", "hold", "ûm", ["falling"]),
        b("ลูก", "baby", "lûuk", ["falling"]),
      ]),
      r("คนขายหยิบแก้ว", "khon-khǎai yìp gâew", "The seller picks up a glass.", [
        b("คนขาย", "seller", "khon-khǎai", ["mid", "rising"]),
        b("หยิบ", "pick up", "yìp", ["low"]),
        b("แก้ว", "glass", "gâew", ["falling"]),
      ]),
      r("น้องส่งข้อความ", "nóng sòng khâaw-khwaam", "My younger sibling sends a message.", [
        b("น้อง", "my younger sibling", "nóng", ["high"]),
        b("ส่ง", "send", "sòng", ["low"]),
        b("ข้อความ", "message", "khâaw-khwaam", ["falling", "mid"]),
      ]),
      r("ครูเรียกนักเรียน", "khruu rîak nák-rian", "The teacher calls the student.", [
        b("ครู", "teacher", "khruu", ["mid"]),
        b("เรียก", "call", "rîak", ["falling"]),
        b("นักเรียน", "student", "nák-rian", ["high", "mid"]),
      ]),
      r("เพื่อนพับผ้า", "phûean pháp phâa", "My friend folds the laundry.", [
        b("เพื่อน", "my friend", "phûean", ["falling"]),
        b("พับ", "fold", "pháp", ["high"]),
        b("ผ้า", "laundry", "phâa", ["falling"]),
      ]),
      r("เขาเก็บจาน", "khǎo kèp jaan", "He clears the plates.", [
        b("เขา", "he", "khǎo", ["rising"]),
        b("เก็บ", "clear away", "kèp", ["low"]),
        b("จาน", "plates", "jaan", ["mid"]),
      ]),
    ],
  },
  "identity-pen": {
    lessonTitle: "Identity with เป็น",
    rows: [
      r("ฉันเป็นครู", "chǎn bpen khruu", "I am a teacher.", [
        b("ฉัน", "I", "chǎn", ["rising"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("ครู", "teacher", "khruu", ["mid"]),
      ]),
      r("ผมเป็นหมอ", "phǒm bpen mǎw", "I am a doctor.", [
        b("ผม", "I (male speaker)", "phǒm", ["rising"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("หมอ", "doctor", "mǎw", ["rising"]),
      ]),
      r("คุณเป็นนักเรียน", "khun bpen nák-rian", "You are a student.", [
        b("คุณ", "you", "khun", ["mid"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("นักเรียน", "student", "nák-rian", ["high", "mid"]),
      ]),
      r("เขาเป็นครู", "khǎo bpen khruu", "He is a teacher.", [
        b("เขา", "he", "khǎo", ["rising"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("ครู", "teacher", "khruu", ["mid"]),
      ]),
      r("เธอเป็นหมอ", "thoe bpen mǎw", "She is a doctor.", [
        b("เธอ", "she", "thoe", ["mid"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("หมอ", "doctor", "mǎw", ["rising"]),
      ]),
      r("พ่อเป็นคนไทย", "phâw bpen khon-thai", "Dad is Thai.", [
        b("พ่อ", "Dad", "phâw", ["falling"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("คนไทย", "Thai person / Thai", "khon-thai", ["mid", "mid"]),
      ]),
      r("แม่เป็นครู", "mâe bpen khruu", "Mom is a teacher.", [
        b("แม่", "Mom", "mâe", ["falling"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("ครู", "teacher", "khruu", ["mid"]),
      ]),
      r("เด็กเป็นนักเรียน", "dèk bpen nák-rian", "The child is a student.", [
        b("เด็ก", "child", "dèk", ["low"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("นักเรียน", "student", "nák-rian", ["high", "mid"]),
      ]),
      r("ครูเป็นคนไทย", "khruu bpen khon-thai", "The teacher is Thai.", [
        b("ครู", "teacher", "khruu", ["mid"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("คนไทย", "Thai person / Thai", "khon-thai", ["mid", "mid"]),
      ]),
      r("เพื่อนเป็นนักเรียน", "phûean bpen nák-rian", "My friend is a student.", [
        b("เพื่อน", "my friend", "phûean", ["falling"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("นักเรียน", "student", "nák-rian", ["high", "mid"]),
      ]),
      r("ฉันเป็นคนไทย", "chǎn bpen khon-thai", "I am Thai.", [
        b("ฉัน", "I", "chǎn", ["rising"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("คนไทย", "Thai person / Thai", "khon-thai", ["mid", "mid"]),
      ]),
      r("ผมเป็นนักเรียน", "phǒm bpen nák-rian", "I am a student.", [
        b("ผม", "I (male speaker)", "phǒm", ["rising"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("นักเรียน", "student", "nák-rian", ["high", "mid"]),
      ]),
      r("คุณเป็นครู", "khun bpen khruu", "You are a teacher.", [
        b("คุณ", "you", "khun", ["mid"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("ครู", "teacher", "khruu", ["mid"]),
      ]),
      r("เขาเป็นคนไทย", "khǎo bpen khon-thai", "He is Thai.", [
        b("เขา", "he", "khǎo", ["rising"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("คนไทย", "Thai person / Thai", "khon-thai", ["mid", "mid"]),
      ]),
      r("เธอเป็นนักเรียน", "thoe bpen nák-rian", "She is a student.", [
        b("เธอ", "she", "thoe", ["mid"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("นักเรียน", "student", "nák-rian", ["high", "mid"]),
      ]),
      r("เพื่อนเป็นครู", "phûean bpen khruu", "My friend is a teacher.", [
        b("เพื่อน", "my friend", "phûean", ["falling"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("ครู", "teacher", "khruu", ["mid"]),
      ]),
      r("เขาเป็นหมอ", "khǎo bpen mǎw", "He is a doctor.", [
        b("เขา", "he", "khǎo", ["rising"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("หมอ", "doctor", "mǎw", ["rising"]),
      ]),
      r("เธอเป็นคนไทย", "thoe bpen khon-thai", "She is Thai.", [
        b("เธอ", "she", "thoe", ["mid"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("คนไทย", "Thai person / Thai", "khon-thai", ["mid", "mid"]),
      ]),
      r("พ่อเป็นหมอ", "phâw bpen mǎw", "Dad is a doctor.", [
        b("พ่อ", "Dad", "phâw", ["falling"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("หมอ", "doctor", "mǎw", ["rising"]),
      ]),
      r("แม่เป็นคนไทย", "mâe bpen khon-thai", "Mom is Thai.", [
        b("แม่", "Mom", "mâe", ["falling"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("คนไทย", "Thai person / Thai", "khon-thai", ["mid", "mid"]),
      ]),
      r("คุณเป็นคนไทย", "khun bpen khon-thai", "You are Thai.", [
        b("คุณ", "you", "khun", ["mid"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("คนไทย", "Thai person / Thai", "khon-thai", ["mid", "mid"]),
      ]),
      r("เขาเป็นผู้ชาย", "khǎo bpen phûu-chaai", "He is a man.", [
        b("เขา", "he", "khǎo", ["rising"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("ผู้ชาย", "man", "phûu-chaai", ["falling", "mid"]),
      ]),
      r("เธอเป็นผู้หญิง", "thoe bpen phûu-yǐng", "She is a woman.", [
        b("เธอ", "she", "thoe", ["mid"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("ผู้หญิง", "woman", "phûu-yǐng", ["falling", "rising"]),
      ]),
      r("เด็กเป็นคนไทย", "dèk bpen khon-thai", "The child is Thai.", [
        b("เด็ก", "child", "dèk", ["low"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("คนไทย", "Thai person / Thai", "khon-thai", ["mid", "mid"]),
      ]),
      r("เพื่อนเป็นคนไทย", "phûean bpen khon-thai", "My friend is Thai.", [
        b("เพื่อน", "my friend", "phûean", ["falling"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("คนไทย", "Thai person / Thai", "khon-thai", ["mid", "mid"]),
      ]),
    ],
  },
  "polite-particles": {
    lessonTitle: "Polite Particles ครับ / ค่ะ / คะ",
    rows: [
      r("สวัสดีครับ", "sà-wàt-dii khráp", "Hello. (male speaker)", [
        b("สวัสดี", "hello", "sà-wàt-dii", ["low", "low", "mid"]),
        b("ครับ", "polite particle", "khráp", ["high"]),
      ]),
      r("สวัสดีค่ะ", "sà-wàt-dii khâ", "Hello. (female speaker)", [
        b("สวัสดี", "hello", "sà-wàt-dii", ["low", "low", "mid"]),
        b("ค่ะ", "polite particle", "khâ", ["falling"]),
      ]),
      r("ขอบคุณครับ", "khàwp-khun khráp", "Thank you. (male speaker)", [
        b("ขอบคุณ", "thank you", "khàwp-khun", ["low", "mid"]),
        b("ครับ", "polite particle", "khráp", ["high"]),
      ]),
      r("ขอบคุณค่ะ", "khàwp-khun khâ", "Thank you. (female speaker)", [
        b("ขอบคุณ", "thank you", "khàwp-khun", ["low", "mid"]),
        b("ค่ะ", "polite particle", "khâ", ["falling"]),
      ]),
      r("ผมชื่อมินครับ", "phǒm chʉ̂ʉ Min khráp", "My name is Min. (male speaker)", [
        b("ผม", "I (male speaker)", "phǒm", ["rising"]),
        b("ชื่อ", "name / am named", "chʉ̂ʉ", ["falling"]),
        b("มิน", "Min", "Min", ["mid"]),
        b("ครับ", "polite particle", "khráp", ["high"]),
      ]),
      r("ฉันชื่อดาวค่ะ", "chǎn chʉ̂ʉ Daao khâ", "My name is Dao. (female speaker)", [
        b("ฉัน", "I", "chǎn", ["rising"]),
        b("ชื่อ", "name / am named", "chʉ̂ʉ", ["falling"]),
        b("ดาว", "Dao", "Daao", ["mid"]),
        b("ค่ะ", "polite particle", "khâ", ["falling"]),
      ]),
      r("ผมอยู่บ้านครับ", "phǒm yùu bâan khráp", "I'm at home. (male speaker)", [
        b("ผม", "I (male speaker)", "phǒm", ["rising"]),
        b("อยู่", "am / stay", "yùu", ["low"]),
        b("บ้าน", "home", "bâan", ["falling"]),
        b("ครับ", "polite particle", "khráp", ["high"]),
      ]),
      r("หนูหิวค่ะ", "nǔu hǐu khâ", "I'm hungry. (younger/female speaker)", [
        b("หนู", "I (younger speaker)", "nǔu", ["rising"]),
        b("หิว", "hungry", "hǐu", ["rising"]),
        b("ค่ะ", "polite particle", "khâ", ["falling"]),
      ]),
      r("ผมไปก่อนครับ", "phǒm bpai gàwn khráp", "I'm heading out first. (male speaker)", [
        b("ผม", "I (male speaker)", "phǒm", ["rising"]),
        b("ไป", "go", "bpai", ["mid"]),
        b("ก่อน", "first / before", "gàwn", ["low"]),
        b("ครับ", "polite particle", "khráp", ["high"]),
      ]),
      r("แม่อยู่บ้านค่ะ", "mâe yùu bâan khâ", "Mom is at home. (female speaker)", [
        b("แม่", "Mom", "mâe", ["falling"]),
        b("อยู่", "is / stay", "yùu", ["low"]),
        b("บ้าน", "home", "bâan", ["falling"]),
        b("ค่ะ", "polite particle", "khâ", ["falling"]),
      ]),
      r("พ่อกินข้าวครับ", "phâw kin khâao khráp", "Dad is eating rice. (male speaker)", [
        b("พ่อ", "Dad", "phâw", ["falling"]),
        b("กิน", "eat", "kin", ["mid"]),
        b("ข้าว", "rice", "khâao", ["falling"]),
        b("ครับ", "polite particle", "khráp", ["high"]),
      ]),
      r("แม่ดื่มน้ำค่ะ", "mâe dùuem náam khâ", "Mom is drinking water. (female speaker)", [
        b("แม่", "Mom", "mâe", ["falling"]),
        b("ดื่ม", "drink", "dùuem", ["low"]),
        b("น้ำ", "water", "náam", ["high"]),
        b("ค่ะ", "polite particle", "khâ", ["falling"]),
      ]),
      r("เขาเป็นครูครับ", "khǎo bpen khruu khráp", "He's a teacher. (male speaker)", [
        b("เขา", "he", "khǎo", ["rising"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("ครู", "teacher", "khruu", ["mid"]),
        b("ครับ", "polite particle", "khráp", ["high"]),
      ]),
      r("เด็กอยู่ในห้องค่ะ", "dèk yùu nai hâwng khâ", "The child is in the room. (female speaker)", [
        b("เด็ก", "child", "dèk", ["low"]),
        b("อยู่", "is / stay", "yùu", ["low"]),
        b("ใน", "in", "nai", ["mid"]),
        b("ห้อง", "room", "hâwng", ["falling"]),
        b("ค่ะ", "polite particle", "khâ", ["falling"]),
      ]),
      r("คุณว่างไหมคะ", "khun wâang mái khá", "Are you free? (female speaker)", [
        b("คุณ", "you", "khun", ["mid"]),
        b("ว่าง", "free", "wâang", ["falling"]),
        b("ไหม", "question particle", "mái", ["rising"]),
        b("คะ", "polite particle", "khá", ["high"]),
      ]),
      r("คุณหิวไหมคะ", "khun hǐu mái khá", "Are you hungry? (female speaker)", [
        b("คุณ", "you", "khun", ["mid"]),
        b("หิว", "hungry", "hǐu", ["rising"]),
        b("ไหม", "question particle", "mái", ["rising"]),
        b("คะ", "polite particle", "khá", ["high"]),
      ]),
      r("คุณชื่ออะไรคะ", "khun chʉ̂ʉ à-rai khá", "What's your name? (female speaker)", [
        b("คุณ", "you", "khun", ["mid"]),
        b("ชื่อ", "name / are named", "chʉ̂ʉ", ["falling"]),
        b("อะไร", "what", "à-rai", ["low", "mid"]),
        b("คะ", "polite particle", "khá", ["high"]),
      ]),
      r("คุณอยู่ที่นี่ไหมคะ", "khun yùu thîi nîi mái khá", "Are you here? (female speaker)", [
        b("คุณ", "you", "khun", ["mid"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("ที่", "at", "thîi", ["falling"]),
        b("นี่", "here", "nîi", ["falling"]),
        b("ไหม", "question particle", "mái", ["rising"]),
        b("คะ", "polite particle", "khá", ["high"]),
      ]),
      r("คุณเป็นครูไหมคะ", "khun bpen khruu mái khá", "Are you a teacher? (female speaker)", [
        b("คุณ", "you", "khun", ["mid"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("ครู", "teacher", "khruu", ["mid"]),
        b("ไหม", "question particle", "mái", ["rising"]),
        b("คะ", "polite particle", "khá", ["high"]),
      ]),
      r("คุณอ่านหนังสือไหมคะ", "khun àan nǎng-sǔue mái khá", "Do you read books? (female speaker)", [
        b("คุณ", "you", "khun", ["mid"]),
        b("อ่าน", "read", "àan", ["low"]),
        b("หนังสือ", "books", "nǎng-sǔue", ["rising", "rising"]),
        b("ไหม", "question particle", "mái", ["rising"]),
        b("คะ", "polite particle", "khá", ["high"]),
      ]),
      r("นี่อะไรคะ", "nîi à-rai khá", "What is this? (female speaker)", [
        b("นี่", "this", "nîi", ["falling"]),
        b("อะไร", "what", "à-rai", ["low", "mid"]),
        b("คะ", "polite particle", "khá", ["high"]),
      ]),
      r("คุณชื่ออะไรครับ", "khun chʉ̂ʉ à-rai khráp", "What's your name? (male speaker)", [
        b("คุณ", "you", "khun", ["mid"]),
        b("ชื่อ", "name / are named", "chʉ̂ʉ", ["falling"]),
        b("อะไร", "what", "à-rai", ["low", "mid"]),
        b("ครับ", "polite particle", "khráp", ["high"]),
      ]),
      r("เขาอยู่ที่นี่ไหมครับ", "khǎo yùu thîi nîi mái khráp", "Is he here? (male speaker)", [
        b("เขา", "he", "khǎo", ["rising"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("ที่", "at", "thîi", ["falling"]),
        b("นี่", "here", "nîi", ["falling"]),
        b("ไหม", "question particle", "mái", ["rising"]),
        b("ครับ", "polite particle", "khráp", ["high"]),
      ]),
      r("ขอโทษครับ", "khǎw-thôot khráp", "Excuse me. (male speaker)", [
        b("ขอโทษ", "excuse me / sorry", "khǎw-thôot", ["rising", "falling"]),
        b("ครับ", "polite particle", "khráp", ["high"]),
      ]),
      r("ขอโทษค่ะ", "khǎw-thôot khâ", "Excuse me. (female speaker)", [
        b("ขอโทษ", "excuse me / sorry", "khǎw-thôot", ["rising", "falling"]),
        b("ค่ะ", "polite particle", "khâ", ["falling"]),
      ]),
    ],
  },
  "name-chue": {
    lessonTitle: "Names with ชื่อ",
    rows: [
      r("ฉันชื่อดาว", "chǎn chʉ̂ʉ Daao", "My name is Dao.", [
        b("ฉัน", "I", "chǎn", ["rising"]),
        b("ชื่อ", "name / am named", "chʉ̂ʉ", ["falling"]),
        b("ดาว", "Dao", "Daao", ["mid"]),
      ]),
      r("ผมชื่อโต้ง", "phǒm chʉ̂ʉ Dtông", "My name is Tong. (male speaker)", [
        b("ผม", "I (male speaker)", "phǒm", ["rising"]),
        b("ชื่อ", "name / am named", "chʉ̂ʉ", ["falling"]),
        b("โต้ง", "Tong", "Dtông", ["falling"]),
      ]),
      r("คุณชื่ออะไร", "khun chʉ̂ʉ à-rai", "What's your name?", [
        b("คุณ", "you", "khun", ["mid"]),
        b("ชื่อ", "name / are named", "chʉ̂ʉ", ["falling"]),
        b("อะไร", "what", "à-rai", ["low", "mid"]),
      ]),
      r("เขาชื่อบีม", "khǎo chʉ̂ʉ Biim", "His name is Beam.", [
        b("เขา", "he", "khǎo", ["rising"]),
        b("ชื่อ", "name / is named", "chʉ̂ʉ", ["falling"]),
        b("บีม", "Beam", "Biim", ["mid"]),
      ]),
      r("เธอชื่อฝน", "thoe chʉ̂ʉ Fǒn", "Her name is Fon.", [
        b("เธอ", "she", "thoe", ["mid"]),
        b("ชื่อ", "name / is named", "chʉ̂ʉ", ["falling"]),
        b("ฝน", "Fon", "Fǒn", ["rising"]),
      ]),
      r("เพื่อนฉันชื่อบอล", "phûean chǎn chʉ̂ʉ Bawn", "My friend's name is Ball.", [
        b("เพื่อน", "friend", "phûean", ["falling"]),
        b("ฉัน", "my", "chǎn", ["rising"]),
        b("ชื่อ", "name / is named", "chʉ̂ʉ", ["falling"]),
        b("บอล", "Ball", "Bawn", ["mid"]),
      ]),
      r("พี่สาวฉันชื่อฟ้า", "phîi-sǎao chǎn chʉ̂ʉ Fáa", "My older sister's name is Fah.", [
        b("พี่สาว", "my older sister", "phîi-sǎao", ["falling", "rising"]),
        b("ฉัน", "my", "chǎn", ["rising"]),
        b("ชื่อ", "name / is named", "chʉ̂ʉ", ["falling"]),
        b("ฟ้า", "Fah", "Fáa", ["high"]),
      ]),
      r("น้องชายฉันชื่อจูน", "nóng-chaai chǎn chʉ̂ʉ Juun", "My younger brother's name is June.", [
        b("น้องชาย", "my younger brother", "nóng-chaai", ["high", "mid"]),
        b("ฉัน", "my", "chǎn", ["rising"]),
        b("ชื่อ", "name / is named", "chʉ̂ʉ", ["falling"]),
        b("จูน", "June", "Juun", ["mid"]),
      ]),
      r("ครูชื่ออะไร", "khruu chʉ̂ʉ à-rai", "What's the teacher's name?", [
        b("ครู", "teacher", "khruu", ["mid"]),
        b("ชื่อ", "name / is named", "chʉ̂ʉ", ["falling"]),
        b("อะไร", "what", "à-rai", ["low", "mid"]),
      ]),
      r("หมาชื่อโบ้", "mǎa chʉ̂ʉ Bôo", "The dog's name is Bo.", [
        b("หมา", "dog", "mǎa", ["rising"]),
        b("ชื่อ", "name / is named", "chʉ̂ʉ", ["falling"]),
        b("โบ้", "Bo", "Bôo", ["falling"]),
      ]),
      r("แมวชื่อดำ", "maeo chʉ̂ʉ Dam", "The cat's name is Dam.", [
        b("แมว", "cat", "maeo", ["mid"]),
        b("ชื่อ", "name / is named", "chʉ̂ʉ", ["falling"]),
        b("ดำ", "Dam", "Dam", ["mid"]),
      ]),
      r("ร้านนี้ชื่ออะไร", "ráan níi chʉ̂ʉ à-rai", "What's this shop called?", [
        b("ร้าน", "shop", "ráan", ["high"]),
        b("นี้", "this", "níi", ["high"]),
        b("ชื่อ", "be called / name", "chʉ̂ʉ", ["falling"]),
        b("อะไร", "what", "à-rai", ["low", "mid"]),
      ]),
      r("โรงเรียนนี้ชื่ออะไร", "roong-rian níi chʉ̂ʉ à-rai", "What's this school called?", [
        b("โรงเรียน", "school", "roong-rian", ["mid", "mid"]),
        b("นี้", "this", "níi", ["high"]),
        b("ชื่อ", "be called / name", "chʉ̂ʉ", ["falling"]),
        b("อะไร", "what", "à-rai", ["low", "mid"]),
      ]),
      r("เพลงนี้ชื่ออะไร", "phleeng níi chʉ̂ʉ à-rai", "What's this song called?", [
        b("เพลง", "song", "phleeng", ["mid"]),
        b("นี้", "this", "níi", ["high"]),
        b("ชื่อ", "be called / name", "chʉ̂ʉ", ["falling"]),
        b("อะไร", "what", "à-rai", ["low", "mid"]),
      ]),
      r("หนังเรื่องนี้ชื่ออะไร", "nǎng-rʉ̂ang níi chʉ̂ʉ à-rai", "What's this movie called?", [
        b("หนังเรื่อง", "movie", "nǎng-rʉ̂ang", ["rising", "falling"]),
        b("นี้", "this", "níi", ["high"]),
        b("ชื่อ", "be called / name", "chʉ̂ʉ", ["falling"]),
        b("อะไร", "what", "à-rai", ["low", "mid"]),
      ]),
      r("ฉันชื่อเล่นว่าฝน", "chǎn chʉ̂ʉ-lên wâa Fǒn", "My nickname is Fon.", [
        b("ฉัน", "I", "chǎn", ["rising"]),
        b("ชื่อเล่น", "nickname", "chʉ̂ʉ-lên", ["falling", "falling"]),
        b("ว่า", "that / called", "wâa", ["falling"]),
        b("ฝน", "Fon", "Fǒn", ["rising"]),
      ]),
      r("ผมชื่อเล่นว่าโต้ง", "phǒm chʉ̂ʉ-lên wâa Dtông", "My nickname is Tong. (male speaker)", [
        b("ผม", "I (male speaker)", "phǒm", ["rising"]),
        b("ชื่อเล่น", "nickname", "chʉ̂ʉ-lên", ["falling", "falling"]),
        b("ว่า", "that / called", "wâa", ["falling"]),
        b("โต้ง", "Tong", "Dtông", ["falling"]),
      ]),
      r("น้องชื่ออะไร", "nóng chʉ̂ʉ à-rai", "What's your name? (to a younger person)", [
        b("น้อง", "younger person / younger sibling", "nóng", ["high"]),
        b("ชื่อ", "name / are named", "chʉ̂ʉ", ["falling"]),
        b("อะไร", "what", "à-rai", ["low", "mid"]),
      ]),
      r("คนนี้ชื่ออะไร", "khon níi chʉ̂ʉ à-rai", "What's this person's name?", [
        b("คน", "person", "khon", ["mid"]),
        b("นี้", "this", "níi", ["high"]),
        b("ชื่อ", "name / is named", "chʉ̂ʉ", ["falling"]),
        b("อะไร", "what", "à-rai", ["low", "mid"]),
      ]),
      r("เพื่อนคุณชื่ออะไร", "phûean khun chʉ̂ʉ à-rai", "What's your friend's name?", [
        b("เพื่อน", "friend", "phûean", ["falling"]),
        b("คุณ", "your", "khun", ["mid"]),
        b("ชื่อ", "name / is named", "chʉ̂ʉ", ["falling"]),
        b("อะไร", "what", "à-rai", ["low", "mid"]),
      ]),
      r("พี่ชายฉันชื่อบีม", "phîi-chaai chǎn chʉ̂ʉ Biim", "My older brother's name is Beam.", [
        b("พี่ชาย", "my older brother", "phîi-chaai", ["falling", "mid"]),
        b("ฉัน", "my", "chǎn", ["rising"]),
        b("ชื่อ", "name / is named", "chʉ̂ʉ", ["falling"]),
        b("บีม", "Beam", "Biim", ["mid"]),
      ]),
      r("น้องสาวฉันชื่อดาว", "nóng-sǎao chǎn chʉ̂ʉ Daao", "My younger sister's name is Dao.", [
        b("น้องสาว", "my younger sister", "nóng-sǎao", ["high", "rising"]),
        b("ฉัน", "my", "chǎn", ["rising"]),
        b("ชื่อ", "name / is named", "chʉ̂ʉ", ["falling"]),
        b("ดาว", "Dao", "Daao", ["mid"]),
      ]),
      r("เด็กคนนี้ชื่ออะไร", "dèk khon níi chʉ̂ʉ à-rai", "What's this child's name?", [
        b("เด็ก", "child", "dèk", ["low"]),
        b("คน", "classifier / person", "khon", ["mid"]),
        b("นี้", "this", "níi", ["high"]),
        b("ชื่อ", "name / is named", "chʉ̂ʉ", ["falling"]),
        b("อะไร", "what", "à-rai", ["low", "mid"]),
      ]),
      r("เขาชื่ออะไร", "khǎo chʉ̂ʉ à-rai", "What's his name?", [
        b("เขา", "he", "khǎo", ["rising"]),
        b("ชื่อ", "name / is named", "chʉ̂ʉ", ["falling"]),
        b("อะไร", "what", "à-rai", ["low", "mid"]),
      ]),
      r("เธอชื่ออะไร", "thoe chʉ̂ʉ à-rai", "What's her name?", [
        b("เธอ", "she", "thoe", ["mid"]),
        b("ชื่อ", "name / is named", "chʉ̂ʉ", ["falling"]),
        b("อะไร", "what", "à-rai", ["low", "mid"]),
      ]),
    ],
  },
  "question-mai": {
    lessonTitle: "Yes or No Questions with ไหม",
    rows: [
      r("คุณหิวไหม", "khun hǐu mái", "Are you hungry?", [
        b("คุณ", "you", "khun", ["mid"]),
        b("หิว", "hungry", "hǐu", ["rising"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("คุณว่างไหม", "khun wâang mái", "Are you free?", [
        b("คุณ", "you", "khun", ["mid"]),
        b("ว่าง", "free", "wâang", ["falling"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("คุณอยู่บ้านไหม", "khun yùu bâan mái", "Are you at home?", [
        b("คุณ", "you", "khun", ["mid"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("บ้าน", "home", "bâan", ["falling"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("เขาอยู่ที่นี่ไหม", "khǎo yùu thîi nîi mái", "Is he here?", [
        b("เขา", "he", "khǎo", ["rising"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("ที่", "at", "thîi", ["falling"]),
        b("นี่", "here", "nîi", ["falling"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("พ่ออยู่ที่ร้านไหม", "phâw yùu thîi ráan mái", "Is Dad at the shop?", [
        b("พ่อ", "Dad", "phâw", ["falling"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("ที่", "at", "thîi", ["falling"]),
        b("ร้าน", "shop", "ráan", ["high"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("แม่ไปทำงานไหม", "mâe bpai tham-ngaan mái", "Is Mom going to work?", [
        b("แม่", "Mom", "mâe", ["falling"]),
        b("ไป", "go", "bpai", ["mid"]),
        b("ทำงาน", "work", "tham-ngaan", ["mid", "mid"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("คุณมาไหม", "khun maa mái", "Are you coming?", [
        b("คุณ", "you", "khun", ["mid"]),
        b("มา", "come", "maa", ["mid"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("คุณดื่มกาแฟไหม", "khun dùuem gaa-fae mái", "Do you drink coffee?", [
        b("คุณ", "you", "khun", ["mid"]),
        b("ดื่ม", "drink", "dùuem", ["low"]),
        b("กาแฟ", "coffee", "gaa-fae", ["mid", "mid"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("เขาชอบชาไหม", "khǎo chôop chaa mái", "Does he like tea?", [
        b("เขา", "he", "khǎo", ["rising"]),
        b("ชอบ", "like", "chôop", ["falling"]),
        b("ชา", "tea", "chaa", ["mid"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("เธออ่านหนังสือไหม", "thoe àan nǎng-sǔue mái", "Does she read books?", [
        b("เธอ", "she", "thoe", ["mid"]),
        b("อ่าน", "read", "àan", ["low"]),
        b("หนังสือ", "books", "nǎng-sǔue", ["rising", "rising"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("คุณดูหนังไหม", "khun duu nǎng mái", "Do you watch movies?", [
        b("คุณ", "you", "khun", ["mid"]),
        b("ดู", "watch", "duu", ["mid"]),
        b("หนัง", "movies", "nǎng", ["rising"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("คุณมีเวลาไหม", "khun mii wee-laa mái", "Do you have time?", [
        b("คุณ", "you", "khun", ["mid"]),
        b("มี", "have", "mii", ["mid"]),
        b("เวลา", "time", "wee-laa", ["mid", "mid"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("เขามีรถไหม", "khǎo mii rót mái", "Does he have a car?", [
        b("เขา", "he", "khǎo", ["rising"]),
        b("มี", "have", "mii", ["mid"]),
        b("รถ", "car", "rót", ["high"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("ร้านเปิดไหม", "ráan bpə̀ət mái", "Is the shop open?", [
        b("ร้าน", "shop", "ráan", ["high"]),
        b("เปิด", "open", "bpə̀ət", ["low"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("ห้องนี้เย็นไหม", "hâwng níi yen mái", "Is this room cool?", [
        b("ห้อง", "room", "hâwng", ["falling"]),
        b("นี้", "this", "níi", ["high"]),
        b("เย็น", "cool", "yen", ["mid"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("อาหารอร่อยไหม", "aa-hǎan à-ròi mái", "Is the food tasty?", [
        b("อาหาร", "food", "aa-hǎan", ["mid", "rising"]),
        b("อร่อย", "tasty", "à-ròi", ["low", "low"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("น้ำร้อนไหม", "náam rón mái", "Is the water hot?", [
        b("น้ำ", "water", "náam", ["high"]),
        b("ร้อน", "hot", "rón", ["high"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("แมวอยู่ข้างในไหม", "maeo yùu khâang-nai mái", "Is the cat inside?", [
        b("แมว", "cat", "maeo", ["mid"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("ข้างใน", "inside", "khâang-nai", ["falling", "mid"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("ครูมาไหม", "khruu maa mái", "Is the teacher coming?", [
        b("ครู", "teacher", "khruu", ["mid"]),
        b("มา", "come", "maa", ["mid"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("คุณเป็นครูไหม", "khun bpen khruu mái", "Are you a teacher?", [
        b("คุณ", "you", "khun", ["mid"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("ครู", "teacher", "khruu", ["mid"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("เขาเป็นคนไทยไหม", "khǎo bpen khon-thai mái", "Is he Thai?", [
        b("เขา", "he", "khǎo", ["rising"]),
        b("เป็น", "be", "bpen", ["mid"]),
        b("คนไทย", "Thai person / Thai", "khon-thai", ["mid", "mid"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("นี่ของคุณไหม", "nîi khǎawng khun mái", "Is this yours?", [
        b("นี่", "this", "nîi", ["falling"]),
        b("ของ", "thing / belonging", "khǎawng", ["rising"]),
        b("คุณ", "you", "khun", ["mid"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("วันนี้ฝนตกไหม", "wan-níi fǒn-tòk mái", "Is it raining today?", [
        b("วันนี้", "today", "wan-níi", ["mid", "high"]),
        b("ฝนตก", "rain", "fǒn-tòk", ["rising", "low"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("เด็กนอนไหม", "dèk nawn mái", "Is the child sleeping?", [
        b("เด็ก", "child", "dèk", ["low"]),
        b("นอน", "sleep", "nawn", ["mid"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("พ่อดูทีวีไหม", "phâw duu thii-wii mái", "Is Dad watching TV?", [
        b("พ่อ", "Dad", "phâw", ["falling"]),
        b("ดู", "watch", "duu", ["mid"]),
        b("ทีวี", "TV", "thii-wii", ["mid", "mid"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
    ],
  },
  "have-mii": {
    lessonTitle: "Have / There Is with มี",
    rows: [
      r("ฉันมีแมว", "chǎn mii maeo", "I have a cat.", [
        b("ฉัน", "I", "chǎn", ["rising"]),
        b("มี", "have", "mii", ["mid"]),
        b("แมว", "cat", "maeo", ["mid"]),
      ]),
      r("เขามีรถ", "khǎo mii rót", "He has a car.", [
        b("เขา", "he", "khǎo", ["rising"]),
        b("มี", "have", "mii", ["mid"]),
        b("รถ", "car", "rót", ["high"]),
      ]),
      r("ฉันมีเพื่อน", "chǎn mii phûean", "I have a friend.", [
        b("ฉัน", "I", "chǎn", ["rising"]),
        b("มี", "have", "mii", ["mid"]),
        b("เพื่อน", "friend", "phûean", ["falling"]),
      ]),
      r("แม่มีเวลา", "mâe mii wee-laa", "Mom has time.", [
        b("แม่", "Mom", "mâe", ["falling"]),
        b("มี", "have", "mii", ["mid"]),
        b("เวลา", "time", "wee-laa", ["mid", "mid"]),
      ]),
      r("พ่อมีงาน", "phâw mii ngaan", "Dad has work.", [
        b("พ่อ", "Dad", "phâw", ["falling"]),
        b("มี", "have", "mii", ["mid"]),
        b("งาน", "work", "ngaan", ["mid"]),
      ]),
      r("เรามีเงิน", "rao mii ngoen", "We have money.", [
        b("เรา", "we", "rao", ["mid"]),
        b("มี", "have", "mii", ["mid"]),
        b("เงิน", "money", "ngoen", ["mid"]),
      ]),
      r("คุณมีพี่น้องไหม", "khun mii phîi-náwng mái", "Do you have any siblings?", [
        b("คุณ", "you", "khun", ["mid"]),
        b("มี", "have", "mii", ["mid"]),
        b("พี่น้อง", "siblings", "phîi-náwng", ["falling", "high"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("เขามีน้องสาว", "khǎo mii nóng-sǎao", "He has a younger sister.", [
        b("เขา", "he", "khǎo", ["rising"]),
        b("มี", "have", "mii", ["mid"]),
        b("น้องสาว", "younger sister", "nóng-sǎao", ["high", "rising"]),
      ]),
      r("ฉันมีนัดวันนี้", "chǎn mii nát wan-níi", "I have plans today.", [
        b("ฉัน", "I", "chǎn", ["rising"]),
        b("มี", "have", "mii", ["mid"]),
        b("นัด", "an appointment / plans", "nát", ["high"]),
        b("วันนี้", "today", "wan-níi", ["mid", "high"]),
      ]),
      r("เรามีคำถาม", "rao mii kham-thǎam", "We have a question.", [
        b("เรา", "we", "rao", ["mid"]),
        b("มี", "have", "mii", ["mid"]),
        b("คำถาม", "a question", "kham-thǎam", ["mid", "rising"]),
      ]),
      r("ห้องนี้มีโต๊ะ", "hâwng níi mii dtó", "This room has a table.", [
        b("ห้อง", "room", "hâwng", ["falling"]),
        b("นี้", "this", "níi", ["high"]),
        b("มี", "have / there is", "mii", ["mid"]),
        b("โต๊ะ", "table", "dtó", ["high"]),
      ]),
      r("บ้านเรามีสวน", "bâan rao mii sǔan", "Our house has a garden.", [
        b("บ้าน", "house", "bâan", ["falling"]),
        b("เรา", "our", "rao", ["mid"]),
        b("มี", "have", "mii", ["mid"]),
        b("สวน", "garden", "sǔan", ["rising"]),
      ]),
      r("ที่ร้านนี้มีชา", "thîi ráan níi mii chaa", "They have tea here.", [
        b("ที่", "at", "thîi", ["falling"]),
        b("ร้าน", "shop", "ráan", ["high"]),
        b("นี้", "this", "níi", ["high"]),
        b("มี", "have / there is", "mii", ["mid"]),
        b("ชา", "tea", "chaa", ["mid"]),
      ]),
      r("ที่นี่มีคนเยอะ", "thîi nîi mii khon yə́", "There are a lot of people here.", [
        b("ที่", "at", "thîi", ["falling"]),
        b("นี่", "here", "nîi", ["falling"]),
        b("มี", "there are", "mii", ["mid"]),
        b("คน", "people", "khon", ["mid"]),
        b("เยอะ", "a lot", "yə́", ["high"]),
      ]),
      r("ที่ตลาดมีผลไม้", "thîi dtà-làat mii phǒn-lá-mái", "There’s fruit at the market.", [
        b("ที่", "at", "thîi", ["falling"]),
        b("ตลาด", "market", "dtà-làat", ["low", "low"]),
        b("มี", "there is", "mii", ["mid"]),
        b("ผลไม้", "fruit", "phǒn-lá-mái", ["rising", "high", "high"]),
      ]),
      r("ฉันมีหนังสือใหม่", "chǎn mii nǎng-sǔue mài", "I have a new book.", [
        b("ฉัน", "I", "chǎn", ["rising"]),
        b("มี", "have", "mii", ["mid"]),
        b("หนังสือ", "book", "nǎng-sǔue", ["rising", "rising"]),
        b("ใหม่", "new", "mài", ["falling"]),
      ]),
      r("เขามีกระเป๋าใหม่", "khǎo mii grà-bpǎo mài", "He has a new bag.", [
        b("เขา", "he", "khǎo", ["rising"]),
        b("มี", "have", "mii", ["mid"]),
        b("กระเป๋า", "bag", "grà-bpǎo", ["low", "rising"]),
        b("ใหม่", "new", "mài", ["falling"]),
      ]),
      r("ครูมีเวลาตอนนี้", "khruu mii wee-laa dtawn-níi", "The teacher has time right now.", [
        b("ครู", "teacher", "khruu", ["mid"]),
        b("มี", "have", "mii", ["mid"]),
        b("เวลา", "time", "wee-laa", ["mid", "mid"]),
        b("ตอนนี้", "right now", "dtawn-níi", ["mid", "high"]),
      ]),
      r("คุณมีน้ำไหม", "khun mii náam mái", "Do you have water?", [
        b("คุณ", "you", "khun", ["mid"]),
        b("มี", "have", "mii", ["mid"]),
        b("น้ำ", "water", "náam", ["high"]),
        b("ไหม", "question particle", "mái", ["rising"]),
      ]),
      r("พ่อมีโทรศัพท์", "phâw mii thoo-rá-sàp", "Dad has a phone.", [
        b("พ่อ", "Dad", "phâw", ["falling"]),
        b("มี", "have", "mii", ["mid"]),
        b("โทรศัพท์", "phone", "thoo-rá-sàp", ["mid", "high", "low"]),
      ]),
      r("ฉันมีงานเยอะ", "chǎn mii ngaan yə́", "I have a lot of work.", [
        b("ฉัน", "I", "chǎn", ["rising"]),
        b("มี", "have", "mii", ["mid"]),
        b("งาน", "work", "ngaan", ["mid"]),
        b("เยอะ", "a lot", "yə́", ["high"]),
      ]),
      r("ที่บ้านมีข้าว", "thîi bâan mii khâao", "There’s rice at home.", [
        b("ที่", "at", "thîi", ["falling"]),
        b("บ้าน", "home", "bâan", ["falling"]),
        b("มี", "there is", "mii", ["mid"]),
        b("ข้าว", "rice", "khâao", ["falling"]),
      ]),
      r("เขามีแมวสองตัว", "khǎo mii maeo sǎawng dtuaa", "He has two cats.", [
        b("เขา", "he", "khǎo", ["rising"]),
        b("มี", "have", "mii", ["mid"]),
        b("แมว", "cat", "maeo", ["mid"]),
        b("สองตัว", "two", "sǎawng dtuaa", ["rising", "mid"]),
      ]),
      r("บ้านนี้มีห้องน้ำ", "bâan níi mii hâwng-náam", "This house has a bathroom.", [
        b("บ้าน", "house", "bâan", ["falling"]),
        b("นี้", "this", "níi", ["high"]),
        b("มี", "have", "mii", ["mid"]),
        b("ห้องน้ำ", "bathroom", "hâwng-náam", ["falling", "high"]),
      ]),
      r("วันนี้เรามีเรียน", "wan-níi rao mii rian", "We have class today.", [
        b("วันนี้", "today", "wan-níi", ["mid", "high"]),
        b("เรา", "we", "rao", ["mid"]),
        b("มี", "have", "mii", ["mid"]),
        b("เรียน", "class / study", "rian", ["mid"]),
      ]),
    ],
  },
  "no-have-mai-mii": {
    lessonTitle: "Absence with ไม่มี",
    rows: [
      r("ฉันไม่มีเงิน", "chǎn mâi mii ngoen", "I don't have any money.", [
        b("ฉัน", "I", "chǎn", ["rising"]),
        b("ไม่มี", "don't have", "mâi mii", ["falling", "mid"]),
        b("เงิน", "money", "ngoen", ["mid"]),
      ]),
      r("เขาไม่มีเวลา", "khǎo mâi mii wee-laa", "He doesn't have time.", [
        b("เขา", "he", "khǎo", ["rising"]),
        b("ไม่มี", "doesn't have", "mâi mii", ["falling", "mid"]),
        b("เวลา", "time", "wee-laa", ["mid", "mid"]),
      ]),
      r("วันนี้ฉันไม่มีเรียน", "wan-níi chǎn mâi mii rian", "I don't have class today.", [
        b("วันนี้", "today", "wan-níi", ["mid", "high"]),
        b("ฉัน", "I", "chǎn", ["rising"]),
        b("ไม่มี", "don't have", "mâi mii", ["falling", "mid"]),
        b("เรียน", "class / study", "rian", ["mid"]),
      ]),
      r("ที่บ้านไม่มีนม", "thîi bâan mâi mii nom", "There's no milk at home.", [
        b("ที่", "at", "thîi", ["falling"]),
        b("บ้าน", "home", "bâan", ["falling"]),
        b("ไม่มี", "there isn't", "mâi mii", ["falling", "mid"]),
        b("นม", "milk", "nom", ["mid"]),
      ]),
      r("ห้องนี้ไม่มีโต๊ะ", "hâwng níi mâi mii dtó", "There isn't a table in this room.", [
        b("ห้อง", "room", "hâwng", ["falling"]),
        b("นี้", "this", "níi", ["high"]),
        b("ไม่มี", "there isn't", "mâi mii", ["falling", "mid"]),
        b("โต๊ะ", "table", "dtó", ["high"]),
      ]),
      r("ที่ร้านนี้ไม่มีชา", "thîi ráan níi mâi mii chaa", "They don't have tea here.", [
        b("ที่", "at", "thîi", ["falling"]),
        b("ร้าน", "shop", "ráan", ["high"]),
        b("นี้", "this", "níi", ["high"]),
        b("ไม่มี", "don't have", "mâi mii", ["falling", "mid"]),
        b("ชา", "tea", "chaa", ["mid"]),
      ]),
      r("พ่อไม่มีรถ", "phâw mâi mii rót", "Dad doesn't have a car.", [
        b("พ่อ", "Dad", "phâw", ["falling"]),
        b("ไม่มี", "doesn't have", "mâi mii", ["falling", "mid"]),
        b("รถ", "car", "rót", ["high"]),
      ]),
      r("แม่ไม่มีโทรศัพท์", "mâe mâi mii thoo-rá-sàp", "Mom doesn't have a phone.", [
        b("แม่", "Mom", "mâe", ["falling"]),
        b("ไม่มี", "doesn't have", "mâi mii", ["falling", "mid"]),
        b("โทรศัพท์", "phone", "thoo-rá-sàp", ["mid", "high", "low"]),
      ]),
      r("เราไม่มีคำถาม", "rao mâi mii kham-thǎam", "We don't have any questions.", [
        b("เรา", "we", "rao", ["mid"]),
        b("ไม่มี", "don't have", "mâi mii", ["falling", "mid"]),
        b("คำถาม", "questions", "kham-thǎam", ["mid", "rising"]),
      ]),
      r("ฉันไม่มีพี่น้อง", "chǎn mâi mii phîi-náwng", "I don't have any siblings.", [
        b("ฉัน", "I", "chǎn", ["rising"]),
        b("ไม่มี", "don't have", "mâi mii", ["falling", "mid"]),
        b("พี่น้อง", "siblings", "phîi-náwng", ["falling", "high"]),
      ]),
      r("เขาไม่มีแมว", "khǎo mâi mii maeo", "He doesn't have a cat.", [
        b("เขา", "he", "khǎo", ["rising"]),
        b("ไม่มี", "doesn't have", "mâi mii", ["falling", "mid"]),
        b("แมว", "cat", "maeo", ["mid"]),
      ]),
      r("กระเป๋าใบนี้ไม่มีเงิน", "grà-bpǎo bai-níi mâi mii ngoen", "There isn't any money in this bag.", [
        b("กระเป๋าใบนี้", "this bag", "grà-bpǎo bai-níi", ["low", "rising", "mid", "high"]),
        b("ไม่มี", "there isn't", "mâi mii", ["falling", "mid"]),
        b("เงิน", "money", "ngoen", ["mid"]),
      ]),
      r("วันนี้ครูไม่มีเวลา", "wan-níi khruu mâi mii wee-laa", "The teacher doesn't have time today.", [
        b("วันนี้", "today", "wan-níi", ["mid", "high"]),
        b("ครู", "teacher", "khruu", ["mid"]),
        b("ไม่มี", "doesn't have", "mâi mii", ["falling", "mid"]),
        b("เวลา", "time", "wee-laa", ["mid", "mid"]),
      ]),
      r("ที่นี่ไม่มีคน", "thîi nîi mâi mii khon", "There isn't anyone here.", [
        b("ที่", "at", "thîi", ["falling"]),
        b("นี่", "here", "nîi", ["falling"]),
        b("ไม่มี", "there isn't", "mâi mii", ["falling", "mid"]),
        b("คน", "people / anyone", "khon", ["mid"]),
      ]),
      r("ตอนนี้ฉันไม่มีนัด", "dtawn-níi chǎn mâi mii nát", "I don't have any plans right now.", [
        b("ตอนนี้", "right now", "dtawn-níi", ["mid", "high"]),
        b("ฉัน", "I", "chǎn", ["rising"]),
        b("ไม่มี", "don't have", "mâi mii", ["falling", "mid"]),
        b("นัด", "plans / appointment", "nát", ["high"]),
      ]),
      r("บ้านนี้ไม่มีสวน", "bâan níi mâi mii sǔan", "This house doesn't have a garden.", [
        b("บ้าน", "house", "bâan", ["falling"]),
        b("นี้", "this", "níi", ["high"]),
        b("ไม่มี", "doesn't have", "mâi mii", ["falling", "mid"]),
        b("สวน", "garden", "sǔan", ["rising"]),
      ]),
      r("ที่ตลาดไม่มีมะม่วง", "thîi dtà-làat mâi mii má-mûang", "There are no mangoes at the market.", [
        b("ที่", "at", "thîi", ["falling"]),
        b("ตลาด", "market", "dtà-làat", ["low", "low"]),
        b("ไม่มี", "there aren't", "mâi mii", ["falling", "mid"]),
        b("มะม่วง", "mangoes", "má-mûang", ["high", "falling"]),
      ]),
      r("เราไม่มีน้ำ", "rao mâi mii náam", "We don't have water.", [
        b("เรา", "we", "rao", ["mid"]),
        b("ไม่มี", "don't have", "mâi mii", ["falling", "mid"]),
        b("น้ำ", "water", "náam", ["high"]),
      ]),
      r("ฉันไม่มีหนังสือเล่มนั้น", "chǎn mâi mii nǎng-sǔue lêm-nán", "I don't have that book.", [
        b("ฉัน", "I", "chǎn", ["rising"]),
        b("ไม่มี", "don't have", "mâi mii", ["falling", "mid"]),
        b("หนังสือ", "book", "nǎng-sǔue", ["rising", "rising"]),
        b("เล่มนั้น", "that one", "lêm-nán", ["falling", "high"]),
      ]),
      r("เขาไม่มีงานวันนี้", "khǎo mâi mii ngaan wan-níi", "He doesn't have work today.", [
        b("เขา", "he", "khǎo", ["rising"]),
        b("ไม่มี", "doesn't have", "mâi mii", ["falling", "mid"]),
        b("งาน", "work", "ngaan", ["mid"]),
        b("วันนี้", "today", "wan-níi", ["mid", "high"]),
      ]),
      r("ห้องน้ำนี้ไม่มีสบู่", "hâwng-náam níi mâi mii sà-bùu", "There isn't any soap in this bathroom.", [
        b("ห้องน้ำ", "bathroom", "hâwng-náam", ["falling", "high"]),
        b("นี้", "this", "níi", ["high"]),
        b("ไม่มี", "there isn't", "mâi mii", ["falling", "mid"]),
        b("สบู่", "soap", "sà-bùu", ["low", "low"]),
      ]),
      r("ตู้เย็นไม่มีผลไม้", "dtûu-yen mâi mii phǒn-lá-mái", "There isn't any fruit in the fridge.", [
        b("ตู้เย็น", "fridge", "dtûu-yen", ["falling", "mid"]),
        b("ไม่มี", "there isn't", "mâi mii", ["falling", "mid"]),
        b("ผลไม้", "fruit", "phǒn-lá-mái", ["rising", "high", "high"]),
      ]),
      r("เด็กไม่มีการบ้านวันนี้", "dèk mâi mii gaan-bâan wan-níi", "The child doesn't have homework today.", [
        b("เด็ก", "child", "dèk", ["low"]),
        b("ไม่มี", "doesn't have", "mâi mii", ["falling", "mid"]),
        b("การบ้าน", "homework", "gaan-bâan", ["mid", "falling"]),
        b("วันนี้", "today", "wan-níi", ["mid", "high"]),
      ]),
      r("พ่อไม่มีบัตร", "phâw mâi mii bàt", "Dad doesn't have a card.", [
        b("พ่อ", "Dad", "phâw", ["falling"]),
        b("ไม่มี", "doesn't have", "mâi mii", ["falling", "mid"]),
        b("บัตร", "card", "bàt", ["low"]),
      ]),
      r("วันนี้โรงเรียนไม่มีเรียน", "wan-níi roong-rian mâi mii rian", "There are no classes at school today.", [
        b("วันนี้", "today", "wan-níi", ["mid", "high"]),
        b("โรงเรียน", "school", "roong-rian", ["mid", "mid"]),
        b("ไม่มี", "there aren't", "mâi mii", ["falling", "mid"]),
        b("เรียน", "classes / study", "rian", ["mid"]),
      ]),
    ],
  },
  "location-yuu": {
    lessonTitle: "Location with อยู่",
    rows: [
      r("ฉันอยู่ที่บ้าน", "chǎn yùu thîi bâan", "I'm at home.", [
        b("ฉัน", "I", "chǎn", ["rising"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("ที่", "at", "thîi", ["falling"]),
        b("บ้าน", "home", "bâan", ["falling"]),
      ]),
      r("พ่ออยู่ที่ร้าน", "phâw yùu thîi ráan", "Dad is at the shop.", [
        b("พ่อ", "Dad", "phâw", ["falling"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("ที่", "at", "thîi", ["falling"]),
        b("ร้าน", "shop", "ráan", ["high"]),
      ]),
      r("แม่อยู่ในครัว", "mâe yùu nai khrua", "Mom is in the kitchen.", [
        b("แม่", "Mom", "mâe", ["falling"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("ใน", "in", "nai", ["mid"]),
        b("ครัว", "kitchen", "khrua", ["mid"]),
      ]),
      r("เขาอยู่ที่โรงเรียน", "khǎo yùu thîi roong-rian", "He's at school.", [
        b("เขา", "he", "khǎo", ["rising"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("ที่", "at", "thîi", ["falling"]),
        b("โรงเรียน", "school", "roong-rian", ["mid", "mid"]),
      ]),
      r("เธออยู่ที่ทำงาน", "thoe yùu thîi tham-ngaan", "She's at work.", [
        b("เธอ", "she", "thoe", ["mid"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("ที่", "at", "thîi", ["falling"]),
        b("ทำงาน", "work", "tham-ngaan", ["mid", "mid"]),
      ]),
      r("น้องอยู่ในห้อง", "nóng yùu nai hâwng", "My younger sibling is in the room.", [
        b("น้อง", "my younger sibling", "nóng", ["high"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("ใน", "in", "nai", ["mid"]),
        b("ห้อง", "room", "hâwng", ["falling"]),
      ]),
      r("แมวอยู่บนโต๊ะ", "maeo yùu bon dtó", "The cat is on the table.", [
        b("แมว", "cat", "maeo", ["mid"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("บน", "on", "bon", ["mid"]),
        b("โต๊ะ", "table", "dtó", ["high"]),
      ]),
      r("หมาอยู่หน้าบ้าน", "mǎa yùu nâa bâan", "The dog is in front of the house.", [
        b("หมา", "dog", "mǎa", ["rising"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("หน้า", "in front of", "nâa", ["falling"]),
        b("บ้าน", "house", "bâan", ["falling"]),
      ]),
      r("หนังสืออยู่ในกระเป๋า", "nǎng-sǔue yùu nai grà-bpǎo", "The book is in the bag.", [
        b("หนังสือ", "book", "nǎng-sǔue", ["rising", "rising"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("ใน", "in", "nai", ["mid"]),
        b("กระเป๋า", "bag", "grà-bpǎo", ["low", "rising"]),
      ]),
      r("โทรศัพท์อยู่ในกระเป๋า", "thoo-rá-sàp yùu nai grà-bpǎo", "The phone is in the bag.", [
        b("โทรศัพท์", "phone", "thoo-rá-sàp", ["mid", "high", "low"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("ใน", "in", "nai", ["mid"]),
        b("กระเป๋า", "bag", "grà-bpǎo", ["low", "rising"]),
      ]),
      r("ครูอยู่ในห้องเรียน", "khruu yùu nai hâwng-rian", "The teacher is in the classroom.", [
        b("ครู", "teacher", "khruu", ["mid"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("ใน", "in", "nai", ["mid"]),
        b("ห้องเรียน", "classroom", "hâwng-rian", ["falling", "mid"]),
      ]),
      r("เพื่อนอยู่ที่ตลาด", "phûean yùu thîi dtà-làat", "My friend is at the market.", [
        b("เพื่อน", "my friend", "phûean", ["falling"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("ที่", "at", "thîi", ["falling"]),
        b("ตลาด", "market", "dtà-làat", ["low", "low"]),
      ]),
      r("เด็กอยู่ในสวน", "dèk yùu nai sǔan", "The child is in the garden.", [
        b("เด็ก", "child", "dèk", ["low"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("ใน", "in", "nai", ["mid"]),
        b("สวน", "garden", "sǔan", ["rising"]),
      ]),
      r("รองเท้าอยู่ใต้โต๊ะ", "rawng-tháao yùu dtâi dtó", "The shoes are under the table.", [
        b("รองเท้า", "shoes", "rawng-tháao", ["mid", "high"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("ใต้", "under", "dtâi", ["falling"]),
        b("โต๊ะ", "table", "dtó", ["high"]),
      ]),
      r("น้ำอยู่ในตู้เย็น", "náam yùu nai dtûu-yen", "The water is in the fridge.", [
        b("น้ำ", "water", "náam", ["high"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("ใน", "in", "nai", ["mid"]),
        b("ตู้เย็น", "fridge", "dtûu-yen", ["falling", "mid"]),
      ]),
      r("จานอยู่บนโต๊ะ", "jaan yùu bon dtó", "The plate is on the table.", [
        b("จาน", "plate", "jaan", ["mid"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("บน", "on", "bon", ["mid"]),
        b("โต๊ะ", "table", "dtó", ["high"]),
      ]),
      r("รถอยู่หน้าร้าน", "rót yùu nâa ráan", "The car is in front of the shop.", [
        b("รถ", "car", "rót", ["high"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("หน้า", "in front of", "nâa", ["falling"]),
        b("ร้าน", "shop", "ráan", ["high"]),
      ]),
      r("ฉันอยู่ในรถ", "chǎn yùu nai rót", "I'm in the car.", [
        b("ฉัน", "I", "chǎn", ["rising"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("ใน", "in", "nai", ["mid"]),
        b("รถ", "car", "rót", ["high"]),
      ]),
      r("เสื้ออยู่ในตู้", "sʉ̂a yùu nai dtûu", "The shirt is in the cabinet.", [
        b("เสื้อ", "shirt", "sʉ̂a", ["falling"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("ใน", "in", "nai", ["mid"]),
        b("ตู้", "cabinet", "dtûu", ["falling"]),
      ]),
      r("พี่อยู่ในห้องน้ำ", "phîi yùu nai hâwng-náam", "My older sibling is in the bathroom.", [
        b("พี่", "my older sibling", "phîi", ["falling"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("ใน", "in", "nai", ["mid"]),
        b("ห้องน้ำ", "bathroom", "hâwng-náam", ["falling", "high"]),
      ]),
      r("กระเป๋าอยู่บนเก้าอี้", "grà-bpǎo yùu bon gâo-îi", "The bag is on the chair.", [
        b("กระเป๋า", "bag", "grà-bpǎo", ["low", "rising"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("บน", "on", "bon", ["mid"]),
        b("เก้าอี้", "chair", "gâo-îi", ["falling", "falling"]),
      ]),
      r("แม่อยู่ที่บ้านตอนนี้", "mâe yùu thîi bâan dtawn-níi", "Mom is at home right now.", [
        b("แม่", "Mom", "mâe", ["falling"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("ที่", "at", "thîi", ["falling"]),
        b("บ้าน", "home", "bâan", ["falling"]),
        b("ตอนนี้", "right now", "dtawn-níi", ["mid", "high"]),
      ]),
      r("เพื่อนอยู่ที่บ้าน", "phûean yùu thîi bâan", "My friend is at home.", [
        b("เพื่อน", "my friend", "phûean", ["falling"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("ที่", "at", "thîi", ["falling"]),
        b("บ้าน", "home", "bâan", ["falling"]),
      ]),
      r("ครูอยู่หน้าห้อง", "khruu yùu nâa hâwng", "The teacher is at the front of the room.", [
        b("ครู", "teacher", "khruu", ["mid"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("หน้า", "front of", "nâa", ["falling"]),
        b("ห้อง", "room", "hâwng", ["falling"]),
      ]),
      r("แมวอยู่ใต้โต๊ะ", "maeo yùu dtâi dtó", "The cat is under the table.", [
        b("แมว", "cat", "maeo", ["mid"]),
        b("อยู่", "be / stay", "yùu", ["low"]),
        b("ใต้", "under", "dtâi", ["falling"]),
        b("โต๊ะ", "table", "dtó", ["high"]),
      ]),
    ],
  }
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeLessonFiles(grammarId, lesson) {
  const finalLesson = {
    lessonId: grammarId,
    stage: STAGE,
    lessonTitle: repair(lesson.lessonTitle),
    rows: lesson.rows.map((row) => ({
      thai: row.thai,
      english: row.english,
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

  for (const [index, row] of lesson.rows.entries()) {
    const toneAnalysis = makeToneAnalysis();
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
        row.thai,
        row.romanization,
        row.english,
        JSON.stringify(row.breakdown),
        row.difficulty,
        baseSortOrder + index,
        JSON.stringify(toneAnalysis),
        NOTE,
        waveId,
        JSON.stringify(["new_gen"]),
      ],
    );
  }

  return waveId;
}

async function main() {
  ensureDir(GENERATED_DIR);
  ensureDir(SOURCE_DIR);

  for (const [grammarId, lesson] of Object.entries(LESSONS)) {
    writeLessonFiles(grammarId, lesson);
  }

  const client = await pool.connect();
  try {
    for (const [grammarId, lesson] of Object.entries(LESSONS)) {
      await client.query("BEGIN");
      try {
        const waveId = await stageLesson(client, grammarId, lesson);
        await client.query("COMMIT");
        console.log(`Staged ${grammarId} as ${waveId} (${lesson.rows.length} rows)`);
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
