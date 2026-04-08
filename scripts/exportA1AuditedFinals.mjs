import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { pool } from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GENERATED_DIR = path.resolve(__dirname, "..", "admin-data", "generated-candidates");
const row = (thai, english) => ({ thai, english });

const IDENTITY_PEN_ROWS = [
  row("ฉันเป็นครู", "I am a teacher."),
  row("ผมเป็นหมอ", "I am a doctor."),
  row("คุณเป็นนักเรียน", "You are a student."),
  row("เขาเป็นพ่อครัว", "He is a cook."),
  row("เธอเป็นพยาบาล", "She is a nurse."),
  row("พี่สาวเป็นครู", "My older sister is a teacher."),
  row("น้องชายเป็นนักเรียน", "My younger brother is a student."),
  row("เพื่อนฉันเป็นคนญี่ปุ่น", "My friend is Japanese."),
  row("แม่เป็นแม่ค้า", "Mom is a vendor."),
  row("พ่อเป็นคนขับรถ", "Dad is a driver."),
  row("ลุงเป็นตำรวจ", "My uncle is a police officer."),
  row("ป้าเป็นช่างผม", "My aunt is a hairdresser."),
  row("ครูคนนี้เป็นคนไทย", "This teacher is Thai."),
  row("หมอคนนั้นเป็นคนจีน", "That doctor is Chinese."),
  row("เขาเป็นเพื่อนบ้านใหม่", "He is the new neighbor."),
  row("เธอเป็นเจ้าของร้าน", "She is the shop owner."),
  row("พี่ชายเป็นวิศวกร", "My older brother is an engineer."),
  row("น้องสาวเป็นนักดนตรี", "My younger sister is a musician."),
  row("ลูกชายเขาเป็นนักกีฬา", "His son is an athlete."),
  row("เพื่อนบ้านเป็นคนเกาหลี", "My neighbor is Korean."),
  row("เขาเป็นนักท่องเที่ยว", "He is a tourist."),
  row("เธอเป็นนักร้อง", "She is a singer."),
  row("ผมเป็นคนไทย", "I am Thai."),
  row("คุณเป็นหัวหน้าห้อง", "You are the class monitor."),
  row("เด็กคนนั้นเป็นนักเรียนใหม่", "That child is the new student."),
];

const POLITE_PARTICLES_ROWS = [
  row("ผมชื่อก้องครับ", "My name is Kong."),
  row("ฉันชื่อมินค่ะ", "My name is Mint."),
  row("หนูหิวแล้วค่ะ", "I'm hungry."),
  row("ผมพร้อมแล้วครับ", "I'm ready."),
  row("ขอบคุณมากค่ะ", "Thank you very much."),
  row("ไม่เป็นไรครับ", "It's okay."),
  row("วันนี้อากาศดีค่ะ", "The weather is nice today."),
  row("ผมอยู่ข้างนอกครับ", "I'm outside."),
  row("ฉันเอาอันนี้ค่ะ", "I'll take this one."),
  row("ผมขอน้ำเปล่าครับ", "Water, please."),
  row("หนูไม่แน่ใจค่ะ", "I'm not sure."),
  row("ผมกลับก่อนนะครับ", "I'll head out first."),
  row("ฉันชอบร้านนี้ค่ะ", "I like this place."),
  row("ผมหิวมากครับ", "I'm very hungry."),
  row("รับถุงไหมคะ", "Would you like a bag?"),
  row("รอสักครู่นะคะ", "Just a moment, please."),
  row("ทางนี้ค่ะ", "This way, please."),
  row("นั่งตรงนี้ได้เลยครับ", "You can sit here."),
  row("เดี๋ยวมานะคะ", "I'll be right back."),
  row("เชิญครับ", "Go ahead."),
  row("วันนี้คนเยอะค่ะ", "It's crowded today."),
  row("ผมยังไม่พร้อมครับ", "I'm not ready yet."),
  row("ฉันเข้าใจแล้วค่ะ", "I understand now."),
  row("ขอโทษนะคะ มาช้าหน่อยค่ะ", "Sorry I'm a little late."),
  row("ยินดีที่ได้รู้จักครับ", "Nice to meet you."),
];

const NAME_CHUE_ROWS = [
  row("ฉันชื่อมินท์", "My name is Mint."),
  row("ผมชื่อบีม", "My name is Beam."),
  row("คุณชื่ออะไร", "What's your name?"),
  row("คุณชื่อเล่นว่าอะไร", "What's your nickname?"),
  row("เขาชื่ออาร์ต", "His name is Art."),
  row("เธอชื่อแพร", "Her name is Prae."),
  row("เพื่อนฉันชื่อเบส", "My friend's name is Best."),
  row("ครูคนใหม่ชื่อแอน", "The new teacher's name is Ann."),
  row("น้องสาวชื่อข้าวฟ่าง", "My younger sister's name is Khao-fang."),
  row("พี่ชายชื่อเจ", "My older brother's name is Jay."),
  row("ลูกชายเขาชื่อวิน", "His son's name is Win."),
  row("ลูกสาวเขาชื่อพลอย", "His daughter's name is Ploy."),
  row("แมวตัวนี้ชื่อโมจิ", "This cat's name is Mochi."),
  row("หมาในบ้านชื่อโบ้", "The dog at home is named Bo."),
  row("ร้านนี้ชื่อบ้านสวน", "This place is called Baan Suan."),
  row("โรงแรมนี้ชื่อริมน้ำ", "This hotel is called Rimnam."),
  row("ถนนนี้ชื่อสุขุมวิท", "This road is called Sukhumvit."),
  row("เมืองนี้ชื่อเชียงใหม่", "This city is Chiang Mai."),
  row("คนนั้นชื่ออะไรนะ", "What's that person's name again?"),
  row("เขาชื่อเล่นว่าต้น", "His nickname is Ton."),
  row("เธอชื่อเล่นว่าฝน", "Her nickname is Fon."),
  row("ชื่อจริงฉันคือนิชา", "My real name is Nicha."),
  row("ชื่อจริงเขาคือธนพล", "His real name is Thanaphon."),
  row("คุณชื่อเหมือนเพื่อนฉัน", "You have the same name as my friend."),
  row("ผมจำชื่อคุณได้แล้ว", "I remember your name now."),
];

const QUESTION_MAI_ROWS = [
  row("คุณหิวไหม", "Are you hungry?"),
  row("วันนี้คุณว่างไหม", "Are you free today?"),
  row("เขาอยู่บ้านไหม", "Is he at home?"),
  row("เธอพร้อมไหม", "Is she ready?"),
  row("กาแฟแก้วนี้หวานไหม", "Is this coffee sweet?"),
  row("ห้องนี้เย็นไหม", "Is this room cold?"),
  row("ข้างนอกฝนตกไหม", "Is it raining outside?"),
  row("ตอนนี้รถติดไหม", "Is traffic bad right now?"),
  row("พรุ่งนี้คุณไปด้วยไหม", "Are you coming tomorrow?"),
  row("คุณเข้าใจไหม", "Do you understand?"),
  row("แม่อยู่ในครัวไหม", "Is Mom in the kitchen?"),
  row("พ่อกลับมาแล้วไหม", "Is Dad back yet?"),
  row("ร้านนี้เปิดไหม", "Is this place open?"),
  row("ที่นี่มีห้องน้ำไหม", "Is there a restroom here?"),
  row("ที่นั่งตรงนี้ว่างไหม", "Is this seat free?"),
  row("เขาชอบชาไทยไหม", "Does he like Thai tea?"),
  row("น้องกลัวหมาไหม", "Is your younger sibling afraid of dogs?"),
  row("หนังเรื่องนี้สนุกไหม", "Is this movie good?"),
  row("อาหารร้านนี้แพงไหม", "Is the food here expensive?"),
  row("คุณชอบร้านนี้ไหม", "Do you like this place?"),
  row("คุณเห็นป้ายนี้ไหม", "Do you see this sign?"),
  row("เขาพูดเร็วไหม", "Does he speak quickly?"),
  row("วันนี้ร้อนไหม", "Is it hot today?"),
  row("อันนี้ถูกไหม", "Is this correct?"),
  row("คุณต้องการถุงไหม", "Do you want a bag?"),
];

const HAVE_MII_ROWS = [
  row("ฉันมีหนังสือเล่มใหม่", "I have a new book."),
  row("ผมมีเวลานิดหน่อย", "I have a little time."),
  row("คุณมีร่มสีดำ", "You have a black umbrella."),
  row("เขามีจักรยานสีแดง", "He has a red bicycle."),
  row("เธอมีน้องสาวหนึ่งคน", "She has one younger sister."),
  row("เรามีข้าวอยู่ที่บ้าน", "We have rice at home."),
  row("พ่อมีรถคันใหญ่", "Dad has a big car."),
  row("แม่มีเพื่อนอยู่เชียงใหม่", "Mom has a friend in Chiang Mai."),
  row("ในตู้เย็นมีนม", "There's milk in the fridge."),
  row("บนโต๊ะมีโทรศัพท์", "There's a phone on the table."),
  row("ในห้องมีเก้าอี้สองตัว", "There are two chairs in the room."),
  row("หน้าบ้านมีต้นไม้ใหญ่", "There's a big tree in front of the house."),
  row("วันนี้มีแดด", "It's sunny today."),
  row("คืนนี้มีตลาดนัด", "There's a night market tonight."),
  row("ในกระเป๋าฉันมีผ้าเช็ดหน้า", "There's a handkerchief in my bag."),
  row("ร้านนี้มีชาไทยอร่อย", "This place has good Thai tea."),
  row("เขามีแมวสองตัว", "He has two cats."),
  row("เธอมีงานเยอะวันนี้", "She has a lot of work today."),
  row("โรงแรมนี้มีสระว่ายน้ำ", "This hotel has a swimming pool."),
  row("ใกล้บ้านมีร้านกาแฟ", "There's a coffee shop near the house."),
  row("บนเตียงมีหมอนสองใบ", "There are two pillows on the bed."),
  row("ตอนนี้มีคนรอคิว", "There are people waiting in line right now."),
  row("พี่สาวมีห้องทำงานเล็ก ๆ", "My older sister has a small office."),
  row("ในแก้วมีน้ำแข็งเยอะ", "There's a lot of ice in the glass."),
  row("ที่โต๊ะนั้นมีที่ว่างสองที่", "There are two open seats at that table."),
];

const NO_HAVE_MAI_MII_ROWS = [
  row("ฉันไม่มีเวลา", "I don't have time."),
  row("ผมไม่มีเงินสด", "I don't have cash."),
  row("คุณไม่มีร่ม", "You don't have an umbrella."),
  row("เขาไม่มีรถ", "He doesn't have a car."),
  row("เธอไม่มีพี่น้อง", "She doesn't have any siblings."),
  row("เราไม่มีไข่ในตู้เย็น", "We don't have any eggs in the fridge."),
  row("พ่อไม่มีงานวันนี้", "Dad doesn't have work today."),
  row("แม่ไม่มีชาเขียวที่บ้าน", "Mom doesn't have any green tea at home."),
  row("ในห้องไม่มีแอร์", "There isn't an AC in the room."),
  row("บนโต๊ะไม่มีปากกา", "There isn't a pen on the table."),
  row("ที่นี่ไม่มีห้องน้ำ", "There isn't a restroom here."),
  row("ในกระเป๋าฉันไม่มีเหรียญ", "I don't have any coins in my bag."),
  row("วันนี้ไม่มีแดด", "It's not sunny today."),
  row("คืนนี้ไม่มีรถเมล์แล้ว", "There aren't any buses tonight."),
  row("ร้านนี้ไม่มีที่นั่งข้างใน", "This place doesn't have indoor seating."),
  row("เขาไม่มีแมวแล้ว", "He doesn't have a cat anymore."),
  row("เธอไม่มีคิวตอนบ่าย", "She doesn't have any appointments this afternoon."),
  row("หน้าบ้านไม่มีรถ", "There isn't a car in front of the house."),
  row("ในแก้วไม่มีน้ำแข็ง", "There isn't any ice in the glass."),
  row("บ้านนี้ไม่มีสุนัข", "There isn't a dog at this house."),
  row("ตอนนี้ไม่มีคนอยู่ในร้าน", "No one is in the shop right now."),
  row("โรงแรมนี้ไม่มีลิฟต์", "This hotel doesn't have an elevator."),
  row("ตู้เย็นไม่มีนมแล้ว", "There's no milk left in the fridge."),
  row("ห้องนี้ไม่มีหน้าต่าง", "This room doesn't have a window."),
  row("ฉันไม่มีคำถาม", "I don't have any questions."),
];

const LOCATION_YUU_ROWS = [
  row("ฉันอยู่ที่บ้าน", "I am at home."),
  row("ผมอยู่ที่ร้านกาแฟ", "I am at the coffee shop."),
  row("คุณอยู่ที่ทำงาน", "You are at work."),
  row("เขาอยู่บนรถเมล์", "He is on the bus."),
  row("เธออยู่ที่โรงเรียน", "She is at school."),
  row("เราอยู่หน้าร้าน", "We are in front of the shop."),
  row("แม่อยู่ในครัว", "Mom is in the kitchen."),
  row("พ่ออยู่ในสวน", "Dad is in the garden."),
  row("น้องอยู่ในห้องนอน", "My younger sibling is in the bedroom."),
  row("ครูอยู่ในห้องเรียน", "The teacher is in the classroom."),
  row("แมวอยู่ใต้โต๊ะ", "The cat is under the table."),
  row("หมาอยู่ข้างประตู", "The dog is by the door."),
  row("โทรศัพท์อยู่ในกระเป๋า", "The phone is in the bag."),
  row("กุญแจอยู่บนโต๊ะ", "The keys are on the table."),
  row("กระเป๋าอยู่ข้างเก้าอี้", "The bag is next to the chair."),
  row("ห้องน้ำอยู่ทางซ้าย", "The restroom is on the left."),
  row("รถฉันอยู่หน้าบ้าน", "My car is in front of the house."),
  row("เพื่อนอยู่ที่เชียงใหม่", "My friend is in Chiang Mai."),
  row("พี่สาวอยู่ที่ออฟฟิศ", "My older sister is at the office."),
  row("เขาอยู่กับเพื่อน", "He is with his friend."),
  row("ฉันยังอยู่ที่ร้าน", "I am still at the shop."),
  row("แม่ยังอยู่ที่ตลาด", "Mom is still at the market."),
  row("พ่ออยู่ข้างล่าง", "Dad is downstairs."),
  row("หนังสืออยู่บนชั้น", "The book is on the shelf."),
  row("เด็ก ๆ อยู่หลังบ้าน", "The children are behind the house."),
];

const ORIGIN_MAA_JAAK_ROWS = [
  row("ฉันมาจากกรุงเทพฯ", "I'm from Bangkok."),
  row("ผมมาจากเชียงใหม่", "I'm from Chiang Mai."),
  row("คุณมาจากภูเก็ต", "You're from Phuket."),
  row("เขามาจากขอนแก่น", "He's from Khon Kaen."),
  row("เธอมาจากญี่ปุ่น", "She's from Japan."),
  row("เรามาจากเกาหลี", "We're from Korea."),
  row("ครูมาจากลาว", "The teacher is from Laos."),
  row("เพื่อนฉันมาจากพม่า", "My friend is from Myanmar."),
  row("พ่อมาจากอยุธยา", "Dad is from Ayutthaya."),
  row("แม่มาจากอุดรธานี", "Mom is from Udon Thani."),
  row("พี่มาจากที่ทำงาน", "My older sibling is coming from work."),
  row("น้องมาจากโรงเรียน", "My younger sibling is coming from school."),
  row("เขามาจากร้านกาแฟข้างล่าง", "He is coming from the cafe downstairs."),
  row("ฉันมาจากตลาด", "I'm coming from the market."),
  row("ผมมาจากธนาคาร", "I'm coming from the bank."),
  row("เธอมาจากบ้านเพื่อน", "She is coming from her friend's house."),
  row("เรามาจากสนามบิน", "We're coming from the airport."),
  row("เขามาจากร้านยา", "He is coming from the pharmacy."),
  row("ครอบครัวนี้มาจากจีน", "This family is from China."),
  row("นักเรียนคนนี้มาจากเชียงราย", "This student is from Chiang Rai."),
  row("นักท่องเที่ยวคนนั้นมาจากฝรั่งเศส", "That tourist is from France."),
  row("กาแฟนี้มาจากเชียงราย", "This coffee comes from Chiang Rai."),
  row("ชานี้มาจากเชียงใหม่", "This tea comes from Chiang Mai."),
  row("ของฝากนี้มาจากภูเก็ต", "This souvenir is from Phuket."),
  row("กล้วยพวงนี้มาจากสวนหลังบ้าน", "These bananas are from the backyard garden."),
];

const NATURAL_ADDRESS_PRONOUNS_ROWS = [
  row("หนูหิวแล้ว", "I'm hungry."),
  row("หนูอยากกลับบ้าน", "I want to go home."),
  row("พี่ไปก่อนนะ", "I'll head out first."),
  row("พี่ขอดูเมนูหน่อย", "Can I see the menu?"),
  row("เราง่วงมาก", "I'm really sleepy."),
  row("เราไม่เอาเผ็ด", "I don't want it spicy."),
  row("แม่กำลังทำกับข้าว", "I'm cooking right now."),
  row("พ่อกลับดึกหน่อยนะ", "I'll be home a little late."),
  row("ครูจะเก็บการบ้านแล้วนะ", "I'm about to collect the homework."),
  row("หมอขอตรวจแป๊บนึงนะ", "Let me take a quick look."),
  row("ไปก่อนนะ", "I'm heading out now."),
  row("ถึงบ้านแล้ว", "I'm home now."),
  row("ยังไม่หิว", "I'm not hungry yet."),
  row("ไม่เอาแล้ว", "I don't want it anymore."),
  row("รอแป๊บนึง", "Wait a second."),
  row("ขอคิดดูก่อน", "Let me think first."),
  row("พี่ยังไม่ว่างนะ", "I'm still busy."),
  row("หนูไม่ชอบผัก", "I don't like vegetables."),
  row("เราอยู่ตรงนี้", "I'm right here."),
  row("แม่ทำเสร็จแล้ว", "I'm done cooking."),
  row("พ่อเปิดประตูให้แล้ว", "I opened the door for you."),
  row("ครูขอชื่อหน่อย", "Can I have your name?"),
  row("หมอจะอธิบายอีกทีนะ", "I'll explain it again."),
  row("น้องช่วยถือหน่อย", "Can you hold this for a second?"),
  row("พี่ไปส่งที่หน้าบ้านนะ", "I'll drop you off in front of the house."),
];

const LESSONS = [
  {
    grammarId: "adjectives",
    stage: "A1.1",
    lessonTitle: "Adjectives as Predicates",
    rowPatches: {
      7312: {
        thai: "ห้องสะอาด",
        english: "The room is clean.",
      },
    },
  },
  {
    grammarId: "future-ja",
    stage: "A1.2",
    lessonTitle: "Future with จะ",
    rowPatches: {
      4409: {
        thai: "เราจะไปทะเลสุดสัปดาห์นี้",
        english: "We will go to the beach this weekend.",
      },
      4415: {
        english: "I will mail the letter tomorrow.",
      },
      4425: {
        thai: "แม่จะทำขนมพรุ่งนี้",
        english: "Mom will make dessert tomorrow.",
      },
    },
  },
  {
    grammarId: "go-come-pai-maa",
    stage: "A1.1",
    lessonTitle: "Movement with ไป / มา",
    rowPatches: {
      8901: {
        thai: "เพื่อนไปหาหมอ",
        english: "My friend is going to see the doctor.",
      },
      8879: {
        thai: "น้องมาหาพี่",
        english: "The younger sibling comes to see the older sibling.",
      },
      8877: {
        thai: "เราไปที่สวน",
        english: "We go to the park.",
      },
    },
  },
  {
    grammarId: "progressive-kamlang",
    stage: "A1.2",
    lessonTitle: "Ongoing Action with กำลัง",
    rowPatches: {
      5605: {
        thai: "พวกเรากำลังเดินไปตลาด",
        english: "We are walking to the market.",
      },
      5611: {
        thai: "เด็ก ๆ กำลังเล่นเกม",
        english: "The children are playing games.",
      },
      5617: {
        thai: "พวกเรากำลังนั่งรถไฟ",
        english: "We are taking the train.",
      },
      5624: {
        thai: "นักเรียนกำลังรอครู",
        english: "The students are waiting for the teacher.",
      },
      5626: {
        english: "A friend is getting on the bus.",
      },
    },
  },
  {
    grammarId: "question-words",
    stage: "A1.1",
    lessonTitle: "Basic Question Words",
    rowPatches: {
      8970: {
        thai: "ใครชอบกาแฟ",
        english: "Who likes coffee?",
      },
      8968: {
        thai: "ใครมาวันนี้",
        english: "Who came today?",
      },
      8976: {
        thai: "เธอฟังเพลงอะไร",
        english: "What song is she listening to?",
      },
      8967: {
        thai: "แม่ทำอะไร",
        english: "What is Mom doing?",
      },
      8978: {
        thai: "พ่อดูอะไร",
        english: "What is Dad watching?",
      },
      8987: {
        thai: "ใครมาจากเชียงใหม่",
        english: "Who is from Chiang Mai?",
      },
      9010: {
        thai: "เธอถืออะไร",
        english: "What is she holding?",
      },
      8996: {
        thai: "เด็กดูอะไร",
        english: "What is the child watching?",
      },
      9009: {
        thai: "ใครมีเวลา",
        english: "Who has time?",
      },
    },
  },
  {
    grammarId: "classifiers",
    stage: "A1.2",
    lessonTitle: "Counting with Classifiers",
    rowPatches: {
      4048: {
        thai: "ฉันมีปากกาสองด้าม",
        english: "I have two pens.",
      },
      4062: {
        thai: "เราสั่งน้ำสองแก้ว",
        english: "We ordered two glasses of water.",
      },
    },
  },
  {
    grammarId: "place-words",
    stage: "A1.2",
    lessonTitle: "Basic Place Words ใน / บน / ใต้ / ข้าง",
    rowPatches: {
      5450: {
        thai: "กุญแจอยู่ข้างตู้เย็น",
        english: "The keys are next to the fridge.",
      },
      5456: {
        thai: "รองเท้าอยู่ข้างประตู",
        english: "The shoes are by the door.",
      },
      5457: {
        thai: "แก้วน้ำอยู่บนโต๊ะ",
        english: "The glass is on the table.",
      },
      5463: {
        thai: "หมอนอยู่บนเตียง",
        english: "The pillow is on the bed.",
      },
      5465: {
        thai: "กระเป๋าอยู่ข้างคอมพิวเตอร์",
        english: "The bag is next to the computer.",
      },
      5469: {
        thai: "รองเท้าอยู่ใต้โต๊ะ",
        english: "The shoes are under the table.",
      },
      5470: {
        thai: "หนังสืออยู่บนเก้าอี้",
        english: "The book is on the chair.",
      },
    },
  },
  {
    grammarId: "because-phraw",
    stage: "A1.2",
    lessonTitle: "Reasons with เพราะ",
    rowPatches: {
      3884: {
        thai: "แม่ทำอาหารเพราะทุกคนหิว",
        english: "Mom is cooking because everyone is hungry.",
      },
      3886: {
        thai: "เราเรียนภาษาญี่ปุ่นเพราะอยากไปญี่ปุ่น",
        english: "We are studying Japanese because we want to go to Japan.",
      },
      3893: {
        thai: "เธอชอบดอกไม้เพราะกลิ่นหอม",
        english: "She likes flowers because they smell nice.",
      },
      3898: {
        thai: "เราชอบเดินเพราะอากาศดี",
        english: "We like walking because the weather is nice.",
      },
      3900: {
        thai: "แม่ซื้อผลไม้เพราะอยากทำขนม",
        english: "Mom buys fruit because she wants to make dessert.",
      },
      3902: {
        thai: "เธอมีความสุขเพราะได้เจอเพื่อน",
        english: "She is happy because she got to see her friend.",
      },
    },
  },
  {
    grammarId: "imperatives",
    stage: "A1.2",
    lessonTitle: "Commands and Suggestions",
    rowPatches: {
      4581: {
        thai: "เปิดประตูหน่อย",
        english: "Please open the door.",
      },
      4583: {
        thai: "ช่วยทำกับข้าวหน่อย",
        english: "Please help with the cooking.",
      },
      4599: {
        thai: "โทรหาฉันหน่อย",
        english: "Please call me.",
      },
      4600: {
        english: "How about some water?",
      },
    },
  },
  {
    grammarId: "negative-imperative-ya",
    stage: "A1.2",
    lessonTitle: "Negative Commands with อย่า",
    rowPatches: {
      4911: {
        thai: "อย่าแตะของร้อน",
        english: "Don't touch anything hot.",
      },
      4912: {
        thai: "อย่าลืมตามนัดนะ",
        english: "Don't forget our appointment.",
      },
      4915: {
        thai: "อย่ากินเร็วเกินไป",
        english: "Don't eat too fast.",
      },
      4920: {
        english: "Don't forget to turn the AC on.",
      },
    },
  },
  {
    grammarId: "want-yaak",
    stage: "A1.2",
    lessonTitle: "Want to with อยาก",
    rowPatches: {
      6477: {
        english: "He wants to go to the beach.",
      },
      6484: {
        thai: "ฉันอยากไปนอนแล้ว",
        english: "I want to go to bed now.",
      },
      6489: {
        thai: "เขาอยากหัดเล่นกีตาร์",
        english: "He wants to learn to play the guitar.",
      },
      6492: {
        thai: "คุณอยากลองร้านนี้ไหม",
        english: "Do you want to try this restaurant?",
      },
      6495: {
        thai: "ลูกอยากเล่นเปียโน",
        english: "The child wants to play the piano.",
      },
      6498: {
        thai: "เพื่อนอยากพักผ่อน",
        english: "My friend wants to rest.",
      },
    },
  },
  {
    grammarId: "possession-khong",
    stage: "A1.2",
    lessonTitle: "Possession with ของ",
    rowPatches: {
      5524: {
        english: "My older sister's bag is in the bedroom.",
      },
      5527: {
        thai: "หนังสือของครูอยู่ในห้องสมุด",
        english: "The teacher's book is in the library.",
      },
      5530: {
        thai: "จักรยานของเพื่อนอยู่หน้าบ้าน",
        english: "My friend's bicycle is in front of the house.",
      },
      5536: {
        thai: "กระเป๋าของนักเรียนหาย",
        english: "The student's bag is missing.",
      },
      5538: {
        thai: "แก้วของแม่อยู่บนโต๊ะ",
        english: "Mom's glass is on the table.",
      },
      5541: {
        english: "Grandma's snacks are really good.",
      },
      5546: {
        thai: "โทรศัพท์ของเขาอยู่บนโต๊ะ",
        english: "His phone is on the table.",
      },
      5547: {
        thai: "คอมพิวเตอร์ของพี่ชายใหม่มาก",
        english: "My older brother's computer is very new.",
      },
    },
  },
  {
    grammarId: "price-thaorai",
    stage: "A1.2",
    lessonTitle: "Prices with เท่าไร",
    rowPatches: {
      5580: {
        thai: "นิตยสารเล่มนี้ราคาเท่าไร",
        english: "How much is this magazine?",
      },
      5583: {
        thai: "น้ำมันขวดนี้ราคาเท่าไร",
        english: "How much is this bottle of cooking oil?",
      },
      5586: {
        thai: "ขนมชิ้นนี้ราคาเท่าไร",
        english: "How much is this dessert?",
      },
      5588: {
        thai: "ขนมปังก้อนนี้ราคาเท่าไร",
        english: "How much is this loaf of bread?",
      },
      5589: {
        thai: "โทรศัพท์เครื่องนี้ราคาเท่าไร",
        english: "How much is this phone?",
      },
      5591: {
        thai: "ตั๋วใบนี้ราคาเท่าไร",
        english: "How much is this ticket?",
      },
      5595: {
        thai: "ผลไม้ถุงนี้ราคาเท่าไร",
        english: "How much is this bag of fruit?",
      },
      5596: {
        thai: "ตั๋วรถเมล์เท่าไร",
        english: "How much is the bus ticket?",
      },
      5597: {
        thai: "กาแฟแก้วนี้เท่าไร",
        english: "How much is this coffee?",
      },
      5599: {
        thai: "เสื้อกันฝนตัวนี้เท่าไร",
        english: "How much is this rain jacket?",
      },
    },
  },
  {
    grammarId: "conjunction-and-but",
    stage: "A1.2",
    lessonTitle: "Basic Linkers with และ / หรือ / แต่",
    rowPatches: {
      4124: {
        english: "Is he going to the library or the mall?",
      },
      4129: {
        thai: "พวกเราเรียนภาษาจีน แต่ยังพูดไม่เก่ง",
        english: "We are studying Chinese, but we still don't speak it well.",
      },
      4133: {
        thai: "เขาเรียนเก่งและใจดี",
        english: "He does well in school and is kind.",
      },
      4138: {
        thai: "ร้านนี้เล็กแต่อาหารอร่อย",
        english: "This place is small, but the food is good.",
      },
      4139: {
        english: "Are you here for work or on vacation?",
      },
      4141: {
        thai: "ฉันว่างวันเสาร์และวันอาทิตย์",
        english: "I'm free on Saturday and Sunday.",
      },
      4143: {
        thai: "คืนนี้ฉันจะอ่านหนังสือหรือดูทีวี",
        english: "Tonight I'll either read a book or watch TV.",
      },
      4146: {
        english: "Are you going shopping or going swimming?",
      },
    },
  },
  {
    grammarId: "time-expressions",
    stage: "A1.2",
    lessonTitle: "Basic Time Expressions",
    rowPatches: {
      6369: { english: "I'm going to the mall today." },
      6370: { english: "He's eating right now." },
      6371: { english: "Mom is working tomorrow." },
      6372: { english: "He's studying right now." },
      6373: { english: "We're watching a movie today." },
      6374: { english: "Dad is going to the market tomorrow." },
      6376: { english: "He's watching TV right now." },
      6379: { english: "He's studying Thai today." },
      6380: {
        thai: "พรุ่งนี้เขาไปทะเล",
        english: "He's going to the beach tomorrow.",
      },
      6383: { english: "I'm going to work tomorrow." },
      6385: { english: "Mom is making dessert today." },
      6386: { english: "We're going to the amusement park tomorrow." },
      6388: { english: "We're shopping today." },
      6390: { english: "I'm driving to work right now." },
      6391: { english: "We're going to the park tomorrow." },
      6393: { english: "I'm going swimming at the pool tomorrow." },
    },
  },
  {
    grammarId: "can-dai",
    stage: "A1.2",
    lessonTitle: "Ability with ได้",
    rowPatches: {
      3933: {
        thai: "เขาไปโรงเรียนเองได้",
        english: "He can go to school by himself.",
      },
      3935: {
        thai: "น้องผูกเชือกรองเท้าได้",
        english: "My younger sibling can tie their shoelaces.",
      },
      3936: {
        thai: "ฉันทำกับข้าวง่าย ๆ ได้",
        english: "I can cook simple meals.",
      },
      3937: {
        thai: "หมาตัวนี้ว่ายน้ำได้",
        english: "This dog can swim.",
      },
      3939: {
        thai: "นักเรียนตอบคำถามได้",
        english: "The students can answer the questions.",
      },
      3940: {
        thai: "ฉันซ่อมจักรยานได้",
        english: "I can repair a bicycle.",
      },
      3941: {
        thai: "เพื่อนฉันเต้นได้ดี",
        english: "My friend can dance well.",
      },
      3942: {
        thai: "คุณสอนคณิตศาสตร์เด็กเล็กได้",
        english: "You can teach math to young children.",
      },
      3946: {
        thai: "เด็กคนนี้ข้ามถนนเองได้แล้ว",
        english: "This child can cross the street on their own now.",
      },
      3947: {
        thai: "พวกเขาเล่นฟุตบอลได้ดี",
        english: "They can play football well.",
      },
      3948: {
        thai: "เขาทำความสะอาดห้องเองได้",
        english: "He can clean his room by himself.",
      },
      3949: {
        thai: "เธอช่วยงานบ้านได้เยอะ",
        english: "She can help a lot with the housework.",
      },
      3950: {
        thai: "เด็กคนนี้อ่านการ์ตูนไทยได้",
        english: "This child can read Thai comics.",
      },
      3953: {
        thai: "เด็กคนนี้อ่านหนังสือเองได้",
        english: "This child can read on their own.",
      },
      3954: {
        thai: "พวกเราแบกของพวกนี้ได้",
        english: "We can carry these things.",
      },
    },
  },
  {
    grammarId: "very-maak",
    stage: "A1.2",
    lessonTitle: "Degree with มาก / น้อย",
    rowPatches: {
      6452: {
        thai: "ฝนตกมากวันนี้",
        english: "It's raining a lot today.",
      },
      6455: {
        thai: "เขาอ่านหนังสือมาก",
        english: "He reads a lot.",
      },
      6456: {
        english: "They have a lot of money.",
      },
      6458: {
        thai: "นักท่องเที่ยวมาที่นี่มาก",
        english: "A lot of tourists come here.",
      },
      6460: {
        thai: "ช่วงนี้ฉันอ่านข่าวมาก",
        english: "I've been reading the news a lot lately.",
      },
      6462: {
        thai: "เขาทำงานหนักมาก",
        english: "He works very hard.",
      },
      6463: {
        thai: "กาแฟแก้วนี้หวานมาก",
        english: "This coffee is very sweet.",
      },
      6466: {
        thai: "เธอมีเพื่อนมาก",
        english: "She has a lot of friends.",
      },
      6468: {
        thai: "เราเดินมากทุกวัน",
        english: "We walk a lot every day.",
      },
      6470: {
        thai: "เธอพูดมาก",
        english: "She talks a lot.",
      },
      6471: {
        thai: "เขาชอบเล่นฟุตบอลมาก",
        english: "He really likes playing football.",
      },
      6472: {
        thai: "หมาตัวนี้เห่ามาก",
        english: "This dog barks a lot.",
      },
      6473: {
        thai: "เขานอนมากในวันหยุด",
        english: "He sleeps a lot on weekends.",
      },
      6474: {
        thai: "เด็ก ๆ เล่นกันมากหลังเลิกเรียน",
        english: "The kids play a lot after school.",
      },
      6475: {
        thai: "เขาถามคำถามมาก",
        english: "He asks a lot of questions.",
      },
    },
  },
  {
    grammarId: "this-that",
    stage: "A1.1",
    lessonTitle: "Demonstratives นี่ / นั้น / โน่น",
    rowPatches: {
      7937: {
        thai: "หนังนั้นสนุก",
        english: "That movie is fun.",
      },
      7924: {
        thai: "นี่คือร้านกาแฟ",
        english: "This is a coffee shop.",
      },
      7931: {
        thai: "นั่นคือป้ายรถเมล์",
        english: "That is a bus stop.",
      },
      7951: {
        thai: "นั่นไม่ใช่ชาเย็น",
        english: "That's not iced tea.",
      },
      7954: {
        thai: "บ้านโน่นสวยมาก",
        english: "That house over there is very pretty.",
      },
    },
  },
  {
    grammarId: "experience-koey",
    stage: "A1.2",
    lessonTitle: "Past Experience with เคย",
    rowPatches: {
      4349: {
        english: "He has been to the beach with his friends.",
      },
      4352: {
        english: "You have driven to Bangkok before.",
      },
      4354: {
        thai: "เขาเคยนั่งรถไฟไปเชียงใหม่",
        english: "He has taken the train to Chiang Mai before.",
      },
      4365: {
        thai: "เขาเคยดื่มกาแฟที่ร้านนี้",
        english: "He has had coffee at this shop before.",
      },
    },
  },
  {
    grammarId: "not-identity-mai-chai",
    stage: "A1.1",
    lessonTitle: "Noun Negation with ไม่ใช่",
    rowPatches: {
      7705: {
        thai: "เขาไม่ใช่คนขับรถ",
        english: "He isn't the driver.",
      },
      7710: {
        thai: "เธอไม่ใช่หมอ",
        english: "She isn't a doctor.",
      },
      7711: {
        english: "We aren't teachers.",
      },
      7696: {
        thai: "ครูไม่ใช่หมอ",
        english: "The teacher isn't a doctor.",
      },
      7691: {
        thai: "เพื่อนไม่ใช่หมอ",
        english: "My friend isn't a doctor.",
      },
      7695: {
        english: "You're not Thai.",
      },
      7663: {
        thai: "นี่ไม่ใช่น้ำผลไม้",
        english: "This isn't fruit juice.",
      },
    },
  },
  {
    grammarId: "identity-pen",
    stage: "A1.1",
    lessonTitle: "Identity with เป็น",
    manualRows: IDENTITY_PEN_ROWS,
  },
  {
    grammarId: "polite-particles",
    stage: "A1.1",
    lessonTitle: "Polite Particles ครับ / ค่ะ",
    manualRows: POLITE_PARTICLES_ROWS,
  },
  {
    grammarId: "name-chue",
    stage: "A1.1",
    lessonTitle: "Names with ชื่อ",
    manualRows: NAME_CHUE_ROWS,
  },
  {
    grammarId: "question-mai",
    stage: "A1.1",
    lessonTitle: "Yes or No Questions with ไหม",
    manualRows: QUESTION_MAI_ROWS,
  },
  {
    grammarId: "have-mii",
    stage: "A1.1",
    lessonTitle: "Have / There Is with มี",
    manualRows: HAVE_MII_ROWS,
  },
  {
    grammarId: "no-have-mai-mii",
    stage: "A1.1",
    lessonTitle: "Absence with ไม่มี",
    manualRows: NO_HAVE_MAI_MII_ROWS,
  },
  {
    grammarId: "location-yuu",
    stage: "A1.1",
    lessonTitle: "Location with อยู่",
    manualRows: LOCATION_YUU_ROWS,
  },
  {
    grammarId: "origin-maa-jaak",
    stage: "A1.1",
    lessonTitle: "Origin with มาจาก",
    manualRows: ORIGIN_MAA_JAAK_ROWS,
  },
  {
    grammarId: "natural-address-pronouns",
    stage: "A1.1",
    lessonTitle: "Natural Address and Pronoun Dropping",
    manualRows: NATURAL_ADDRESS_PRONOUNS_ROWS,
  },
];

async function exportLesson({
  grammarId,
  stage,
  lessonTitle,
  rowPatches = {},
  manualRows = null,
}) {
  return exportLessonRows({ grammarId, stage, lessonTitle, rowPatches, manualRows });
}

async function exportLessonRows({
  grammarId,
  stage,
  lessonTitle,
  rowPatches = {},
  manualRows = null,
}) {
  let rows;

  if (Array.isArray(manualRows)) {
    if (manualRows.length !== 25) {
      throw new Error(`Expected 25 manual rows for ${grammarId}, found ${manualRows.length}.`);
    }
    rows = manualRows.map((row) => ({
      thai: row.thai,
      english: normalizeEnglish(row.english),
    }));
  } else {
  const patchedIds = Object.keys(rowPatches).map((value) => Number(value));
  const result = await pool.query(
    `
      SELECT id, thai, english, next_wave_decision
      FROM grammar_examples
      WHERE grammar_id = $1
        AND (
          next_wave_decision = ANY($2::text[])
          OR id = ANY($3::bigint[])
        )
      ORDER BY sort_order ASC, id ASC
    `,
    [grammarId, ["carry", "revise"], patchedIds],
  );

    if (result.rows.length !== 25) {
      throw new Error(
        `Expected 25 carry/revise rows for ${grammarId}, found ${result.rows.length}.`,
      );
    }

    rows = result.rows.map((row) => {
      const patch = rowPatches[Number(row.id)] ?? {};
      return {
        thai: patch.thai ?? row.thai,
        english: normalizeEnglish(patch.english ?? row.english),
      };
    });
  }

  const payload = {
    lessonId: grammarId,
    stage,
    lessonTitle,
    rows,
  };

  const outputPath = path.join(GENERATED_DIR, `${grammarId}-final25-reviewed.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return outputPath;
}

function normalizeEnglish(value) {
  const trimmed = String(value ?? "").trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  if (/[.?!]$/.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}.`;
}

async function main() {
  const written = [];
  for (const lesson of LESSONS) {
    written.push(await exportLesson(lesson));
  }
  console.log(JSON.stringify({ written }, null, 2));
}

main()
  .catch((error) => {
    console.error("Failed to export audited A1 finals:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
