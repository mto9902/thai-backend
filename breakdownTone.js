const EXPLICIT_ROMAN_TONE_MARKS = new Map([
  ["\u0300", "low"],
  ["\u0301", "high"],
  ["\u0302", "falling"],
  ["\u030C", "rising"],
]);

const MID_CLASS_CONSONANTS = new Set([
  "\u0E01",
  "\u0E08",
  "\u0E0E",
  "\u0E0F",
  "\u0E14",
  "\u0E15",
  "\u0E1A",
  "\u0E1B",
  "\u0E2D",
]);
const HIGH_CLASS_CONSONANTS = new Set([
  "\u0E02",
  "\u0E09",
  "\u0E10",
  "\u0E16",
  "\u0E1C",
  "\u0E1D",
  "\u0E28",
  "\u0E29",
  "\u0E2A",
  "\u0E2B",
]);
const LOW_CLASS_CONSONANTS = new Set([
  "\u0E04",
  "\u0E05",
  "\u0E06",
  "\u0E07",
  "\u0E0A",
  "\u0E0B",
  "\u0E0C",
  "\u0E0D",
  "\u0E11",
  "\u0E12",
  "\u0E13",
  "\u0E17",
  "\u0E18",
  "\u0E19",
  "\u0E1E",
  "\u0E1F",
  "\u0E20",
  "\u0E21",
  "\u0E22",
  "\u0E23",
  "\u0E25",
  "\u0E27",
  "\u0E2C",
  "\u0E2E",
]);
const HO_NAM_FOLLOWERS = new Set([
  "\u0E07",
  "\u0E0D",
  "\u0E13",
  "\u0E19",
  "\u0E21",
  "\u0E22",
  "\u0E23",
  "\u0E25",
  "\u0E27",
]);
const INITIAL_CLUSTER_SECONDS = new Set(["\u0E23", "\u0E25", "\u0E27"]);
const THAI_CONSONANT_REGEX = /[\u0E01-\u0E2E]/u;
const TONE_MARKS = ["\u0E48", "\u0E49", "\u0E4A", "\u0E4B"];
const LIVE_FINALS = new Set([
  "\u0E07",
  "\u0E19",
  "\u0E13",
  "\u0E0D",
  "\u0E21",
  "\u0E22",
  "\u0E27",
  "\u0E23",
  "\u0E25",
  "\u0E2C",
]);
const STOP_FINALS = new Set([
  "\u0E01",
  "\u0E02",
  "\u0E04",
  "\u0E06",
  "\u0E14",
  "\u0E08",
  "\u0E0A",
  "\u0E0B",
  "\u0E0E",
  "\u0E0F",
  "\u0E10",
  "\u0E11",
  "\u0E12",
  "\u0E15",
  "\u0E16",
  "\u0E17",
  "\u0E18",
  "\u0E28",
  "\u0E29",
  "\u0E2A",
  "\u0E1A",
  "\u0E1B",
  "\u0E1E",
  "\u0E20",
  "\u0E1F",
]);
const TRAILING_NON_CONSONANTS = new Set([
  "\u0E48",
  "\u0E49",
  "\u0E4A",
  "\u0E4B",
  "\u0E47",
  "\u0E4C",
  "\u0E4D",
  "\u0E30",
  "\u0E31",
  "\u0E32",
  "\u0E33",
  "\u0E34",
  "\u0E35",
  "\u0E36",
  "\u0E37",
  "\u0E38",
  "\u0E39",
  "\u0E40",
  "\u0E41",
  "\u0E42",
  "\u0E43",
  "\u0E44",
]);
const SHORT_VOWEL_PATTERNS = [
  /\u0E30/u,
  /\u0E31/u,
  /\u0E34/u,
  /\u0E36/u,
  /\u0E38/u,
  /\u0E47/u,
  /\u0E40[\u0E01-\u0E2E]+\u0E30/u,
  /\u0E41[\u0E01-\u0E2E]+\u0E30/u,
  /\u0E42[\u0E01-\u0E2E]+\u0E30/u,
  /\u0E40[\u0E01-\u0E2E]+\u0E32\u0E30/u,
  /\u0E40[\u0E01-\u0E2E]+\u0E2D\u0E30/u,
  /\u0E40[\u0E01-\u0E2E]+\u0E35\u0E22\u0E30/u,
  /\u0E40[\u0E01-\u0E2E]+\u0E37\u0E2D\u0E30/u,
  /[\u0E01-\u0E2E]+\u0E31\u0E27\u0E30/u,
  /\u0E24/u,
];
const LONG_VOWEL_HINTS = [
  /\u0E32/u,
  /\u0E35/u,
  /\u0E37/u,
  /\u0E39/u,
  /\u0E46/u,
  /\u0E33/u,
  /\u0E2D[\u0E01-\u0E2E]$/u,
  /\u0E40/u,
  /\u0E41/u,
  /\u0E42/u,
  /\u0E43/u,
  /\u0E44/u,
  /\u0E31\u0E27/u,
  /\u0E40[\u0E01-\u0E2E]+\u0E35\u0E22/u,
  /\u0E40[\u0E01-\u0E2E]+\u0E37\u0E2D/u,
];
const THAI_VOWELS = [
  "\u0E30",
  "\u0E31",
  "\u0E32",
  "\u0E34",
  "\u0E35",
  "\u0E36",
  "\u0E37",
  "\u0E38",
  "\u0E39",
  "\u0E40",
  "\u0E41",
  "\u0E42",
  "\u0E43",
  "\u0E44",
  "\u0E33",
  "\u0E24",
  "\u0E26",
  "\u0E45",
];
const LEADING_VOWELS = new Set([
  "\u0E40",
  "\u0E41",
  "\u0E42",
  "\u0E43",
  "\u0E44",
]);
const DEPENDENT_VOWELS = new Set([
  "\u0E30",
  "\u0E31",
  "\u0E32",
  "\u0E33",
  "\u0E34",
  "\u0E35",
  "\u0E36",
  "\u0E37",
  "\u0E38",
  "\u0E39",
  "\u0E24",
  "\u0E26",
  "\u0E45",
]);
const TRUE_INITIAL_CLUSTER_FIRSTS = {
  "\u0E23": new Set(["\u0E01", "\u0E02", "\u0E04", "\u0E15", "\u0E1B", "\u0E1E"]),
  "\u0E25": new Set(["\u0E01", "\u0E02", "\u0E04", "\u0E1B", "\u0E1E", "\u0E1F"]),
  "\u0E27": new Set(["\u0E01", "\u0E02", "\u0E04"]),
};

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

function countThaiSyllables(word) {
  const chars = Array.from(stripToneMarks(stripSilentMarkers(word)));
  let count = 0;

  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];

    if (LEADING_VOWELS.has(char)) {
      count += 1;
      continue;
    }

    if (DEPENDENT_VOWELS.has(char)) {
      const previous = chars[index - 1];
      if (!previous || !LEADING_VOWELS.has(previous)) {
        count += 1;
      }
    }
  }

  return count;
}

function isValidTrueInitialCluster(first, second) {
  return Boolean(
    TRUE_INITIAL_CLUSTER_FIRSTS[second] &&
      TRUE_INITIAL_CLUSTER_FIRSTS[second].has(first),
  );
}

function isConservativeSingleSyllableCandidate(word) {
  if (!word || /[\s/]/u.test(word) || word.includes("\u0E4C")) {
    return false;
  }

  const stripped = stripToneMarks(stripSilentMarkers(word));
  const consonants = getThaiConsonants(stripped);
  if (consonants.length === 0) {
    return false;
  }

  if (countThaiSyllables(word) !== 1) {
    return false;
  }

  if (consonants.length >= 4) {
    return false;
  }

  if (consonants.length === 3) {
    const [first, second] = consonants;
    if (!second || second.index !== first.index + 1) {
      return false;
    }

    const hasHoNamLead =
      first.char === "\u0E2B" && HO_NAM_FOLLOWERS.has(second.char);
    if (!hasHoNamLead && !isValidTrueInitialCluster(first.char, second.char)) {
      return false;
    }
  }

  return true;
}

function getThaiConsonants(word) {
  return Array.from(word)
    .map((char, index) => ({ char, index }))
    .filter(({ char }) => THAI_CONSONANT_REGEX.test(char));
}

function stripSilentMarkers(word) {
  return word.replace(/[\u0E01-\u0E2E]\u0E4C/gu, "").replace(/\u0E4C/gu, "");
}

function stripToneMarks(word) {
  return word.replace(/[\u0E48\u0E49\u0E4A\u0E4B]/gu, "");
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
    first.char === "\u0E2B" &&
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
      (first.char === "\u0E2B" && HO_NAM_FOLLOWERS.has(second.char)))
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
  if (word.endsWith("\u0E33")) {
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

  if (toneMark === "\u0E48") {
    return initialClass === "low" ? "falling" : "low";
  }

  if (toneMark === "\u0E49") {
    return initialClass === "low" ? "high" : "falling";
  }

  if (toneMark === "\u0E4A") {
    return initialClass === "mid" ? "high" : undefined;
  }

  if (toneMark === "\u0E4B") {
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

function normalizeProvidedTones(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((tone) => typeof tone === "string" && tone.trim().length > 0);
}

export function analyzeBreakdownTones({
  thai,
  romanization,
  providedTones,
  overrideTones,
}) {
  const normalizedThai = typeof thai === "string" ? thai.trim() : "";
  const normalizedRomanization =
    typeof romanization === "string" ? romanization.trim() : "";
  const normalizedProvidedTones = normalizeProvidedTones(providedTones);
  const normalizedOverrideTones = normalizeProvidedTones(overrideTones);
  const syllableCount = countThaiSyllables(normalizedThai);

  if (normalizedOverrideTones.length > 0) {
    return {
      tones: normalizedOverrideTones,
      confidence: 100,
      status: "approved",
      source: "override",
      needsReview: false,
      reasons: [],
      syllableCount,
    };
  }

  if (normalizedProvidedTones.length > 0) {
    return {
      tones: normalizedProvidedTones,
      confidence: 100,
      status: "approved",
      source: "manual",
      needsReview: false,
      reasons: [],
      syllableCount,
    };
  }

  if (!normalizedThai) {
    return {
      tones: [],
      confidence: 0,
      status: "review",
      source: "missing",
      needsReview: true,
      reasons: ["Missing Thai text"],
      syllableCount: 0,
    };
  }

  if (syllableCount === 1 && isConservativeSingleSyllableCandidate(normalizedThai)) {
    const thaiTone = calculateThaiToneFromSpelling(
      normalizedThai,
      normalizedRomanization,
    );
    if (thaiTone) {
      return {
        tones: [thaiTone],
        confidence: 99,
        status: "approved",
        source: "thai-spelling",
        needsReview: false,
        reasons: [],
        syllableCount,
      };
    }
  }

  if (normalizedRomanization) {
    const explicitRomanizationTones =
      getExplicitTonesFromRomanization(normalizedRomanization);
    if (explicitRomanizationTones.length > 0) {
      return {
        tones: explicitRomanizationTones,
        confidence: explicitRomanizationTones.length === 1 ? 97 : 96,
        status: "review",
        source:
          explicitRomanizationTones.length === 1
            ? "romanization-explicit"
            : "romanization-explicit-multi",
        needsReview: true,
        reasons: [
          explicitRomanizationTones.length === 1
            ? "Tone comes from marked romanization and needs review"
            : "Multi-syllable tone comes from marked romanization and needs review",
        ],
        syllableCount,
      };
    }

    const consensusTone = getRomanizationConsensusTone(normalizedRomanization);
    if (consensusTone) {
      return {
        tones: [consensusTone],
        confidence: 90,
        status: "review",
        source: "romanization-consensus",
        needsReview: true,
        reasons: ["Tone is inferred from romanization consensus and needs review"],
        syllableCount,
      };
    }
  }

  return {
    tones: [],
    confidence: 0,
    status: "review",
    source: "unresolved",
    needsReview: true,
    reasons: [
      syllableCount > 1
        ? "Multi-syllable word needs manual tone review"
        : "No reliable tone derivation",
    ],
    syllableCount,
  };
}

export function resolveBreakdownTones(args) {
  return analyzeBreakdownTones(args).tones;
}

export function resolveBreakdownTone(args) {
  return resolveBreakdownTones(args)[0];
}
