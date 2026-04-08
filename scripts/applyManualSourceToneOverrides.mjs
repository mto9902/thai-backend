import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
const SOURCE_DIR = path.join(SERVER_ROOT, "admin-data", "manual-source-lessons");

const DEFAULT_LESSONS = ["just-in-time-pho-di"];

const MANUAL_TONE_OVERRIDES = {
  "just-in-time-pho-di": {
    พอดี: { tones: ["mid", "mid"], displayThaiSegments: ["พอ", "ดี"] },
    เขา: { tones: ["rising"] },
    เรา: { tones: ["mid"] },
    เวลา: { tones: ["mid", "mid"], displayThaiSegments: ["เว", "ลา"] },
    มาถึง: { tones: ["mid", "rising"], displayThaiSegments: ["มา", "ถึง"] },
    ทำงาน: { tones: ["mid", "mid"], displayThaiSegments: ["ทำ", "งาน"] },
    ร้านกาแฟ: { tones: ["high", "mid", "mid"], displayThaiSegments: ["ร้าน", "กา", "แฟ"] },
    วันนี้: { tones: ["mid", "high"], displayThaiSegments: ["วัน", "นี้"] },
    ได้ยิน: { tones: ["falling", "mid"], displayThaiSegments: ["ได้", "ยิน"] },
    ตัวนี้: { tones: ["mid", "high"], displayThaiSegments: ["ตัว", "นี้"] },
    สำหรับ: { tones: ["rising", "low"], displayThaiSegments: ["สำ", "หรับ"] },
    อาหารเย็น: { tones: ["mid", "rising", "mid"], displayThaiSegments: ["อา", "หาร", "เย็น"] },
    ตอนนี้: { tones: ["mid", "high"], displayThaiSegments: ["ตอน", "นี้"] },
    รองเท้า: { tones: ["mid", "high"], displayThaiSegments: ["รอง", "เท้า"] },
    สนามบิน: { tones: ["rising", "mid", "mid"], displayThaiSegments: ["สะ", "นาม", "บิน"] },
    งานใหม่: { tones: ["mid", "falling"], displayThaiSegments: ["งาน", "ใหม่"] },
    สัปดาห์นี้: { tones: ["low", "mid", "high"], displayThaiSegments: ["สัป", "ดาห์", "นี้"] },
    ออกไป: { tones: ["low", "mid"], displayThaiSegments: ["ออก", "ไป"] },
    ข่าวดี: { tones: ["low", "mid"], displayThaiSegments: ["ข่าว", "ดี"] },
    งานเลี้ยง: { tones: ["mid", "falling"], displayThaiSegments: ["งาน", "เลี้ยง"] },
    ตอนเช้า: { tones: ["mid", "high"], displayThaiSegments: ["ตอน", "เช้า"] },
    ถูกใจ: { tones: ["low", "mid"], displayThaiSegments: ["ถูก", "ใจ"] },
    ที่ทำงาน: { tones: ["falling", "mid", "mid"], displayThaiSegments: ["ที่", "ทำ", "งาน"] },
    ประชุม: { tones: ["low", "mid"], displayThaiSegments: ["ประ", "ชุม"] },
    จำนวน: { tones: ["mid", "mid"], displayThaiSegments: ["จำ", "นวน"] },
    คน: { tones: ["mid"] },
    เตรียมตัว: { tones: ["mid", "mid"], displayThaiSegments: ["เตรียม", "ตัว"] },
    เดินทาง: { tones: ["mid", "mid"], displayThaiSegments: ["เดิน", "ทาง"] },
    การยอมรับ: { tones: ["mid", "mid", "high"], displayThaiSegments: ["การ", "ยอม", "รับ"] },
    หลังจาก: { tones: ["rising", "low"], displayThaiSegments: ["หลัง", "จาก"] },
    หนังสือ: { tones: ["rising", "rising"], displayThaiSegments: ["หนัง", "สือ"] },
    ตามหา: { tones: ["mid", "rising"], displayThaiSegments: ["ตาม", "หา"] },
    นาฬิกา: { tones: ["mid", "high", "mid"], displayThaiSegments: ["นา", "ฬิ", "กา"] },
    ใช้งาน: { tones: ["high", "mid"], displayThaiSegments: ["ใช้", "งาน"] },
    เพลงนี้: { tones: ["mid", "high"], displayThaiSegments: ["เพลง", "นี้"] },
    ตอนที่: { tones: ["mid", "falling"], displayThaiSegments: ["ตอน", "ที่"] },
    เงิน: { tones: ["mid"] },
    คันใหม่: { tones: ["mid", "falling"], displayThaiSegments: ["คัน", "ใหม่"] },
    สถานีรถไฟ: { tones: ["low", "mid", "mid", "high", "mid"], displayThaiSegments: ["สะ", "ถา", "นี", "รถ", "ไฟ"] },
    ฝน: { tones: ["rising"] },
  },
  "to-be-khue-vs-pen": {
    เขา: { tones: ["rising"] },
    ของ: { tones: ["rising"] },
    ของฉัน: { tones: ["rising", "rising"], displayThaiSegments: ["ของ", "ฉัน"] },
    คนที่: { tones: ["mid", "falling"], displayThaiSegments: ["คน", "ที่"] },
    น้องชาย: { tones: ["high", "mid"], displayThaiSegments: ["น้อง", "ชาย"] },
    หมอ: { tones: ["rising"] },
    นักเรียน: { tones: ["high", "mid"], displayThaiSegments: ["นัก", "เรียน"] },
    ห้องนี้: { tones: ["falling", "high"], displayThaiSegments: ["ห้อง", "นี้"] },
    ที่ที่: { tones: ["falling", "falling"], displayThaiSegments: ["ที่", "ที่"] },
    ทำงาน: { tones: ["mid", "mid"], displayThaiSegments: ["ทำ", "งาน"] },
    อาหารหลัก: { tones: ["mid", "rising", "low"], displayThaiSegments: ["อา", "หาร", "หลัก"] },
    วิศวกร: { tones: ["high", "low", "mid", "mid"] },
    นักเขียน: { tones: ["high", "rising"], displayThaiSegments: ["นัก", "เขียน"] },
    ชื่อเสียง: { tones: ["falling", "rising"], displayThaiSegments: ["ชื่อ", "เสียง"] },
    ที่ดีที่สุด: {
      tones: ["falling", "mid", "falling", "low"],
      displayThaiSegments: ["ที่", "ดี", "ที่", "สุด"],
    },
    งานอดิเรก: { tones: ["mid", "low", "mid", "mid"] },
    การทำอาหาร: {
      tones: ["mid", "mid", "mid", "rising"],
      displayThaiSegments: ["การ", "ทำ", "อา", "หาร"],
    },
    ที่ได้รับรางวัล: {
      tones: ["falling", "falling", "high", "mid", "mid"],
      displayThaiSegments: ["ที่", "ได้", "รับ", "ราง", "วัล"],
    },
  },
  "reciprocal-kan": {
    พวกเขา: { tones: ["falling", "rising"], displayThaiSegments: ["พวก", "เขา"] },
    พวกเรา: { tones: ["falling", "mid"], displayThaiSegments: ["พวก", "เรา"] },
    ด้วยกัน: { tones: ["falling", "mid"], displayThaiSegments: ["ด้วย", "กัน"] },
    เรา: { tones: ["mid"] },
    ทุกคน: { tones: ["high", "mid"], displayThaiSegments: ["ทุก", "คน"] },
    ช่วยกัน: { tones: ["falling", "mid"], displayThaiSegments: ["ช่วย", "กัน"] },
    ทะเล: { tones: ["mid", "mid"], displayThaiSegments: ["ทะ", "เล"] },
    ทำงานบ้าน: { tones: ["mid", "mid", "falling"], displayThaiSegments: ["ทำ", "งาน", "บ้าน"] },
    ร้านกาแฟ: { tones: ["high", "mid", "mid"], displayThaiSegments: ["ร้าน", "กา", "แฟ"] },
    กำลัง: { tones: ["mid", "mid"], displayThaiSegments: ["กำ", "ลัง"] },
    ทำอาหารเย็น: {
      tones: ["mid", "mid", "rising", "mid"],
      displayThaiSegments: ["ทำ", "อา", "หาร", "เย็น"],
    },
    วางแผน: { tones: ["mid", "rising"], displayThaiSegments: ["วาง", "แผน"] },
    ไปเที่ยว: { tones: ["mid", "falling"], displayThaiSegments: ["ไป", "เที่ยว"] },
    คู่สามีภรรยา: {
      tones: ["falling", "mid", "mid", "mid"],
      displayThaiSegments: ["คู่", "สา", "มี", "ภรรยา"],
    },
    ดูหนัง: { tones: ["mid", "rising"], displayThaiSegments: ["ดู", "หนัง"] },
    ทุกคืนวันศุกร์: {
      tones: ["high", "falling", "mid", "low"],
      displayThaiSegments: ["ทุก", "คืน", "วัน", "ศุกร์"],
    },
    ออกกำลังกาย: {
      tones: ["low", "mid", "mid", "high"],
      displayThaiSegments: ["ออก", "กำ", "ลัง", "กาย"],
    },
    ฟังเพลง: { tones: ["mid", "mid"], displayThaiSegments: ["ฟัง", "เพลง"] },
    ในครอบครัว: {
      tones: ["mid", "low", "mid"],
      displayThaiSegments: ["ใน", "ครอบ", "ครัว"],
    },
    ทำรายงาน: { tones: ["mid", "high", "mid"], displayThaiSegments: ["ทำ", "ราย", "งาน"] },
    ทำสวน: { tones: ["mid", "rising"], displayThaiSegments: ["ทำ", "สวน"] },
    ทำอาหารเช้า: {
      tones: ["mid", "mid", "rising", "high"],
      displayThaiSegments: ["ทำ", "อา", "หาร", "เช้า"],
    },
    พรุ่งนี้: { tones: ["high", "high"], displayThaiSegments: ["พรุ่ง", "นี้"] },
    ทำความสะอาด: {
      tones: ["mid", "falling", "low", "low"],
      displayThaiSegments: ["ทำ", "ความ", "สะ", "อาด"],
    },
    เรียน: { tones: ["mid"] },
    ภาษาไทย: { tones: ["mid", "rising", "mid"], displayThaiSegments: ["ภา", "ษา", "ไทย"] },
    เขา: { tones: ["rising"] },
    จัดงานเลี้ยง: { tones: ["low", "mid", "falling"], displayThaiSegments: ["จัด", "งาน", "เลี้ยง"] },
    ทำอาหาร: { tones: ["mid", "mid", "rising"], displayThaiSegments: ["ทำ", "อา", "หาร"] },
    การบรรยาย: {
      tones: ["mid", "mid", "low", "falling"],
      displayThaiSegments: ["การ", "บรร", "ยา", "ย"],
    },
    ทั้งกลุ่ม: { tones: ["falling", "low"], displayThaiSegments: ["ทั้ง", "กลุ่ม"] },
    เดินป่า: { tones: ["mid", "low"], displayThaiSegments: ["เดิน", "ป่า"] },
    ออกไป: { tones: ["low", "mid"], displayThaiSegments: ["ออก", "ไป"] },
    แก้ไข: { tones: ["high", "rising"], displayThaiSegments: ["แก้", "ไข"] },
    ปัญหา: { tones: ["mid", "rising"], displayThaiSegments: ["ปัญ", "หา"] },
    แบ่งกัน: { tones: ["low", "mid"], displayThaiSegments: ["แบ่ง", "กัน"] },
    ทำการบ้าน: { tones: ["mid", "mid", "falling"], displayThaiSegments: ["ทำ", "การ", "บ้าน"] },
    เตรียม: { tones: ["mid"] },
    งานสัมมนา: {
      tones: ["mid", "low", "mid", "mid"],
      displayThaiSegments: ["งาน", "สัม", "มะ", "นา"],
    },
    เรียนรู้: { tones: ["mid", "high"], displayThaiSegments: ["เรียน", "รู้"] },
    โครงการ: { tones: ["mid", "mid", "mid"], displayThaiSegments: ["โครง", "กา", "ร"] },
    อาสาสมัคร: {
      tones: ["mid", "rising", "low", "high"],
      displayThaiSegments: ["อา", "สา", "สะ", "หมัก"],
    },
  },
  "beneficial-hai": {
    เขา: { tones: ["rising"] },
    คอมพิวเตอร์: { tones: ["mid", "mid", "high", "mid"], displayThaiSegments: ["คอม", "พิ", "ว", "เตอร์"] },
    ผม: { tones: ["rising"] },
    อาหาร: { tones: ["mid", "rising"], displayThaiSegments: ["อา", "หาร"] },
    ทุกวัน: { tones: ["high", "mid"], displayThaiSegments: ["ทุก", "วัน"] },
    พี่ชาย: { tones: ["falling", "mid"], displayThaiSegments: ["พี่", "ชาย"] },
    การบ้าน: { tones: ["mid", "falling"], displayThaiSegments: ["การ", "บ้าน"] },
    ทุกคน: { tones: ["high", "mid"], displayThaiSegments: ["ทุก", "คน"] },
    ของขวัญ: { tones: ["rising", "rising"], displayThaiSegments: ["ของ", "ขวัญ"] },
    อีเมล: { tones: ["mid", "mid", "mid"], displayThaiSegments: ["อี", "เม", "ล"] },
    เจ้านาย: { tones: ["falling", "mid"], displayThaiSegments: ["เจ้า", "นาย"] },
    หนังสือ: { tones: ["rising", "rising"], displayThaiSegments: ["หนัง", "สือ"] },
    จักรยาน: { tones: ["low", "mid", "mid"], displayThaiSegments: ["จัก", "ระ", "ยาน"] },
    เตรียม: { tones: ["mid"] },
    อาหารเช้า: { tones: ["mid", "rising", "high"], displayThaiSegments: ["อา", "หาร", "เช้า"] },
    จดหมาย: { tones: ["low", "rising"], displayThaiSegments: ["จด", "หมาย"] },
    จัดเตรียม: { tones: ["low", "mid"], displayThaiSegments: ["จัด", "เตรียม"] },
    อธิบาย: { tones: ["low", "high", "mid"], displayThaiSegments: ["อ", "ธิ", "บาย"] },
    บทเรียน: { tones: ["low", "mid"], displayThaiSegments: ["บท", "เรียน"] },
    พี่สาว: { tones: ["falling", "rising"], displayThaiSegments: ["พี่", "สาว"] },
    ของหวาน: { tones: ["rising", "rising"], displayThaiSegments: ["ของ", "หวาน"] },
    วันเกิด: { tones: ["mid", "low"], displayThaiSegments: ["วัน", "เกิด"] },
    วันหยุด: { tones: ["mid", "low"], displayThaiSegments: ["วัน", "หยุด"] },
    น้องสาว: { tones: ["high", "rising"], displayThaiSegments: ["น้อง", "สาว"] },
    ตอนเช้า: { tones: ["mid", "high"], displayThaiSegments: ["ตอน", "เช้า"] },
    หัวหน้า: { tones: ["rising", "falling"], displayThaiSegments: ["หัว", "หน้า"] },
    เรา: { tones: ["mid"] },
    ไปเที่ยว: { tones: ["mid", "falling"], displayThaiSegments: ["ไป", "เที่ยว"] },
  },
  "about-concerning-kiaw-kap": {
    เรา: { tones: ["mid"] },
    คำถาม: { tones: ["mid", "rising"], displayThaiSegments: ["คำ", "ถาม"] },
    บทเรียน: { tones: ["low", "mid"], displayThaiSegments: ["บท", "เรียน"] },
    บทเรียนนี้: { tones: ["low", "mid", "high"], displayThaiSegments: ["บท", "เรียน", "นี้"] },
    ปีหน้า: { tones: ["mid", "falling"], displayThaiSegments: ["ปี", "หน้า"] },
    ชีวิต: { tones: ["mid", "high"], displayThaiSegments: ["ชี", "วิต"] },
    เมือง: { tones: ["mid"] },
    ราคา: { tones: ["mid", "mid"], displayThaiSegments: ["รา", "คา"] },
    น้ำมัน: { tones: ["high", "mid"], displayThaiSegments: ["น้ำ", "มัน"] },
    อีเมล: { tones: ["mid", "mid"], displayThaiSegments: ["อี", "เมล"] },
    ตารางประชุม: { tones: ["mid", "mid", "low", "mid"], displayThaiSegments: ["ตา", "ราง", "ประ", "ชุม"] },
    บทความ: { tones: ["low", "mid"], displayThaiSegments: ["บท", "ความ"] },
    รายการ: { tones: ["mid", "mid"], displayThaiSegments: ["ราย", "การ"] },
    รายการนี้: { tones: ["mid", "mid", "high"], displayThaiSegments: ["ราย", "การ", "นี้"] },
    ข้อมูล: { tones: ["falling", "mid"], displayThaiSegments: ["ข้อ", "มูล"] },
    โรงเรียนนี้: { tones: ["mid", "mid", "high"], displayThaiSegments: ["โรง", "เรียน", "นี้"] },
    ทะเลไทย: { tones: ["high", "mid", "mid"], displayThaiSegments: ["ทะ", "เล", "ไทย"] },
    รีวิว: { tones: ["mid", "mid"], displayThaiSegments: ["รี", "วิว"] },
    โรงแรมนี้: { tones: ["mid", "mid", "high"], displayThaiSegments: ["โรง", "แรม", "นี้"] },
    งานชิ้นนี้: { tones: ["mid", "high", "high"], displayThaiSegments: ["งาน", "ชิ้น", "นี้"] },
    อาหารไทย: { tones: ["mid", "rising", "mid"], displayThaiSegments: ["อา", "หาร", "ไทย"] },
    ตอนนี้: { tones: ["mid", "high"], displayThaiSegments: ["ตอน", "นี้"] },
    งบประมาณ: { tones: ["low", "low", "mid"], displayThaiSegments: ["งบ", "ประ", "มาณ"] },
    งานใหม่: { tones: ["mid", "falling"], displayThaiSegments: ["งาน", "ใหม่"] },
    ประชุม: { tones: ["low", "mid"], displayThaiSegments: ["ประ", "ชุม"] },
    ตอนบ่าย: { tones: ["mid", "low"], displayThaiSegments: ["ตอน", "บ่าย"] },
    วิธีใช้: { tones: ["high", "mid", "high"], displayThaiSegments: ["วิ", "ธี", "ใช้"] },
    อาหารเชียงใหม่: { tones: ["mid", "rising", "mid", "falling"], displayThaiSegments: ["อา", "หาร", "เชียง", "ใหม่"] },
    กาแฟ: { tones: ["mid", "mid"], displayThaiSegments: ["กา", "แฟ"] },
    อาจารย์: { tones: ["mid", "mid"], displayThaiSegments: ["อา", "จารย์"] },
    กำลัง: { tones: ["mid", "mid"], displayThaiSegments: ["กำ", "ลัง"] },
  },
  "also-kor": {
    เหมือนกัน: { tones: ["rising", "mid"], displayThaiSegments: ["เหมือน", "กัน"] },
    เรา: { tones: ["mid"] },
    วันนี้: { tones: ["mid", "high"], displayThaiSegments: ["วัน", "นี้"] },
    อากาศ: { tones: ["mid", "low"], displayThaiSegments: ["อา", "กาศ"] },
    เดินเล่น: { tones: ["mid", "falling"], displayThaiSegments: ["เดิน", "เล่น"] },
    ออกไป: { tones: ["low", "mid"], displayThaiSegments: ["ออก", "ไป"] },
    เข้าใจ: { tones: ["falling", "mid"], displayThaiSegments: ["เข้า", "ใจ"] },
    ลอง: { tones: ["mid"] },
    อันนี้: { tones: ["mid", "high"], displayThaiSegments: ["อัน", "นี้"] },
    ไม่มี: { tones: ["falling", "mid"], displayThaiSegments: ["ไม่", "มี"] },
    เรียน: { tones: ["mid"] },
    ทำงาน: { tones: ["mid", "mid"], displayThaiSegments: ["ทำ", "งาน"] },
    โทรมา: { tones: ["mid", "mid"], displayThaiSegments: ["โทร", "มา"] },
  },
  "prefer-di-kwa": {
    ดีกว่า: { tones: ["mid", "low"], displayThaiSegments: ["ดี", "กว่า"] },
    รถไฟ: { tones: ["high", "mid"], displayThaiSegments: ["รถ", "ไฟ"] },
    โทรไป: { tones: ["mid", "mid"], displayThaiSegments: ["โทร", "ไป"] },
    จอง: { tones: ["mid"] },
    วันนี้: { tones: ["mid", "high"], displayThaiSegments: ["วัน", "นี้"] },
    ทางนี้: { tones: ["mid", "high"], displayThaiSegments: ["ทาง", "นี้"] },
    อันนี้: { tones: ["mid", "high"], displayThaiSegments: ["อัน", "นี้"] },
    ข้างใน: { tones: ["falling", "mid"], displayThaiSegments: ["ข้าง", "ใน"] },
    เอา: { tones: ["mid"] },
    คุยกัน: { tones: ["mid", "mid"], displayThaiSegments: ["คุย", "กัน"] },
    ตรงๆ: { tones: ["mid", "mid"], displayThaiSegments: ["ตรง", "ตรง"] },
    ตอนนี้: { tones: ["mid", "high"], displayThaiSegments: ["ตอน", "นี้"] },
    แบบเดิม: { tones: ["low", "mid"], displayThaiSegments: ["แบบ", "เดิม"] },
    รอ: { tones: ["mid"] },
    ตอนเช้า: { tones: ["mid", "high"], displayThaiSegments: ["ตอน", "เช้า"] },
    ตอนบ่าย: { tones: ["mid", "low"], displayThaiSegments: ["ตอน", "บ่าย"] },
  },
  "cause-result-phro-wa": {
    เรา: { tones: ["mid"] },
    ไม่สบาย: { tones: ["falling", "mid", "mid"], displayThaiSegments: ["ไม่", "สะ", "บาย"] },
    วันนี้: { tones: ["mid", "high"], displayThaiSegments: ["วัน", "นี้"] },
    เสื้อกันหนาว: { tones: ["falling", "mid", "rising"], displayThaiSegments: ["เสื้อ", "กัน", "หนาว"] },
    อากาศ: { tones: ["mid", "low"], displayThaiSegments: ["อา", "กาศ"] },
    อาหาร: { tones: ["mid", "rising"], displayThaiSegments: ["อา", "หาร"] },
    เรียน: { tones: ["mid"] },
    ภาษาไทย: { tones: ["mid", "rising", "mid"], displayThaiSegments: ["ภา", "ษา", "ไทย"] },
    คนไทย: { tones: ["mid", "mid"], displayThaiSegments: ["คน", "ไทย"] },
    ประชุม: { tones: ["low", "mid"], displayThaiSegments: ["ประ", "ชุม"] },
    รอ: { tones: ["mid"] },
    ดีใจ: { tones: ["mid", "mid"], displayThaiSegments: ["ดี", "ใจ"] },
    กาแฟ: { tones: ["mid", "mid"], displayThaiSegments: ["กา", "แฟ"] },
    ตอนเย็น: { tones: ["mid", "mid"], displayThaiSegments: ["ตอน", "เย็น"] },
    นอน: { tones: ["mid"] },
    ธนาคาร: { tones: ["mid", "mid", "mid"], displayThaiSegments: ["ทะ", "นา", "คาร"] },
    โอนเงิน: { tones: ["mid", "mid"], displayThaiSegments: ["โอน", "เงิน"] },
    ข้างใน: { tones: ["falling", "mid"], displayThaiSegments: ["ข้าง", "ใน"] },
    หลังคา: { tones: ["rising", "mid"], displayThaiSegments: ["หลัง", "คา"] },
    ลม: { tones: ["mid"] },
    เอา: { tones: ["mid"] },
    ทันที: { tones: ["mid", "mid"], displayThaiSegments: ["ทัน", "ที"] },
    กำลัง: { tones: ["mid", "mid"], displayThaiSegments: ["กำ", "ลัง"] },
    อันเก่า: { tones: ["mid", "low"], displayThaiSegments: ["อัน", "เก่า"] },
    ตรงนั้น: { tones: ["mid", "high"], displayThaiSegments: ["ตรง", "นั้น"] },
    เกินไป: { tones: ["mid", "mid"], displayThaiSegments: ["เกิน", "ไป"] },
    โทรหา: { tones: ["mid", "rising"], displayThaiSegments: ["โทร", "หา"] },
    เดินเล่น: { tones: ["mid", "falling"], displayThaiSegments: ["เดิน", "เล่น"] },
    บน: { tones: ["mid"] },
    รถไฟ: { tones: ["high", "mid"], displayThaiSegments: ["รถ", "ไฟ"] },
  },
  "cause-result-tham-hai": {
    ทำให้: { tones: ["mid", "falling"], displayThaiSegments: ["ทำ", "ให้"] },
    ถนน: { tones: ["low", "rising"], displayThaiSegments: ["ถะ", "นน"] },
    กังวล: { tones: ["mid", "mid"], displayThaiSegments: ["กัง", "วล"] },
    อากาศ: { tones: ["mid", "low"], displayThaiSegments: ["อา", "กาศ"] },
    เรา: { tones: ["mid"] },
    กาแฟ: { tones: ["mid", "mid"], displayThaiSegments: ["กา", "แฟ"] },
    คำตอบ: { tones: ["mid", "low"], displayThaiSegments: ["คำ", "ตอบ"] },
    แปลกใจ: { tones: ["low", "mid"], displayThaiSegments: ["แปลก", "ใจ"] },
    ลม: { tones: ["mid"] },
    ประตู: { tones: ["low", "mid"], displayThaiSegments: ["ประ", "ตู"] },
    การนอนน้อย: { tones: ["mid", "mid", "high"], displayThaiSegments: ["การ", "นอน", "น้อย"] },
    ทั้งคืน: { tones: ["high", "falling"], displayThaiSegments: ["ทั้ง", "คืน"] },
    ข้อความ: { tones: ["falling", "mid"], displayThaiSegments: ["ข้อ", "ความ"] },
    การออกกำลังกาย: { tones: ["mid", "low", "mid", "mid", "mid"], displayThaiSegments: ["การ", "ออก", "กำ", "ลัง", "กาย"] },
    การพูดเร็ว: { tones: ["mid", "falling", "mid"], displayThaiSegments: ["การ", "พูด", "เร็ว"] },
    อาหาร: { tones: ["mid", "rising"], displayThaiSegments: ["อา", "หาร"] },
    น้ำตา: { tones: ["high", "mid"], displayThaiSegments: ["น้ำ", "ตา"] },
    ราคา: { tones: ["mid", "mid"], displayThaiSegments: ["รา", "คา"] },
    คำถาม: { tones: ["mid", "rising"], displayThaiSegments: ["คำ", "ถาม"] },
    นักเรียน: { tones: ["high", "mid"], displayThaiSegments: ["นัก", "เรียน"] },
    การรอนาน: { tones: ["mid", "mid", "mid"], displayThaiSegments: ["การ", "รอ", "นาน"] },
    การซ้อม: { tones: ["mid", "falling"], displayThaiSegments: ["การ", "ซ้อม"] },
    ทุกวัน: { tones: ["high", "mid"], displayThaiSegments: ["ทุก", "วัน"] },
    คำชม: { tones: ["mid", "mid"], displayThaiSegments: ["คำ", "ชม"] },
    กำลังใจ: { tones: ["mid", "mid", "mid"], displayThaiSegments: ["กำ", "ลัง", "ใจ"] },
    การไม่ได้พัก: { tones: ["mid", "falling", "falling", "high"], displayThaiSegments: ["การ", "ไม่", "ได้", "พัก"] },
    อารมณ์: { tones: ["mid", "mid"], displayThaiSegments: ["อา", "รมณ์"] },
  },
  "cause-result-jueng": {
    เรา: { tones: ["mid"] },
    ไม่สบาย: { tones: ["falling", "low", "mid"], displayThaiSegments: ["ไม่", "สะ", "บาย"] },
    ทำงาน: { tones: ["mid", "mid"], displayThaiSegments: ["ทำ", "งาน"] },
    อาหารเช้า: { tones: ["mid", "rising", "high"], displayThaiSegments: ["อา", "หาร", "เช้า"] },
    ประชุม: { tones: ["low", "mid"], displayThaiSegments: ["ประ", "ชุม"] },
    นอน: { tones: ["mid"] },
    คน: { tones: ["mid"] },
    กลับไป: { tones: ["low", "mid"], displayThaiSegments: ["กลับ", "ไป"] },
    เอา: { tones: ["mid"] },
    บน: { tones: ["mid"] },
    วันนี้: { tones: ["mid", "high"], displayThaiSegments: ["วัน", "นี้"] },
    อากาศ: { tones: ["mid", "low"], displayThaiSegments: ["อา", "กาศ"] },
    เดิน: { tones: ["mid"] },
    เข้าใจ: { tones: ["falling", "mid"], displayThaiSegments: ["เข้า", "ใจ"] },
    เวลา: { tones: ["mid", "mid"], displayThaiSegments: ["เว", "ลา"] },
    คุยกัน: { tones: ["mid", "mid"], displayThaiSegments: ["คุย", "กัน"] },
    ทุกวัน: { tones: ["high", "mid"], displayThaiSegments: ["ทุก", "วัน"] },
    คืนนี้: { tones: ["falling", "high"], displayThaiSegments: ["คืน", "นี้"] },
    เงิน: { tones: ["mid"] },
    มานาน: { tones: ["mid", "mid"], displayThaiSegments: ["มา", "นาน"] },
    คอม: { tones: ["mid"] },
    นักเรียน: { tones: ["high", "mid"], displayThaiSegments: ["นัก", "เรียน"] },
    หลงทาง: { tones: ["rising", "mid"], displayThaiSegments: ["หลง", "ทาง"] },
    เกินไป: { tones: ["mid", "mid"], displayThaiSegments: ["เกิน", "ไป"] },
    โทรมา: { tones: ["mid", "mid"], displayThaiSegments: ["โทร", "มา"] },
    ตอนเย็น: { tones: ["mid", "mid"], displayThaiSegments: ["ตอน", "เย็น"] },
    กุญแจ: { tones: ["mid", "mid"], displayThaiSegments: ["กุญ", "แจ"] },
    รอ: { tones: ["mid"] },
    เตรียมตัว: { tones: ["mid", "mid"], displayThaiSegments: ["เตรียม", "ตัว"] },
    คำถาม: { tones: ["mid", "rising"], displayThaiSegments: ["คำ", "ถาม"] },
    รถไฟ: { tones: ["high", "mid"], displayThaiSegments: ["รถ", "ไฟ"] },
    ตลอดทาง: { tones: ["low", "low", "mid"], displayThaiSegments: ["ตะ", "หลอด", "ทาง"] },
    มั่นใจ: { tones: ["falling", "mid"], displayThaiSegments: ["มั่น", "ใจ"] },
    รายละเอียด: { tones: ["mid", "low", "low"], displayThaiSegments: ["ราย", "ละ", "เอียด"] },
    ตัดสินใจ: { tones: ["low", "rising", "mid"], displayThaiSegments: ["ตัด", "สิน", "ใจ"] },
    อีเมล: { tones: ["mid", "mid"], displayThaiSegments: ["อี", "เมล"] },
    ไฟล์: { tones: ["mid"] },
    วางแผน: { tones: ["mid", "rising"], displayThaiSegments: ["วาง", "แผน"] },
  },
};

function parseArgs() {
  const args = process.argv.slice(2);
  const lessonsIndex = args.indexOf("--lessons");
  const lessons =
    lessonsIndex >= 0 && lessonsIndex < args.length - 1
      ? args[lessonsIndex + 1]
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : DEFAULT_LESSONS;

  return { lessons };
}

function repair(value) {
  return String(value ?? "").replace(/^\uFEFF/, "").replace(/\u0000/g, "").trim();
}

function applyOverrides(grammarId) {
  const overrideMap = MANUAL_TONE_OVERRIDES[grammarId];
  if (!overrideMap) {
    throw new Error(`No overrides configured for ${grammarId}`);
  }

  const sourcePath = path.join(SOURCE_DIR, `${grammarId}-source.json`);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source lesson for ${grammarId}`);
  }

  const source = JSON.parse(fs.readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, ""));
  const rows = Array.isArray(source?.rows) ? source.rows : [];

  for (const row of rows) {
    for (const item of row.breakdown ?? []) {
      const key = repair(item?.thai);
      const override = overrideMap[key];
      if (!override) {
        continue;
      }
      item.tones = override.tones;
      if (override.tones.length === 1) {
        item.tone = override.tones[0];
      } else {
        delete item.tone;
      }
      if (override.displayThaiSegments) {
        item.displayThaiSegments = override.displayThaiSegments;
      }
    }
  }

  fs.writeFileSync(
    sourcePath,
    `${JSON.stringify({ grammarId, rows }, null, 2)}\n`,
    "utf8",
  );

  console.log(`Applied manual tone overrides for ${grammarId}`);
}

function main() {
  const { lessons } = parseArgs();
  for (const grammarId of lessons) {
    applyOverrides(grammarId);
  }
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
