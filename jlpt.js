import fs from "fs";
import path from "path";

const JLPT_LEVEL_ORDER = ["N5", "N4", "N3", "N2", "N1"];
const VALID_JLPT_LEVELS = new Set(JLPT_LEVEL_ORDER);

function ensureLegacyJlptDataFile(lessonsFile) {
  fs.mkdirSync(path.dirname(lessonsFile), { recursive: true });

  if (!fs.existsSync(lessonsFile)) {
    fs.writeFileSync(lessonsFile, '{"lessons":[]}', "utf8");
  }
}

function ensureJlptContentRoot(contentRoot) {
  fs.mkdirSync(contentRoot, { recursive: true });

  for (const level of JLPT_LEVEL_ORDER) {
    fs.mkdirSync(path.join(contentRoot, level), { recursive: true });
  }
}

function readJsonFile(filePath, fallbackValue) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Failed to read JSON file ${filePath}:`, err);
    return fallbackValue;
  }
}

function summarizeJlptLesson(lesson) {
  return {
    id: lesson.id,
    level: lesson.level,
    lessonNumber: lesson.lessonNumber,
    titleJapanese: lesson.titleJapanese,
    titleMeaning: lesson.titleMeaning,
  };
}

function isArrowOnlyStep(step) {
  const label = typeof step?.label === "string" ? step.label.trim() : "";
  const value = typeof step?.value === "string" ? step.value.trim() : "";
  return !label && ["â†“", "Ã¢â€ â€œ", "->", "â†’"].includes(value);
}

function sanitizeConjugationChoice(choice) {
  return {
    ...choice,
    flow: Array.isArray(choice?.flow)
      ? choice.flow.filter((step) => !isArrowOnlyStep(step))
      : [],
  };
}

function sanitizeJlptLessonDetail(lesson) {
  return {
    ...lesson,
    conjugationChoices: Array.isArray(lesson?.conjugationChoices)
      ? lesson.conjugationChoices.map(sanitizeConjugationChoice)
      : [],
  };
}

function sortLessons(a, b) {
  const levelDiff =
    JLPT_LEVEL_ORDER.indexOf(a.level) - JLPT_LEVEL_ORDER.indexOf(b.level);
  if (levelDiff !== 0) {
    return levelDiff;
  }
  return Number(a.lessonNumber || 0) - Number(b.lessonNumber || 0);
}

function readLegacyJlptLessons(lessonsFile) {
  ensureLegacyJlptDataFile(lessonsFile);

  try {
    const parsed = readJsonFile(lessonsFile, { lessons: [] });
    const lessons = Array.isArray(parsed?.lessons) ? parsed.lessons : [];

    return lessons
      .filter((lesson) => lesson && typeof lesson === "object")
      .filter((lesson) => VALID_JLPT_LEVELS.has(lesson.level))
      .sort(sortLessons);
  } catch (err) {
    console.error("Failed to read legacy JLPT lessons:", err);
    return [];
  }
}

function getStructuredLessonDirs(contentRoot) {
  ensureJlptContentRoot(contentRoot);

  const lessonDirs = [];

  for (const level of JLPT_LEVEL_ORDER) {
    const levelDir = path.join(contentRoot, level);
    const entries = fs.readdirSync(levelDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      lessonDirs.push({
        level,
        lessonDir: path.join(levelDir, entry.name),
      });
    }
  }

  return lessonDirs;
}

function readStructuredLessonCore(lessonDir, level) {
  const lessonFile = path.join(lessonDir, "lesson.json");
  if (!fs.existsSync(lessonFile)) {
    return null;
  }

  const lesson = readJsonFile(lessonFile, null);
  if (!lesson || typeof lesson !== "object") {
    return null;
  }

  const normalizedLesson = {
    ...lesson,
    level: typeof lesson.level === "string" ? lesson.level : level,
  };

  if (!normalizedLesson.id || !VALID_JLPT_LEVELS.has(normalizedLesson.level)) {
    return null;
  }

  return normalizedLesson;
}

function readStructuredLessonExamples(lessonDir, lessonId) {
  const examplesFile = path.join(lessonDir, "examples.json");
  if (!fs.existsSync(examplesFile)) {
    return [];
  }

  const parsed = readJsonFile(examplesFile, { lessonId, examples: [] });
  if (Array.isArray(parsed)) {
    return parsed;
  }

  return Array.isArray(parsed?.examples) ? parsed.examples : [];
}

function readStructuredJlptLessons(contentRoot) {
  const lessons = getStructuredLessonDirs(contentRoot)
    .map(({ level, lessonDir }) => ({
      lessonDir,
      lesson: readStructuredLessonCore(lessonDir, level),
    }))
    .filter((entry) => entry.lesson)
    .map((entry) => entry);

  return lessons.sort((a, b) => sortLessons(a.lesson, b.lesson));
}

function loadJlptCatalog({ contentRoot, legacyLessonsFile }) {
  const structuredLessons = readStructuredJlptLessons(contentRoot);

  if (structuredLessons.length > 0) {
    return {
      mode: "structured",
      lessons: structuredLessons,
    };
  }

  return {
    mode: "legacy",
    lessons: readLegacyJlptLessons(legacyLessonsFile),
  };
}

function summarizeCatalogLessons(catalog, level) {
  if (catalog.mode === "structured") {
    return catalog.lessons
      .map((entry) => entry.lesson)
      .filter((lesson) => lesson.level === level)
      .map(summarizeJlptLesson);
  }

  return catalog.lessons
    .filter((lesson) => lesson.level === level)
    .map(summarizeJlptLesson);
}

function getCatalogLevelCounts(catalog) {
  const lessonList =
    catalog.mode === "structured"
      ? catalog.lessons.map((entry) => entry.lesson)
      : catalog.lessons;

  return JLPT_LEVEL_ORDER.map((level) => ({
    level,
    lessonCount: lessonList.filter((lesson) => lesson.level === level).length,
  }));
}

function getCatalogLessonDetail(catalog, lessonId) {
  if (catalog.mode === "structured") {
    const lessonEntry = catalog.lessons.find((entry) => entry.lesson.id === lessonId);
    if (!lessonEntry) {
      return null;
    }

    return sanitizeJlptLessonDetail({
      ...lessonEntry.lesson,
      examples: readStructuredLessonExamples(lessonEntry.lessonDir, lessonId),
    });
  }

  const legacyLesson = catalog.lessons.find((entry) => entry.id === lessonId);
  return legacyLesson ? sanitizeJlptLessonDetail(legacyLesson) : null;
}

function getCatalogLessonExamples(catalog, lessonId) {
  if (catalog.mode === "structured") {
    const lessonEntry = catalog.lessons.find((entry) => entry.lesson.id === lessonId);
    if (!lessonEntry) {
      return null;
    }

    return {
      lessonId,
      examples: readStructuredLessonExamples(lessonEntry.lessonDir, lessonId),
    };
  }

  const legacyLesson = catalog.lessons.find((entry) => entry.id === lessonId);
  if (!legacyLesson) {
    return null;
  }

  return {
    lessonId,
    examples: Array.isArray(legacyLesson.examples) ? legacyLesson.examples : [],
  };
}

export default function registerJlptRoutes(app, options = {}) {
  const adminDataDir = options.adminDataDir || path.resolve("./admin-data");
  const legacyLessonsFile =
    options.lessonsFile || path.join(adminDataDir, "jlpt-lessons.json");
  const structuredContentRoot =
    options.contentRoot || path.join(adminDataDir, "jlpt", "levels");

  app.get("/jlpt/levels", (_req, res) => {
    try {
      const catalog = loadJlptCatalog({
        contentRoot: structuredContentRoot,
        legacyLessonsFile,
      });

      res.json({ levels: getCatalogLevelCounts(catalog) });
    } catch (err) {
      console.error("Failed to fetch JLPT levels:", err);
      res.status(500).json({ error: "Failed to fetch JLPT levels" });
    }
  });

  app.get("/jlpt/lessons", (req, res) => {
    try {
      const level =
        typeof req.query?.level === "string" ? req.query.level.trim() : "";

      if (!VALID_JLPT_LEVELS.has(level)) {
        return res.status(400).json({
          error: `level must be one of: ${JLPT_LEVEL_ORDER.join(", ")}`,
        });
      }

      const catalog = loadJlptCatalog({
        contentRoot: structuredContentRoot,
        legacyLessonsFile,
      });

      res.json({ lessons: summarizeCatalogLessons(catalog, level) });
    } catch (err) {
      console.error("Failed to fetch JLPT lesson summaries:", err);
      res.status(500).json({ error: "Failed to fetch JLPT lesson summaries" });
    }
  });

  app.get("/jlpt/lessons/:id", (req, res) => {
    try {
      const catalog = loadJlptCatalog({
        contentRoot: structuredContentRoot,
        legacyLessonsFile,
      });
      const lesson = getCatalogLessonDetail(catalog, req.params.id);

      if (!lesson) {
        return res.status(404).json({ error: "JLPT lesson not found" });
      }

      res.json(lesson);
    } catch (err) {
      console.error("Failed to fetch JLPT lesson detail:", err);
      res.status(500).json({ error: "Failed to fetch JLPT lesson detail" });
    }
  });

  app.get("/jlpt/lessons/:id/examples", (req, res) => {
    try {
      const catalog = loadJlptCatalog({
        contentRoot: structuredContentRoot,
        legacyLessonsFile,
      });
      const examplesDoc = getCatalogLessonExamples(catalog, req.params.id);

      if (!examplesDoc) {
        return res.status(404).json({ error: "JLPT lesson not found" });
      }

      res.json(examplesDoc);
    } catch (err) {
      console.error("Failed to fetch JLPT lesson examples:", err);
      res.status(500).json({ error: "Failed to fetch JLPT lesson examples" });
    }
  });
}
