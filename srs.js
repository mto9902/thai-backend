/**
 * srs.js — Anki-style SRS engine v3
 *
 * Full Anki SM-2 variant with:
 * - Card states: new → learning → review, with lapse → relearning
 * - Learning steps: [1m, 10m] before graduating
 * - Ease factor adjustments per grade
 * - Proper interval computation for all states
 */

import { pool } from "./db.js";

const SRS_CONFIG = {
  dailyNewWordLimit: 20,
  learningSteps: [1, 10],
  relearningSteps: [10],
  graduatingInterval: 1,
  easyInterval: 4,
  defaultEase: 2.5,
  minEase: 1.3,
  maxEase: 3.5,
  hardMultiplier: 1.2,
  easyBonus: 1.3,
  lapseMultiplier: 0.1,
  minLapseInterval: 1,
  maxInterval: 36500,
  learnAheadLimitMins: 20,
};

async function getOrBuildQueue(userId) {
  const existing = await pool.query(
    `SELECT COUNT(*) FROM review_queue
     WHERE user_id = $1 AND queue_date = CURRENT_DATE`,
    [userId]
  );

  if (parseInt(existing.rows[0].count) > 0) return;

  const reviewDue = await pool.query(
    `SELECT thai FROM user_vocab
     WHERE user_id = $1
       AND COALESCE(state, 'new') = 'review'
       AND next_review <= NOW()
     ORDER BY next_review ASC`,
    [userId]
  );

  const newDue = await pool.query(
    `SELECT thai FROM user_vocab
     WHERE user_id = $1
       AND COALESCE(state, 'new') = 'new'
       AND next_review <= NOW()
     ORDER BY next_review ASC
     LIMIT $2`,
    [userId, SRS_CONFIG.dailyNewWordLimit]
  );

  const reviewCards = reviewDue.rows.map((r) => r.thai);
  const newCards = newDue.rows.map((r) => r.thai);

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  shuffle(reviewCards);
  shuffle(newCards);

  const cards = [...reviewCards, ...newCards];

  if (cards.length === 0) return;

  const positions = cards.map((_, idx) => idx);

  await pool.query(
    `INSERT INTO review_queue (user_id, thai, queue_date, position)
     SELECT $1, t.thai, CURRENT_DATE, t.pos
     FROM UNNEST($2::text[], $3::int[]) AS t(thai, pos)
     ON CONFLICT (user_id, thai, queue_date) DO NOTHING`,
    [userId, cards, positions]
  );
}

async function getQueueCounts(userId) {
  const result = await pool.query(
    `SELECT
       COUNT(*) AS total_cards,
       COUNT(*) FILTER (WHERE served = TRUE) AS cards_served
     FROM review_queue
     WHERE user_id = $1 AND queue_date = CURRENT_DATE`,
    [userId]
  );

  const row = result.rows[0];
  return {
    totalCards: parseInt(row.total_cards),
    cardsServed: parseInt(row.cards_served),
    cardsRemaining: parseInt(row.total_cards) - parseInt(row.cards_served),
  };
}

async function markQueueCardServed(userId, thai) {
  await pool.query(
    `UPDATE review_queue
     SET served = TRUE
     WHERE user_id = $1
       AND thai = $2
       AND queue_date = CURRENT_DATE`,
    [userId, thai]
  );
}

async function getSessionRecord(userId, thai) {
  await pool.query(
    `INSERT INTO review_sessions (user_id, thai, session_date)
     VALUES ($1, $2, CURRENT_DATE)
     ON CONFLICT (user_id, thai, session_date) DO NOTHING`,
    [userId, thai]
  );

  const result = await pool.query(
    `SELECT * FROM review_sessions
     WHERE user_id = $1 AND thai = $2 AND session_date = CURRENT_DATE`,
    [userId, thai]
  );

  return result.rows[0];
}

async function incrementSeen(userId, thai) {
  await pool.query(
    `UPDATE review_sessions
     SET seen_count = seen_count + 1, last_shown_at = NOW()
     WHERE user_id = $1 AND thai = $2 AND session_date = CURRENT_DATE`,
    [userId, thai]
  );
}

async function incrementCorrect(userId, thai) {
  await pool.query(
    `UPDATE review_sessions
     SET correct_count = correct_count + 1
     WHERE user_id = $1 AND thai = $2 AND session_date = CURRENT_DATE`,
    [userId, thai]
  );
}

async function resetCorrect(userId, thai) {
  await pool.query(
    `UPDATE review_sessions
     SET correct_count = 0
     WHERE user_id = $1 AND thai = $2 AND session_date = CURRENT_DATE`,
    [userId, thai]
  );
}

function clampEase(ease) {
  return Math.max(SRS_CONFIG.minEase, Math.min(SRS_CONFIG.maxEase, ease));
}

function easeForGrade(currentEase, grade) {
  switch (grade) {
    case "again":
      return clampEase(currentEase - 0.2);
    case "hard":
      return clampEase(currentEase - 0.15);
    case "good":
      return currentEase;
    case "easy":
      return clampEase(currentEase + 0.15);
    default:
      return currentEase;
  }
}

function minutesToDays(mins) {
  return mins / 1440;
}

function clampInterval(days) {
  return Math.min(days, SRS_CONFIG.maxInterval);
}

function fuzzRange(interval, previousInterval) {
  if (interval < 2) return { min: interval, max: interval };

  let range;
  if (interval < 7) {
    range = 2;
  } else if (interval < 30) {
    range = Math.round(interval * 0.1);
  } else {
    range = Math.round(interval * 0.15);
  }
  range = Math.max(range, 1);

  const minVal = Math.max(previousInterval || 1, Math.round(interval - range), 1);
  const maxVal = Math.min(Math.round(interval + range), SRS_CONFIG.maxInterval);

  return { min: minVal, max: Math.max(minVal, maxVal) };
}

function fuzzInterval(interval, previousInterval) {
  const { min, max } = fuzzRange(interval, previousInterval);
  if (min === max) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

function computeIntervalPreviews(state, stepIndex, ease, currentInterval) {
  const steps =
    state === "relearning"
      ? SRS_CONFIG.relearningSteps
      : SRS_CONFIG.learningSteps;

  if (state === "new" || state === "learning") {
    const againMins = steps[0] || 1;
    const hardMins = steps[stepIndex] || steps[0] || 1;
    const atLastStep = stepIndex >= steps.length - 1;
    const goodDays = atLastStep
      ? SRS_CONFIG.graduatingInterval
      : minutesToDays(steps[stepIndex + 1] || steps[0]);
    const easyDays = SRS_CONFIG.easyInterval;

    return {
      again: minutesToDays(againMins),
      hard: minutesToDays(hardMins),
      good: goodDays,
      easy: easyDays,
    };
  }

  if (state === "relearning") {
    const againMins = steps[0] || 10;
    const hardMins = steps[stepIndex] || steps[0] || 10;
    const goodDays = Math.max(
      currentInterval * SRS_CONFIG.lapseMultiplier,
      SRS_CONFIG.minLapseInterval
    );
    const easyDays = Math.max(goodDays * 1.5, SRS_CONFIG.minLapseInterval);

    return {
      again: minutesToDays(againMins),
      hard: minutesToDays(hardMins),
      good: clampInterval(goodDays),
      easy: clampInterval(easyDays),
    };
  }

  const baseInterval = currentInterval || SRS_CONFIG.graduatingInterval;
  const againMins = SRS_CONFIG.relearningSteps[0] || 10;
  const hardRaw = Math.max(baseInterval * SRS_CONFIG.hardMultiplier, baseInterval + 1);
  const goodRaw = Math.max(baseInterval * ease, hardRaw + 1);
  const easyRaw = Math.max(baseInterval * ease * SRS_CONFIG.easyBonus, goodRaw + 1);

  function previewFuzz(raw) {
    const { min, max } = fuzzRange(raw, currentInterval);
    return clampInterval(Math.round((min + max) / 2));
  }

  return {
    again: minutesToDays(againMins),
    hard: previewFuzz(hardRaw),
    good: previewFuzz(goodRaw),
    easy: previewFuzz(easyRaw),
  };
}

async function serveCard(userId, card, queueCounts, res) {
  await getSessionRecord(userId, card.thai);
  await incrementSeen(userId, card.thai);

  const wrongResult = await pool.query(
    `SELECT english FROM user_vocab
     WHERE user_id = $1 AND english != $2
     ORDER BY RANDOM()
     LIMIT 3`,
    [userId, card.english]
  );

  const choices = [card.english, ...wrongResult.rows.map((r) => r.english)];

  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }

  const vocabResult = await pool.query(
    `SELECT mastery, ease_factor, current_interval,
            COALESCE(state, 'new') AS state, COALESCE(step_index, 0) AS step_index
     FROM user_vocab WHERE user_id = $1 AND thai = $2`,
    [userId, card.thai]
  );

  const vocab = vocabResult.rows[0];
  const ease = parseFloat(vocab.ease_factor) || SRS_CONFIG.defaultEase;
  const currentInterval = parseFloat(vocab.current_interval) || 0;

  const intervalPreviews = computeIntervalPreviews(
    vocab.state,
    parseInt(vocab.step_index),
    ease,
    currentInterval
  );

  const countsResult = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE COALESCE(state, 'new') = 'new' AND next_review <= NOW()) AS new_count,
       COUNT(*) FILTER (WHERE state IN ('learning', 'relearning')) AS learning_count,
       COUNT(*) FILTER (WHERE COALESCE(state, 'new') = 'review' AND next_review <= NOW()) AS review_count
     FROM user_vocab
     WHERE user_id = $1`,
    [userId]
  );

  const counts = countsResult.rows[0];

  res.json({
    thai: card.thai,
    correct: card.english,
    romanization: card.romanization || "",
    choices,
    state: vocab.state,
    counts: {
      newCount: parseInt(counts.new_count) || 0,
      learningCount: parseInt(counts.learning_count) || 0,
      reviewCount: parseInt(counts.review_count) || 0,
    },
    intervalPreviews,
  });
}

async function getSessionSummary(userId) {
  const result = await pool.query(
    `SELECT
       COUNT(*) AS cards_reviewed,
       SUM(correct_count) AS total_correct,
       SUM(seen_count) AS total_seen,
       COUNT(*) FILTER (WHERE correct_count >= 1) AS cards_promoted,
       COUNT(*) FILTER (WHERE correct_count = 0) AS cards_missed,
       ROUND(AVG(last_response_ms)) AS avg_response_ms
     FROM review_sessions
     WHERE user_id = $1 AND session_date = CURRENT_DATE`,
    [userId]
  );

  const row = result.rows[0];
  const totalSeen = parseInt(row.total_seen) || 1;
  const totalCorrect = parseInt(row.total_correct) || 0;

  return {
    cardsReviewed: parseInt(row.cards_reviewed),
    totalCorrect,
    totalSeen,
    accuracy: Math.round((totalCorrect / totalSeen) * 100),
    cardsPromoted: parseInt(row.cards_promoted),
    cardsMissed: parseInt(row.cards_missed),
    avgResponseMs: row.avg_response_ms ? parseInt(row.avg_response_ms) : null,
  };
}

async function handleReview(req, res) {
  try {
    const userId = req.userId;
    const learnAheadMs = SRS_CONFIG.learnAheadLimitMins * 60 * 1000;

    const learningCard = await pool.query(
      `SELECT v.thai, v.english, v.romanization
       FROM user_vocab v
       WHERE v.user_id = $1
         AND v.state IN ('learning', 'relearning')
         AND v.next_review <= NOW()
       ORDER BY v.next_review ASC
       LIMIT 1`,
      [userId]
    );

    if (learningCard.rows.length > 0) {
      const queueCounts = await getQueueCounts(userId);
      return await serveCard(userId, learningCard.rows[0], queueCounts, res);
    }

    await getOrBuildQueue(userId);
    const queueCounts = await getQueueCounts(userId);

    const next = await pool.query(
      `SELECT q.thai, v.english, v.romanization
       FROM review_queue q
       JOIN user_vocab v ON v.user_id = q.user_id AND v.thai = q.thai
       WHERE q.user_id = $1
         AND q.queue_date = CURRENT_DATE
         AND q.served = FALSE
       ORDER BY q.position ASC
       LIMIT 1`,
      [userId]
    );

    if (next.rows.length > 0) {
      return await serveCard(userId, next.rows[0], queueCounts, res);
    }

    const staleQueuedCard = await pool.query(
      `SELECT q.thai, v.english, v.romanization
       FROM review_queue q
       JOIN user_vocab v ON v.user_id = q.user_id AND v.thai = q.thai
       WHERE q.user_id = $1
         AND q.queue_date = CURRENT_DATE
         AND q.served = TRUE
         AND COALESCE(v.state, 'new') IN ('new', 'review')
         AND v.next_review <= NOW()
       ORDER BY q.position ASC
       LIMIT 1`,
      [userId]
    );

    if (staleQueuedCard.rows.length > 0) {
      return await serveCard(userId, staleQueuedCard.rows[0], queueCounts, res);
    }

    // Fallback: due cards NOT in today's queue (became due after queue was built)
    const unqueuedDue = await pool.query(
      `SELECT v.thai, v.english, v.romanization
       FROM user_vocab v
       WHERE v.user_id = $1
         AND COALESCE(v.state, 'new') IN ('new', 'review')
         AND v.next_review <= NOW()
         AND NOT EXISTS (
           SELECT 1 FROM review_queue q
           WHERE q.user_id = v.user_id AND q.thai = v.thai AND q.queue_date = CURRENT_DATE
         )
       ORDER BY
         CASE WHEN COALESCE(v.state, 'new') = 'review' THEN 0 ELSE 1 END,
         v.next_review ASC
       LIMIT 1`,
      [userId]
    );

    if (unqueuedDue.rows.length > 0) {
      return await serveCard(userId, unqueuedDue.rows[0], queueCounts, res);
    }

    const learnAhead = await pool.query(
      `SELECT v.thai, v.english, v.romanization, v.next_review
       FROM user_vocab v
       WHERE v.user_id = $1
         AND v.state IN ('learning', 'relearning')
       ORDER BY v.next_review ASC
       LIMIT 1`,
      [userId]
    );

    // Build counts for waiting/done responses
    const countsResult = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE COALESCE(state, 'new') = 'new' AND next_review <= NOW()) AS new_count,
         COUNT(*) FILTER (WHERE state IN ('learning', 'relearning')) AS learning_count,
         COUNT(*) FILTER (WHERE COALESCE(state, 'new') = 'review' AND next_review <= NOW()) AS review_count
       FROM user_vocab
       WHERE user_id = $1`,
      [userId]
    );
    const counts = {
      newCount: parseInt(countsResult.rows[0].new_count) || 0,
      learningCount: parseInt(countsResult.rows[0].learning_count) || 0,
      reviewCount: parseInt(countsResult.rows[0].review_count) || 0,
    };

    if (learnAhead.rows.length > 0) {
      const nextDue = new Date(learnAhead.rows[0].next_review).getTime();
      const nowMs = Date.now();

      if (nextDue <= nowMs + learnAheadMs) {
        return await serveCard(userId, learnAhead.rows[0], queueCounts, res);
      }

      return res.json({
        waiting: true,
        nextDueAt: learnAhead.rows[0].next_review,
        counts,
      });
    }

    if (queueCounts.totalCards === 0 && counts.newCount === 0 && counts.reviewCount === 0) {
      return res.json({ done: true, counts });
    }

    const summary = await getSessionSummary(userId);
    return res.json({ done: true, summary, counts });
  } catch (err) {
    console.error("Review error:", err);
    res.status(500).json({ error: "Failed to generate review" });
  }
}

async function handleAnswer(req, res) {
  try {
    const userId = req.userId;
    const { thai, grade } = req.body;

    if (!thai || !grade) {
      return res.status(400).json({ error: "Missing word or grade" });
    }

    const result = await pool.query(
      `SELECT mastery, ease_factor, lapse_count, current_interval,
              COALESCE(state, 'new') AS state, COALESCE(step_index, 0) AS step_index
       FROM user_vocab
       WHERE user_id = $1 AND thai = $2`,
      [userId, thai]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Word not found" });
    }

    const word = result.rows[0];
    const currentEase = parseFloat(word.ease_factor) || SRS_CONFIG.defaultEase;
    const currentInterval = parseFloat(word.current_interval) || 0;
    const lapseCount = parseInt(word.lapse_count) || 0;
    const cardState = word.state;
    const stepIndex = parseInt(word.step_index) || 0;

    let newState = cardState;
    let newStepIndex = stepIndex;
    let newEase = currentEase;
    let newInterval = currentInterval;
    let newLapseCount = lapseCount;
    let nextReviewMins = 0;
    let promoted = false;
    let lapsed = false;

    if (cardState === "new" || cardState === "learning") {
      const steps = SRS_CONFIG.learningSteps;

      if (grade === "again") {
        newState = "learning";
        newStepIndex = 0;
        nextReviewMins = steps[0] || 1;
      } else if (grade === "hard") {
        newState = "learning";
        newStepIndex = stepIndex;
        nextReviewMins = steps[stepIndex] || steps[0] || 1;
      } else if (grade === "good") {
        const atLastStep = stepIndex >= steps.length - 1;
        if (atLastStep) {
          newState = "review";
          newStepIndex = 0;
          newInterval = SRS_CONFIG.graduatingInterval;
          nextReviewMins = SRS_CONFIG.graduatingInterval * 1440;
          promoted = true;
        } else {
          newState = "learning";
          newStepIndex = stepIndex + 1;
          nextReviewMins = steps[stepIndex + 1] || 10;
        }
      } else if (grade === "easy") {
        newState = "review";
        newStepIndex = 0;
        newInterval = SRS_CONFIG.easyInterval;
        nextReviewMins = SRS_CONFIG.easyInterval * 1440;
        promoted = true;
      }
    } else if (cardState === "relearning") {
      const steps = SRS_CONFIG.relearningSteps;

      if (grade === "again") {
        newState = "relearning";
        newStepIndex = 0;
        nextReviewMins = steps[0] || 10;
      } else if (grade === "hard") {
        newState = "relearning";
        newStepIndex = stepIndex;
        nextReviewMins = steps[stepIndex] || steps[0] || 10;
      } else if (grade === "good") {
        const atLastStep = stepIndex >= steps.length - 1;
        if (atLastStep) {
          newState = "review";
          newStepIndex = 0;
          newInterval = Math.max(
            currentInterval * SRS_CONFIG.lapseMultiplier,
            SRS_CONFIG.minLapseInterval
          );
          nextReviewMins = newInterval * 1440;
          promoted = true;
        } else {
          newState = "relearning";
          newStepIndex = stepIndex + 1;
          nextReviewMins = steps[stepIndex + 1] || 10;
        }
      } else if (grade === "easy") {
        newState = "review";
        newStepIndex = 0;
        newInterval = Math.max(
          currentInterval * SRS_CONFIG.lapseMultiplier * 1.5,
          SRS_CONFIG.minLapseInterval
        );
        nextReviewMins = newInterval * 1440;
        promoted = true;
      }
    } else {
      newEase = easeForGrade(currentEase, grade);
      const baseInterval = currentInterval || SRS_CONFIG.graduatingInterval;

      if (grade === "again") {
        lapsed = true;
        newLapseCount = lapseCount + 1;
        newState = "relearning";
        newStepIndex = 0;
        nextReviewMins = SRS_CONFIG.relearningSteps[0] || 10;
      } else if (grade === "hard") {
        newState = "review";
        const raw = clampInterval(
          Math.max(baseInterval * SRS_CONFIG.hardMultiplier, baseInterval + 1)
        );
        newInterval = fuzzInterval(raw, currentInterval);
        nextReviewMins = newInterval * 1440;
        promoted = true;
      } else if (grade === "good") {
        newState = "review";
        const hardVal = Math.max(baseInterval * SRS_CONFIG.hardMultiplier, baseInterval + 1);
        const raw = clampInterval(Math.max(baseInterval * newEase, hardVal + 1));
        newInterval = fuzzInterval(raw, currentInterval);
        nextReviewMins = newInterval * 1440;
        promoted = true;
      } else if (grade === "easy") {
        newState = "review";
        const hardVal = Math.max(baseInterval * SRS_CONFIG.hardMultiplier, baseInterval + 1);
        const goodVal = Math.max(baseInterval * newEase, hardVal + 1);
        const raw = clampInterval(
          Math.max(baseInterval * newEase * SRS_CONFIG.easyBonus, goodVal + 1)
        );
        newInterval = fuzzInterval(raw, currentInterval);
        nextReviewMins = newInterval * 1440;
        promoted = true;
      }
    }

    newInterval = Math.round(newInterval * 100) / 100;

    const intervalStr =
      nextReviewMins >= 1440
        ? `${Math.round((nextReviewMins / 1440) * 100) / 100} days`
        : `${Math.round(nextReviewMins)} minutes`;

    await pool.query(
      `UPDATE user_vocab
       SET last_seen = NOW(),
           next_review = NOW() + ($3)::interval,
           ease_factor = $4,
           current_interval = $5,
           lapse_count = $6,
           state = $7,
           step_index = $8
           ${promoted ? ", mastery = LEAST(mastery + 1, 8), last_mastery_update = NOW()" : ""}
       WHERE user_id = $1 AND thai = $2`,
      [userId, thai, intervalStr, newEase, newInterval, newLapseCount, newState, newStepIndex]
    );

    await markQueueCardServed(userId, thai);

    await getSessionRecord(userId, thai);
    if (grade !== "again") {
      await incrementCorrect(userId, thai);
    } else {
      await resetCorrect(userId, thai);
    }

    const nextReviewDays = nextReviewMins / 1440;

    res.json({
      success: true,
      promoted,
      lapsed,
      state: newState,
      nextReviewDays,
      easeFactor: newEase,
      lapseCount: newLapseCount,
    });
  } catch (err) {
    console.error("Answer error:", err);
    res.status(500).json({ error: "Answer update failed" });
  }
}

async function handleStats(req, res) {
  try {
    const userId = req.userId;

    const result = await pool.query(
      `SELECT
         COUNT(*) AS total_words,
         COUNT(*) FILTER (WHERE COALESCE(state, 'new') = 'new') AS new_words,
         COUNT(*) FILTER (WHERE COALESCE(state, 'new') IN ('learning', 'relearning')) AS learning_words,
         COUNT(*) FILTER (WHERE COALESCE(state, 'new') = 'review') AS reviewing_words,
         COUNT(*) FILTER (WHERE mastery >= 8) AS mastered_words,
         COUNT(*) FILTER (WHERE next_review <= NOW()) AS reviews_due,
         ROUND(AVG(ease_factor), 2) AS avg_ease,
         SUM(lapse_count) AS total_lapses
       FROM user_vocab
       WHERE user_id = $1`,
      [userId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ error: "Stats failed" });
  }
}

async function handleProgress(req, res) {
  try {
    const userId = req.userId;

    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE DATE(last_seen) = CURRENT_DATE) AS reviews_today,
         COUNT(*) FILTER (WHERE DATE(first_seen) = CURRENT_DATE) AS words_learned_today,
         COUNT(*) FILTER (WHERE mastery >= 8) AS mastered_words
       FROM user_vocab
       WHERE user_id = $1`,
      [userId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Progress error:", err);
    res.status(500).json({ error: "Failed to load progress" });
  }
}

async function handleHeatmap(req, res) {
  try {
    const userId = req.userId;
    const map = {};

    // 1. Vocab activity from review_sessions
    const vocab = await pool.query(
      `SELECT session_date::text AS day, SUM(seen_count) AS count
       FROM review_sessions
       WHERE user_id = $1
       GROUP BY session_date`,
      [userId]
    );
    for (const row of vocab.rows) {
      map[row.day] = (map[row.day] || 0) + Number(row.count);
    }

    // 2. Grammar + other activity from activity_log
    const activity = await pool.query(
      `SELECT activity_date::text AS day, SUM(count) AS count
       FROM activity_log
       WHERE user_id = $1
       GROUP BY activity_date`,
      [userId]
    );
    for (const row of activity.rows) {
      map[row.day] = (map[row.day] || 0) + Number(row.count);
    }

    res.json(map);
  } catch (err) {
    console.error("Heatmap error:", err);
    res.status(500).json({ error: "Heatmap failed" });
  }
}

async function handleActivityLog(req, res) {
  try {
    const userId = req.userId;
    const { source, count } = req.body;
    if (!source || typeof count !== "number" || count < 1) {
      return res.status(400).json({ error: "Invalid source or count" });
    }
    await pool.query(
      `INSERT INTO activity_log (user_id, activity_date, source, count)
       VALUES ($1, CURRENT_DATE, $2, $3)
       ON CONFLICT (user_id, activity_date, source)
       DO UPDATE SET count = activity_log.count + $3`,
      [userId, source, count]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Activity log error:", err);
    res.status(500).json({ error: "Activity log failed" });
  }
}

export function registerSRSRoutes(app, authMiddleware) {
  app.get("/vocab/review", authMiddleware, handleReview);
  app.post("/vocab/answer", authMiddleware, handleAnswer);
  app.get("/vocab/stats", authMiddleware, handleStats);
  app.get("/vocab/progress", authMiddleware, handleProgress);
  app.get("/vocab/heatmap", authMiddleware, handleHeatmap);
  app.post("/activity/log", authMiddleware, handleActivityLog);
}

export { SRS_CONFIG };
