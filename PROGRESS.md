# Life OS — Progress

## CURRENT STATE

### Framework
Plain HTML/CSS/JS static files deployed on Vercel. No React, no Next.js, no build step. Server logic via Vercel serverless functions (`api/` directory, Node.js ESM). PWA-enabled (manifest.json, sw.js).

### Supabase Project
URL: `https://nwdyuiimfqhlqscnbqmq.supabase.co`  
Env vars used: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (server-side); anon/publishable key `sb_publishable_KFOU1sDCxRp8c1M3kSytHg_nuQWzfPT` hardcoded in frontend HTML.

### Auth / RLS
**None.** No Supabase Auth, no login flow, no user_id. All tables accessed directly with anon key (frontend) or service key (server). Single-user app — effectively private by obscurity (anon key is publishable/safe but tables have no RLS).

### Data Architecture
1. **localStorage** — primary store for most user-driven modules (gym, body, skin, habits, nutrition meals, mood, finance manual entries, tasks, reminders, calendar, travel, library, social). Synced to Supabase `app_state` table as cloud backup.
2. **`app_state` table** (key TEXT, data JSONB, updated_at TIMESTAMPTZ) — key-value mirror of localStorage for cross-device sync and cloud persistence.
3. **Health metric tables** — receive data from Samsung Health Android bridge:
   - `weight`, `sleep`, `steps`, `heart_rate`, `exercise`, `sleep_stage`, `nutrition` (Samsung Health nutrition), `mindfulness`, `hrv`, `skin_temperature`, `respiratory_rate`, `floors_climbed`, `hydration`, `total_calories`, `basal_metabolic_rate`, `body_fat`, `distance`, `oxygen_saturation`, `mood`, `bloodwork`, `habits`
   - All share schema: `id BIGSERIAL, data JSONB, created_at TIMESTAMPTZ`
4. **`health_insights`** (id, data, created_at) — AI-generated insights from agent
5. **`calendar_events`** (id, data, created_at) — AI-queued Google Calendar events
6. **`api_usage`** (id, data, created_at) — API cost tracking

**`events` table exists (migration in `supabase/migrations/001_events_table.sql`). `addEvent()` write path exists. No Realtime subscriptions yet.**

### API Routes (`api/`)
| File | Purpose |
|------|---------|
| `health/[type].js` | Write health metric rows (POST `data` JSONB) |
| `health/read/[type].js` | Read health metric rows (GET, filter by days/limit) |
| `health-ai/agent.js` | Main AI agent — reads all health tables, writes insights, runs on Vercel Cron 7am daily |
| `health-ai/SUPABASE_SETUP.sql` | Schema for health_insights, calendar_events, api_usage |
| `life-context.js` | Aggregates recent data from all health tables for AI context |
| `nutrition-ai.js` | Food photo/description → nutritional breakdown (Claude Haiku vision) |
| `gcal-nlp.js` | Natural language → calendar event JSON (Claude Haiku) |
| `gcal-config.js` | ~~Deleted~~ — merged into `gcal-nlp.js` GET handler to free a function slot |
| `gc-link.js` / `gc-sync.js` | GoCardless bank transaction sync |
| `se-link.js` / `se-sync.js` | Salt Edge bank transaction sync |
| `sleep-ingest.js` | Receives sleep data from Samsung Health bridge |

### AI (what already exists)
- **Daily briefing**: `agent.js` runs via Vercel Cron at 7am, reads last 7-14 days of all health tables, generates insights via Claude Sonnet, saves to `health_insights`. Cron auth via `CRON_SECRET` header.
- **Nutrition AI**: food photo → macros (Claude Haiku with vision)
- **Calendar NLP**: natural language → calendar event (Claude Haiku)
- Models hardcoded (`claude-haiku-4-5-20251001`, `claude-sonnet-4-6`) — NOT read from `CLAUDE_MODEL` env var yet.

### Existing Modules (HTML pages)
| Page | Status | Notes |
|------|--------|-------|
| `index.html` | Full — Dashboard/Command Center | AI summary, health tiles, date nav |
| `gym.html` | Full | DUP split, PRs, volume, muscle tracking, body goals, cycle tracker |
| `health.html` | Full | Bloodwork, sleep, weight, metrics panels |
| `nutrition.html` | Full | TDEE, meal log, AI nutrition, Supabase nutrition data |
| `water.html` | Full | Hydration tracking |
| `po-water.html` | Full | Procal water (Samsung Health) |
| `body.html` | Full | Body composition |
| `skin.html` | Full | Skin routines, irritation |
| `glowlab.html` | Full | Skin device sessions, LED, microneedling |
| `mood.html` | Full | Mood & energy ratings |
| `habits.html` | Full | Habit tracking with streaks |
| `finance.html` | Full | Expenses, GoCardless/Salt Edge bank sync |
| `calendar.html` | Full | Google Calendar sync + Pomodoro |
| `tasks.html` | Full | Task management |
| `reminders.html` | Full | Reminders + supplement schedule |
| `social.html` | Full | Social log |
| `library.html` | Full | Reading tracker |
| `travel.html` | Full | Travel log |
| `export.html` | Full | Data export |
| `watch.html` | Full | Samsung Health bridge |
| `review.html` | Full | Weekly review |
| `usage.html` | Full | API usage/cost tracking |

### Integrations
- Samsung Health / Health Connect: Android app → `/api/health/*` → Supabase tables (working)
- Google Calendar: OAuth via frontend GAPI + token client (working)
- GoCardless: Bank sync (working)
- Salt Edge: Bank sync (working)
- Nutrition AI: Claude vision (working)
- No lab PDF OCR yet
- No Finance CSV import yet

### Env Vars in use
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`, `GC_SECRET_ID`, `GC_SECRET_KEY`, `SE_APP_ID`, `SE_SECRET`, `CRON_SECRET`, `SLEEP_INGEST_SECRET`

### Missing `.env.example`
None committed.

---

## BUILD PLAN

### Phase 0 — Discovery & Foundation
- [x] Discovery pass complete; CURRENT STATE written in PROGRESS.md. _(this file)_
- [x] Unified `events` table + RLS + indexes. `supabase/migrations/001_events_table.sql`. No user_id (no Supabase Auth); anon-role RLS policies allow full access; 4 indexes (ts, type, domains GIN, data GIN). Note: replace policies with auth.uid() scope when auth is added.
- [x] Single `addEvent()` write path. `api/events/add.js` (POST, service key, returns row). `events.js` client helper (window.addEvent). Note: freed one Vercel function slot by merging `api/gcal-config.js` GET handler into `api/gcal-nlp.js` (GET = clientId, POST = NLP); `calendar.html` fetch updated to `/api/gcal-nlp`. Function count: 12/12.
- [ ] Realtime subscription helper — client-side `subscribeToEvents(callback)` using Supabase Realtime on the `events` table. Auth note: single-user app, no Supabase Auth; use service key server-side, anon key client-side with RLS policy that allows all reads/inserts for anon role (single-user acceptable — revisit if multi-user needed).
- [ ] Universal Input Bar widget (structured fallback) — a persistent bottom bar added to `index.html` that creates real events via `addEvent()`. Manual structured form (no NLP yet). Include domain selector + type + value fields.
- [ ] `/api/health` route — basic health check endpoint returning `{ status: 'ok', ts }`.
- [x] `.env.example` committed with all required env var names. Added `CLAUDE_MODEL` and `CLAUDE_MODEL_FAST`.
- [x] Wire `CLAUDE_MODEL` env var into all AI API routes. `agent.js` MODELS const, `nutrition-ai.js`, `gcal-nlp.js` — all read from `process.env.CLAUDE_MODEL[_FAST]` with hardcoded fallback.

### Phase 1 — Core Modules (extend existing HTML pages with `events` data)
- [ ] Training & Workout: wire `addEvent()` into gym.html manual log form so sets/sessions also write to `events` table (keep existing localStorage behavior). Add `events`-backed selector for recent sessions tile.
- [ ] Sleep: wire sleep manual-entry into `events` (type `sleep.night`). Show events-backed rolling 7-day avg and readiness score.
- [ ] Mood & Energy: wire mood.html ratings into `events` (type `mood.rating`). Show events-backed trend.
- [ ] Body Composition: wire body.html weight/measurement logs into `events`. Show events-backed goal pacing.
- [ ] Nutrition: wire nutrition.html manual meal logs into `events` (type `nutrition.meal`). Running surplus/deficit from events.
- [ ] Finance: wire finance.html manual expense entry into `events` (type `finance.expense`). Monthly burn from events.

### Phase 2 — Health Modules
- [ ] Supplements: wire reminders.html supplement logs into `events` (type `supplements.taken`). Adherence streak from events.
- [ ] Bloodwork: wire health.html bloodwork entry into `events` (type `bloodwork.panel`). Reference-range bands on chart.
- [ ] Skin: wire skin.html routine log into `events` (type `skin.routine`). Correlate irritation with routine from events.

### Phase 3 — AI Intelligence Layer
- [ ] Wire `CLAUDE_MODEL` env var (already in Phase 0; full AI service refactor).
- [ ] NL input parsing → events: extend `/api/events/add.js` with NL parse mode — POST `{ text }` → Claude parses → calls `addEvent()` for each detected event. Wire into Universal Input Bar as primary path.
- [ ] Daily briefing upgraded: agent.js to read from `events` table (in addition to existing health tables) for manual entries; store briefing as `ai.briefing` event; display on `index.html`.
- [ ] Cross-domain insight engine: standalone `/api/ai/insights.js` — reads events across domains, calls Claude, writes `ai.insight` events. Run from Vercel Cron.
- [ ] Anomaly/flag detection: `/api/ai/flags.js` — biomarker out-of-range, weight swings, skin spikes, finance blowouts → write `ai.flag` events → surface in `index.html` insight strip.
- [ ] AI Panel: new `ai.html` page — full briefing, insights list, flags, active experiments, chat interface.
- [ ] Experiment engine: propose/track/report via `ai.experiment` events.

### Phase 4 — Integrations
- [x] Sleep + activity import (Samsung Health via watch.html + Health Connect Android app). _(already working)_
- [x] Google Calendar two-way sync. _(already working in calendar.html)_
- [ ] Lab PDF upload → server OCR → bloodwork fields prefilled.
- [ ] Finance CSV import (supplement to GoCardless/Salt Edge live sync).

### Phase 5 — Polish & Hardening
- [ ] Mobile layout pass (fast-capture flows — InputBar usable on mobile).
- [ ] Charts pass: sparklines on Command Center tiles, range bands on bloodwork charts.
- [ ] RLS review: verify `events` RLS actually blocks unintended access; document decision on single-user auth model.
- [ ] Settings page (`settings.html`): goals, reminder config, what context gets sent to AI, data export/backup.
- [ ] `.env.example` kept current (done in Phase 0).
- [ ] Final verification + Definition of Done.

---

_Last updated: 2026-05-30. Phase 0: events table, addEvent() write path, .env.example, CLAUDE_MODEL wiring done. Next: Realtime subscription helper._
