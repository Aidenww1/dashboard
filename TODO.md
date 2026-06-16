# Life OS — Road to "Apple Quality"

Everything left between today's build and a dashboard that is genuinely the only app Kees opens. Honest, exhaustive, prioritized. Checkboxes so it can be worked top-down.

Status today: all 14 roadmap phases built + post-v14 backlog (1-9) + operator layer + multi-device activity + PR/entry deletes. SW v32, 10/12 serverless functions. Most AI/OAuth/push flows are built but **verified only in local preview** — not yet proven on the deployed app with real data.

Legend: ⛔ blocker · 🔴 high · 🟡 medium · 🟢 polish · 💤 deferred-by-spec

---

## P0 — Security & Trust (do FIRST, nothing ships safely without this)
- [ ] ⛔ **Supabase Auth (single account).** App talks to Supabase with a publishable key and no login → anyone with the key has full access. Add one-account auth; client uses the session, not the raw key.
- [ ] ⛔ **Enable RLS on every `public` table** (`app_state`, `events`, health tables) with policies requiring the authenticated user. Without auth this either breaks the app or protects nothing — must land with the auth change.
- [ ] 🔴 **Lock the activity bridge** behind auth/secret before piping screen-time data (sensitive even as a summary).
- [ ] 🔴 **Secret on any ingest endpoints** (push-subscribe, future activity-ingest) so they can't be spammed.
- [ ] 🟡 Audit what the publishable key can read today; rotate it after RLS lands.
- [ ] 🟡 Confirm the Supabase **service key** only ever lives in Vercel env (never shipped to client). Currently correct — keep it that way.
- [ ] 🟢 Add a privacy/data page: what's stored, where, how to wipe it.

## P1 — Finish "the AI runs everything" (the North Star)
- [ ] 🔴 **Risky-action tools for the operator** behind preview→confirm: Gmail (archive/reply/label), finance (categorize/mark), calendar (create/move/cancel blocks), delete entries. Today the operator only does safe additive actions.
- [ ] 🔴 **Unify the data layer.** Server `agent.js` tools write Supabase health tables; the UI + client operator write localStorage. Pick one source of truth so the operator acts on exactly what the screens show.
- [ ] 🔴 **Photo actions from chat** ("analyze/log this photo") — wire the operator into the Analyze→Report→Log flow.
- [ ] 🟡 **Operator memory of pending actions** across navigation (currently ephemeral; lost on page change).
- [ ] 🟡 **Calendar (Google) write** end-to-end from the day planner + operator (OAuth scope + confirm).
- [ ] 🟡 Make the command/operator bar the genuine universal entry: voice button optional (💤), but every module reachable + operable from it.

## P1 — Real-world validation (everything "verified to boundary" must be proven live)
- [ ] 🔴 Deploy: `vercel --prod`. Then verify on a real device, signed in:
- [ ] 🔴 AI vision: meal photo, body photo, skin photo, bloodwork screenshot, receipt — Analyze→Report→Log each actually works with the API key.
- [ ] 🔴 Gmail OAuth + classification + safe cleanup + order extraction on the real inbox.
- [ ] 🔴 Web push: set VAPID env, subscribe on phone, confirm the 07:00 briefing arrives with the app closed.
- [ ] 🔴 Cloud backup + **restore** round-trip on a real device (spec's "test restore once").
- [ ] 🟡 Weekly report, feature-gap audit, opportunity news scan, ask-anything — confirm live with real data.
- [ ] 🟡 Share-target on Android: share photo/receipt/text into each destination and confirm intake.
- [ ] 🟡 Confirm the morning agent cron actually fires on Vercel and saves the briefing.

## P2 — "Apple Quality" UI/UX (the part that makes it feel premium)
- [ ] 🔴 **Adopt the spec's exact nav**: Today / Log / Coach / Money / More (5 tabs). Current 4 + More-sheet is close but not the named structure; "Coach" and "Log" deserve first-class tabs.
- [ ] 🔴 **Consistent design system pass** across all 20+ pages: one type scale, spacing scale, radius, shadow, color tokens. Several pages predate design.css and drift.
- [ ] 🔴 **Loading states everywhere**: skeleton loaders for every card that fetches/computes (no blank flashes, no layout shift).
- [ ] 🔴 **Error + empty states everywhere**: every card needs a useful empty state (spec: "No meals logged yet. Log your first meal…") and a graceful error state, not silence.
- [ ] 🟡 **Motion**: 60fps page/card transitions, sheet spring animations, list reordering, tasteful micro-interactions. Respect `prefers-reduced-motion`.
- [ ] 🟡 **Gestures**: swipe-to-delete/complete on list rows, pull-to-refresh, bottom sheets for quick edits (spec calls these out).
- [ ] 🟡 **Haptics** on key actions (where supported) + crisp tap feedback.
- [ ] 🟡 **Confirm sheets** for risky actions instead of `confirm()` dialogs (Apple-style action sheets).
- [ ] 🟡 **Today view ordering** to match spec exactly: Life Score → Coach priority → Readiness → Calendar → Supplements → Calories/protein → Focus → Orders → Important email → Money alert → Opportunity → Missing data.
- [ ] 🟢 Icon set consistency (one stroke weight, one family), app icon polish, splash screen.
- [ ] 🟢 Typography: real font loading (Inter), font-display swap, no FOUT.
- [ ] 🟢 Dark/light parity (currently dark-only) — at least lock dark beautifully.
- [ ] 🟢 Number formatting + locale (EUR, dates, 24h) consistent everywhere.
- [ ] 🟢 Polished install/onboarding flow (current onboarding is a 3-step overlay — deepen it).

## P2 — Data integrity & editing (you must be able to fix anything yourself)
- [ ] 🔴 **Edit/delete on every module's entries**, like the new gym PR/set delete: meals, weight, sleep, mood, supplements, finance tx, subscriptions, orders, skin logs, body photos, bloodwork, tasks, goals, reminders. No more "stuck bad data."
- [ ] 🟡 **Undo** for destructive actions (toast with Undo) instead of hard confirms everywhere.
- [ ] 🟡 **Data Quality Score** surfaced consistently and feeding advice confidence in every AI output (spec requires it).
- [ ] 🟡 Dedupe + validation on import (bank CSV, bloodwork) so bad rows can't poison trends.
- [ ] 🟢 A "Fix my data" view: list anomalies (impossible weights, 350000kg lifts) and one-tap correct.

## P3 — Activity & Visual intelligence (the "track what I'm really doing")
- [ ] 🟡 **Enrich the activity bridge**: active-vs-AFK split, window **titles** (gaming/docs/specific sites), category buckets (work/social/video/gaming). Currently only top apps/domains.
- [ ] 🟡 **Activity → insights**: feed screen-time into Opportunity Radar (time gaps, distraction) + the briefing + focus auto-tracking (replace manual focus timer).
- [ ] 🟡 **Activity history** (timeline + week trends), not just today's summary.
- [ ] 🟡 **OCR confirm flow** for shared bloodwork/receipt (health page currently stages the image; make Analyze→confirm→Log explicit).
- [ ] 🟢 **Progress-photo auto-align** (pose/scale normalization) — needs a lightweight CV/pose model; the hard one. Until then keep the manual comparison slider + alignment guides + ghost-overlay.
- [ ] 💤 Workout form video analysis (spec-deferred).

## P3 — Architecture hardening
- [ ] 🟡 Move heavy DB reads/writes behind serverless `/api` (the spec's `getLifeContext` is meant to be server-side; today it's client `LifeOS.context`). Reduces key exposure + centralizes.
- [ ] 🟡 **Postgres full-text search** for global search (currently client-side JS over localStorage) once data is server-side.
- [ ] 🟡 **Offline IndexedDB write queue + optimistic UI** (Phase 12 part 2, not built). localStorage-first approximates it; a real queue makes multi-device + flaky-network solid.
- [ ] 🟡 Split the monolith HTML files (finance.html, gym.html, health.html are huge) into shared modules; faster loads, less duplication.
- [ ] 🟢 Server scheduled daily DB backup (currently client-driven cloud backup) on a paid tier or cron dump.
- [ ] 🟢 Stay within Vercel Hobby limits (10/12 functions, 2 crons) — track as features grow.

## P4 — Performance, accessibility, testing
- [ ] 🟡 **Performance budget**: first paint < 1.5s on mobile, no jank. Audit the largest pages, lazy-load below-the-fold, cache AI results (already partly done).
- [ ] 🟡 **Accessibility**: focus states, ARIA on custom controls, contrast AA, screen-reader labels, 44px tap targets, keyboard nav on desktop.
- [ ] 🟡 **Automated tests**: there are none. Add unit tests for the deterministic core (life score, readiness, savings rate, CSV parser, deload, merge, briefing, actions) — these are pure and high-value.
- [ ] 🟢 Smoke/E2E for the critical flows (log a day, analyze a photo, run the operator).
- [ ] 🟢 Error logging/telemetry (client errors surfaced somewhere you'll see them).
- [ ] 🟢 Lighthouse PWA score 100; verify installability + offline shell on real devices.

## Per-module acceptance gaps (spec checklist sweep)
For each module, confirm it meets the spec's "feature complete" bar: mobile-OK, 5-sec understandable, reduces app-switching, empty/loading/error states, in Today + search + command bar, updates Data Quality, suggests reminders, Analyze→Report→Log for photos, audit run.
- [ ] 🟡 Nutrition · Training · Recovery · Health/Bloodwork/Supplements/Skin · Finance · Gmail · Productivity · Radar · Coach · Body progress — run each against the checklist, fix the misses.

## P0/P1 — Things the first pass missed (real, not polish)
- [~] ⛔ **Photo storage will overflow localStorage.** Body/skin progress photos in `localStorage` (~5-10MB quota) will hard-fail after a few months of weekly sets. Move photos to **IndexedDB** (local) and/or **Supabase Storage** (synced, RLS-protected). PARTIAL — body.html progress photos moved to IndexedDB via photo-store.js (a27a0a9). STILL TODO: skin.html photos (in skin:logs, which is cloud-synced via SYNC_KEYS — needs Supabase Storage or drop from sync) and po_coach_photos (gym, base64+Supabase). Resolve with the deferred security/Storage work.
- [ ] 🔴 **Google OAuth verification.** Gmail/Calendar use sensitive scopes. An unverified app stuck in "testing" expires refresh tokens ~weekly (constant re-login) and shows a scary consent screen. Either complete Google's verification (CASA assessment for restricted scopes — real cost/effort) or accept weekly re-auth. Decide + document.
- [ ] 🔴 **Provider limits & cost caps.** Supabase free tier pauses after inactivity + 500MB cap; Anthropic API spend has no budget guard; Vercel Hobby caps (functions/crons/bandwidth). Add usage monitoring + a hard AI-spend cap + a plan for when limits hit.
- [x] 🔴 **Multi-device sync = last-write-wins → silent data loss.** DONE — cloudsync.js (LifeOSSync) does per-key timestamp merge with Supabase Realtime + edit-deferral + prefix matching. ALL pages migrated, incl. finance/index/gym (c6d9aee, 1ce6c3f, 2d81b92). Remaining minor gap: whole-key deletion isn't propagated (needs tombstones) — rare here since entries are edited via array rewrites.
- [ ] 🔴 **Timezone / DST correctness.** Crons run in UTC; briefing wake-time, date-keys, streaks, "today" windows are local. DST shifts and travel will mis-bucket days, break streaks, fire briefings at the wrong hour. Centralize date handling + test around DST.
- [ ] 🟡 **localStorage schema migrations.** Keys evolve (`:v1` bumps) with no migration framework; a shape change silently breaks old data. Add versioned migrations on load.
- [ ] 🟡 **Strip EXIF/GPS from uploaded photos** before store/analyze (don't leak home location in image metadata).
- [ ] 🟡 **Backup encryption.** Cloud backups + photos are plaintext sensitive data in Supabase. Consider client-side encryption for the backup blob and stored photos.
- [ ] 🟡 **Historical / bulk import.** Getting past data in (old weights, workouts, transactions) — a bulk import/paste flow so the app isn't starting from zero.
- [ ] 🟢 **Backup round-trip from ZIP.** Restore currently reads the JSON; confirm you can fully rebuild from the exported ZIP too.

## Legal & compliance (EU / single user, but still)
- [x] 🔴 **Medical disclaimer** on bloodwork/supplements/skin ("not medical advice, consult a professional"). DONE — health.html page-foot disclaimer (c4b2362).
- [x] 🟡 **Financial disclaimer** on can-I-afford/mortgage/investing ("not financial advice"). DONE — finance.html page-foot disclaimer (c4b2362).
- [ ] 🟡 **GDPR basics**: health data is special-category. Even single-user, document data location, retention, and a one-tap "delete everything" (right to erasure) — also good hygiene.
- [ ] 🟢 Anthropic / Google / Supabase ToS compliance check for personal use at this scale.

## Ops, reliability & quality
- [~] 🔴 **Error monitoring** (client + serverless). Right now failures are silent; you'd never know an AI call, sync, or cron is broken. CLIENT DONE — errlog.js / LifeOSErrors ring buffer + tap-to-view surface (1cc3e2a). STILL TODO: serverless (agent.js/api errors) + cron-failure visibility.
- [ ] 🟡 **Graceful degradation** when Anthropic/Supabase/Google are down or rate-limited (clear states, retries with backoff, never a blank screen).
- [ ] 🟡 **Secrets/key rotation** plan + checklist (VAPID, Supabase, Anthropic, Google).
- [ ] 🟡 **AI quality evals**: a small regression set for the deterministic-vs-AI boundary so prompt/model changes don't silently degrade coaching/classification.
- [ ] 🟡 **Anthropic model migration** handling (model IDs deprecate; centralize + monitor).
- [ ] 🟢 In-app changelog / "what's new" after each deploy.
- [x] 🟢 SW update UX: prompt "new version, reload" instead of silent/stale (the stale-cache issue hit us during dev). DONE — pwa.js controllerchange toast (c4b2362).

## Settings & account
- [ ] 🟡 **One real Settings hub**: units, calorie/protein/sleep targets, wake time, integrations (Gmail/Calendar/VAPID/activity), privacy, export, danger-zone wipe. Currently scattered across pages.
- [ ] 🟡 **Account recovery** for the single Supabase account (password reset / re-auth on a new device).
- [ ] 🟢 Per-module preferences (e.g. which cards show on Today, ordering).

## Platform-native polish (true "phone replacement")
- [ ] 🟢 **Android home-screen widgets** (readiness / today / supplements) — PWAs can't do native widgets; would need a thin TWA or companion. Evaluate.
- [ ] 🟢 **TWA / Play Store presence** so it feels like a real installed app (optional; PWA install already covers most).
- [ ] 🟢 Notification **quiet hours** + per-type toggles + timezone-correct scheduling.
- [ ] 🟢 App shortcuts/quick actions already exist — add a share-to-Life-OS from more contexts; richer notification actions.

## Deferred by spec (don't build unless asked)
- [ ] 💤 Samsung Health sync (revisit when reads are reliable; manual-first holds).
- [ ] 💤 Voice logging.
- [ ] 💤 PSD2 live bank feed (CSV import is in; upgrade later).
- [ ] 💤 Advanced investing automation (research/watchlists OK; no auto-trading).

## Definition of "done / Apple quality"
- [ ] Wake up → Today view answers "what matters" in < 10s.
- [ ] Log anything in < 15s, from anywhere, including by voice-of-chat operator.
- [ ] Every risky action has a clean confirm; every list item is editable/deletable; nothing ever gets "stuck."
- [ ] Every screen has loading + empty + error states and feels instant.
- [ ] Claude can explain or operate every module from chat, acting on real data.
- [ ] Data is secured by Auth + RLS; backups proven to restore.
- [ ] 30-day test: no other tracking/planning/money/inbox/photo app gets reinstalled. If one does, log it here and build the missing feature.
