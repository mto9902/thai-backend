import fs from "fs";

const file =
  "C:/Users/Lux/thai-generator/ai-server/admin-data/manual-source-lessons/future-ja-source.json";

const data = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));

data.rows[6].thai = "เราจะไปทะเลสุดสัปดาห์นี้";
data.rows[22].thai = "แม่จะเย็บเสื้อพรุ่งนี้";
data.rows[22].english = "Mom will sew a shirt tomorrow.";

fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log("repaired future-ja");
