import fs from "fs";
import path from "path";

const sourceDir = path.join(
  process.cwd(),
  "admin-data",
  "manual-source-lessons",
);

const lessons = [
  "comparison-kwaa",
  "duration-penwela-manan",
  "female-particles-kha-kha",
  "frequency-adverbs",
  "knowledge-ruu-ruujak",
  "like-chorp",
  "past-laew",
  "permission-dai",
  "quantifiers-thuk-bang-lai",
  "recent-past-phoeng",
  "relative-thi",
  "reported-speech",
  "sequence-conjunctions",
  "skill-pen",
];

const romanizationMap = {
  "เขา": "khǎo",
  "เธอ": "thoe",
  "พ่อ": "phâw",
  "เพื่อน": "phʉ̂an",
  "เพื่อนบ้าน": "phʉ̂an-bâan",
  "แล้ว": "láeo",
  "ข้อความ": "khâaw-kwaam",
  "ซ่อม": "sôm",
  "ตอน": "dtawn",
  "ตอนเช้า": "dtawn-cháao",
  "น้องสาว": "nóng-sǎao",
  "เปิด": "bpə̀ət",
  "พวกเขา": "phûak-khǎo",
  "รถเมล์": "rót-mee",
  "จักรยาน": "jàk-grà-yaan",
  "ฉัน": "chǎn",
  "ชอบ": "chɔ̂ɔp",
  "ดื่ม": "dùum",
  "ตอนเย็น": "dtawn-yen",
  "โต๊ะ": "dtó",
  "ที่": "thîi",
  "โทรมา": "thoo-maa",
  "โทรหา": "thoo-hǎa",
  "ปิด": "bpìt",
  "แม่": "mâe",
  "แมว": "maew",
  "รอ": "raw",
  "ร้านกาแฟ": "ráan gaa-fae",
  "ว่าง": "wâang",
  "ส่ง": "sòng",
  "หน้าต่าง": "nâa-dtàang",
  "หลัง": "lǎng",
  "ห้อง": "hâwng",
  "ไหม": "mǎi",
  "ออก": "òk",
  "อ่าน": "àan",
  "อาบน้ำ": "àap-náam",
  "กระเป๋า": "grà-bpǎo",
  "กิน": "kin",
  "กีตาร์": "gii-dtaa",
  "กุญแจ": "gun-jaae",
  "เก็บ": "gèp",
  "ของ": "khǎawng",
  "ครู": "khruu",
  "เงียบ": "ngîap",
  "จาก": "jàak",
  "จ่าย": "jàai",
  "ชื่อ": "chûue",
  "เช้านี้": "cháo-níi",
  "เชียงใหม่": "chiang-mài",
  "ด้วย": "dûai",
  "เด็กๆ": "dèk-dèk",
  "เดินเล่น": "doen-lên",
  "ได้": "dâi",
  "ได้ไหม": "dâi mǎi",
  "ตก": "dtòk",
  "ต้อง": "dtâwng",
  "ตอบ": "dtàwp",
  "ตั๋ว": "dtǔua",
  "ถ่ายรูป": "thàai-rûup",
  "โทร": "thoo",
  "โทรศัพท์": "thoo-rá-sàp",
  "ธนาคาร": "tha-naa-khaan",
  "นอน": "nawn",
  "นั่ง": "nâng",
  "ในบ้าน": "nai-bâan",
  "ประตู": "bprà-dtuu",
  "ปริ้น": "bprín",
  "เป็น": "bpen",
  "ไป": "bpai",
  "ผลไม้": "phǒn-lá-mái",
  "ผู้ชาย": "phûu-chaai",
  "ฝน": "fǒn",
  "พรุ่งนี้": "phrûng-níi",
  "พวกเรา": "phûak-rao",
  "พี่สาว": "phîi-sǎao",
  "พูด": "phûut",
  "เพลง": "phleeng",
  "เพิ่ง": "phêng",
  "เพื่อนฉัน": "phʉ̂an chǎn",
  "ฟัง": "fang",
  "ยกเลิก": "yók-lôerk",
  "รถไฟ": "rót-fai",
  "รถไฟฟ้า": "rót-fai-fáa",
  "รหัสผ่าน": "rá-hàt-phàan",
  "ร้อน": "ráawn",
  "เร็ว": "reo",
  "เรา": "rao",
  "เริ่ม": "rêrm",
  "เรียน": "rian",
  "เรื่อง": "rûueang",
  "ล้าง": "láang",
  "เล่น": "lên",
  "เล่า": "lâo",
  "เลิกเรียน": "lə̂ək rian",
  "วันอาทิตย์": "wan-aa-thít",
  "วิ่ง": "wîng",
  "สวน": "sǔan",
  "เสมอ": "sà-mǒe",
  "เสื้อผ้า": "sʉ̂a-phâa",
  "หนัง": "nǎng",
  "หมา": "mǎa",
  "หยุด": "yùt",
  "หรือยัง": "rʉ̌ʉ-yang",
  "ใหม่": "mài",
  "อยู่": "yùu",
  "อาหาร": "aa-hǎan",
  "ประมาณ": "prà-maan",
  "หกโมงเย็น": "hòk moong yen",
  "กระเป๋าเดินทาง": "grà-bpǎo-dəən-taang",
  "พนักงาน": "phá-nák-ngaan",
  "ส่งของ": "sòng khǎawng",
  "พนักงานส่งของ": "phá-nák-ngaan sòng khǎawng",
  "เดินทาง": "doen-thaang",
};

function joinBreakdownRomanization(row) {
  return (row.breakdown || [])
    .map((item) => item.romanization || "")
    .filter(Boolean)
    .join(" ");
}

function replaceChunk(row, targetThai, replacement) {
  const breakdown = row.breakdown || [];
  const index = breakdown.findIndex((item) => item.thai === targetThai);
  if (index === -1) {
    return false;
  }
  breakdown.splice(index, 1, ...replacement);
  row.breakdown = breakdown;
  row.romanization = joinBreakdownRomanization(row);
  return true;
}

const touched = [];

for (const lesson of lessons) {
  const sourcePath = path.join(sourceDir, `${lesson}-source.json`);
  const data = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  let fileChanged = false;
  let rowChanges = 0;

  for (const row of data.rows || []) {
    let rowChanged = false;

    if (row.thai === "น้องสาวโทรมาเสมอประมาณหกโมงเย็น") {
      rowChanged =
        replaceChunk(row, "ประมาณหกโมงเย็น", [
          {
            thai: "ประมาณ",
            english: "around",
            tones: ["low", "mid"],
            romanization: "prà-maan",
          },
          {
            thai: "หกโมงเย็น",
            english: "six p.m.",
            tones: ["low", "mid", "mid"],
            romanization: "hòk moong yen",
          },
        ]) || rowChanged;
    }

    if (row.thai === "เรากินอาหารข้างทางบางครั้งหลังเลิกเรียน") {
      rowChanged =
        replaceChunk(row, "หลังเลิกเรียน", [
          {
            thai: "หลัง",
            english: "after",
            tones: ["rising"],
            tone: "rising",
            romanization: "lǎng",
          },
          {
            thai: "เลิกเรียน",
            english: "finish class",
            tones: ["falling", "mid"],
            romanization: "lə̂ək rian",
          },
        ]) || rowChanged;
    }

    for (const item of row.breakdown || []) {
      const nextRomanization = romanizationMap[item.thai];
      if (nextRomanization && item.romanization !== nextRomanization) {
        item.romanization = nextRomanization;
        rowChanged = true;
      }
    }

    if (rowChanged) {
      row.romanization = joinBreakdownRomanization(row);
      rowChanges += 1;
      fileChanged = true;
    }
  }

  if (fileChanged) {
    fs.writeFileSync(sourcePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    touched.push({ lesson, rowChanges });
  }
}

console.log(JSON.stringify(touched, null, 2));
