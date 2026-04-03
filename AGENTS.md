# Keystone Languages AI Server

## Project Overview

This is the backend API server for **Keystone Languages**, a Thai language learning application. It provides RESTful endpoints for user management, vocabulary SRS (Spaced Repetition System), grammar lessons, text-to-speech audio generation, subscription billing, and content review workflows.

The codebase is written in **JavaScript (ES modules)** and runs on Node.js with Express.js. The primary natural language used in comments and documentation is **English**.

## Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js (ES modules: `"type": "module"`) |
| Framework | Express.js 5.x |
| Database | PostgreSQL (via `pg` package) |
| Authentication | JWT + bcrypt for passwords, Google OAuth |
| AI/ML | OpenAI GPT-4o-mini for grammar exercises |
| TTS | Google Cloud Text-to-Speech |
| Billing | Paddle (subscription management) |
| NLP | `@nlpjs/lang-th` for Thai language processing |

## Project Structure

```
ai-server/
├── server.js                    # Main application entry point (~6,100 lines)
├── db.js                        # PostgreSQL connection pool configuration
├── srs.js                       # Spaced Repetition System (Anki SM-2)
├── paddle.js                    # Paddle billing/subscription integration
├── jlpt.js                      # Japanese JLPT lesson content routes
├── transform.js                 # OpenAI-powered grammar transformation exercises
├── breakdownTone.js             # Thai tone analysis from spelling/romanization
├── grammar/                     # CSV files with Thai grammar examples (192+ grammar points)
│   ├── classifiers.csv
│   ├── past-laew.csv
│   └── ... (organized by grammar topic)
├── scripts/                     # Maintenance and data migration scripts
│   ├── migrateGrammarCsvsToDb.mjs
│   ├── generateGrammarExamples.mjs
│   ├── seedShowcaseUser.mjs
│   └── ... (reporting and curation tools)
├── admin-data/                  # Admin configuration and JLPT content
│   ├── grammar-overrides.json   # Grammar lesson metadata (migrating to DB)
│   └── jlpt/                    # JLPT lesson content
├── tts-cache/                   # Cached Google TTS audio files
├── package.json                 # Dependencies and npm scripts
├── .env                         # Environment variables (see below)
└── MIGRATION_GUIDE.md           # SRS production migration documentation
```

## Environment Variables

Create a `.env` file with the following variables:

```bash
# Database
DB_HOST=your-db-host
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your-password
DB_NAME=postgres

# Authentication
JWT_SECRET=your-jwt-secret
ADMIN_EMAILS=admin1@example.com,admin2@example.com

# OpenAI
OPENAI_API_KEY=sk-...

# Google OAuth
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=...

# Google TTS (either credentials file or inline JSON)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
# OR
GOOGLE_TTS_CREDENTIALS_JSON={"type":"service_account",...}

# Paddle Billing
PADDLE_API_KEY=pdl_sdbx_... or pdl_live_...
PADDLE_WEBHOOK_SECRET=pdl_ntfset_...
EXPO_PUBLIC_PADDLE_MONTHLY_PRICE_ID=pri_...
EXPO_PUBLIC_PADDLE_YEARLY_PRICE_ID=pri_...

# Email (SMTP) - Required for password reset
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM_EMAIL=noreply@example.com
SMTP_FROM_NAME=Keystone Languages

# Optional
PORT=3000
NODE_ENV=development
TTS_CACHE_MAX_BYTES=1073741824  # 1GB default
```

## Running the Server

```bash
# Install dependencies
npm install

# Start the server (uses .env file automatically)
node server.js

# The server will:
# 1. Run database migrations (auto-creates tables if needed)
# 2. Load the Thai dictionary from telex-utf8.csv
# 3. Load grammar examples from CSV files or database
# 4. Print a startup summary with all routes and service statuses
```

## Key Modules

### srs.js - Spaced Repetition System

Implements an Anki-style SM-2 algorithm with the following features:
- **Card states:** new → learning → review, with lapse → relearning
- **Learning steps:** [1m, 10m] before graduating
- **Relearning steps:** [10m] after a lapse
- **Ease factor adjustments:** Based on answer grades (again/hard/good/easy)
- **Interval fuzzing:** Prevents cards from clustering
- **Daily queue:** Deterministic review queue built once per day

Key configuration in `SRS_CONFIG`:
```javascript
dailyNewWordLimit: 20,
learningSteps: [1, 10],
graduatingInterval: 1,  // days
easyInterval: 4,        // days
```

### breakdownTone.js - Thai Tone Analysis

Derives Thai tone information from Thai spelling and romanization:
- Analyzes consonant classes (mid/high/low)
- Detects syllable types (live/dead)
- Identifies vowel lengths (short/long)
- Maps tone marks (mai ek, mai tho, etc.)
- Supports explicit tone marks in romanization (using Unicode combining diacritics)

Returns confidence scores and review status for quality control.

### paddle.js - Subscription Billing

Integrates with Paddle for subscription management:
- Webhook signature verification
- Subscription status tracking
- Plan switching (monthly/yearly)
- Customer portal sessions
- Prorated billing calculations

## Database Schema

### Core Tables

```sql
-- Users
users (id, email, password_hash, display_name, google_sub, 
       is_admin, can_review_content, has_keystone_access,
       paddle_customer_id, paddle_subscription_id, ...)

-- Vocabulary with SRS state
user_vocab (user_id, thai, english, romanization,
            mastery, ease_factor, current_interval, lapse_count,
            state, step_index, next_review, first_seen, last_seen)

-- SRS session tracking
review_sessions (user_id, thai, session_date, seen_count, correct_count)
review_queue (user_id, thai, queue_date, position, served)

-- Grammar content
grammar_examples (id, grammar_id, thai, romanization, english, 
                  breakdown JSONB, difficulty, tone_confidence, 
                  tone_status, review_status, ...)
grammar_lesson_overrides (grammar_id, stage, content JSONB, ...)
grammar_progress (user_id, grammar_id, rounds, correct, total)

-- User activity
activity_log (user_id, activity_date, source, count)
bookmarks (user_id, grammar_id)
user_preferences (user_id, track_practice_vocab)

-- Password reset
password_reset_tokens (user_id, token_hash, expires_at, used_at)
```

## API Routes Overview

### Authentication
- `POST /signup` - Email/password registration
- `POST /login` - Email/password login
- `POST /auth/google` - Google OAuth sign-in
- `GET /me` - Get current user profile
- `PATCH /me` - Update display name
- `POST /password/forgot` - Request password reset
- `POST /password/reset` - Reset password with token

### SRS / Vocabulary
- `GET /vocab/review` - Get next review card
- `POST /vocab/answer` - Submit answer (grade: again/hard/good/easy)
- `GET /vocab/stats` - Get vocabulary statistics
- `GET /vocab/progress` - Get today's progress
- `GET /vocab/heatmap` - Get activity heatmap data
- `POST /track-words` - Add words to vocabulary

### Grammar
- `GET /grammar/overrides` - Get published grammar lesson overrides
- `POST /practice-csv` - Get a random practice sentence for a grammar point
- `GET /grammar/progress` - Get user's grammar progress
- `POST /grammar/progress/round` - Record a practice round

### Content Review (requires `can_review_content` or `is_admin`)
- `GET /review/queue` - Get review queue items
- `GET /review/grammar/:grammarId` - Get grammar lesson for review
- `PATCH /review/grammar/:grammarId/lesson` - Update lesson content
- `POST /review/grammar/:grammarId/examples` - Add example sentence
- `PATCH /review/examples/:exampleId` - Update example sentence

### Admin (requires `is_admin`)
- `GET /admin/dashboard` - Get admin statistics
- `GET /admin/users` - List all users
- `POST /admin/users` - Create new user
- `PATCH /admin/users/:userId` - Update user
- `GET /admin/grammar` - List all grammar points

### Billing
- `GET /billing/paddle/subscription` - Get subscription details
- `POST /billing/paddle/portal` - Get customer portal URL
- `POST /billing/paddle/subscription/switch` - Switch plan

### Utility
- `GET /health` - Health check with DB pool stats
- `GET /health/startup` - Detailed startup report
- `POST /tts/sentence` - Generate Thai speech audio
- `POST /transform` - Generate grammar transformation exercise
- `POST /alphabet-trainer` - Get words for alphabet practice

### JLPT (Japanese)
- `GET /jlpt/levels` - List JLPT levels
- `GET /jlpt/lessons?level=N5` - List lessons for a level
- `GET /jlpt/lessons/:id` - Get lesson detail

## Code Style Guidelines

1. **Use ES modules:** All files use `import/export` syntax
2. **Async/await:** Prefer async/await over callbacks
3. **Error handling:** Use try/catch blocks; return 500 status for unexpected errors
4. **SQL:** Use parameterized queries (`$1, $2, ...`) to prevent injection
5. **Normalization:** Validate and normalize all user input at route boundaries
6. **Database transactions:** Use `BEGIN/COMMIT/ROLLBACK` for multi-step operations

Example pattern for database routes:
```javascript
app.post('/example', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // ... do work ...
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Operation failed:', err);
    res.status(500).json({ error: 'Operation failed' });
  } finally {
    client.release();
  }
});
```

## Testing

Currently, there is no automated test suite. Testing is done manually:

```bash
# Start the server
node server.js

# Check health endpoint
curl http://localhost:3000/health

# Test authentication (requires valid credentials)
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'
```

## Deployment Considerations

1. **Database migrations:** The server auto-runs migrations on startup (see `startServer()` in server.js)
2. **TTS cache:** Set `TTS_CACHE_MAX_BYTES` to control disk usage
3. **Rate limiting:** Auth and TTS endpoints have built-in rate limiters
4. **Paddle webhooks:** Ensure the webhook endpoint `/webhooks/paddle` is publicly accessible
5. **Cleanup:** Run periodic cleanup of old `review_sessions` and `review_queue` rows (see MIGRATION_GUIDE.md)

## Security Notes

- All passwords are hashed with bcrypt (10 rounds)
- JWT tokens are signed with `JWT_SECRET`
- Database connections use SSL with `rejectUnauthorized: false` (configured for AWS RDS)
- Paddle webhooks are verified with HMAC-SHA256 signatures
- Rate limiting is applied to auth endpoints and TTS endpoints
- Input validation is performed at all route boundaries
