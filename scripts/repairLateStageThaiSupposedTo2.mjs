import fs from "fs";

const file =
  "C:/Users/Lux/thai-generator/ai-server/admin-data/manual-source-lessons/supposed-to-khuan-ja-source.json";

const rows = [
  { thai: "เขาน่าจะถึงแล้ว", breakdownThai: ["เขา", "น่าจะ", "ถึงแล้ว"] },
  { thai: "รถไฟควรจะมาถึงเร็วๆนี้", breakdownThai: ["รถไฟ", "ควรจะ", "มาถึงเร็วๆนี้"] },
  { thai: "เรื่องนี้น่าจะง่ายกว่าที่คิด", breakdownThai: ["เรื่องนี้", "น่าจะ", "ง่ายกว่าที่คิด"] },
  { thai: "เขาควรจะรู้เรื่องนี้แล้ว", breakdownThai: ["เขา", "ควรจะ", "รู้เรื่องนี้แล้ว"] },
  { thai: "เธอน่าจะเข้าใจเหตุผลของเรา", breakdownThai: ["เธอ", "น่าจะ", "เข้าใจเหตุผลของเรา"] },
  { thai: "ทีมควรจะส่งได้วันนี้", breakdownThai: ["ทีม", "ควรจะ", "ส่งได้วันนี้"] },
  { thai: "เขาน่าจะยังไม่กลับ", breakdownThai: ["เขา", "น่าจะ", "ยังไม่กลับ"] },
  { thai: "เราควรจะคุยกันก่อน", breakdownThai: ["เรา", "ควรจะ", "คุยกันก่อน"] },
  { thai: "ลูกค้าน่าจะอยากได้คำตอบเร็ว", breakdownThai: ["ลูกค้า", "น่าจะ", "อยากได้คำตอบเร็ว"] },
  { thai: "ฉันควรจะถามให้ชัดกว่านี้", breakdownThai: ["ฉัน", "ควรจะ", "ถามให้ชัดกว่านี้"] },
  { thai: "เขาน่าจะลืมเวลา", breakdownThai: ["เขา", "น่าจะ", "ลืมเวลา"] },
  { thai: "เราควรจะเผื่อเวลาเดินทาง", breakdownThai: ["เรา", "ควรจะ", "เผื่อเวลาเดินทาง"] },
  { thai: "แผนนี้น่าจะใช้ได้", breakdownThai: ["แผนนี้", "น่าจะ", "ใช้ได้"] },
  { thai: "เขาควรจะขอโทษก่อน", breakdownThai: ["เขา", "ควรจะ", "ขอโทษก่อน"] },
  { thai: "เธอน่าจะเห็นข้อความแล้ว", breakdownThai: ["เธอ", "น่าจะ", "เห็นข้อความแล้ว"] },
  { thai: "เราควรจะพักสักหน่อย", breakdownThai: ["เรา", "ควรจะ", "พักสักหน่อย"] },
  { thai: "ผลน่าจะออกพรุ่งนี้", breakdownThai: ["ผล", "น่าจะ", "ออกพรุ่งนี้"] },
  { thai: "เขาควรจะบอกเราก่อน", breakdownThai: ["เขา", "ควรจะ", "บอกเราก่อน"] },
  { thai: "ลูกค้าน่าจะยังลังเลอยู่", breakdownThai: ["ลูกค้า", "น่าจะ", "ยังลังเลอยู่"] },
  { thai: "เราควรจะอ่านสัญญาให้ครบ", breakdownThai: ["เรา", "ควรจะ", "อ่านสัญญาให้ครบ"] },
  { thai: "เขาน่าจะเข้าใจผิด", breakdownThai: ["เขา", "น่าจะ", "เข้าใจผิด"] },
  { thai: "ทีมควรจะเตรียมแผนสำรอง", breakdownThai: ["ทีม", "ควรจะ", "เตรียมแผนสำรอง"] },
  { thai: "เรื่องนี้น่าจะใช้เวลาอีกพักหนึ่ง", breakdownThai: ["เรื่องนี้", "น่าจะ", "ใช้เวลาอีกพักหนึ่ง"] },
  { thai: "ฉันควรจะตอบให้เร็วกว่านี้", breakdownThai: ["ฉัน", "ควรจะ", "ตอบให้เร็วกว่านี้"] },
  { thai: "เขาน่าจะรู้ว่าต้องทำอะไร", breakdownThai: ["เขา", "น่าจะ", "รู้ว่าต้องทำอะไร"] },
];

const data = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));

rows.forEach((fix, rowIndex) => {
  data.rows[rowIndex].thai = fix.thai;
  fix.breakdownThai.forEach((thai, chunkIndex) => {
    data.rows[rowIndex].breakdown[chunkIndex].thai = thai;
  });
});

fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log("repaired supposed-to-khuan-ja");
