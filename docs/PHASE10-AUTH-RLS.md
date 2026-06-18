# Phase 10 — Auth + RLS Migration (DRAFT, do not apply)

Status: **DRAFTED — awaiting owner-coordinated cutover.** No SQL has been run, no
RLS enabled, no client auth wired. APPLE_PLAN.md §3 + Phase 10 require this to land
as ONE coordinated change with an owner login test; enabling RLS without auth would
break every client read/write (publishable key returns zero rows). This doc is the
reviewable plan.

## 0. Why this is owner-gated

- The client (cloudsync.js, realtime.js, lifeos-core.js) reads/writes `app_state`
  and `events` directly with the **publishable** anon key. The moment RLS is ON and
  policies require `auth.uid()`, those calls return nothing **unless** the client
  sends a logged-in session JWT. So auth UI + session plumbing must ship in the same
  release as the policies.
- Single-user app → exactly one auth account. Owner must create it and confirm they
  can still log in and see their data after cutover ("owner can still access the app"
  acceptance criterion).

## 1. Tables to protect (from `api/` + client)

- `app_state` (cols: `key` text PK, `data` jsonb) — client-written via publishable key
- `events` (cols: `type`, `data`, `ts`) — client-written via publishable key
- Health tables (server-written via service key): `heart_rate, steps, calories,
  sleep, height, weight, oxygen_saturation, exercise, sleep_stage, nutrition,
  mindfulness, hrv, skin_temperature, respiratory_rate, floors_climbed, hydration,
  total_calories, basal_metabolic_rate, body_fat, distance, mood, bloodwork, habits`

## 2. Schema change (add owner scoping)

Single user, so one `OWNER_UID` (the auth.users id created in step 4). Add a
`user_id` column defaulting to `auth.uid()`, backfill existing rows to OWNER_UID.

```sql
-- run per table; example for app_state + one health table
alter table public.app_state add column if not exists user_id uuid default auth.uid();
update public.app_state set user_id = '<OWNER_UID>' where user_id is null;
alter table public.app_state alter column user_id set not null;
-- repeat for events + every health table in §1
```

## 3. RLS policies (template per table)

```sql
alter table public.app_state enable row level security;

create policy app_state_select on public.app_state
  for select using (auth.uid() = user_id);
create policy app_state_modify on public.app_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Apply the same two policies to `events` and each health table. The **service key**
(server routes) bypasses RLS, so server-side health writes keep working — but they
MUST stamp `user_id = OWNER_UID` on insert so reads (which may go through RLS) match.

## 4. Auth setup (Supabase)

1. Create one user in Supabase Auth (email + password). Record its `id` = OWNER_UID.
2. Decide flow: email+password login screen, session persisted by supabase-js.
3. No sign-up UI (single user) — login only, plus password reset.

## 5. Client changes (coordinated, same release)

- Add supabase-js (or keep hand-rolled fetch but attach the session
  `Authorization: Bearer <access_token>` + `apikey` headers).
- Gate the app shell behind a login check; unauthenticated → login screen.
- `cloudsync.js`, `realtime.js`, `lifeos-core.js`: send the session JWT instead of
  the bare publishable key on every `/rest/v1/*` call + the realtime socket.
- Token refresh handling (supabase-js does this automatically; hand-rolled needs a
  refresh path).

## 6. Server changes

- Health/ingest routes use `SUPABASE_SERVICE_KEY` (bypasses RLS) + their own secrets
  (`SLEEP_INGEST_TOKEN`, `CRON_SECRET`).
- **CRITICAL FINDING (self-review, HIGH) — FIXED IN CODE.** Service-role inserts run
  with `auth.uid() = NULL`, so the `user_id NOT NULL DEFAULT auth.uid()` column would
  get NULL → **every server insert would fail (and NULL-owned rows would be invisible
  to the owner's authed reads).** Fixed: all six Supabase-insert routes now stamp
  `user_id: process.env.OWNER_UID` —
  `api/health/[type].js`, `api/health-ai/agent.js` (health + events + briefing),
  `api/events/add.js`, `api/push-subscribe.js`, `api/sleep-ingest.js`, `api/_webpush.js`.
  Pre-cutover `OWNER_UID` is unset → `undefined` → omitted by `JSON.stringify` →
  behaviour is byte-identical to today. **You MUST set the `OWNER_UID` env var
  (= the auth user's id) on Vercel before enabling the NOT NULL constraint / RLS**,
  or server ingestion breaks.
- After cutover, rotate the publishable key (it was exposed pre-RLS) — TODO P0 item.

## 7. Cutover order (do NOT reorder)

1. Ship client build that can authenticate but still works pre-RLS (auth optional).
2. Create the Supabase auth user; copy its id.
3. Set `OWNER_UID` env on Vercel = that id, and redeploy (so server routes stamp it).
4. Owner logs in once on the deployed app; confirm session works.
5. Run §2 schema + backfill (rows now owned by OWNER_UID).
6. Run §3 enable RLS + policies.
7. Owner reloads → confirms data still visible (now via session); confirm a server
   ingest (e.g. Tasker push) still writes a row.
8. `LifeOSAuth.setRequired(true)` → make auth required (remove the pre-RLS fallback).
9. Rotate publishable key.

## 8. Rollback

- `alter table ... disable row level security;` immediately restores pre-RLS access
  via publishable key. Keep the client's pre-RLS fallback until step 6 is proven.
- `user_id` column is additive (safe to leave if rolling back RLS).

## 9. Required tests (Phase 10 acceptance)

- [ ] Unauthenticated `/rest/v1/app_state` request → 0 rows / rejected.
- [ ] Authenticated (owner session) → full access to own rows.
- [ ] A second fabricated user cannot read OWNER_UID rows (RLS isolation).
- [ ] Ingest endpoints reject calls without their secret.
- [ ] Backup → restore still round-trips post-RLS.
- [ ] Owner can still log in + see data after the full cutover.

## 9b. Security self-review findings (Codex CLI sandbox couldn't read the FS)

- **[HIGH, FIXED] service-role inserts didn't set user_id** — see §6. All 6 routes
  now stamp `OWNER_UID`; set the env before enabling RLS.
- **[HIGH, FIXED] sleep-ingest fail-open** — `if (expectedToken && body.token !== …)`
  skipped auth entirely when `SLEEP_INGEST_TOKEN` was unset. Now fails CLOSED via
  `checkIngestToken` (api/_ingest-auth.js): no token configured -> 503; token via
  `X-Ingest-Token` header / `body.token` / `?token`, constant-time compared.
- **[HIGH, STAGED] health ingest (`api/health/[type].js`) had NO auth** — open POST
  to 24 DB tables with `CORS *`. Added `checkIngestToken(..., {failOpenWhenUnset:true})`:
  enforces once **`HEALTH_INGEST_TOKEN`** is set; stays open while unset so the
  current Tasker/Health Connect flow isn't broken. **Cutover: set `HEALTH_INGEST_TOKEN`
  + add the same token (header `X-Ingest-Token`) to the Tasker/MacroDroid HTTP task.**
- **[MEDIUM] sleep-ingest uses the publishable key**, so post-RLS (no session) it
  can't write. At cutover, switch `api/sleep-ingest.js` to `SUPABASE_SERVICE_KEY`
  (server-only, bypasses RLS) so server ingest keeps working. (Already stamps
  user_id.)
- **[HIGH, cutover] push-subscribe.js is unauthenticated** (service key, no auth). A
  POST registers any push subscription into `push:subs:v1`; an attacker could add
  THEIR endpoint and receive the owner's AI briefing pushes (personal health/finance
  data), or DELETE to drop the owner's subs. It's browser-called, so the right fix is
  the **user session** (gate POST/DELETE on a valid Supabase session at the auth
  cutover), not an ingest token. GET (returns the VAPID public key) can stay open.
  Until then this is a known pre-RLS exposure. Same applies to the read endpoints
  (`health/read/[type]`, `life-context`) which RLS will protect.
- **[LOW, accepted] auth gate not focus-trapped / `auth:required` flag is localStorage
  (tamperable)** — acceptable: the gate is UX, RLS server-side is the real boundary;
  single-user on own device.

## 10. Threat review checklist (run with Codex adversarial review before cutover)

unauthenticated access · cross-user access · stolen browser state · exposed
publishable key · service-role leakage · OAuth callback · CSRF/state · operator
privilege · file upload validation · injection · secret storage · backup exposure ·
restore integrity. Then Semgrep + Gitleaks.
