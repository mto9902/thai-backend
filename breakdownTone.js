const EXPLICIT_ROMAN_TONE_MARKS = new Map([
  ["\u0300", "low"],
  ["\u0301", "high"],
  ["\u0302", "falling"],
  ["\u030C", "rising"],
]);

const MID_CLASS_CONSONANTS = new Set(["ก", "จ", "ฎ", "ฏ", "ด", "ต", "บ", "ป", "อ"]);
const HIGH_CLASS_CONSONANTS = new Set([
  "ข",
  "ฉ",
  "ฐ",
  "ถ",
  "ผ",
  "ฝ",
  "ศ",
  "ษ",
  "ส",
  "ห",
]);
const LOW_CLASS_CONSONANTS = new Set([
  "ค",
  "ฅ",
  "ฆ",
  "ง",
  "ช",
  "ซ",
  "ฌ",
  "ญ",
  "ฑ",
  "ฒ",
  "ณ",
  "ท",
  "ธ",
  "น",
  "พ",
  "ฟ",
  "ภ",
  "ม",
  "ย",
  "ร",
  "ล",
  "ว",
  "ฬ",
  "ฮ",
]);
const HO_NAM_FOLLOWERS = new Set(["ง", "ญ", "ณ", "น", "ม", "ย", "ร", "ล", "ว"]);
const INITIAL_CLUSTER_SECONDS = new Set(["ร", "ล", "ว"]);
const THAI_CONSONANT_REGEX = /[ก-ฮ]/u;
const TONE_MARKS = ["่", "้", "๊", "๋"];
const LIVE_FINALS = new Set(["ง", "น", "ณ", "ญ", "ม", "ย", "ว", "ร", "ล", "ฬ"]);
const STOP_FINALS = new Set([
  "ก",
  "ข",
  "ค",
  "ฆ",
  "ด",
  "จ",
  "ช",
  "ซ",
  "ฎ",
  "ฏ",
  "ฐ",
  "ฑ",
  "ฒ",
  "ต",
  "ถ",
  "ท",
  "ธ",
  "ศ",
  "ษ",
  "ส",
  "บ",
  "ป",
  "พ",
  "ภ",
  "ฟ",
]);
const TRAILING_NON_CONSONANTS = new Set([
  "่",
  "้",
  "๊",
  "๋",
  "็",
  "์",
  "ํ",
  "ะ",
  "ั",
  "า",
  "ำ",
  "ิ",
  "ี",
  "ึ",
  "ื",
  "ุ",
  "ู",
  "เ",
  "แ",
  "โ",
  "ใ",
  "ไ",
]);
const SHORT_VOWEL_PATTERNS = [
  /ะ/u,
  /ั/u,
  /ิ/u,
  /ึ/u,
  /ุ/u,
  /็/u,
  /เ[ก-ฮ]+ะ/u,
  /แ[ก-ฮ]+ะ/u,
  /โ[ก-ฮ]+ะ/u,
  /เ[ก-ฮ]+าะ/u,
  /เ[ก-ฮ]+อะ/u,
  /เ[ก-ฮ]+ียะ/u,
  /เ[ก-ฮ]+ือะ/u,
  /[ก-ฮ]+ัวะ/u,
  /ฤ/u,
];
const LONG_VOWEL_HINTS = [
  /า/u,
  /ี/u,
  /ื/u,
  /ู/u,
  /ๅ/u,
  /ำ/u,
  /อ[ก-ฮ]$/u,
  /เ/u,
  /แ/u,
  /โ/u,
  /ใ/u,
  /ไ/u,
  /ัว/u,
  /เ[ก-ฮ]+ีย/u,
  /เ[ก-ฮ]+ือ/u,
];

function splitRomanizedSyllables(romanization) {
  return romanization
    .trim()
    .split(/[\s/-]+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function getExplicitToneFromRomanizedSyllable(syllable) {
  const normalized = syllable.normalize("NFD");
  const matchedTones = [];

  for (const [mark, tone] of EXPLICIT_ROMAN_TONE_MARKS.entries()) {
    if (normalized.includes(mark)) {
      matchedTones.push(tone);
    }
  }

  if (matchedTones.length !== 1) {
    return undefined;
  }

  return matchedTones[0];
}

function countExplicitRomanToneMarks(syllable) {
  const normalized = syllable.normalize("NFD");
  let count = 0;

  for (const mark of EXPLICIT_ROMAN_TONE_MARKS.keys()) {
    if (normalized.includes(mark)) {
      count += 1;
    }
  }

  return count;
}

function getThaiConsonants(word) {
  return Array.from(word)
    .map((char, index) => ({ char, index }))
    .filter(({ char }) => THAI_CONSONANT_REGEX.test(char));
}

function stripSilentMarkers(word) {
  return word.replace(/[ก-ฮ]์/gu, "").replace(/์/gu, "");
}

function stripToneMarks(word) {
  return word.replace(/[่้๊๋]/gu, "");
}

function getToneMark(word) {
  return TONE_MARKS.find((mark) => word.includes(mark));
}

function getConsonantClass(consonant) {
  if (MID_CLASS_CONSONANTS.has(consonant)) {
    return "mid";
  }

  if (HIGH_CLASS_CONSONANTS.has(consonant)) {
    return "high";
  }

  if (LOW_CLASS_CONSONANTS.has(consonant)) {
    return "low";
  }

  return undefined;
}

function getEffectiveInitialClass(word) {
  const consonants = getThaiConsonants(word);
  if (consonants.length === 0) {
    return undefined;
  }

  const [first, second] = consonants;
  const baseClass = getConsonantClass(first.char);

  if (
    first.char === "ห" &&
    second &&
    second.index === first.index + 1 &&
    HO_NAM_FOLLOWERS.has(second.char)
  ) {
    return "high";
  }

  return baseClass;
}

function getFinalConsonant(word) {
  const consonants = getThaiConsonants(word);
  if (consonants.length <= 1) {
    return undefined;
  }

  const [first, second] = consonants;
  if (
    consonants.length === 2 &&
    second.index === first.index + 1 &&
    (INITIAL_CLUSTER_SECONDS.has(second.char) ||
      (first.char === "ห" && HO_NAM_FOLLOWERS.has(second.char)))
  ) {
    return undefined;
  }

  const chars = Array.from(word);

  for (let index = chars.length - 1; index >= 0; index -= 1) {
    const char = chars[index];

    if (THAI_CONSONANT_REGEX.test(char)) {
      return char;
    }

    if (!TRAILING_NON_CONSONANTS.has(char)) {
      return undefined;
    }
  }

  return undefined;
}

function isShortVowel(word, hasFinalConsonant) {
  if (SHORT_VOWEL_PATTERNS.some((pattern) => pattern.test(word))) {
    return true;
  }

  if (LONG_VOWEL_HINTS.some((pattern) => pattern.test(word))) {
    return false;
  }

  return hasFinalConsonant;
}

function getSyllableType(word) {
  if (word.endsWith("ำ")) {
    return "live";
  }

  const finalConsonant = getFinalConsonant(word);
  if (finalConsonant) {
    if (LIVE_FINALS.has(finalConsonant)) {
      return "live";
    }

    if (STOP_FINALS.has(finalConsonant)) {
      return "dead";
    }
  }

  return isShortVowel(word, Boolean(finalConsonant)) ? "dead" : "live";
}

function calculateThaiToneFromSpelling(thai, romanization) {
  const normalizedRomanization =
    typeof romanization === "string" ? romanization.trim() : "";

  if (normalizedRomanization) {
    const romanSyllables = splitRomanizedSyllables(normalizedRomanization);
    if (romanSyllables.length !== 1) {
      return undefined;
    }

    if (countExplicitRomanToneMarks(romanSyllables[0]) > 1) {
      return undefined;
    }
  }

  if (/[\s/]/u.test(thai)) {
    return undefined;
  }

  const stripped = stripToneMarks(stripSilentMarkers(thai));
  const toneMark = getToneMark(thai);
  const initialClass = getEffectiveInitialClass(stripped);
  if (!initialClass) {
    return undefined;
  }

  const finalConsonant = getFinalConsonant(stripped);
  const shortDead =
    getSyllableType(stripped) === "dead" &&
    isShortVowel(stripped, Boolean(finalConsonant));

  if (toneMark === "่") {
    return initialClass === "low" ? "falling" : "low";
  }

  if (toneMark === "้") {
    return initialClass === "low" ? "high" : "falling";
  }

  if (toneMark === "๊") {
    return initialClass === "mid" ? "high" : undefined;
  }

  if (toneMark === "๋") {
    return initialClass === "mid" ? "rising" : undefined;
  }

  if (initialClass === "mid") {
    return getSyllableType(stripped) === "live" ? "mid" : "low";
  }

  if (initialClass === "high") {
    return getSyllableType(stripped) === "live" ? "rising" : "low";
  }

  if (initialClass === "low") {
    if (getSyllableType(stripped) === "live") {
      return "mid";
    }

    return shortDead ? "high" : "falling";
  }

  return undefined;
}

function getRomanizationConsensusTone(romanization) {
  const syllables = splitRomanizedSyllables(romanization);
  if (syllables.length === 0) {
    return undefined;
  }

  if (syllables.length === 1) {
    return getExplicitToneFromRomanizedSyllable(syllables[0]);
  }

  const explicitTones = syllables.map(getExplicitToneFromRomanizedSyllable);
  if (explicitTones.every(Boolean)) {
    const uniqueTones = new Set(explicitTones);
    if (uniqueTones.size === 1) {
      return explicitTones[0];
    }
  }

  return undefined;
}

function getExplicitTonesFromRomanization(romanization) {
  const syllables = splitRomanizedSyllables(romanization);
  if (syllables.length === 0) {
    return [];
  }

  const explicitTones = syllables.map(getExplicitToneFromRomanizedSyllable);
  if (explicitTones.every(Boolean)) {
    return explicitTones;
  }

  return [];
}

export function resolveBreakdownTones({ thai, romanization }) {
  const normalizedThai = typeof thai === "string" ? thai.trim() : "";
  const normalizedRomanization =
    typeof romanization === "string" ? romanization.trim() : "";

  if (!normalizedThai) {
    return [];
  }

  const thaiTone = calculateThaiToneFromSpelling(
    normalizedThai,
    normalizedRomanization,
  );
  if (thaiTone) {
    return [thaiTone];
  }

  if (normalizedRomanization) {
    const explicitRomanizationTones =
      getExplicitTonesFromRomanization(normalizedRomanization);
    if (explicitRomanizationTones.length > 0) {
      return explicitRomanizationTones;
    }

    const consensusTone = getRomanizationConsensusTone(normalizedRomanization);
    if (consensusTone) {
      return [consensusTone];
    }
  }

  return [];
}

export function resolveBreakdownTone(args) {
  return resolveBreakdownTones(args)[0];
}
