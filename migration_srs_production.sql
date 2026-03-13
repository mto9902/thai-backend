-- =============================================
-- SRS Production Migration
-- Run this against your database before deploying
-- =============================================

-- 1. Review session tracking (replaces in-memory reviewSession + lastCardShown)
CREATE TABLE IF NOT EXISTS review_sessions (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thai          TEXT NOT NULL,
  session_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  seen_count    INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  last_shown_at TIMESTAMPTZ,
  UNIQUE(user_id, thai, session_date)
);

CREATE INDEX IF NOT EXISTS idx_review_sessions_user_date
  ON review_sessions(user_id, session_date);

-- 2. Review queue (replaces random selection with ordered queue)
CREATE TABLE IF NOT EXISTS review_queue (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thai        TEXT NOT NULL,
  queue_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  position    INTEGER NOT NULL,
  served      BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(user_id, thai, queue_date)
);

CREATE INDEX IF NOT EXISTS idx_review_queue_user_date
  ON review_queue(user_id, queue_date, position);

-- 3. Extend user_vocab if columns are missing
--    (safe to run multiple times due to IF NOT EXISTS logic)
DO $$
BEGIN
  -- Ensure next_review exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_vocab' AND column_name = 'next_review'
  ) THEN
    ALTER TABLE user_vocab ADD COLUMN next_review TIMESTAMPTZ DEFAULT NOW();
  END IF;

  -- Ensure last_mastery_update exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_vocab' AND column_name = 'last_mastery_update'
  ) THEN
    ALTER TABLE user_vocab ADD COLUMN last_mastery_update TIMESTAMPTZ;
  END IF;

  -- Ensure mastery default is 1
  ALTER TABLE user_vocab ALTER COLUMN mastery SET DEFAULT 1;
END
$$;

-- 4. Daily cleanup (optional: run via cron or pg_cron)
--    Removes session/queue rows older than 7 days to keep tables lean
-- DELETE FROM review_sessions WHERE session_date < CURRENT_DATE - INTERVAL '7 days';
-- DELETE FROM review_queue WHERE queue_date < CURRENT_DATE - INTERVAL '7 days';
