import { pool } from "../db.js";

const REVIEW_DATE = "2026-03-25";
const REVIEW_NOTE = `Manual full A1.1 curation ${REVIEW_DATE}`;

const A11_GRAMMAR_IDS = [
  "svo",
  "polite-particles",
  "name-chue",
  "natural-address-pronouns",
  "identity-pen",
  "adjectives",
  "negative-mai",
  "question-mai",
  "question-words",
  "have-mii",
  "no-have-mai-mii",
  "location-yuu",
  "origin-maa-jaak",
  "this-that",
  "not-identity-mai-chai",
  "go-come-pai-maa",
];

function makeWord(thai, english, romanization, tones, grammar = false) {
  const item = {
    thai,
    english,
    romanization,
  };

  if (grammar) {
    item.grammar = true;
  }

  if (tones.length === 1) {
    item.tone = tones[0];
  }

  item.tones = tones;
  return item;
}

const TOKENS = {
  i: makeWord("ฉัน", "I", "chǎn", ["rising"]),
  meM: makeWord("ผม", "I (male speaker)", "phǒm", ["rising"], true),
  you: makeWord("คุณ", "you", "khun", ["mid"]),
  he: makeWord("เขา", "he", "khǎo", ["rising"]),
  she: makeWord("เธอ", "she", "thoe", ["mid"]),
  we: makeWord("เรา", "we", "rao", ["mid"]),
  they: makeWord("พวกเขา", "they", "phûak-khǎo", ["falling", "rising"]),
  dad: makeWord("พ่อ", "dad", "phâw", ["falling"]),
  mom: makeWord("แม่", "mom", "mâe", ["falling"]),
  child: makeWord("เด็ก", "child", "dèk", ["low"]),
  teacher: makeWord("ครู", "teacher", "khruu", ["mid"]),
  friend: makeWord("เพื่อน", "friend", "phûuean", ["falling"]),
  nuu: makeWord("หนู", "I (younger speaker)", "nǔu", ["rising"], true),
  pii: makeWord("พี่", "I / older sibling", "phîi", ["falling"], true),
  nong: makeWord("น้อง", "younger sibling", "nóng", ["high"], true),
  doctor: makeWord("หมอ", "doctor", "mǎw", ["rising"]),
  student: makeWord("นักเรียน", "student", "nák-rian", ["high", "mid"]),
  woman: makeWord("ผู้หญิง", "woman", "phûu-yǐng", ["falling", "rising"]),
  man: makeWord("ผู้ชาย", "man", "phûu-chaai", ["falling", "mid"]),
  thaiPerson: makeWord("คนไทย", "Thai person", "khon-thai", ["mid", "mid"]),
  rice: makeWord("ข้าว", "rice", "khâao", ["falling"]),
  water: makeWord("น้ำ", "water", "náam", ["high"]),
  tea: makeWord("ชา", "tea", "chaa", ["mid"]),
  milk: makeWord("นม", "milk", "nom", ["mid"]),
  fish: makeWord("ปลา", "fish", "plaa", ["mid"]),
  veg: makeWord("ผัก", "vegetables", "phàk", ["low"]),
  shirt: makeWord("เสื้อ", "shirt", "sʉ̂a", ["falling"]),
  movie: makeWord("หนัง", "movie", "nǎng", ["rising"]),
  book: makeWord("หนังสือ", "book", "nǎng-sʉ̌ʉ", ["rising", "rising"]),
  coffee: makeWord("กาแฟ", "coffee", "gaa-fae", ["mid", "mid"]),
  snack: makeWord("ขนม", "snack", "khà-nǒm", ["low", "rising"]),
  penObj: makeWord("ปากกา", "pen", "bpàak-gaa", ["low", "mid"]),
  food: makeWord("อาหาร", "food", "aa-hǎan", ["mid", "rising"]),
  song: makeWord("เพลง", "song", "phleeng", ["mid"]),
  game: makeWord("เกม", "game", "geem", ["mid"]),
  car: makeWord("รถ", "car", "rót", ["high"]),
  bowl: makeWord("ชาม", "bowl", "chaam", ["mid"]),
  table: makeWord("โต๊ะ", "table", "dtó", ["falling"]),
  house: makeWord("บ้าน", "house", "bâan", ["falling"]),
  room: makeWord("ห้อง", "room", "hông", ["falling"]),
  shop: makeWord("ร้าน", "shop", "ráan", ["high"]),
  market: makeWord("ตลาด", "market", "ta-làat", ["mid", "low"]),
  time: makeWord("เวลา", "time", "wee-laa", ["mid", "mid"]),
  rain: makeWord("ฝน", "rain", "fǒn", ["rising"]),
  eat: makeWord("กิน", "eat", "kin", ["mid"]),
  drink: makeWord("ดื่ม", "drink", "dʉ̀ʉm", ["low"]),
  buy: makeWord("ซื้อ", "buy", "sʉ́ʉ", ["high"]),
  watch: makeWord("ดู", "watch", "duu", ["mid"]),
  read: makeWord("อ่าน", "read", "àan", ["low"]),
  play: makeWord("เล่น", "play", "lên", ["falling"]),
  listen: makeWord("ฟัง", "listen", "fang", ["mid"]),
  use: makeWord("ใช้", "use", "chái", ["high"]),
  like: makeWord("ชอบ", "like", "chôop", ["falling"]),
  go: makeWord("ไป", "go", "bpai", ["mid"]),
  come: makeWord("มา", "come", "maa", ["mid"]),
  find: makeWord("หา", "meet", "hǎa", ["rising"]),
  stay: makeWord("อยู่", "be located", "yùu", ["low"], true),
  have: makeWord("มี", "have", "mii", ["mid"], true),
  notHave: makeWord("ไม่มี", "not have", "mâi-mii", ["falling", "mid"], true),
  be: makeWord("เป็น", "be", "bpen", ["mid"], true),
  notBe: makeWord("ไม่ใช่", "not be", "mâi-châi", ["falling", "falling"], true),
  from: makeWord("มาจาก", "come from", "maa-jàak", ["mid", "low"], true),
  named: makeWord("ชื่อ", "be named", "chʉ̂ʉ", ["falling"], true),
  not: makeWord("ไม่", "not", "mâi", ["falling"], true),
  q: makeWord("ไหม", "question particle", "mǎi", ["rising"], true),
  kha: makeWord("ค่ะ", "polite particle", "khâ", ["falling"], true),
  khrap: makeWord("ครับ", "polite particle", "khráp", ["high"], true),
  khaQ: makeWord("คะ", "polite particle", "khá", ["high"], true),
  thisPost: makeWord("นี้", "this", "níi", ["high"], true),
  thatPost: makeWord("นั้น", "that", "nán", ["high"], true),
  farPost: makeWord("โน่น", "that over there", "nôon", ["falling"], true),
  thisPron: makeWord("นี่", "this", "nîi", ["falling"], true),
  thatPron: makeWord("นั่น", "that", "nân", ["falling"], true),
  isWord: makeWord("คือ", "is", "kheuu", ["mid"], true),
  who: makeWord("ใคร", "who", "khrai", ["mid"], true),
  what: makeWord("อะไร", "what", "à-rai", ["low", "mid"], true),
  wherePhrase: makeWord("ที่ไหน", "where", "thîi-nǎi", ["falling", "rising"], true),
  where: makeWord("ไหน", "where", "nǎi", ["rising"], true),
  atHome: makeWord("ที่บ้าน", "at home", "thîi-bâan", ["falling", "falling"]),
  atShop: makeWord("ที่ร้าน", "at the shop", "thîi-ráan", ["falling", "high"]),
  atMarket: makeWord("ที่ตลาด", "at the market", "thîi-ta-làat", ["falling", "mid", "low"]),
  atRoom: makeWord("ที่ห้อง", "in the room", "thîi-hông", ["falling", "falling"]),
  here: makeWord("ที่นี่", "here", "thîi-nîi", ["falling", "falling"]),
  first: makeWord("ก่อน", "first", "gàwn", ["low"]),
  free: makeWord("ว่าง", "free", "wâang", ["falling"]),
  hungry: makeWord("หิว", "hungry", "hǐu", ["rising"]),
  good: makeWord("ดี", "good", "dii", ["mid"]),
  beautiful: makeWord("สวย", "beautiful", "sǔuai", ["rising"]),
  newAdj: makeWord("ใหม่", "new", "mài", ["falling"]),
  oldAdj: makeWord("เก่า", "old", "gào", ["low"]),
  big: makeWord("ใหญ่", "big", "yài", ["low"]),
  small: makeWord("เล็ก", "small", "lék", ["high"]),
  hot: makeWord("ร้อน", "hot", "rón", ["high"]),
  cold: makeWord("เย็น", "cold", "yen", ["mid"]),
  kind: makeWord("ใจดี", "kind", "jai-dii", ["mid", "mid"]),
  white: makeWord("ขาว", "white", "khǎao", ["rising"]),
  fast: makeWord("เร็ว", "fast", "reo", ["mid"]),
  closed: makeWord("ปิด", "closed", "bpìt", ["low"]),
  delicious: makeWord("อร่อย", "delicious", "à-ròi", ["low", "low"]),
  tall: makeWord("สูง", "tall", "sǔung", ["rising"]),
  clear: makeWord("ใส", "clear", "sǎi", ["rising"]),
  thailand: makeWord("ไทย", "Thailand", "thai", ["mid"]),
  china: makeWord("จีน", "China", "jiin", ["mid"]),
  japan: makeWord("ญี่ปุ่น", "Japan", "yîi-bpùn", ["falling", "low"]),
  america: makeWord("อเมริกา", "America", "a-mee-rí-gaa", ["mid", "mid", "high", "mid"]),
  india: makeWord("อินเดีย", "India", "in-dii-a", ["mid", "mid", "mid"]),
  min: makeWord("มิน", "Min", "mìn", ["low"]),
  beam: makeWord("บีม", "Beam", "biim", ["mid"]),
  ball: makeWord("บอล", "Ball", "bawn", ["mid"]),
  dao: makeWord("ดาว", "Dao", "daao", ["mid"]),
  june: makeWord("จูน", "June", "juun", ["mid"]),
};

function item(key) {
  const source = TOKENS[key];
  if (!source) {
    throw new Error(`Unknown token: ${key}`);
  }

  return JSON.parse(JSON.stringify(source));
}

function row(keys, english, difficulty = "easy") {
  const breakdown = keys.map((key) => item(key));
  return {
    thai: breakdown.map((entry) => entry.thai).join(""),
    romanization: breakdown.map((entry) => entry.romanization).join(" "),
    english,
    breakdown,
    difficulty,
  };
}

function subject(key, label, options = {}) {
  return {
    key,
    label,
    copula: options.copula ?? "is",
    doAux: options.doAux ?? "does",
    haveVerb: options.haveVerb ?? "has",
    thirdPerson: options.thirdPerson ?? true,
  };
}

function lowerFirst(value) {
  return value.length > 0 ? value[0].toLowerCase() + value.slice(1) : value;
}

function buildBank() {
  const banks = {};

  const svoSubjects = [
    subject("i", "I", { copula: "am", doAux: "do", haveVerb: "have", thirdPerson: false }),
    subject("you", "You", { copula: "are", doAux: "do", haveVerb: "have", thirdPerson: false }),
    subject("he", "He"),
    subject("she", "She"),
    subject("teacher", "The teacher"),
  ];
  const svoPredicates = [
    { keys: ["eat", "rice"], base: "eat rice", third: "eats rice" },
    { keys: ["drink", "water"], base: "drink water", third: "drinks water" },
    { keys: ["buy", "fish"], base: "buy fish", third: "buys fish" },
    { keys: ["read", "book"], base: "read a book", third: "reads a book" },
    { keys: ["watch", "movie"], base: "watch a movie", third: "watches a movie" },
  ];
  banks["svo"] = [];
  for (const entry of svoSubjects) {
    for (const predicate of svoPredicates) {
      banks["svo"].push(
        row(
          [entry.key, ...predicate.keys],
          `${entry.label} ${entry.thirdPerson ? predicate.third : predicate.base}.`,
        ),
      );
    }
  }

  const negativeSubjects = svoSubjects;
  const negativePredicates = [
    { keys: ["eat", "fish"], base: "eat fish" },
    { keys: ["drink", "coffee"], base: "drink coffee" },
    { keys: ["buy", "shirt"], base: "buy a shirt" },
    { keys: ["read", "book"], base: "read a book" },
    { keys: ["watch", "movie"], base: "watch a movie" },
  ];
  banks["negative-mai"] = [];
  for (const entry of negativeSubjects) {
    for (const predicate of negativePredicates) {
      banks["negative-mai"].push(
        row(
          [entry.key, "not", ...predicate.keys],
          `${entry.label} ${entry.doAux} not ${predicate.base}.`,
        ),
      );
    }
  }

  const questionSubjects = [
    ["you", "you"],
    ["he", "he"],
    ["she", "she"],
    ["dad", "dad"],
    ["mom", "mom"],
  ];
  const questionPredicates = [
    [["hungry"], "hungry"],
    [["free"], "free"],
    [["eat", "rice"], "eat rice"],
    [["drink", "tea"], "drink tea"],
    [["stay", "atHome"], "at home"],
  ];
  banks["question-mai"] = [];
  for (const [subjectKey, subjectEnglish] of questionSubjects) {
    const meta = subject(
      subjectKey,
      subjectEnglish === "you" ? "You" : subjectEnglish[0].toUpperCase() + subjectEnglish.slice(1),
      subjectEnglish === "you"
        ? { copula: "are", doAux: "do", haveVerb: "have", thirdPerson: false }
        : undefined,
    );
    for (const [predicateKeys, predicateEnglish] of questionPredicates) {
      const lowered = lowerFirst(meta.label);
      const verbLike =
        predicateKeys.length === 1 && ["hungry", "free"].includes(predicateKeys[0])
          ? `${meta.copula[0].toUpperCase()}${meta.copula.slice(1)} ${lowered} ${predicateEnglish}?`
          : `${meta.doAux[0].toUpperCase()}${meta.doAux.slice(1)} ${lowered} ${predicateEnglish === "at home" ? "stay at home" : predicateEnglish}?`;
      banks["question-mai"].push(row([subjectKey, ...predicateKeys, "q"], verbLike));
    }
  }

  const haveSubjects = [
    subject("i", "I", { copula: "am", doAux: "do", haveVerb: "have", thirdPerson: false }),
    subject("meM", "I", { copula: "am", doAux: "do", haveVerb: "have", thirdPerson: false }),
    subject("you", "You", { copula: "are", doAux: "do", haveVerb: "have", thirdPerson: false }),
    subject("he", "He"),
    subject("she", "She"),
  ];
  const haveObjects = [
    ["book", "a book"],
    ["penObj", "a pen"],
    ["car", "a car"],
    ["snack", "a snack"],
    ["shirt", "a shirt"],
  ];
  banks["have-mii"] = [];
  for (const entry of haveSubjects) {
    for (const [objectKey, objectEnglish] of haveObjects) {
      banks["have-mii"].push(
        row([entry.key, "have", objectKey], `${entry.label} ${entry.haveVerb} ${objectEnglish}.`),
      );
    }
  }

  banks["no-have-mai-mii"] = [];
  for (const entry of haveSubjects) {
    for (const [objectKey, objectEnglish] of haveObjects) {
      banks["no-have-mai-mii"].push(
        row(
          [entry.key, "notHave", objectKey],
          `${entry.label} ${entry.doAux} not have ${objectEnglish}.`,
        ),
      );
    }
  }

  const nameSubjects = [
    ["i", "My name is"],
    ["meM", "My name is"],
    ["he", "His name is"],
    ["she", "Her name is"],
    ["friend", "My friend's name is"],
  ];
  const names = [
    ["min", "Min"],
    ["beam", "Beam"],
    ["ball", "Ball"],
    ["dao", "Dao"],
    ["june", "June"],
  ];
  banks["name-chue"] = [];
  for (const [subjectKey, subjectEnglish] of nameSubjects) {
    for (const [nameKey, nameEnglish] of names) {
      banks["name-chue"].push(
        row([subjectKey, "named", nameKey], `${subjectEnglish} ${nameEnglish}.`),
      );
    }
  }

  const pronounSubjects = [
    subject("nuu", "I", { copula: "am", doAux: "do", haveVerb: "have", thirdPerson: false }),
    subject("meM", "I", { copula: "am", doAux: "do", haveVerb: "have", thirdPerson: false }),
    subject("pii", "I", { copula: "am", doAux: "do", haveVerb: "have", thirdPerson: false }),
    subject("nong", "My younger sibling"),
    subject("we", "We", { copula: "are", doAux: "do", haveVerb: "have", thirdPerson: false }),
  ];
  const pronounPredicates = [
    { keys: ["eat", "rice"], base: "eat rice", third: "eats rice" },
    { keys: ["drink", "water"], base: "drink water", third: "drinks water" },
    { keys: ["go", "atMarket"], base: "go to the market", third: "goes to the market" },
    { keys: ["stay", "atHome"], base: "stay at home", third: "stays at home" },
    { keys: ["read", "book"], base: "read a book", third: "reads a book" },
  ];
  banks["natural-address-pronouns"] = [];
  for (const entry of pronounSubjects) {
    for (const predicate of pronounPredicates) {
      banks["natural-address-pronouns"].push(
        row(
          [entry.key, ...predicate.keys],
          `${entry.label} ${entry.thirdPerson ? predicate.third : predicate.base}.`,
        ),
      );
    }
  }

  const locationSubjects = haveSubjects;
  const locations = [
    ["atHome", "at home"],
    ["atShop", "at the shop"],
    ["atMarket", "at the market"],
    ["atRoom", "in the room"],
    ["here", "here"],
  ];
  banks["location-yuu"] = [];
  for (const entry of locationSubjects) {
    for (const [locationKey, locationEnglish] of locations) {
      banks["location-yuu"].push(
        row([entry.key, "stay", locationKey], `${entry.label} ${entry.copula} ${locationEnglish}.`),
      );
    }
  }

  const originSubjects = haveSubjects;
  const origins = [
    ["thailand", "Thailand"],
    ["china", "China"],
    ["japan", "Japan"],
    ["america", "America"],
    ["india", "India"],
  ];
  banks["origin-maa-jaak"] = [];
  for (const entry of originSubjects) {
    for (const [originKey, originEnglish] of origins) {
      banks["origin-maa-jaak"].push(
        row([entry.key, "from", originKey], `${entry.label} ${entry.copula} from ${originEnglish}.`),
      );
    }
  }

  banks["polite-particles"] = [
    row(["meM", "eat", "rice", "khrap"], "I eat rice. (male speaker)"),
    row(["meM", "drink", "water", "khrap"], "I drink water. (male speaker)"),
    row(["meM", "go", "first", "khrap"], "I will go first. (male speaker)"),
    row(["meM", "stay", "atHome", "khrap"], "I am at home. (male speaker)"),
    row(["meM", "free", "khrap"], "I am free. (male speaker)"),
    row(["meM", "hungry", "khrap"], "I am hungry. (male speaker)"),
    row(["you", "free", "q", "khaQ"], "Are you free? (female speaker)"),
    row(["you", "hungry", "q", "khaQ"], "Are you hungry? (female speaker)"),
    row(["you", "eat", "rice", "q", "khaQ"], "Do you eat rice? (female speaker)"),
    row(["you", "drink", "tea", "q", "khaQ"], "Do you drink tea? (female speaker)"),
    row(["i", "named", "min", "kha"], "My name is Min. (female speaker)"),
    row(["nuu", "hungry", "kha"], "I am hungry. (younger/female speaker)"),
    row(["pii", "stay", "here", "kha"], "I am here. (older/female speaker)"),
    row(["mom", "stay", "atHome", "kha"], "Mom is at home. (female speaker)"),
    row(["i", "read", "book", "kha"], "I read a book. (female speaker)"),
    row(["i", "go", "atMarket", "kha"], "I go to the market. (female speaker)"),
    row(["i", "like", "tea", "kha"], "I like tea. (female speaker)"),
    row(["he", "be", "teacher", "khrap"], "He is a teacher. (male speaker)"),
    row(["child", "stay", "atRoom", "kha"], "The child is in the room. (female speaker)"),
    row(["dad", "eat", "rice", "khrap"], "Dad eats rice. (male speaker)"),
    row(["mom", "drink", "water", "kha"], "Mom drinks water. (female speaker)"),
    row(["you", "read", "book", "q", "khaQ"], "Do you read books? (female speaker)"),
    row(["he", "come", "here", "khrap"], "He comes here. (male speaker)"),
    row(["i", "not", "eat", "fish", "kha"], "I do not eat fish. (female speaker)"),
    row(["meM", "like", "coffee", "khrap"], "I like coffee. (male speaker)"),
  ];

  banks["identity-pen"] = [
    row(["i", "be", "teacher"], "I am a teacher."),
    row(["meM", "be", "doctor"], "I am a doctor."),
    row(["you", "be", "student"], "You are a student."),
    row(["he", "be", "teacher"], "He is a teacher."),
    row(["she", "be", "doctor"], "She is a doctor."),
    row(["dad", "be", "teacher"], "Dad is a teacher."),
    row(["mom", "be", "doctor"], "Mom is a doctor."),
    row(["child", "be", "student"], "The child is a student."),
    row(["teacher", "be", "thaiPerson"], "The teacher is Thai."),
    row(["friend", "be", "student"], "My friend is a student."),
    row(["i", "be", "woman"], "I am a woman."),
    row(["meM", "be", "man"], "I am a man."),
    row(["you", "be", "thaiPerson"], "You are Thai."),
    row(["he", "be", "man"], "He is a man."),
    row(["she", "be", "woman"], "She is a woman."),
    row(["dad", "be", "man"], "Dad is a man."),
    row(["mom", "be", "woman"], "Mom is a woman."),
    row(["child", "be", "thaiPerson"], "The child is Thai."),
    row(["teacher", "be", "doctor"], "The teacher is a doctor."),
    row(["friend", "be", "thaiPerson"], "My friend is Thai."),
    row(["i", "be", "student"], "I am a student.", "medium"),
    row(["you", "be", "teacher"], "You are a teacher.", "medium"),
    row(["he", "be", "thaiPerson"], "He is Thai.", "medium"),
    row(["she", "be", "student"], "She is a student.", "medium"),
    row(["friend", "be", "teacher"], "My friend is a teacher.", "medium"),
  ];

  banks["adjectives"] = [
    row(["water", "cold"], "The water is cold."),
    row(["coffee", "hot"], "The coffee is hot."),
    row(["house", "big"], "The house is big."),
    row(["house", "small"], "The house is small."),
    row(["shirt", "beautiful"], "The shirt is beautiful."),
    row(["shirt", "newAdj"], "The shirt is new."),
    row(["car", "oldAdj"], "The car is old."),
    row(["room", "big"], "The room is big."),
    row(["shop", "small"], "The shop is small."),
    row(["fish", "big"], "The fish is big."),
    row(["food", "delicious"], "The food is delicious."),
    row(["child", "kind"], "The child is kind."),
    row(["teacher", "kind"], "The teacher is kind."),
    row(["rice", "hot"], "The rice is hot."),
    row(["water", "clear"], "The water is clear."),
    row(["car", "fast"], "The car is fast."),
    row(["shirt", "white"], "The shirt is white."),
    row(["house", "newAdj"], "The house is new."),
    row(["movie", "good"], "The movie is good."),
    row(["book", "good"], "The book is good."),
    row(["mom", "kind"], "Mom is kind.", "medium"),
    row(["dad", "tall"], "Dad is tall.", "medium"),
    row(["shop", "closed"], "The shop is closed.", "medium"),
    row(["room", "cold"], "The room is cool.", "medium"),
    row(["child", "hungry"], "The child is hungry.", "medium"),
  ];

  banks["question-words"] = [
    row(["who", "stay", "atHome"], "Who is at home?"),
    row(["who", "eat", "rice"], "Who eats rice?"),
    row(["who", "read", "book"], "Who reads a book?"),
    row(["who", "named", "min"], "Who is named Min?"),
    row(["you", "named", "what"], "What is your name?"),
    row(["he", "eat", "what"], "What does he eat?"),
    row(["she", "drink", "what"], "What does she drink?"),
    row(["mom", "buy", "what"], "What does Mom buy?"),
    row(["dad", "read", "what"], "What does Dad read?"),
    row(["you", "stay", "wherePhrase"], "Where are you?"),
    row(["dad", "stay", "wherePhrase"], "Where is Dad?"),
    row(["mom", "stay", "wherePhrase"], "Where is Mom?"),
    row(["teacher", "stay", "wherePhrase"], "Where is the teacher?"),
    row(["thisPron", "isWord", "what"], "What is this?"),
    row(["thatPron", "isWord", "what"], "What is that?"),
    row(["who", "be", "teacher"], "Who is a teacher?"),
    row(["who", "be", "doctor"], "Who is a doctor?"),
    row(["who", "from", "thailand"], "Who is from Thailand?"),
    row(["you", "from", "where"], "Where are you from?"),
    row(["he", "from", "where"], "Where is he from?"),
    row(["she", "buy", "what"], "What does she buy?"),
    row(["child", "play", "what"], "What does the child play?"),
    row(["friend", "watch", "what"], "What does your friend watch?"),
    row(["who", "stay", "here"], "Who is here?"),
    row(["who", "have", "book"], "Who has a book?"),
  ];

  banks["this-that"] = [
    row(["house", "thisPost", "big"], "This house is big."),
    row(["house", "thatPost", "small"], "That house is small."),
    row(["house", "farPost", "beautiful"], "That house over there is beautiful."),
    row(["shop", "thisPost", "closed"], "This shop is closed."),
    row(["shop", "thatPost", "big"], "That shop is big."),
    row(["shop", "farPost", "small"], "That shop over there is small."),
    row(["bowl", "thisPost", "have", "rice"], "This bowl has rice."),
    row(["bowl", "thatPost", "have", "water"], "That bowl has water."),
    row(["shirt", "thisPost", "newAdj"], "This shirt is new."),
    row(["shirt", "thatPost", "beautiful"], "That shirt is beautiful."),
    row(["car", "thisPost", "fast"], "This car is fast."),
    row(["car", "thatPost", "oldAdj"], "That car is old."),
    row(["book", "thisPost", "good"], "This book is good."),
    row(["book", "thatPost", "newAdj"], "That book is new."),
    row(["water", "thisPost", "cold"], "This water is cold."),
    row(["coffee", "thatPost", "hot"], "That coffee is hot."),
    row(["rice", "thisPost", "hot"], "This rice is hot."),
    row(["movie", "thatPost", "good"], "That movie is good."),
    row(["child", "thatPost", "kind"], "That child is kind."),
    row(["teacher", "farPost", "tall"], "That teacher over there is tall."),
    row(["thisPron", "isWord", "house"], "This is a house.", "medium"),
    row(["thatPron", "isWord", "shop"], "That is a shop.", "medium"),
    row(["thisPron", "notBe", "water"], "This is not water.", "medium"),
    row(["thatPron", "notBe", "tea"], "That is not tea.", "medium"),
    row(["bowl", "farPost", "have", "fish"], "That bowl over there has fish.", "medium"),
  ];

  banks["not-identity-mai-chai"] = [
    row(["thisPron", "notBe", "water"], "This is not water."),
    row(["thisPron", "notBe", "tea"], "This is not tea."),
    row(["thisPron", "notBe", "coffee"], "This is not coffee."),
    row(["thatPron", "notBe", "house"], "That is not a house."),
    row(["thatPron", "notBe", "shop"], "That is not a shop."),
    row(["i", "notBe", "teacher"], "I am not a teacher."),
    row(["meM", "notBe", "doctor"], "I am not a doctor."),
    row(["you", "notBe", "child"], "You are not a child."),
    row(["he", "notBe", "dad"], "He is not a dad."),
    row(["she", "notBe", "mom"], "She is not a mom."),
    row(["we", "notBe", "teacher"], "We are not teachers."),
    row(["dad", "notBe", "doctor"], "Dad is not a doctor."),
    row(["mom", "notBe", "teacher"], "Mom is not a teacher."),
    row(["child", "notBe", "teacher"], "The child is not a teacher."),
    row(["teacher", "notBe", "dad"], "The teacher is not a dad."),
    row(["friend", "notBe", "mom"], "My friend is not a mom."),
    row(["i", "notBe", "man"], "I am not a man.", "medium"),
    row(["meM", "notBe", "woman"], "I am not a woman.", "medium"),
    row(["you", "notBe", "thaiPerson"], "You are not Thai.", "medium"),
    row(["he", "notBe", "student"], "He is not a student.", "medium"),
    row(["she", "notBe", "teacher"], "She is not a teacher.", "medium"),
    row(["thisPron", "notBe", "fish"], "This is not fish.", "medium"),
    row(["thatPron", "notBe", "movie"], "That is not a movie.", "medium"),
    row(["thisPron", "notBe", "book"], "This is not a book.", "medium"),
    row(["thatPron", "notBe", "shirt"], "That is not a shirt.", "medium"),
  ];

  banks["go-come-pai-maa"] = [
    row(["i", "go", "atMarket"], "I go to the market."),
    row(["meM", "go", "atHome"], "I go home."),
    row(["you", "go", "atShop"], "You go to the shop."),
    row(["he", "go", "find", "dad"], "He goes to see Dad."),
    row(["she", "go", "find", "mom"], "She goes to see Mom."),
    row(["we", "go", "find", "teacher"], "We go to see the teacher."),
    row(["dad", "come", "atHome"], "Dad comes home."),
    row(["mom", "come", "atShop"], "Mom comes to the shop."),
    row(["child", "come", "atRoom"], "The child comes into the room."),
    row(["teacher", "come", "atMarket"], "The teacher comes to the market."),
    row(["friend", "go", "find", "nong"], "My friend goes to see the younger sibling."),
    row(["nuu", "go", "find", "pii"], "I go to see my older sibling."),
    row(["pii", "come", "here"], "I come here."),
    row(["nong", "come", "atHome"], "The younger sibling comes home."),
    row(["they", "go", "atMarket"], "They go to the market."),
    row(["i", "come", "atHome"], "I come home."),
    row(["meM", "come", "atShop"], "I come to the shop."),
    row(["you", "go", "atRoom"], "You go to the room."),
    row(["he", "come", "find", "friend"], "He comes to see a friend."),
    row(["she", "come", "find", "teacher"], "She comes to see the teacher."),
    row(["we", "go", "atShop"], "We go to the shop.", "medium"),
    row(["dad", "go", "atMarket"], "Dad goes to the market.", "medium"),
    row(["mom", "come", "here"], "Mom comes here.", "medium"),
    row(["child", "go", "find", "mom"], "The child goes to see Mom.", "medium"),
    row(["teacher", "come", "atRoom"], "The teacher comes into the room.", "medium"),
  ];

  return banks;
}

const BANKS = buildBank();

function assertBankSizes() {
  for (const grammarId of A11_GRAMMAR_IDS) {
    const rows = BANKS[grammarId];
    if (!rows) {
      throw new Error(`Missing bank for ${grammarId}`);
    }
    if (rows.length !== 25) {
      throw new Error(`Expected 25 rows for ${grammarId}, found ${rows.length}`);
    }
  }
}

async function main() {
  assertBankSizes();

  const result = await pool.query(
    `
    SELECT grammar_id, id, sort_order
    FROM grammar_examples
    WHERE grammar_id = ANY($1::text[])
    ORDER BY grammar_id ASC, sort_order ASC, id ASC
    `,
    [A11_GRAMMAR_IDS],
  );

  const idsByGrammar = new Map();
  for (const rowData of result.rows) {
    if (!idsByGrammar.has(rowData.grammar_id)) {
      idsByGrammar.set(rowData.grammar_id, []);
    }
    idsByGrammar.get(rowData.grammar_id).push(Number(rowData.id));
  }

  for (const grammarId of A11_GRAMMAR_IDS) {
    const ids = idsByGrammar.get(grammarId) ?? [];
    if (ids.length !== 25) {
      throw new Error(`Expected 25 stored rows for ${grammarId}, found ${ids.length}`);
    }

    const bank = BANKS[grammarId];
    for (let index = 0; index < bank.length; index += 1) {
      const sentence = bank[index];
      await pool.query(
        `
        UPDATE grammar_examples
        SET
          thai = $1,
          romanization = $2,
          english = $3,
          breakdown = $4::jsonb,
          difficulty = $5,
          tone_confidence = 100,
          tone_status = 'approved',
          review_status = 'approved',
          tone_analysis = $6::jsonb,
          review_note = $7,
          approved_at = COALESCE(approved_at, NOW()),
          last_edited_at = NOW()
        WHERE id = $8
        `,
        [
          sentence.thai,
          sentence.romanization,
          sentence.english,
          JSON.stringify(sentence.breakdown),
          sentence.difficulty,
          JSON.stringify({
            source: "manual-a11-full-curation",
            reviewedAt: REVIEW_DATE,
            reviewVersion: 1,
            grammarId,
          }),
          REVIEW_NOTE,
          ids[index],
        ],
      );
    }
  }

  console.log("Applied full manual A1.1 curation for all trimmed lessons.");
}

main()
  .catch((error) => {
    console.error("Failed to apply full manual A1.1 curation:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
