# SRS Production Migration Guide

## What changed and why

### Problem → Solution

| Prototype issue | Production fix |
|---|---|
| `reviewSession`, `lastCardShown`, `sessionDate` live in memory — lost on restart | Moved to `review_sessions` table in Postgres |
| Random card selection skips cards, repeats others | Deterministic queue built once per day (`review_queue` table), served in order |
| Mastery 5 = never reviewed again | Extended to mastery 8 with long-tail intervals: 14d → 30d → 60d |
| Wrong answer drops mastery by 1 regardless of level | Harder penalty at high mastery (drop 2 levels if mastery ≥ 3) |
| DELETE /bookmark has no try/catch | All routes now have consistent error handling |
| SRS config scattered across server.js | Centralized in `SRS_CONFIG` object in srs.js |

---

## Step 1: Run the migration

```bash
psql -d your_database -f migration_srs_production.sql
```

This creates `review_sessions` and `review_queue` tables, and ensures
`user_vocab` has the required columns.

---

## Step 2: Update server.js

### Remove these things entirely:

1. **All in-memory session variables** (lines ~24-28 in your current file):
```js
// DELETE all of this:
let sessionDate = new Date().toDateString();
const reviewSession = {};
let lastCardShown = {};
const MAX_REVIEWS_PER_WORD = 3;
const DAILY_NEW_WORD_LIMIT = 20;
```

2. **The `resetDailySession()` function** — no longer needed.

3. **These route handlers** (they now live in srs.js):
   - `GET /vocab/review`
   - `POST /vocab/answer`
   - `GET /vocab/stats`
   - `GET /vocab/progress`

### Add these:

At the top of server.js, import the SRS module:
```js
import { registerSRSRoutes, SRS_CONFIG } from "./srs.js";
```

After your auth middleware definition, register the routes:
```js
registerSRSRoutes(app, pool, authMiddleware);
```

In your `/track-words` route, replace the hardcoded limit:
```js
// Change this:
// if (learnedToday + added >= DAILY_NEW_WORD_LIMIT) {
// To this:
if (learnedToday + added >= SRS_CONFIG.dailyNewWordLimit) {
```

### Fix the bookmark delete route:

```js
app.delete("/bookmark", authMiddleware, async (req, res) => {
  try {
    const { grammarId } = req.body;
    const userId = req.userId;

    await pool.query(
      `DELETE FROM bookmarks WHERE user_id = $1 AND grammar_id = $2`,
      [userId, grammarId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send("Bookmark delete failed");
  }
});
```

---

## Step 3: Add cleanup cron (optional but recommended)

Old session and queue rows pile up. Run this daily via pg_cron or a
scheduled task:

```sql
DELETE FROM review_sessions WHERE session_date < CURRENT_DATE - INTERVAL '7 days';
DELETE FROM review_queue WHERE queue_date < CURRENT_DATE - INTERVAL '7 days';
```

---

## SRS interval schedule (new)

```
Mastery 1 → review in 1 day
Mastery 2 → review in 2 days
Mastery 3 → review in 4 days
Mastery 4 → review in 7 days
Mastery 5 → review in 14 days    ← NEW (was "mastered/done")
Mastery 6 → review in 30 days    ← NEW
Mastery 7 → review in 60 days    ← NEW
Mastery 8 → fully mastered
```

Wrong answer penalty:
- Mastery 1–2: drop 1 level
- Mastery 3+: drop 2 levels (forgetting a "known" word = it wasn't solid)

---

## What this does NOT change

- Auth system (unchanged)
- Bookmarks (unchanged, just added error handling)
- `/track-words` (unchanged, just uses config constant)
- `/practice-csv` (unchanged)
- `/login` (unchanged)
- Dictionary/grammar loading (unchanged)
- Transform route (unchanged)
