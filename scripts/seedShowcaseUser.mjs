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

const DEFAULT_EMAIL = process.env.SHOWCASE_EMAIL || "showcase@keystonethai.app";
const DEFAULT_PASSWORD =
  process.env.SHOWCASE_PASSWORD || "KeystoneDemo123!";
const DEFAULT_DISPLAY_NAME =
  process.env.SHOWCASE_DISPLAY_NAME || "Showcase Learner";
const SHOWCASE_STAGE_GROUPS = {
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
  "B1.1": [
    "tend-to-mak-ja",
    "rather-khon-khang",
    "too-much-koen-pai",
    "just-in-time-pho-di",
    "to-be-khue-vs-pen",
    "reciprocal-kan",
    "beneficial-hai",
    "do-in-advance-wai",
    "continuation-aspect",
    "about-concerning-kiaw-kap",
    "also-kor",
    "prefer-di-kwa",
    "cause-result-phro-wa",
    "cause-result-tham-hai",
    "cause-result-jueng",
    "sequence-laew-kor",
    "sequence-jaak-nan",
    "sequence-nai-thi-sut",
  ],
  "B1.2": [
    "not-yet-yang",
    "intermediate-negation",
    "reflexive-tua-eng",
    "distributive-tae-la",
    "intention-tang-jai",
    "almost-kueap",
    "barely-thaep-ja",
    "extent-jon",
    "since-tang-tae",
    "every-time-thuk-khrang-thi",
    "depends-on-khun-yu-kap",
    "so-that-ja-dai",
    "instead-of-thaen-thi-ja",
    "indirect-questions-ru-plao",
    "expanded-relative-structures",
    "perspective-marker-samrap",
    "opinion-marker-nai-khwam-hen",
    "stance-marker-tam-thi-chan-hen",
    "nominalization-karn-khwam",
    "contrast-tae-thawaa",
    "concession-maewaa",
    "concession-thang-thi",
    "result-complements-b1",
  ],
  "B2.1": [
    "serial-verbs-motion",
    "serial-verbs-manner",
    "serial-verbs-causative",
    "time-clause-phoo-kor",
    "time-clause-tangtae",
    "time-clause-rawang",
    "time-clause-tanthii",
    "about-to-kamlangja",
    "gradually-khoi-khoi",
    "secretly-aep",
    "by-chance-bang-oen",
    "unintentionally-mai-dai-tang-jai",
    "probability-khong-ja",
    "expectation-naa-ja",
    "inevitability-yom",
    "obligation-phueng",
    "as-expected-yang-thi-khit",
    "according-to-tam-thi",
    "in-case-phuea-wa",
    "as-long-as-trap-dai-thi",
    "worth-doing-khum-kha",
    "waste-sia",
    "proportional-ying-ying",
    "equal-comparison-thao-kan",
    "similarity-khlaai-kap",
    "difference-taang-jaak",
    "only-piang-thaonan",
    "especially-doey-phro",
    "at-least-most-yaang",
    "exclusively-chaphaw",
    "particle-leuy-emphasis",
    "particle-thiiediaw",
    "particle-chiew",
    "particle-si-sa",
  ],
  "B2.2": [
    "particle-na-softener",
    "particle-la-topic-shift",
    "particle-na-la-contrast",
    "particle-naw-casual-confirm",
    "particle-waa-mai",
    "rhetorical-mi-chai-rue",
    "pretend-klaeng",
    "definitive-sa-sia",
    "regret-sia-dai",
    "no-wonder-mina-la",
    "turns-out-klai-pen-wa",
    "to-the-point-of-thung-khap",
    "apart-from-nok-jak",
    "not-only-but-also-mai-phiang-tae",
    "unless-wen-tae",
    "even-mae-tae",
    "let-alone-nap-prasa-arai",
    "as-if-rao-kap-wa",
    "causative-tham-hai",
    "causative-hai-complex",
    "passive-don-vs-thuuk",
    "passive-subject-affected",
    "cleft-kaan-thi-khue",
    "complementizer-waa-complex",
    "fronted-adverbial-clause",
    "elaboration-marker-khue",
    "topic-introducer-samrap",
    "concessive-marker-yaang-rai-kor",
    "addition-marker-nok-jaak-nan",
    "therefore-formal-jueng",
    "although-formal-maewaa",
    "consequently-song-phal",
    "in-contrast-formal-nai-khana",
  ],
};
const STAGE_ORDER = ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2"];
const CURRENT_STAGE = "B1.2";
const CURRENT_STAGE_PROGRESS = 0.55;
const VOCAB_TARGET = 120;

function parseArgs() {
  const [emailArg, passwordArg, displayNameArg] = process.argv.slice(2);
  return {
    email: (emailArg || DEFAULT_EMAIL).trim().toLowerCase(),
    password: passwordArg || DEFAULT_PASSWORD,
    displayName: displayNameArg || DEFAULT_DISPLAY_NAME,
  };
}

function getShowcaseGrammarIds() {
  const groups = SHOWCASE_STAGE_GROUPS;
  const practiced = [];

  for (const stage of STAGE_ORDER) {
    const ids = groups[stage] || [];
    if (stage !== CURRENT_STAGE) {
      practiced.push(...ids);
      continue;
    }

    const practicedCount = Math.max(1, Math.ceil(ids.length * CURRENT_STAGE_PROGRESS));
    practiced.push(...ids.slice(0, practicedCount));
    break;
  }

  const bookmarks = Array.from(
    new Set([
      ...(groups["B1.2"] || []).slice(0, 3),
      ...(groups["B2.1"] || []).slice(0, 3),
      ...(groups["B2.2"] || []).slice(0, 2),
    ]),
  );

  return {
    groups,
    practicedIds: practiced,
    bookmarkIds: bookmarks,
  };
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

async function loadShowcaseWords(limit = VOCAB_TARGET) {
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

function dateDaysAgo(daysAgo) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date;
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function buildGrammarProgressRows(grammarIds) {
  return grammarIds.map((grammarId, index) => {
    const rounds = 4 + (index % 7);
    const total = rounds * 3 + (index % 3);
    const mistakes = index % 4;
    const correct = Math.max(rounds, total - mistakes);
    const lastPracticed = dateDaysAgo(index % 28);

    return {
      grammarId,
      rounds,
      total,
      correct,
      lastPracticed,
    };
  });
}

function buildActivityRows() {
  const rows = [];

  for (let offset = 0; offset <= 150; offset += 2) {
    if (offset % 6 === 0) {
      continue;
    }

    const activityDate = dateDaysAgo(offset);
    rows.push({
      activityDate: formatDateOnly(activityDate),
      source: "grammar",
      count: 6 + (offset % 11),
    });

    if (offset % 10 === 4) {
      rows.push({
        activityDate: formatDateOnly(activityDate),
        source: "trainer",
        count: 2 + (offset % 4),
      });
    }
  }

  return rows;
}

function buildReviewSessions(words) {
  return words.slice(0, 70).map((word, index) => ({
    thai: word.thai,
    sessionDate: formatDateOnly(dateDaysAgo(index * 2 + 1)),
    seenCount: 4 + (index % 6),
    correctCount: 2 + (index % 4),
  }));
}

function buildUserVocabRows(words) {
  return words.map((word, index) => {
    let state = "review";
    let stepIndex = 0;
    let mastery = 4 + (index % 4);
    let currentInterval = 4 + (index % 20);
    let lapseCount = index % 3;
    let firstSeen = dateDaysAgo(120 - (index % 70));
    let lastSeen = dateDaysAgo(index % 18);
    let nextReview = dateDaysAgo(-(index % 9));

    if (index < 10) {
      state = "new";
      mastery = 1;
      currentInterval = 0;
      lapseCount = 0;
      firstSeen = dateDaysAgo(index % 5);
      lastSeen = firstSeen;
      nextReview = dateDaysAgo(index % 2);
    } else if (index < 20) {
      state = "learning";
      stepIndex = index % 2;
      mastery = 1;
      currentInterval = 0;
      firstSeen = dateDaysAgo(2 + (index % 7));
      lastSeen = dateDaysAgo(index % 3);
      nextReview = dateDaysAgo(0);
    } else if (index < 34) {
      state = "review";
      mastery = 2 + (index % 4);
      currentInterval = 1 + (index % 7);
      nextReview = dateDaysAgo(index % 4);
    } else if (index < 48) {
      state = "review";
      mastery = 5 + (index % 3);
      currentInterval = 10 + (index % 20);
      nextReview = dateDaysAgo(-(2 + (index % 8)));
    } else if (index < 60) {
      state = "review";
      mastery = 8;
      currentInterval = 45 + (index % 20);
      nextReview = dateDaysAgo(-(7 + (index % 20)));
    }

    return {
      ...word,
      state,
      stepIndex,
      mastery,
      currentInterval,
      lapseCount,
      firstSeen,
      lastSeen,
      nextReview,
      lastMasteryUpdate: lastSeen,
    };
  });
}

async function upsertShowcaseUser(client, { email, password, displayName }) {
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
        terms_accepted_at = COALESCE(terms_accepted_at, NOW()),
        privacy_accepted_at = COALESCE(privacy_accepted_at, NOW()),
        consent_source = 'showcase_seed'
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
      terms_accepted_at,
      privacy_accepted_at,
      consent_source
    )
    VALUES ($1, $2, $3, FALSE, NOW(), NOW(), 'showcase_seed')
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

async function seedShowcaseUser() {
  const options = parseArgs();
  const { practicedIds, bookmarkIds } = getShowcaseGrammarIds();
  const grammarRows = buildGrammarProgressRows(practicedIds);
  const words = await loadShowcaseWords(VOCAB_TARGET);
  const vocabRows = buildUserVocabRows(words);
  const activityRows = buildActivityRows();
  const reviewRows = buildReviewSessions(words);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const userId = await upsertShowcaseUser(client, options);
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

    for (const grammarId of bookmarkIds) {
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
        VALUES ($1, $2, $3, $4, $5, NOW())
        `,
        [userId, row.thai, row.sessionDate, row.seenCount, row.correctCount],
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
    console.log("Showcase account ready.");
    console.log(`Email: ${options.email}`);
    console.log(`Password: ${options.password}`);
    console.log(`Grammar topics practiced: ${grammarRows.length}`);
    console.log(`Bookmarks: ${bookmarkIds.length}`);
    console.log(`Vocab cards: ${vocabRows.length}`);
    console.log(`Heatmap days populated: ${activityRows.length}`);
    console.log("");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seedShowcaseUser().catch((err) => {
  console.error("Failed to seed showcase user:", err);
  process.exitCode = 1;
});
