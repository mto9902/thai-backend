import fs from "fs";

const file =
  "C:/Users/Lux/thai-generator/ai-server/admin-data/manual-source-lessons/once-phor-source.json";

const rows = [
  { thai: "พอฝนหยุด เราก็ออกไป", breakdownThai: ["พอฝนหยุด", "เราก็ออกไป"] },
  { thai: "พอถึงบ้าน ฉันก็อาบน้ำ", breakdownThai: ["พอถึงบ้าน", "ฉันก็อาบน้ำ"] },
  { thai: "พอครูถาม เขาก็ตอบทันที", breakdownThai: ["พอครูถาม", "เขาก็ตอบทันที"] },
  { thai: "พอประชุมจบ ทุกคนก็ลุกขึ้น", breakdownThai: ["พอประชุมจบ", "ทุกคนก็ลุกขึ้น"] },
  { thai: "พอไฟกลับมา เราก็เริ่มงานต่อ", breakdownThai: ["พอไฟกลับมา", "เราก็เริ่มงานต่อ"] },
  { thai: "พอเธอเห็นราคา เธอก็เงียบไป", breakdownThai: ["พอเธอเห็นราคา", "เธอก็เงียบไป"] },
  { thai: "พอเขามาถึง เราก็เริ่มคุย", breakdownThai: ["พอเขามาถึง", "เราก็เริ่มคุย"] },
  { thai: "พอร้านเปิด ลูกค้าก็เข้ามา", breakdownThai: ["พอร้านเปิด", "ลูกค้าก็เข้ามา"] },
  { thai: "พอได้รับอีเมล ฉันก็โทรกลับ", breakdownThai: ["พอได้รับอีเมล", "ฉันก็โทรกลับ"] },
  { thai: "พอรถหยุด เด็กก็ลงทันที", breakdownThai: ["พอรถหยุด", "เด็กก็ลงทันที"] },
  { thai: "พอเรารู้ข่าว ทุกคนก็ตกใจ", breakdownThai: ["พอเรารู้ข่าว", "ทุกคนก็ตกใจ"] },
  { thai: "พออาหารมา เขาก็เริ่มกิน", breakdownThai: ["พออาหารมา", "เขาก็เริ่มกิน"] },
  { thai: "พอหมดเวลา ครูก็เก็บข้อสอบ", breakdownThai: ["พอหมดเวลา", "ครูก็เก็บข้อสอบ"] },
  { thai: "พอฝนเริ่มตก เราก็รีบกลับ", breakdownThai: ["พอฝนเริ่มตก", "เราก็รีบกลับ"] },
  { thai: "พอเปิดประตู แมวก็วิ่งออกมา", breakdownThai: ["พอเปิดประตู", "แมวก็วิ่งออกมา"] },
  { thai: "พอถึงคิว ฉันก็เดินเข้าไป", breakdownThai: ["พอถึงคิว", "ฉันก็เดินเข้าไป"] },
  { thai: "พอเขาวางสาย ฉันก็ส่งข้อความ", breakdownThai: ["พอเขาวางสาย", "ฉันก็ส่งข้อความ"] },
  { thai: "พอเครื่องพร้อม ทีมก็เริ่มทดสอบ", breakdownThai: ["พอเครื่องพร้อม", "ทีมก็เริ่มทดสอบ"] },
  { thai: "พอเด็กหลับ แม่ก็เบาเสียง", breakdownThai: ["พอเด็กหลับ", "แม่ก็เบาเสียง"] },
  { thai: "พอเขายิ้ม ทุกคนก็สบายใจ", breakdownThai: ["พอเขายิ้ม", "ทุกคนก็สบายใจ"] },
  { thai: "พอเธอรู้ผลสอบ เธอก็โทรหาแม่", breakdownThai: ["พอเธอรู้ผลสอบ", "เธอก็โทรหาแม่"] },
  { thai: "พอถึงวันจริง ทุกอย่างก็เร็วมาก", breakdownThai: ["พอถึงวันจริง", "ทุกอย่างก็เร็วมาก"] },
  { thai: "พองานเสร็จ เราก็กลับบ้าน", breakdownThai: ["พองานเสร็จ", "เราก็กลับบ้าน"] },
  { thai: "พอเธอเปิดไฟ เขาก็ตื่นเลย", breakdownThai: ["พอเธอเปิดไฟ", "เขาก็ตื่นเลย"] },
  { thai: "พอเราเห็นข้อผิดพลาด ทีมก็หยุดส่งงาน", breakdownThai: ["พอเราเห็นข้อผิดพลาด", "ทีมก็หยุดส่งงาน"] },
];

const data = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));

rows.forEach((fix, rowIndex) => {
  data.rows[rowIndex].thai = fix.thai;
  fix.breakdownThai.forEach((thai, chunkIndex) => {
    data.rows[rowIndex].breakdown[chunkIndex].thai = thai;
  });
});

fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log("repaired once-phor");
