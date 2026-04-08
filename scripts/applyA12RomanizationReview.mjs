import fs from "fs";
import path from "path";

const sourceDir = path.join(
  process.cwd(),
  "admin-data",
  "manual-source-lessons",
);

const lessons = [
  "because-phraw",
  "can-dai",
  "classifiers",
  "conjunction-and-but",
  "experience-koey",
  "future-ja",
  "imperatives",
  "negative-imperative-ya",
  "place-words",
  "possession-khong",
  "price-thaorai",
  "progressive-kamlang",
  "request-khor",
  "time-expressions",
  "very-maak",
  "want-yaak",
];

const romanizationMap = {
  "กลับ": "glàp",
  "กัน": "gan",
  "การบ้าน": "gaan-bâan",
  "กิน": "kin",
  "กินข้าว": "kin-khâao",
  "ของ": "khǎawng",
  "เขา": "khǎo",
  "ครัว": "khrua",
  "ความสะอาด": "khwaam sa-àat",
  "คืนนี้": "khʉʉn-níi",
  "เค้ก": "khéek",
  "จดหมาย": "jòt-mǎai",
  "เจอ": "jəə",
  "ฉัน": "chǎn",
  "เชียงใหม่": "chiang-mài",
  "ซื้อ": "súue",
  "ซื้อของ": "súue khǎawng",
  "ญี่ปุ่น": "yîi-bpùn",
  "ดู": "duu",
  "เดิน": "dooen",
  "ได้": "dâi",
  "ต้นไม้": "dtôn-mái",
  "ตลาด": "dtà-làat",
  "ต้อง": "dtâwng",
  "ตอนบ่าย": "dtawn-bàai",
  "ตอนเย็น": "dtawn-yen",
  "ทะเล": "tha-lay",
  "ทำงาน": "tham-ngaan",
  "ที่นี่": "thîi-nîi",
  "ทีวี": "thii-wii",
  "เที่ยว": "thîao",
  "โทรหา": "thoo-hǎa",
  "ธนาคาร": "tha-naa-khaan",
  "เธอ": "thoe",
  "น้อง": "nóng",
  "น้องชาย": "nóng-chaai",
  "นอน": "nawn",
  "นักเรียน": "nák-rian",
  "ปลูก": "bplùuk",
  "เปิด": "bpə̀ət",
  "ไป": "bpai",
  "ผม": "phǒm",
  "ฝนตก": "fǒn-tòk",
  "พวกเขา": "phûak-khǎo",
  "พวกเรา": "phûak-rao",
  "พ่อ": "phâw",
  "พักผ่อน": "phák-phàwn",
  "พี่สาว": "phîi-sǎao",
  "ฟุตบอล": "phút-bawn",
  "ภาษาไทย": "phaa-sǎa thai",
  "โยคะ": "yo-khá",
  "รถไฟ": "rót-fai",
  "รถเมล์": "rót-mee",
  "ร้านอาหาร": "ráan-aa-hǎan",
  "เร็ว": "reo",
  "โรงเรียน": "roong-rian",
  "ลูกชาย": "lûuk-chaai",
  "ว่ายน้ำ": "wâai-náam",
  "สวน": "sǔan",
  "เสื้อ": "sʉ̂a",
  "หน่อย": "nòi",
  "หนัง": "nǎng",
  "หนังสือ": "nǎng-sǔue",
  "เหนื่อย": "nʉ̀ai",
  "ออกกำลังกาย": "òk-gam-lang-gaai",
  "อาหาร": "aa-hǎan",
};

function joinBreakdownRomanization(row) {
  return (row.breakdown || [])
    .map((item) => item.romanization || "")
    .filter(Boolean)
    .join(" ");
}

const touched = [];

for (const lesson of lessons) {
  const sourcePath = path.join(sourceDir, `${lesson}-source.json`);
  const data = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  let fileChanged = false;
  let rowChanges = 0;

  for (const row of data.rows || []) {
    let rowChanged = false;
    for (const item of row.breakdown || []) {
      const nextRomanization = romanizationMap[item.thai];
      if (nextRomanization && item.romanization !== nextRomanization) {
        item.romanization = nextRomanization;
        rowChanged = true;
        fileChanged = true;
      }
    }
    if (rowChanged) {
      row.romanization = joinBreakdownRomanization(row);
      rowChanges += 1;
    }
  }

  if (fileChanged) {
    fs.writeFileSync(sourcePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    touched.push({ lesson, rowChanges });
  }
}

console.log(JSON.stringify(touched, null, 2));
