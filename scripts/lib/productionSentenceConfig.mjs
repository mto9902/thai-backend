import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..", "..");
const FRONTEND_ROOT = path.resolve(SERVER_ROOT, "..", "thaiApp-2");
const FRONTEND_GRAMMAR_FILE = path.join(FRONTEND_ROOT, "src", "data", "grammar.ts");
const FRONTEND_GRAMMAR_B2_FILE = path.join(
  FRONTEND_ROOT,
  "src",
  "data",
  "grammarB2.ts",
);
const FRONTEND_GRAMMAR_STAGES_FILE = path.join(
  FRONTEND_ROOT,
  "src",
  "data",
  "grammarStages.ts",
);

export const DEFAULT_FIRST_PASS_CANDIDATE_TARGET = 40;
export const DEFAULT_SUPPLEMENTAL_BATCH_SIZE = 10;
export const DEFAULT_FINAL_APPROVED_TARGET = 25;
export const PRODUCTION_SCOPE_STAGES = [
  "A1.2",
  "A2.1",
  "A2.2",
  "B1.1",
  "B1.2",
  "B2.1",
  "B2.2",
  "C1",
];

const STAGE_BRIEFS = {
  "A1.2": {
    progression: "Immediate daily life, requests, quantity, time, movement, and practical beginner interaction.",
    allowedScope: [
      "Use only this lesson plus already-taught A1 grammar.",
      "Keep situations practical, concrete, and beginner-safe.",
      "Favor short spoken Thai that a learner could hear in real life within the first months of study.",
    ],
    diversityRules: [
      "Keep at least five distinct everyday situations in the final lesson set.",
      "Do not overuse the same subject or object across the batch.",
      "Vary home, café, shopping, transport, schedule, and service interactions.",
    ],
    vocabularyGuardrails: {
      focus: [
        "food and drink orders",
        "family and personal belongings",
        "classroom and workplace basics",
        "shopping, payment, and quantity",
        "time, movement, and daily plans",
      ],
      avoidOveruse: ["coffee", "tea", "rice", "water", "book", "movie"],
    },
    realLifeSituations: [
      "ordering food or drinks",
      "asking where something is",
      "planning today or tomorrow",
      "asking the price or quantity",
      "simple requests and permissions",
      "going somewhere or inviting someone",
    ],
    commonTraps: [
      "Do not drift into A2 narration or more complex clause chaining.",
      "Do not make every sentence about eating or drinking.",
    ],
  },
  "A2.1": {
    progression: "Routine narration, sequence, completion, frequency, familiarity, and beginner storytelling.",
    allowedScope: [
      "Use only this lesson plus current or earlier A-level grammar.",
      "Keep meaning grounded in routines, recent events, and familiar experiences.",
      "Prefer realistic narration over abstract commentary.",
    ],
    diversityRules: [
      "Cover routines, travel, errands, school/work, and social plans across the set.",
      "Do not let one habit verb dominate the lesson.",
      "Use both spoken updates and simple story-like sentences.",
    ],
    vocabularyGuardrails: {
      focus: [
        "daily routines and habits",
        "recent actions and small updates",
        "familiar places and people",
        "basic skills and preferences",
        "simple sequencing of events",
      ],
      avoidOveruse: ["go", "eat", "drink", "buy", "work"],
    },
    realLifeSituations: [
      "talking about what happened today",
      "describing routine habits",
      "saying how often something happens",
      "telling someone what you just did",
      "explaining simple likes or skills",
    ],
    commonTraps: [
      "Do not slip into B-level explanation or opinion writing.",
      "Do not sound like a word list disguised as sentences.",
    ],
  },
  "A2.2": {
    progression: "Comparison, advice, feelings, result, and more flexible clause building.",
    allowedScope: [
      "Use only this lesson plus earlier A-level grammar unless the lesson itself justifies a bridge pattern.",
      "Keep sentences natural and practical rather than literary.",
      "Allow slightly longer clauses, but keep them teachable.",
    ],
    diversityRules: [
      "Mix personal life, study, work, travel, health, and social situations.",
      "Avoid repetitive self-talk patterns like 'I feel...' on every row.",
      "Use contrast and result naturally, not mechanically.",
    ],
    vocabularyGuardrails: {
      focus: [
        "advice and obligation",
        "comparison and preference",
        "feelings and reactions",
        "cause, result, and purpose",
        "simple conditionals and change of state",
      ],
      avoidOveruse: ["good", "bad", "happy", "tired", "want"],
    },
    realLifeSituations: [
      "giving advice to a friend",
      "comparing options or choices",
      "describing how someone feels",
      "talking about trying something new",
      "explaining a result or outcome",
    ],
    commonTraps: [
      "Do not let the Thai sound like translated English advice slogans.",
      "Avoid overly abstract moral statements.",
    ],
  },
  "B1.1": {
    progression: "Connected explanation, sequence, reasons, and natural linking of ideas.",
    allowedScope: [
      "Use B1 spoken and written Thai that still feels everyday and accessible.",
      "Prefer clear connected discourse over isolated sentence fragments.",
      "Let the grammar point shape the sentence, not the other way around.",
    ],
    diversityRules: [
      "Balance home, work, study, travel, relationships, and personal reflection.",
      "Use multiple discourse shapes: explanation, sequence, comparison, and stance.",
      "Avoid recycling the same cause-and-effect scenario.",
    ],
    vocabularyGuardrails: {
      focus: [
        "linked actions and routines",
        "reasons and consequences",
        "preferences and judgments",
        "conversation about plans and decisions",
        "mid-level descriptive situations",
      ],
      avoidOveruse: ["because", "so", "very", "go", "do"],
    },
    realLifeSituations: [
      "explaining why something happened",
      "describing a decision or preference",
      "retelling connected events",
      "comparing what feels better or more useful",
      "linking ideas in a longer response",
    ],
    commonTraps: [
      "Do not collapse back into A-level micro-sentences.",
      "Do not make every row sound like essay Thai.",
    ],
  },
  "B1.2": {
    progression: "Opinions, contrast, stance, negation nuance, and more developed description.",
    allowedScope: [
      "Use clear B1 Thai that can carry opinion and viewpoint naturally.",
      "Allow connected reasoning, but stay short enough for targeted lesson practice.",
      "Use the target grammar in sentences that feel actually sayable.",
    ],
    diversityRules: [
      "Include personal views, practical decisions, social situations, and descriptive commentary.",
      "Avoid reusing the same debate-style structure across the set.",
      "Let contrast and stance feel spoken, not textbook-argumentative.",
    ],
    vocabularyGuardrails: {
      focus: [
        "opinions and reactions",
        "comparison and contrast",
        "plans, decisions, and alternatives",
        "describing qualities and tendencies",
        "connected social or workplace situations",
      ],
      avoidOveruse: ["think", "like", "want", "good", "bad"],
    },
    realLifeSituations: [
      "explaining a preference with reasons",
      "correcting or clarifying a misunderstanding",
      "describing a person's tendency or intention",
      "contrasting two options",
      "explaining what depends on what",
    ],
    commonTraps: [
      "Avoid direct translations of English argumentative patterns.",
      "Do not let abstract words replace concrete, natural contexts.",
    ],
  },
  "B2.1": {
    progression: "Nuance, modality, serial verbs, aspect, and stronger conversational control.",
    allowedScope: [
      "Use naturally fluent B2 Thai, but keep each sentence anchored in a recognisable real-life situation.",
      "Allow richer event structure, modality, and discourse control.",
      "Keep the target pattern clearly visible and teachable.",
    ],
    diversityRules: [
      "Use a broad mix of work, logistics, social life, planning, and problem-solving.",
      "Avoid repetitive polite-service scenarios and overused food examples.",
      "Let different rows showcase different speech intents: explanation, warning, assumption, process, evaluation.",
    ],
    vocabularyGuardrails: {
      focus: [
        "movement and serial verb situations",
        "planning and logistics",
        "professional and social communication",
        "probability, obligation, and evaluation",
        "comparative and proportional statements",
      ],
      avoidOveruse: ["coffee", "book", "go", "eat", "watch"],
    },
    realLifeSituations: [
      "navigating places and movement",
      "predicting or assuming what will happen",
      "weighing what is worth doing",
      "explaining how two factors relate",
      "describing unintended or gradual change",
    ],
    commonTraps: [
      "Do not produce literary Thai just to sound advanced.",
      "Do not let modality rows become generic business clichés.",
    ],
  },
  "B2.2": {
    progression: "Advanced discourse, register control, focus, stance particles, and complex clause framing.",
    allowedScope: [
      "Use natural B2 Thai that can sound spoken, editorial, or formal depending on the lesson.",
      "Allow discourse framing and nuanced sentence endings when appropriate.",
      "Keep the target form central and recognisable.",
    ],
    diversityRules: [
      "Spread the set across conversation, explanation, workplace, media, and semi-formal writing.",
      "Avoid filling the lesson with near-duplicate discourse markers wrapped around the same message.",
      "Use a variety of communicative goals: clarification, concession, emphasis, complaint, framing, and evaluation.",
    ],
    vocabularyGuardrails: {
      focus: [
        "register-sensitive connectors",
        "discourse framing and focus",
        "advanced spoken particles",
        "comparison of alternatives",
        "formal and semi-formal explanation",
      ],
      avoidOveruse: ["really", "very", "just", "thing", "problem"],
    },
    realLifeSituations: [
      "clarifying what a speaker actually means",
      "framing a more formal explanation",
      "adding nuanced contrast or concession",
      "commenting on expectations or outcomes",
      "shifting topic or emphasis in a natural way",
    ],
    commonTraps: [
      "Do not make every row sound like a written article lead.",
      "Do not use ornate phrasing that native speakers would not say.",
    ],
  },
  C1: {
    progression: "Inference, concession, framing, clarification, evaluation, and strong formal or nuanced control.",
    allowedScope: [
      "Use precise, natural Thai at C1 level with strong control of nuance and register.",
      "Allow formal written or spoken Thai when the lesson needs it, but keep the sentence useful and credible.",
      "Make the grammar point central rather than decorative.",
    ],
    diversityRules: [
      "Use a wide range of domains: policy, workplace, analysis, public language, and thoughtful everyday reflection.",
      "Avoid repeating the same opinion-register frame across multiple lessons.",
      "Mix formal, semi-formal, and high-register spoken contexts when appropriate.",
    ],
    vocabularyGuardrails: {
      focus: [
        "evaluation and inference",
        "formal explanation and clarification",
        "cause, consequence, and framing",
        "concession and scope marking",
        "precise contrast and discourse management",
      ],
      avoidOveruse: ["think", "good", "bad", "maybe", "problem"],
    },
    realLifeSituations: [
      "evaluating a policy or decision",
      "clarifying what something does and does not mean",
      "framing a formal explanation",
      "drawing an inference from evidence",
      "making a careful concession or correction",
    ],
    commonTraps: [
      "Do not write unnatural translated-academic English or Thai.",
      "Avoid sentences that are advanced only because they are vague.",
    ],
  },
};

let cachedCatalog = null;

function extractBalancedBlock(source, startIndex, openChar, closeChar) {
  let depth = 0;
  let inString = false;
  let stringChar = "";
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === stringChar) {
        inString = false;
        stringChar = "";
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      inString = true;
      stringChar = char;
      continue;
    }

    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  throw new Error(`Failed to extract balanced block starting at ${startIndex}`);
}

function extractArrayContent(source, anchorText) {
  const anchorIndex = source.indexOf(anchorText);
  if (anchorIndex < 0) {
    throw new Error(`Could not find anchor "${anchorText}"`);
  }

  const initializerIndex = source.indexOf("=", anchorIndex);
  if (initializerIndex < 0) {
    throw new Error(`Could not find initializer after "${anchorText}"`);
  }

  const arrayStart = source.indexOf("[", initializerIndex);
  if (arrayStart < 0) {
    throw new Error(`Could not find array start after "${anchorText}"`);
  }

  return extractBalancedBlock(source, arrayStart, "[", "]");
}

function extractObjectContent(source, anchorText) {
  const anchorIndex = source.indexOf(anchorText);
  if (anchorIndex < 0) {
    throw new Error(`Could not find anchor "${anchorText}"`);
  }

  const initializerIndex = source.indexOf("=", anchorIndex);
  if (initializerIndex < 0) {
    throw new Error(`Could not find initializer after "${anchorText}"`);
  }

  const objectStart = source.indexOf("{", initializerIndex);
  if (objectStart < 0) {
    throw new Error(`Could not find object start after "${anchorText}"`);
  }

  return extractBalancedBlock(source, objectStart, "{", "}");
}

function splitTopLevelObjects(arrayText) {
  const entries = [];
  let index = 0;

  while (index < arrayText.length) {
    const start = arrayText.indexOf("{", index);
    if (start < 0) {
      break;
    }

    const objectText = extractBalancedBlock(arrayText, start, "{", "}");
    entries.push(objectText);
    index = start + objectText.length;
  }

  return entries;
}

function decodeFieldText(value) {
  return value.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\s+/g, " ").trim();
}

function matchRequired(text, pattern, label) {
  const match = text.match(pattern);
  if (!match) {
    throw new Error(`Missing ${label}`);
  }
  return decodeFieldText(match[1]);
}

function parseGrammarPointBlock(block) {
  return {
    id: matchRequired(block, /id:\s*"([^"]+)"/, "id"),
    title: matchRequired(block, /title:\s*"([\s\S]*?)",\s*\n\s*level:/, "title"),
    level: matchRequired(block, /level:\s*"([^"]+)"/, "level"),
    explanation: matchRequired(
      block,
      /explanation:\s*"([\s\S]*?)",\s*\n\s*pattern:/,
      "explanation",
    ),
    pattern: matchRequired(
      block,
      /pattern:\s*"([\s\S]*?)",\s*\n\s*example:/,
      "pattern",
    ),
    focusParticle: matchRequired(
      block,
      /focus:\s*\{\s*\n?\s*particle:\s*"([\s\S]*?)",\s*\n\s*meaning:/,
      "focus particle",
    ),
    focusMeaning: matchRequired(
      block,
      /meaning:\s*"([\s\S]*?)",\s*\n\s*\}/,
      "focus meaning",
    ),
  };
}

function loadFrontendGrammarPoints() {
  const grammarSource = fs.readFileSync(FRONTEND_GRAMMAR_FILE, "utf8");
  const grammarB2Source = fs.readFileSync(FRONTEND_GRAMMAR_B2_FILE, "utf8");

  const mainArrayText = extractArrayContent(
    grammarSource,
    "const rawGrammarPoints: RawGrammarPoint[] = [",
  );
  const b2ArrayText = extractArrayContent(
    grammarB2Source,
    "export const b2GrammarPoints: RawGrammarPointLike[] = [",
  );

  const pointBlocks = [
    ...splitTopLevelObjects(mainArrayText),
    ...splitTopLevelObjects(b2ArrayText),
  ];

  return pointBlocks.map(parseGrammarPointBlock);
}

function loadFrontendStageGroups() {
  const source = fs.readFileSync(FRONTEND_GRAMMAR_STAGES_FILE, "utf8");
  const objectText = extractObjectContent(source, "export const GRAMMAR_STAGE_GROUPS");
  const groups = {};
  let currentStage = null;

  for (const rawLine of objectText.split("\n")) {
    const line = rawLine.trim();
    const stageMatch = line.match(/^("?)([A-Z]\d(?:\.\d)?)\1:\s*\[$/);
    if (stageMatch) {
      currentStage = stageMatch[2];
      groups[currentStage] = [];
      continue;
    }

    if (!currentStage) {
      continue;
    }

    if (line === "]," || line === "]") {
      currentStage = null;
      continue;
    }

    const itemMatch = line.match(/^"([^"]+)"[,]?$/);
    if (itemMatch) {
      groups[currentStage].push(itemMatch[1]);
    }
  }

  return groups;
}

function buildStageById(stageGroups) {
  const stageById = new Map();

  for (const [stage, ids] of Object.entries(stageGroups)) {
    for (const id of ids) {
      stageById.set(id, stage);
    }
  }

  return stageById;
}

function getNeighborLessonTitles(stageLessons, currentId) {
  const currentIndex = stageLessons.findIndex((lesson) => lesson.id === currentId);
  if (currentIndex < 0) {
    return [];
  }

  const neighborIndexes = [
    currentIndex - 2,
    currentIndex - 1,
    currentIndex + 1,
    currentIndex + 2,
  ].filter((index) => index >= 0 && index < stageLessons.length);

  return neighborIndexes.map((index) => stageLessons[index].title);
}

function buildLessonBrief(meta, stageLessons) {
  const stageBrief = STAGE_BRIEFS[meta.stage];
  const neighborTitles = getNeighborLessonTitles(stageLessons, meta.id);

  return {
    ...meta,
    lessonGoal: `${meta.title}. Target pattern: ${meta.pattern}. Focus meaning: ${meta.focusMeaning}`,
    stageBrief,
    allowedScope: [
      ...stageBrief.allowedScope,
      `Keep the sentence tightly aligned with the target grammar point: ${meta.title}.`,
    ],
    disallowedNearbyPatterns: neighborTitles.map(
      (title) => `Do not drift into the nearby lesson focus "${title}".`,
    ),
    safeVocabularyTerritory: stageBrief.vocabularyGuardrails.focus,
    naturalSituations: stageBrief.realLifeSituations,
    commonTraps: [
      `Do not make ${meta.title} feel like a literal English-to-Thai transformation exercise.`,
      ...stageBrief.commonTraps,
    ],
    stageLexiconInventory: stageBrief.vocabularyGuardrails,
  };
}

function buildCatalog() {
  const points = loadFrontendGrammarPoints();
  const stageGroups = loadFrontendStageGroups();
  const stageById = buildStageById(stageGroups);

  const lessons = points
    .map((point) => ({
      ...point,
      stage: stageById.get(point.id) ?? null,
    }))
    .filter((point) => point.stage && PRODUCTION_SCOPE_STAGES.includes(point.stage));

  const rawLessonsByStage = new Map();
  for (const stage of PRODUCTION_SCOPE_STAGES) {
    rawLessonsByStage.set(
      stage,
      stageGroups[stage]
        .map((id) => lessons.find((lesson) => lesson.id === id))
        .filter(Boolean),
    );
  }

  const lessonsById = new Map();
  for (const lesson of lessons) {
    const stageLessons = rawLessonsByStage.get(lesson.stage) ?? [];
    lessonsById.set(lesson.id, buildLessonBrief(lesson, stageLessons));
  }

  const lessonsByStage = new Map();
  for (const stage of PRODUCTION_SCOPE_STAGES) {
    lessonsByStage.set(
      stage,
      (stageGroups[stage] ?? [])
        .map((id) => lessonsById.get(id))
        .filter(Boolean),
    );
  }

  return {
    lessonsById,
    lessonsByStage,
  };
}

function ensureCatalog() {
  if (!cachedCatalog) {
    cachedCatalog = buildCatalog();
  }
  return cachedCatalog;
}

export function getProductionStageBrief(stage) {
  return STAGE_BRIEFS[stage] ?? null;
}

export function getProductionLessonConfig(grammarId) {
  return ensureCatalog().lessonsById.get(grammarId) ?? null;
}

export function getProductionLessonsForStage(stage) {
  return [...(ensureCatalog().lessonsByStage.get(stage) ?? [])];
}

export function getAllProductionLessons() {
  return [...ensureCatalog().lessonsById.values()];
}
