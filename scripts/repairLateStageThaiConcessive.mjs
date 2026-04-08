import fs from "fs";

const file =
  "C:/Users/Lux/thai-generator/ai-server/admin-data/manual-source-lessons/concessive-marker-yaang-rai-kor-source.json";

const rows = [
  { thai: "อย่างไรก็ต้องเริ่ม", breakdownThai: ["อย่างไรก็", "ต้องเริ่ม"] },
  { thai: "อย่างไรก็ต้องแจ้งลูกค้าก่อน", breakdownThai: ["อย่างไรก็", "ต้องแจ้งลูกค้าก่อน"] },
  { thai: "อย่างไรก็ควรฟังทั้งสองฝ่าย", breakdownThai: ["อย่างไรก็", "ควรฟังทั้งสองฝ่าย"] },
  { thai: "อย่างไรก็ยังดีกว่าไม่ทำอะไร", breakdownThai: ["อย่างไรก็", "ยังดีกว่าไม่ทำอะไร"] },
  { thai: "อย่างไรก็ต้องมีคนรับผิดชอบ", breakdownThai: ["อย่างไรก็", "ต้องมีคนรับผิดชอบ"] },
  { thai: "อย่างไรก็ควรเตรียมแผนสำรองไว้", breakdownThai: ["อย่างไรก็", "ควรเตรียมแผนสำรองไว้"] },
  { thai: "อย่างไรก็ต้องคุยกันให้ชัด", breakdownThai: ["อย่างไรก็", "ต้องคุยกันให้ชัด"] },
  { thai: "อย่างไรก็ฉันยังไม่เห็นด้วย", breakdownThai: ["อย่างไรก็", "ฉันยังไม่เห็นด้วย"] },
  { thai: "อย่างไรก็เราต้องหาทางออก", breakdownThai: ["อย่างไรก็", "เราต้องหาทางออก"] },
  { thai: "อย่างไรก็เขาควรขอโทษก่อน", breakdownThai: ["อย่างไรก็", "เขาควรขอโทษก่อน"] },
  { thai: "อย่างไรก็เรื่องนี้ต้องจบวันนี้", breakdownThai: ["อย่างไรก็", "เรื่องนี้ต้องจบวันนี้"] },
  { thai: "อย่างไรก็เราควรรอข้อมูลเพิ่ม", breakdownThai: ["อย่างไรก็", "เราควรรอข้อมูลเพิ่ม"] },
  { thai: "อย่างไรก็ฉันจะไม่เปลี่ยนคำตอบ", breakdownThai: ["อย่างไรก็", "ฉันจะไม่เปลี่ยนคำตอบ"] },
  { thai: "อย่างไรก็เขาต้องส่งงานคืนนี้", breakdownThai: ["อย่างไรก็", "เขาต้องส่งงานคืนนี้"] },
  { thai: "อย่างไรก็ทีมนี้ยังต้องฝึกอีก", breakdownThai: ["อย่างไรก็", "ทีมนี้ยังต้องฝึกอีก"] },
  { thai: "อย่างไรก็เราควรบอกความจริง", breakdownThai: ["อย่างไรก็", "เราควรบอกความจริง"] },
  { thai: "อย่างไรก็ต้องมีหลักฐานชัดเจน", breakdownThai: ["อย่างไรก็", "ต้องมีหลักฐานชัดเจน"] },
  { thai: "อย่างไรก็คุณควรตอบให้ตรง", breakdownThai: ["อย่างไรก็", "คุณควรตอบให้ตรง"] },
  { thai: "อย่างไรก็เราต้องคิดเผื่อไว้ก่อน", breakdownThai: ["อย่างไรก็", "เราต้องคิดเผื่อไว้ก่อน"] },
  { thai: "อย่างไรก็เขายังต้องพิสูจน์ตัวเอง", breakdownThai: ["อย่างไรก็", "เขายังต้องพิสูจน์ตัวเอง"] },
  { thai: "อย่างไรก็ต้องเปิดเผยข้อมูลบางส่วน", breakdownThai: ["อย่างไรก็", "ต้องเปิดเผยข้อมูลบางส่วน"] },
  { thai: "อย่างไรก็เราควรแยกประเด็นก่อน", breakdownThai: ["อย่างไรก็", "เราควรแยกประเด็นก่อน"] },
  { thai: "อย่างไรก็ยังต้องตรวจอีกหลายรอบ", breakdownThai: ["อย่างไรก็", "ยังต้องตรวจอีกหลายรอบ"] },
  { thai: "อย่างไรก็เขาควรฟังให้จบก่อน", breakdownThai: ["อย่างไรก็", "เขาควรฟังให้จบก่อน"] },
  { thai: "อย่างไรก็ทีมเราต้องเดินหน้าต่อ", breakdownThai: ["อย่างไรก็", "ทีมเราต้องเดินหน้าต่อ"] },
];

const data = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));

rows.forEach((fix, rowIndex) => {
  data.rows[rowIndex].thai = fix.thai;
  fix.breakdownThai.forEach((thai, chunkIndex) => {
    data.rows[rowIndex].breakdown[chunkIndex].thai = thai;
  });
});

fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log("repaired concessive-marker-yaang-rai-kor");
