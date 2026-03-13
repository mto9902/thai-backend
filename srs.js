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

// ─── SRS Configuration (Anki defaults) ──────────────────────

const SRS_CONFIG = {
  dailyNewWordLimit: 20,

  // Learning steps in minutes (new cards go through these before graduating)
  learningSteps: [1, 10],
  // Relearning steps in minutes (lapsed cards go through these)
  relearningSteps: [10],

  // Interval (in days) when a learning card graduates via "good"
  graduatingInterval: 1,
  // Interval (in days) when a learning card graduates via "easy"
  easyInterval: 4,

  // Starting ease factor (2.5 = Anki default)
  defaultEase: 2.50,
  minEase: 1.30,
  maxEase: 3.50,

  // Review multipliers
  hardMultiplier: 1.2,
  easyBonus: 1.3,

  // Lapse: new interval = old interval * lapseMultiplier
  lapseMultiplier: 0.1,
  minLapseInterval: 1, // days

  // Cap
  maxInterval: 36500,

  // If no other cards available, show learning cards up to this many minutes early
  learnAheadLimitMins: 20,
};

// ─── Queue Builder ───────────────────────────────────────────

async function getOrBuildQueue(userId) {
  const existing = await pool.query(
    `SELECT COUNT(*) FROM review_queue
     WHERE user_id = $1 AND queue_date = CURRENT_DATE`,
    [userId]
  );

  if (parseInt(existing.rows[0].count) > 0) return;

  const due = await pool.query(
    `SELECT thai FROM user_vocab
     WHERE user_id = $1
       AND COALESCE(state, 'new') IN ('new', 'review')
       AND next_review <= NOW()
     ORDER BY next_review ASC`,
    [userId]
  );

  if (due.rows.length === 0) return;

  const cards = due.rows.map((r) => r.thai);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  const positions = cards.map((_, idx) => idx);

  await pool.query(
    `INSERT INTO review_queue (user_id, thai, queue_date, position)
     SELECT $1, t.thai, CURRENT_DATE, t.pos
     FROM UNNEST($2::text[], $3::int[]) AS t(thai, pos)
     ON CONFLICT (user_id, thai, queue_date) DO NOTHING`,
    [userId, cards, positions]
  );
}

// ─── Queue Info ──────────────────────────────────────────────

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

// ─── Session Tracking ────────────────────────────────────────

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

async function recordResponseTime(userId, thai, ms) {
  if (!ms || ms <= 0) return;
  await pool.query(
    `UPDATE review_sessions
     SET last_response_ms = $3
     WHERE user_id = $1 AND thai = $2 AND session_date = CURRENT_DATE`,
    [userId, thai, ms]
  );
}

// ─── Ease Factor ────────────────────────────────────────────

function clampEase(ease) {
  return Math.max(SRS_CONFIG.minEase, Math.min(SRS_CONFIG.maxEase, ease));
}

// Only adjust ease on review/relearning cards (not learning)
function easeForGrade(currentEase, grade) {
  switch (grade) {
    case "again": return clampEase(currentEase - 0.20);
    case "hard":  return clampEase(currentEase - 0.15);
    case "good":  return currentEase;
    case "easy":  return clampEase(currentEase + 0.15);
    default:      return currentEase;
  }
}

// ─── Helper: minutes → fractional days ──────────────────────

function minutesToDays(mins) {
  return mins / 1440;
}

function clampInterval(days) {
  return Math.min(days, SRS_CONFIG.maxInterval);
}

// ─── Interval Preview Computation (all states) ──────────────

function computeIntervalPreviews(state, stepIndex, ease, currentInterval) {
  const steps = (state === "relearning")
    ? SRS_CONFIG.relearningSteps
    : SRS_CONFIG.learningSteps;

  if (state === "new" || state === "learning") {
    // Again → back to step 0
    const againMins = steps[0] || 1;
    // Hard → repeat current step (or step 0 if at start)
    const hardMins = steps[stepIndex] || steps[0] || 1;
    // Good → next step, or graduate if at last step
    const atLastStep = stepIndex >= steps.length - 1;
    const goodDays = atLastStep
      ? SRS_CONFIG.graduatingInterval
      : minutesToDays(steps[stepIndex + 1] || steps[0]);
    // Easy → skip all steps, graduate with easyInterval
    const easyDays = SRS_CONFIG.easyInterval;

    return {
      again: minutesToDays(againMins),
      hard: minutesToDays(hardMins),
      good: goodDays,
      easy: easyDays,
    };
  }

  if (state === "relearning") {
    // Again → back to step 0 of relearning
    const againMins = steps[0] || 10;
    // Hard → repeat current step
    const hardMins = steps[stepIndex] || steps[0] || 10;
    // Good → graduate back to review with lapsed interval
    const goodDays = Math.max(currentInterval * SRS_CONFIG.lapseMultiplier, SRS_CONFIG.minLapseInterval);
    // Easy → graduate back with slightly better interval
    const easyDays = Math.max(goodDays * 1.5, SRS_CONFIG.minLapseInterval);

    return {
      again: minutesToDays(againMins),
      hard: minutesToDays(hardMins),
      good: clampInterval(goodDays),
      easy: clampInterval(easyDays),
    };
  }

  // state === "review"
  const baseInterval = currentInterval || SRS_CONFIG.graduatingInterval;

  // Again → lapse, enter relearning
  const againMins = SRS_CONFIG.relearningSteps[0] || 10;
  // Hard → interval * hardMultiplier (at least current + 1 day)
  const hardDays = Math.max(baseInterval * SRS_CONFIG.hardMultiplier, baseInterval + 1);
  // Good → interval * ease
  const goodDays = Math.max(baseInterval * ease, hardDays + 1);
  // Easy → interval * ease * easyBonus
  const easyDays = Math.max(baseInterval * ease * SRS_CONFIG.easyBonus, goodDays + 1);

  return {
    again: minutesToDays(againMins),
    hard: clampInterval(Math.round(hardDays * 10) / 10),
    good: clampInterval(Math.round(goodDays * 10) / 10),
    easy: clampInterval(Math.round(easyDays * 10) / 10),
  };
}

// ─── Serve a Card ────────────────────────────────────────────

async function serveCard(userId, card, queueCounts, res) {
  await getSessionRecord(userId, card.thai);
  await incrementSeen(userId, card.thai);

  await pool.query(
    `UPDATE review_queue SET served = TRUE
     WHERE user_id = $1 AND thai = $2 AND queue_date = CURRENT_DATE`,
    [userId, card.thai]
  );

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

  // Get card SRS state for interval previews
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
    vocab.state, parseInt(vocab.step_index), ease, currentInterval
  );

  // Anki-style counts: new / learning / review remaining
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

// ─── GET /vocab/review ───────────────────────────────────────

async function handleReview(req, res) {
  try {
    const userId = req.userId;
    const learnAheadMs = SRS_CONFIG.learnAheadLimitMins * 60 * 1000;

    // 1) First check for learning/relearning cards whose timer is up
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

    // 2) Normal queue flow for new/review cards
    await getOrBuildQueue(userId);
    const queueCounts = await getQueueCounts(userId);

    // Serve next unserved card from queue
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

    // 3) No queue cards left — check for learning cards within learn-ahead limit
    const learnAhead = await pool.query(
      `SELECT v.thai, v.english, v.romanization, v.next_review
       FROM user_vocab v
       WHERE v.user_id = $1
         AND v.state IN ('learning', 'relearning')
       ORDER BY v.next_review ASC
       LIMIT 1`,
      [userId]
    );

    if (learnAhead.rows.length > 0) {
      const nextDue = new Date(learnAhead.rows[0].next_review).getTime();
      const nowMs = Date.now();

      if (nextDue <= nowMs + learnAheadMs) {
        // Within learn-ahead limit — serve it now
        return await serveCard(userId, learnAhead.rows[0], queueCounts, res);
      }

      // Beyond learn-ahead limit — tell frontend to wait
      return res.json({
        waiting: true,
        nextDueAt: learnAhead.rows[0].next_review,
      });
    }

    // 4) Nothing left at all
    if (queueCounts.totalCards === 0) {
      return res.json({ done: true });
    }

    const summary = await getSessionSummary(userId);
    return res.json({ done: true, summary });
  } catch (err) {
    console.error("Review error:", err);
    res.status(500).json({ error: "Failed to generate review" });
  }
}

// ─── Session Summary ─────────────────────────────────────────

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

// ─── POST /vocab/answer — Full Anki State Machine ───────────

async function handleAnswer(req, res) {
  try {
    const userId = req.userId;
    const { thai, grade } = req.body;
    // grade: "again" | "hard" | "good" | "easy"

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
    let nextReviewMins = 0; // minutes from now
    let promoted = false;
    let lapsed = false;

    if (cardState === "new" || cardState === "learning") {
      // ── LEARNING FLOW ──
      const steps = SRS_CONFIG.learningSteps;

      // Ease doesn't change during learning (Anki behavior)

      if (grade === "again") {
        // Back to step 0
        newState = "learning";
        newStepIndex = 0;
        nextReviewMins = steps[0] || 1;

      } else if (grade === "hard") {
        // Repeat current step
        newState = "learning";
        newStepIndex = stepIndex;
        nextReviewMins = steps[stepIndex] || steps[0] || 1;

      } else if (grade === "good") {
        const atLastStep = stepIndex >= steps.length - 1;
        if (atLastStep) {
          // Graduate → review
          newState = "review";
          newStepIndex = 0;
          newInterval = SRS_CONFIG.graduatingInterval;
          nextReviewMins = SRS_CONFIG.graduatingInterval * 1440;
          promoted = true;
        } else {
          // Advance to next step
          newState = "learning";
          newStepIndex = stepIndex + 1;
          nextReviewMins = steps[stepIndex + 1] || 10;
        }

      } else if (grade === "easy") {
        // Skip all steps → graduate with easy interval
        newState = "review";
        newStepIndex = 0;
        newInterval = SRS_CONFIG.easyInterval;
        nextReviewMins = SRS_CONFIG.easyInterval * 1440;
        promoted = true;
      }

    } else if (cardState === "relearning") {
      // ── RELEARNING FLOW (after lapse) ──
      const steps = SRS_CONFIG.relearningSteps;

      // Ease already penalized on lapse entry; don't change further in relearning

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
          // Graduate back to review with lapsed interval
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
        // Skip relearning → back to review
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
      // ── REVIEW FLOW ──
      // Ease adjustments happen here
      newEase = easeForGrade(currentEase, grade);
      const baseInterval = currentInterval || SRS_CONFIG.graduatingInterval;

      if (grade === "again") {
        // Lapse → enter relearning
        lapsed = true;
        newLapseCount = lapseCount + 1;
        newState = "relearning";
        newStepIndex = 0;
        // Keep current_interval for later graduation calc
        nextReviewMins = SRS_CONFIG.relearningSteps[0] || 10;

      } else if (grade === "hard") {
        newState = "review";
        newInterval = clampInterval(Math.max(
          baseInterval * SRS_CONFIG.hardMultiplier,
          baseInterval + 1
        ));
        nextReviewMins = newInterval * 1440;
        promoted = true;

      } else if (grade === "good") {
        newState = "review";
        const hardVal = Math.max(baseInterval * SRS_CONFIG.hardMultiplier, baseInterval + 1);
        newInterval = clampInterval(Math.max(baseInterval * newEase, hardVal + 1));
        nextReviewMins = newInterval * 1440;
        promoted = true;

      } else if (grade === "easy") {
        newState = "review";
        const hardVal = Math.max(baseInterval * SRS_CONFIG.hardMultiplier, baseInterval + 1);
        const goodVal = Math.max(baseInterval * newEase, hardVal + 1);
        newInterval = clampInterval(Math.max(
          baseInterval * newEase * SRS_CONFIG.easyBonus,
          goodVal + 1
        ));
        nextReviewMins = newInterval * 1440;
        promoted = true;
      }
    }

    // Round interval for storage
    newInterval = Math.round(newInterval * 100) / 100;

    // Convert nextReviewMins to a postgres interval string
    const intervalStr = nextReviewMins >= 1440
      ? `${Math.round(nextReviewMins / 1440 * 100) / 100} days`
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

    // Session tracking
    await getSessionRecord(userId, thai);
    if (grade !== "again") {
      await incrementCorrect(userId, thai);
    } else {
      await resetCorrect(userId, thai);
    }
    await incrementSeen(userId, thai);

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

// ─── GET /vocab/stats ────────────────────────────────────────

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

// ─── GET /vocab/progress ─────────────────────────────────────

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

// ─── Register ────────────────────────────────────────────────

export function registerSRSRoutes(app, authMiddleware) {
  app.get("/vocab/review", authMiddleware, handleReview);
  app.post("/vocab/answer", authMiddleware, handleAnswer);
  app.get("/vocab/stats", authMiddleware, handleStats);
  app.get("/vocab/progress", authMiddleware, handleProgress);
}

export { SRS_CONFIG };