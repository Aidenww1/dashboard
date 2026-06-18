# Phase 9 — Deployment & Live-Validation Prep

Status: **PREPARED — awaiting owner approval.** Nothing here has been executed.
The plan (APPLE_PLAN.md §3 Deployment safety, Phase 9) requires owner approval
before any `vercel --prod`. This doc is the "show the exact commands and expected
effects" step.

## 1. Current repository state (at prep time)

- Branch: `main`
- Working tree: **uncommitted** — 32 files changed (+1211 / −3914), untracked:
  `APPLE_PLAN.md`, `money.html`, `more.html`, `dates.js`, `tests/`, `package.json`,
  `AGENTS.md`, plus tooling dirs (`.codex/`, `.playwright-mcp/`).
- `po-water.html` deleted (Phase 3, verified no unique logic).
- Service worker cache: `dashboard-v50`.
- Tests: `node tests/run.js` → 65/65 passing.

> The redesign batch (Phase 0-8) is **not yet committed**. A deploy needs a commit
> first. No commit/push has been made — that is an explicit owner-approval gate.

## 2. Exact commands (run only after approval)

```bash
# 1. Review what will ship
git status
git diff --stat

# 2. Stage + commit on a branch (do NOT commit straight to main without review)
git switch -c redesign/phase-0-8
git add -A
git commit            # message describes the Phase 0-8 redesign batch

# 3. Deploy preview first, smoke-test, THEN production
vercel                # preview URL
# ...verify preview...
vercel --prod         # production: dashboard-pi-green-48.vercel.app
```

Expected effect: the redesigned 5-tab app replaces the current production build;
SW v50 busts stale caches for existing installed clients on next load.

## 3. Required environment variables (Vercel project settings)

Server-only (NEVER shipped to client). Confirm each is set before deploy:

| Var | Used by | Notes |
|-----|---------|-------|
| `ANTHROPIC_API_KEY` | visual-ai, nutrition-ai, gcal-nlp, agent | AI vision + coach |
| `CLAUDE_MODEL_FAST` / `CLAUDE_MODEL_SMART` / `CLAUDE_MODEL` | api/* | model routing |
| `SUPABASE_URL` | all server DB routes | |
| `SUPABASE_SERVICE_KEY` | server DB routes | **service role — server only** |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | _webpush, push-subscribe | web push |
| `GOOGLE_CLIENT_ID` | gcal-nlp | calendar OAuth |
| `SLEEP_INGEST_TOKEN` | sleep-ingest | endpoint auth |
| `CRON_SECRET` | health-ai/agent cron | cron auth |

Client uses only the Supabase **publishable** key (`sb_publishable_…`, already in
client code — safe by design, RLS-protected once Phase 10 lands).

## 3b. Pre-flight verification (done autonomously)

- All 11 `api/*.js` serverless functions are valid ESM (`node --check --input-type=module`
  passes for each). They use `import`/`export`; Vercel's Node builder treats them as
  ESM via syntax detection.
- `package.json` is intentionally **type-less**. Do NOT add `"type":"module"` — it
  would break the CommonJS test suite (`tests/*.test.js` use `require`) and
  `dates.js`'s `module.exports` dual-export, while the api functions already work as
  ESM without it. (If a future @vercel/node ever fails ESM syntax-detection, the
  surgical fix is renaming api files to `.mjs`, not flipping the package type.)
- `node tests/run.js` → 124/124 green.

## 4. Known risks before deploy

- **No Auth/RLS yet (Phase 10).** Supabase tables are reachable with the publishable
  key. Deploying does not change that. RLS must land (Phase 10) for real protection.
- **cloudsync request storm** (task_7e9d1bc9): ~228 Supabase reqs/key/load observed
  in preview. On production this is real egress/latency. Consider fixing before or
  shortly after deploy.
- Vercel Hobby limits: function count + 2 crons. Confirm under cap.
- Google OAuth app in "testing" → ~weekly re-auth (owner-accepted, document in
  More → Integrations).

## 5. Live flows to validate ON the deployed app + real device (Phase 9)

Cannot be proven locally. For each: prerequisites → test data → owner approval →
real action → capture → fix → mark proven.

- [ ] AI briefing with real key (no idle spend; button-triggered)
- [ ] AI vision: meal / body / skin / bloodwork / receipt → Analyze→Report→Log
- [ ] Gmail OAuth → inbox triage → order detection → safe cleanup preview
- [ ] Web push while app closed (VAPID set; 07:00 briefing arrives)
- [ ] Cloud backup → full restore onto reset/other device
- [ ] Share-target intake (Android): photo / receipt / text
- [ ] Real-device photo orientation (EXIF)
- [ ] Operator actions on real data (preview+confirm gated)
- [ ] Google Calendar read/write
- [ ] Activity bridge security

## 6. Approval gate

Do not run section 2 until the owner explicitly approves. Show this doc + `git
status` + `git diff --stat` + test results at approval time.
