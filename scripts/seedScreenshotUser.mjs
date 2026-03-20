import bcrypt from "bcrypt";
import csv from "csv-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { pool } from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, "..");
const GRAMMAR_DIR = path.resolve(SERVER_ROOT, "grammar");

const DEFAULT_EMAIL =
  process.env.SCREENSHOT_EMAIL || "screenshots@keystonethai.app";
const DEFAULT_PASSWORD =
  process.env.SCREENSHOT_PASSWORD || "KeystoneShots123!";
const DEFAULT_DISPLAY_NAME =
  process.env.SCREENSHOT_DISPLAY_NAME || "Keystone Screenshot Learner";
const VOCAB_TARGET = 96;

const STAGE_GROUPS = {
  "A1.1": [
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
  ],
  "A1.2": [
    "place-words",
    "possession-khong",
    "want-yaak",
    "request-khor",
    "classifiers",
    "price-thaorai",
    "time-expressions",
    "imperatives",
    "negative-imperative-ya",
    "can-dai",
    "future-ja",
    "very-maak",
    "progressive-kamlang",
    "experience-koey",
    "conjunction-and-but",
    "because-phraw",
  ],
  "A2.1": [
    "past-laew",
    "recent-past-phoeng",
    "duration-penwela-manan",
    "female-particles-kha-kha",
    "frequency-adverbs",
    "like-chorp",
    "knowledge-ruu-ruujak",
    "skill-pen",
    "permission-dai",
    "quantifiers-thuk-bang-lai",
    "sequence-conjunctions",
    "comparison-kwaa",
    "relative-thi",
    "reported-speech",
  ],
  "A2.2": [
    "endurance-wai",
    "superlative",
    "must-tong",
    "should-khuan",
    "prefix-naa-adjective",
    "feelings-rusuek",
    "try-lawng",
    "resultative-ok-samret",
    "passive-tuuk",
    "conditionals",
    "change-state-khuen-long",
    "in-order-to-phuea",
  ],
};

const STAGE_PRACTICE_PLAN = [
  { stage: "A1.1", practicedCount: STAGE_GROUPS["A1.1"].length, dayFloor: 6, dayRange: 7 },
  { stage: "A1.2", practicedCount: 12, dayFloor: 3, dayRange: 8 },
  { stage: "A2.1", practicedCount: 6, dayFloor: 1, dayRange: 6 },
  { stage: "A2.2", practicedCount: 1, dayFloor: 0, dayRange: 3 },
];

const BOOKMARK_IDS = [
  "experience-koey",
  "progressive-kamlang",
  "comparison-kwaa",
  "reported-speech",
  "must-tong",
];

const RECENT_HEATMAP_TIMELINE = [
  { daysAgo: 13, activityCount: 0, reviewCount: 0 },
  { daysAgo: 12, activityCount: 9, reviewCount: 3 },
  { daysAgo: 11, activityCount: 13, reviewCount: 8 },
  { daysAgo: 10, activityCount: 18, reviewCount: 16 },
  { daysAgo: 9, activityCount: 10, reviewCount: 5 },
  { daysAgo: 8, activityCount: 0, reviewCount: 0 },
  { daysAgo: 7, activityCount: 14, reviewCount: 15 },
  { daysAgo: 6, activityCount: 6, reviewCount: 4 },
  { daysAgo: 5, activityCount: 25, reviewCount: 18 },
  { daysAgo: 4, activityCount: 14, reviewCount: 14 },
  { daysAgo: 3, activityCount: 30, reviewCount: 24 },
  { daysAgo: 2, activityCount: 12, reviewCount: 6 },
  { daysAgo: 1, activityCount: 0, reviewCount: 0 },
  { daysAgo: 0, activityCount: 26, reviewCount: 22 },
];

const OLDER_HEATMAP_WEEKS = [
  [
    { activityCount: 2, reviewCount: 1 },
    { activityCount: 0, reviewCount: 0 },
    { activityCount: 4, reviewCount: 2 },
    { activityCount: 5, reviewCount: 2 },
    { activityCount: 3, reviewCount: 1 },
    { activityCount: 6, reviewCount: 3 },
    { activityCount: 1, reviewCount: 0 },
  ],
  [
    { activityCount: 0, reviewCount: 0 },
    { activityCount: 5, reviewCount: 2 },
    { activityCount: 7, reviewCount: 3 },
    { activityCount: 4, reviewCount: 2 },
    { activityCount: 8, reviewCount: 4 },
    { activityCount: 6, reviewCount: 3 },
    { activityCount: 2, reviewCount: 1 },
  ],
  [
    { activityCount: 3, reviewCount: 1 },
    { activityCount: 6, reviewCount: 3 },
    { activityCount: 0, reviewCount: 0 },
    { activityCount: 8, reviewCount: 5 },
    { activityCount: 5, reviewCount: 3 },
    { activityCount: 9, reviewCount: 5 },
    { activityCount: 4, reviewCount: 2 },
  ],
  [
    { activityCount: 4, reviewCount: 2 },
    { activityCount: 7, reviewCount: 4 },
    { activityCount: 9, reviewCount: 5 },
    { activityCount: 0, reviewCount: 0 },
    { activityCount: 6, reviewCount: 3 },
    { activityCount: 10, reviewCount: 6 },
    { activityCount: 5, reviewCount: 2 },
  ],
  [
    { activityCount: 6, reviewCount: 3 },
    { activityCount: 8, reviewCount: 4 },
    { activityCount: 0, reviewCount: 0 },
    { activityCount: 11, reviewCount: 7 },
    { activityCount: 7, reviewCount: 4 },
    { activityCount: 12, reviewCount: 7 },
    { activityCount: 4, reviewCount: 2 },
  ],
  [
    { activityCount: 5, reviewCount: 2 },
    { activityCount: 9, reviewCount: 5 },
    { activityCount: 7, reviewCount: 4 },
    { activityCount: 12, reviewCount: 8 },
    { activityCount: 0, reviewCount: 0 },
    { activityCount: 10, reviewCount: 6 },
    { activityCount: 6, reviewCount: 3 },
  ],
  [
    { activityCount: 7, reviewCount: 4 },
    { activityCount: 10, reviewCount: 6 },
    { activityCount: 0, reviewCount: 0 },
    { activityCount: 13, reviewCount: 8 },
    { activityCount: 9, reviewCount: 5 },
    { activityCount: 15, reviewCount: 10 },
    { activityCount: 6, reviewCount: 3 },
  ],
];

function buildHeatmapTimeline() {
  const olderEntries = [];
  let daysAgo = 62;

  for (const week of OLDER_HEATMAP_WEEKS) {
    for (const day of week) {
      olderEntries.push({ daysAgo, ...day });
      daysAgo -= 1;
    }
  }

  return [...olderEntries, ...RECENT_HEATMAP_TIMELINE];
}

const HEATMAP_TIMELINE = buildHeatmapTimeline();

function parseArgs() {
  const [emailArg, passwordArg, displayNameArg] = process.argv.slice(2);
  return {
    email: (emailArg || DEFAULT_EMAIL).trim().toLowerCase(),
    password: passwordArg || DEFAULT_PASSWORD,
    displayName: displayNameArg || DEFAULT_DISPLAY_NAME,
  };
}

function dateDaysAgo(daysAgo) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date;
}

function formatDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function splitTotal(total, parts) {
  if (total <= 0 || parts <= 0) {
    return [];
  }

  const values = [];
  let remaining = total;
  for (let index = 0; index < parts; index += 1) {
    const slotsLeft = parts - index;
    const base = Math.max(1, Math.floor(remaining / slotsLeft));
    const extraCap = Math.max(0, remaining - base * slotsLeft);
    const extra = Math.min(extraCap, index % 2 === 0 ? 1 : 0);
    const value = Math.min(remaining - (slotsLeft - 1), base + extra);
    values.push(value);
    remaining -= value;
  }

  return values;
}

async function readCsvRows(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

async function loadWords(limit = VOCAB_TARGET) {
  const files = fs
    .readdirSync(GRAMMAR_DIR)
    .filter((file) => file.endsWith(".csv"))
    .sort();
  const words = new Map();

  for (const file of files) {
    const rows = await readCsvRows(path.join(GRAMMAR_DIR, file));
    for (const row of rows) {
      let breakdown = [];
      try {
        breakdown = JSON.parse(row.breakdown || "[]");
      } catch {
        breakdown = [];
      }

      for (const item of breakdown) {
        const thai = typeof item?.thai === "string" ? item.thai.trim() : "";
        const english =
          typeof item?.english === "string" ? item.english.trim() : "";
        const romanization =
          typeof item?.romanization === "string" ? item.romanization.trim() : "";

        if (!thai || !english || words.has(thai)) continue;
        words.set(thai, { thai, english, romanization });

        if (words.size >= limit) {
          return Array.from(words.values());
        }
      }
    }
  }

  return Array.from(words.values());
}

function buildPracticedGrammarIds() {
  const practicedIds = [];
  for (const plan of STAGE_PRACTICE_PLAN) {
    practicedIds.push(...STAGE_GROUPS[plan.stage].slice(0, plan.practicedCount));
  }
  return practicedIds;
}

function buildGrammarProgressRows() {
  return STAGE_PRACTICE_PLAN.flatMap((plan, stageIndex) =>
    STAGE_GROUPS[plan.stage].slice(0, plan.practicedCount).map((grammarId, index) => {
      const lastPracticed = dateDaysAgo(
        plan.dayFloor + ((index + stageIndex) % plan.dayRange),
      );
      const rounds = 4 + ((index + stageIndex) % 6);
      const total = rounds * 3 + ((index + 2) % 4);
      const correct = Math.max(rounds, total - ((index + stageIndex) % 3));
      return {
        grammarId,
        rounds,
        total,
        correct,
        lastPracticed,
      };
    }),
  );
}

function buildActivityRows() {
  const rows = [];

  for (const day of HEATMAP_TIMELINE) {
    if (day.activityCount <= 0) continue;
    const activityDate = formatDateOnly(dateDaysAgo(day.daysAgo));
    const grammarCount = Math.max(1, Math.round(day.activityCount * 0.76));
    const trainerCount = day.activityCount - grammarCount;

    rows.push({
      activityDate,
      source: "grammar",
      count: grammarCount,
    });

    if (trainerCount > 0) {
      rows.push({
        activityDate,
        source: day.daysAgo % 2 === 0 ? "trainer" : "review",
        count: trainerCount,
      });
    }
  }

  return rows;
}

function buildReviewSessionRows(words) {
  const rows = [];
  let cursor = 20;

  for (const day of HEATMAP_TIMELINE) {
    if (day.reviewCount <= 0) continue;

    const sessionDate = formatDateOnly(dateDaysAgo(day.daysAgo));
    const sessionParts = splitTotal(
      day.reviewCount,
      Math.max(2, Math.min(4, Math.ceil(day.reviewCount / 7))),
    );

    sessionParts.forEach((seenCount, index) => {
      const word = words[cursor % words.length];
      cursor += 1;
      rows.push({
        thai: word.thai,
        sessionDate,
        seenCount,
        correctCount: Math.max(1, seenCount - ((index + day.daysAgo) % 2)),
        lastShownAt: dateDaysAgo(day.daysAgo),
      });
    });
  }

  return rows;
}

function buildUserVocabRows(words) {
  return words.map((word, index) => {
    if (index < 4) {
      const firstSeen = dateDaysAgo(index % 3);
      return {
        ...word,
        state: "new",
        stepIndex: 0,
        mastery: 1,
        currentInterval: 0,
        lapseCount: 0,
        firstSeen,
        lastSeen: firstSeen,
        nextReview: dateDaysAgo(1 + (index % 2)),
        lastMasteryUpdate: firstSeen,
      };
    }

    if (index < 9) {
      return {
        ...word,
        state: "learning",
        stepIndex: index % 2,
        mastery: 1,
        currentInterval: 0,
        lapseCount: index % 2,
        firstSeen: dateDaysAgo(2 + (index % 5)),
        lastSeen: hoursAgo(6 + index),
        nextReview: dateDaysAgo(1),
        lastMasteryUpdate: hoursAgo(6 + index),
      };
    }

    if (index < 12) {
      return {
        ...word,
        state: "review",
        stepIndex: 0,
        mastery: 3 + (index % 2),
        currentInterval: 2 + (index % 3),
        lapseCount: index % 2,
        firstSeen: dateDaysAgo(10 + (index % 4)),
        lastSeen: dateDaysAgo(3 + (index % 3)),
        nextReview: dateDaysAgo(1 + (index % 2)),
        lastMasteryUpdate: dateDaysAgo(3 + (index % 3)),
      };
    }

    if (index < 40) {
      const lastSeen = dateDaysAgo(index % 9);
      return {
        ...word,
        state: "review",
        stepIndex: 0,
        mastery: 3 + (index % 3),
        currentInterval: 4 + (index % 9),
        lapseCount: index % 3,
        firstSeen: dateDaysAgo(14 + (index % 12)),
        lastSeen,
        nextReview: addDays(dateDaysAgo(0), 2 + (index % 7)),
        lastMasteryUpdate: lastSeen,
      };
    }

    if (index < 70) {
      const lastSeen = dateDaysAgo(2 + (index % 11));
      return {
        ...word,
        state: "review",
        stepIndex: 0,
        mastery: 5 + (index % 3),
        currentInterval: 10 + (index % 18),
        lapseCount: index % 2,
        firstSeen: dateDaysAgo(24 + (index % 18)),
        lastSeen,
        nextReview: addDays(dateDaysAgo(0), 8 + (index % 12)),
        lastMasteryUpdate: lastSeen,
      };
    }

    const lastSeen = dateDaysAgo(4 + (index % 14));
    return {
      ...word,
      state: "review",
      stepIndex: 0,
      mastery: 8,
      currentInterval: 28 + (index % 32),
      lapseCount: index % 2,
      firstSeen: dateDaysAgo(45 + (index % 25)),
      lastSeen,
      nextReview: addDays(dateDaysAgo(0), 20 + (index % 28)),
      lastMasteryUpdate: lastSeen,
    };
  });
}

async function upsertScreenshotUser(client, { email, password, displayName }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await client.query(
    `
    SELECT id
    FROM users
    WHERE email = $1
    LIMIT 1
    `,
    [email],
  );

  if (existing.rowCount > 0) {
    const userId = existing.rows[0].id;
    await client.query(
      `
      UPDATE users
      SET
        password_hash = $2,
        display_name = $3,
        is_admin = FALSE,
        has_keystone_access = TRUE,
        keystone_access_updated_at = NOW(),
        terms_accepted_at = COALESCE(terms_accepted_at, NOW()),
        privacy_accepted_at = COALESCE(privacy_accepted_at, NOW()),
        consent_source = 'screenshot_seed'
      WHERE id = $1
      `,
      [userId, passwordHash, displayName],
    );
    return userId;
  }

  const inserted = await client.query(
    `
    INSERT INTO users (
      email,
      password_hash,
      display_name,
      is_admin,
      has_keystone_access,
      keystone_access_updated_at,
      terms_accepted_at,
      privacy_accepted_at,
      consent_source
    )
    VALUES ($1, $2, $3, FALSE, TRUE, NOW(), NOW(), NOW(), 'screenshot_seed')
    RETURNING id
    `,
    [email, passwordHash, displayName],
  );

  return inserted.rows[0].id;
}

async function clearExistingUserData(client, userId) {
  await client.query(`DELETE FROM review_queue WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM review_sessions WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM activity_log WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM user_vocab WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM grammar_progress WHERE user_id = $1`, [userId]);
  await client.query(`DELETE FROM bookmarks WHERE user_id = $1`, [userId]);
}

async function seedScreenshotUser() {
  const options = parseArgs();
  const grammarRows = buildGrammarProgressRows();
  const activityRows = buildActivityRows();
  const words = await loadWords(VOCAB_TARGET);
  const vocabRows = buildUserVocabRows(words);
  const reviewRows = buildReviewSessionRows(words);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const userId = await upsertScreenshotUser(client, options);
    await clearExistingUserData(client, userId);

    for (const row of grammarRows) {
      await client.query(
        `
        INSERT INTO grammar_progress (
          user_id,
          grammar_id,
          rounds,
          correct,
          total,
          last_practiced
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          userId,
          row.grammarId,
          row.rounds,
          row.correct,
          row.total,
          row.lastPracticed,
        ],
      );
    }

    for (const grammarId of BOOKMARK_IDS) {
      await client.query(
        `
        INSERT INTO bookmarks (user_id, grammar_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        `,
        [userId, grammarId],
      );
    }

    for (const row of activityRows) {
      await client.query(
        `
        INSERT INTO activity_log (user_id, activity_date, source, count)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, activity_date, source)
        DO UPDATE SET count = EXCLUDED.count
        `,
        [userId, row.activityDate, row.source, row.count],
      );
    }

    for (const row of reviewRows) {
      await client.query(
        `
        INSERT INTO review_sessions (
          user_id,
          thai,
          session_date,
          seen_count,
          correct_count,
          last_shown_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          userId,
          row.thai,
          row.sessionDate,
          row.seenCount,
          row.correctCount,
          row.lastShownAt,
        ],
      );
    }

    for (const row of vocabRows) {
      await client.query(
        `
        INSERT INTO user_vocab (
          user_id,
          thai,
          english,
          romanization,
          mastery,
          ease_factor,
          lapse_count,
          current_interval,
          first_seen,
          last_seen,
          last_mastery_update,
          next_review,
          state,
          step_index
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14
        )
        ON CONFLICT (user_id, thai) DO UPDATE SET
          english = EXCLUDED.english,
          romanization = EXCLUDED.romanization,
          mastery = EXCLUDED.mastery,
          ease_factor = EXCLUDED.ease_factor,
          lapse_count = EXCLUDED.lapse_count,
          current_interval = EXCLUDED.current_interval,
          first_seen = EXCLUDED.first_seen,
          last_seen = EXCLUDED.last_seen,
          last_mastery_update = EXCLUDED.last_mastery_update,
          next_review = EXCLUDED.next_review,
          state = EXCLUDED.state,
          step_index = EXCLUDED.step_index
        `,
        [
          userId,
          row.thai,
          row.english,
          row.romanization,
          row.mastery,
          2.45,
          row.lapseCount,
          row.currentInterval,
          row.firstSeen,
          row.lastSeen,
          row.lastMasteryUpdate,
          row.nextReview,
          row.state,
          row.stepIndex,
        ],
      );
    }

    await client.query("COMMIT");

    console.log("");
    console.log("Screenshot account ready.");
    console.log(`Email: ${options.email}`);
    console.log(`Password: ${options.password}`);
    console.log(`Grammar topics practiced: ${grammarRows.length}`);
    console.log(`Bookmarks: ${BOOKMARK_IDS.length}`);
    console.log(`Vocab cards: ${vocabRows.length}`);
    console.log(`Heatmap active days: ${HEATMAP_TIMELINE.filter((day) => day.activityCount + day.reviewCount > 0).length}`);
    console.log("");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seedScreenshotUser().catch((err) => {
  console.error("Failed to seed screenshot user:", err);
  process.exitCode = 1;
});
