import fs from "fs";
import path from "path";

const JLPT_LEVEL_ORDER = ["N5", "N4", "N3", "N2", "N1"];
const VALID_JLPT_LEVELS = new Set(JLPT_LEVEL_ORDER);

function ensureJlptDataFile(lessonsFile) {
  fs.mkdirSync(path.dirname(lessonsFile), { recursive: true });

  if (!fs.existsSync(lessonsFile)) {
    fs.writeFileSync(lessonsFile, '{"lessons":[]}', "utf8");
  }
}

function readJlptLessons(lessonsFile) {
  ensureJlptDataFile(lessonsFile);

  try {
    const raw = fs.readFileSync(lessonsFile, "utf8");
    const parsed = JSON.parse(raw);
    const lessons = Array.isArray(parsed?.lessons) ? parsed.lessons : [];

    return lessons
      .filter((lesson) => lesson && typeof lesson === "object")
      .filter((lesson) => VALID_JLPT_LEVELS.has(lesson.level))
      .sort((a, b) => {
        const levelDiff =
          JLPT_LEVEL_ORDER.indexOf(a.level) - JLPT_LEVEL_ORDER.indexOf(b.level);
        if (levelDiff !== 0) {
          return levelDiff;
        }
        return Number(a.lessonNumber || 0) - Number(b.lessonNumber || 0);
      });
  } catch (err) {
    console.error("Failed to read JLPT lessons:", err);
    return [];
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

export default function registerJlptRoutes(app, options = {}) {
  const adminDataDir = options.adminDataDir || path.resolve("./admin-data");
  const lessonsFile =
    options.lessonsFile || path.join(adminDataDir, "jlpt-lessons.json");

  app.get("/jlpt/levels", (_req, res) => {
    try {
      const lessons = readJlptLessons(lessonsFile);
      const levels = JLPT_LEVEL_ORDER.map((level) => ({
        level,
        lessonCount: lessons.filter((lesson) => lesson.level === level).length,
      }));
      res.json({ levels });
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

      const lessons = readJlptLessons(lessonsFile)
        .filter((lesson) => lesson.level === level)
        .map(summarizeJlptLesson);

      res.json({ lessons });
    } catch (err) {
      console.error("Failed to fetch JLPT lesson summaries:", err);
      res.status(500).json({ error: "Failed to fetch JLPT lesson summaries" });
    }
  });

  app.get("/jlpt/lessons/:id", (req, res) => {
    try {
      const lesson = readJlptLessons(lessonsFile).find(
        (entry) => entry.id === req.params.id,
      );

      if (!lesson) {
        return res.status(404).json({ error: "JLPT lesson not found" });
      }

      res.json(lesson);
    } catch (err) {
      console.error("Failed to fetch JLPT lesson detail:", err);
      res.status(500).json({ error: "Failed to fetch JLPT lesson detail" });
    }
  });
}
