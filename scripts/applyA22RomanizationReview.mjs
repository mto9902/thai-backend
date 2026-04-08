import fs from "fs";
import path from "path";

const sourceDir = path.join(
  process.cwd(),
  "admin-data",
  "manual-source-lessons",
);

const lessons = [
  "change-state-khuen-long",
  "conditionals",
  "endurance-wai",
  "feelings-rusuek",
  "in-order-to-phuea",
  "must-tong",
  "passive-tuuk",
  "prefix-naa-adjective",
  "resultative-ok-samret",
  "should-khuan",
  "superlative",
  "try-lawng",
];

const romanizationMap = {
  "ประตู": "bprà-dtuu",
  "กระเป๋า": "grà-bpǎo",
  "กาแฟ": "gaa-fae",
  "กิน": "kin",
  "ข้าว": "khâao",
  "ดื่ม": "dùum",
  "เด็กๆ": "dèk-dèk",
  "ต้อง": "dtâwng",
  "ตอนนี้": "dtawn-níi",
  "ตื่น": "dtùen",
  "ถูก": "thùuk",
  "บอก": "bàawk",
  "เพิ่ม": "phêrm",
  "ร้อน": "ráawn",
  "รีบ": "rîip",
  "แล้ว": "láeo",
  "สอบ": "sàawp",
  "เสียง": "sǐiang",
  "ห้อง": "hâwng",
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
