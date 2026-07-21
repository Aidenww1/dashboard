# Phase 0: Visual Parity and Functional Recovery Audit

Date: 2026-07-12

Status: audit only. No product code, deployment, or data migration was changed.

## Executive Summary

The repository contains two overlapping application generations:

- root-level HTML pages that still own much of the mature business logic and data handling;
- a newer `ui/` shell with stronger visual consistency but incomplete feature consolidation.

The current redesign is not yet a single application. It is a visual shell layered over a mixture of new panels, root-page compatibility links, duplicated navigation, and several storage paths. The highest-risk work is not color or spacing. It is preserving mature logging flows while removing duplicated pages and closing unauthenticated server-side data access.

The locked target information architecture is:

- Today
- Log: Food, Body, Training, Skin, Water, Supplements
- Coach
- Money
- More

The current implementation diverges in two important places: Training still exposes a Strength subtab, and Supplements lacks the required Compounds, Monitoring, and Inventory structure.

## Repository State

- Git root: `C:/Users/maila/Desktop/dashboard`
- Branch: `redesign/phase-0-8`
- Working tree at audit start: clean
- Latest observed commit: `cf66323 feat(ui/log): port warmup flow, cycle tracker, composition estimate, body goals`
- Package scripts: `npm test` only; no local development-server script
- Deployment configuration: Vercel rewrite for `/api/health`; Netlify and Vercel metadata are both present
- PWA entry point: `/ui/today.html`

## Page Inventory

### Production shell

| Page | Current role | Target disposition |
|---|---|---|
| `ui/today.html` | New Today dashboard | Keep and recover live states |
| `ui/log.html` | Monolithic six-area Log implementation | Split by domain behind one Log shell |
| `ui/coach.html` | New Coach surface | Keep; verify all recommendations use canonical data |
| `ui/money.html` | New Money surface | Keep; migrate mature finance workflows into its subtabs |
| `ui/more.html` | New More hub | Keep; normalize required groups |
| `ui/settings.html` | Settings compatibility page | Fold into More / Settings |
| `ui/privacy.html` | Privacy compatibility page | Fold into More / Data or About |
| `ui/fix.html`, `ui/gallery.html`, `ui/glowlab.html`, `ui/library.html`, `ui/mood.html`, `ui/social.html`, `ui/tasks.html`, `ui/travel.html`, `ui/usage.html`, `ui/watch.html` | New-shell compatibility destinations | Retain only where a locked target section owns the workflow |

### Mature root pages

| Pages | Current ownership | Target owner |
|---|---|---|
| `index.html` | Legacy dashboard and global core | Today plus shared data services |
| `log.html`, `nutrition.html` | Food logging and nutrition engine | Log / Food |
| `body.html`, `health.html` | Composition, recovery, labs, health metrics | Log / Body |
| `gym.html` | Training sessions, templates, progress | Log / Training |
| `skin.html` | Skin routines, products, analysis, photos | Log / Skin |
| `water.html` | Hydration target, logging, history, settings | Log / Water |
| `reminders.html` | Supplement schedule and reminders | Log / Supplements / Schedule |
| `finance.html`, `money.html`, `glowlab.html` | Personal finance and business P&L | Money subtabs |
| `coach.html`, `ai.html`, `radar.html`, `review.html` | Coaching, analysis, review | Coach, with review entry points from Today |
| `calendar.html`, `tasks.html`, `mail.html` | Planning and inbox | Today or More / Integrations |
| `settings.html`, `privacy.html`, `export.html`, `usage.html` | Configuration and data controls | More |
| `library.html`, `social.html`, `travel.html`, `watch.html`, `share.html`, `fix.html` | Secondary tools and compatibility flows | More or remove after parity approval |
| `habits.html`, `mood.html`, `ds.html` | Legacy or experimental surfaces | No top-level destination; evaluate for More or retirement |

Every HTML page must remain reachable during migration through explicit compatibility routing. A page should only be retired after its write path, edit/delete behavior, import/export behavior, and empty/error states have moved to the canonical owner.

## Visual Discrepancy Report

The reference screens use a dense, desktop-first operational layout. The current shell is close in color and typography but differs in composition and information density.

1. Current dashboard cards are taller than the reference and force vertical scrolling at the target desktop viewport.
2. The reference uses compact metric strips, dense tables, and shallow cards; current panels often spend more height on whitespace and centered empty states.
3. The shell sidebar uses a hardcoded owner name and a hardcoded score delta instead of configured identity and computed state.
4. The current Life Score and top metrics frequently show real empty-state data, while reference images show populated examples. The implementation must preserve honest empty states and must not copy fictional reference values.
5. Sparkline and chart treatment is inconsistent between migrated panels and mature pages.
6. The current `ui/log.html` is one very large document, making spacing and component behavior drift between tabs.
7. Mobile and tablet navigation exists in shared CSS, but page-specific dense grids require viewport-by-viewport validation.
8. The manifest icon is an orange four-square mark and does not match the violet Life OS ring identity.
9. Manifest shortcuts still expose legacy and out-of-scope concepts instead of the locked five-destination architecture.
10. Shared tokens describe an isolated gallery layer even though the files now style production pages; documentation and ownership are stale.

## Functional Recovery Findings

### Critical

1. Authentication is staged but inactive by default. `auth.js` only enforces sign-in when a local flag or session enables it.
2. The deployed data surface is not consistently protected. The events migration grants anonymous CRUD, while the draft Phase 10 RLS migration has not been established as applied.
3. Several API routes use a service-role key without verified caller authentication. The observed exposure includes event writes and health reads. AI and context endpoints also require an explicit authentication review.
4. `api/health/[type].js` is fail-open if its ingest secret is absent. `api/push-subscribe.js` is protected only when an environment switch is enabled.

### High

1. Local storage, Supabase `app_state`, typed health tables, the events table, and IndexedDB photo storage all participate in current behavior. There is no single documented source-of-truth policy.
2. `cloudsync.js` wraps `localStorage.setItem` during registrations and does not propagate deletion tombstones. This can create request amplification and resurrect deleted data.
3. `events-bridge.js` uses coarse deduplication for some records and can merge distinct same-day entries.
4. `ui/ui.js` presents Undo feedback but does not execute rollback. Destructive flows must not claim reversibility until rollback is real.
5. Training has an extra Strength subtab, contrary to the locked architecture.
6. Supplements currently exposes Overview, Schedule, Labs, and Notes. The target requires Overview, Schedule, Compounds, Monitoring, Inventory, and Notes, with Monitoring reading the canonical Body Labs data.
7. PWA shortcuts target legacy pages and features outside the locked architecture.

### Medium

1. `ui/shell.js` hardcodes `Kees` and an “up 6” score delta.
2. Default dialog/sheet examples in `ui/ui.js` contain fictional nutrition values.
3. Progress documentation is stale and conflicts with the presence of staged auth/RLS work.
4. The repository has both Netlify and Vercel artifacts, increasing deployment ambiguity.
5. Root engines above 100 KB and the 400+ KB Log page increase regression risk and make domain ownership difficult to review.

## Data-Path Map

```text
Browser UI
  |-- localStorage namespaces
  |     |-- LifeOS core/domain stores
  |     |-- ui/data.js dashboard projection
  |     `-- cloudsync.js <-> Supabase app_state
  |
  |-- IndexedDB LifeOSPhotos
  |
  |-- events.js -> /api/events/add -> Supabase events
  |                                `-> events-bridge.js -> localStorage
  |
  |-- health clients -> /api/health/* -> typed Supabase health tables
  |                                  `-> realtime.js subscriptions
  |
  `-- AI/context clients -> /api/nutrition-ai, visual-ai, health-ai, life-context
```

Canonical ownership proposed for migration:

| Domain | Canonical write owner | Read projections |
|---|---|---|
| Food | Existing nutrition store/API after parity tests | Today, Coach, Log / Food |
| Body composition | Existing body metric store | Today, Coach, Log / Body |
| Recovery and labs | Typed health tables with authenticated access | Body Recovery/Labs, Supplements Monitoring, Coach |
| Training | Existing gym session/template stores | Today, Coach, Log / Training |
| Skin | Existing skin stores plus IndexedDB photos | Log / Skin, Coach |
| Water | Existing hydration stores | Today, Coach, Log / Water |
| Supplements | Existing reminder/compound/inventory stores | Today, Coach, Log / Supplements |
| Money | Existing finance and GlowLab stores | Today, Coach, Money |

No cross-domain panel should write a second copy of canonical data. Dashboard cards and Coach recommendations should be projections only.

## Component Architecture

Keep the current token and shell layer, then separate domain controllers from views:

```text
ui/shared
  tokens.css
  components.css
  shell.js
  ui.js
  data.js

ui/domains
  today/
  food/
  body/
  training/
  skin/
  water/
  supplements/
  coach/
  money/
  more/

services
  auth
  storage adapters
  sync and events
  health and labs
  AI gateways
```

Reusable view primitives should cover metric strips, compact cards, dense tables, charts, segmented controls, dialogs, confirmation, empty states, errors, and skeleton loading. Domain modules retain their existing calculation and persistence logic until parity tests prove a replacement.

## Migration Order

1. Establish testable local serving, authenticated API boundaries, and the canonical data-source contract.
2. Correct shell identity, route map, PWA icon, and shortcuts without changing domain behavior.
3. Recover Today at the four target viewports using live projections and honest empty states.
4. Recover Log / Food, then Body.
5. Recover Training while removing the separate Strength subtab and preserving full-body flexible 3x/week flows inside Overview, Cardio, Progress, and History.
6. Recover Skin and Water.
7. Consolidate Supplements and reuse Body Labs for Monitoring.
8. Recover Coach against canonical projections.
9. Consolidate Money, including GlowLab business data.
10. Consolidate More, remove compatibility routes only after parity tests, then complete PWA/offline and deployment verification.

## Test Baseline

The repository defines `npm test` through `tests/run.js`, with suites covering auth, backup, cloud sync, dates, finance parsing, ingest auth, Life OS behavior, and operators. Existing deployment documentation reports 124 tests, but this audit does not claim that historical result as current.

The current local Windows process host failed with `CreateProcessWithLogonW failed: 1058`. This blocked:

- the current `npm test` result;
- Semgrep execution;
- Gitleaks execution;
- local HTTP server startup;
- Playwright screenshots and interaction checks at 1440x900, 1792x1024, 768x1024, and 390x844.

These checks remain mandatory gates before Phase 1 changes. Context7, OpenSpace, GSD, and a Codex review tool were not available in the active tool environment and were not substituted with invented output.

## Acceptance Gates Before Phase 1

- Restore command execution and record the current automated test count and failures.
- Run Semgrep with a verified local or approved ruleset and Gitleaks with `.gitleaks.toml`.
- Capture the required responsive baseline for Today, Log and all six areas, Coach, Money, More, and major subtabs.
- Exercise create, edit, delete, undo, import/export, offline, auth, and sync flows where credentials and devices permit.
- Confirm which Supabase migrations are applied in the deployed project.
- Confirm deployment owner and platform, and remove ambiguity between Vercel and Netlify.
- Approve the canonical data-source map and migration order.

## Risks

- Security work can invalidate local-first assumptions and must precede broad UI deployment.
- A visual rewrite of mature root pages can silently lose parsing, import, edit, and deletion behavior.
- Sync changes can duplicate or resurrect records unless deletion and conflict semantics are specified first.
- Large monolithic pages make visual and behavioral regression review expensive.
- Reference images contain fictional populated data; copying those values would hide real empty and disconnected states.
- Device-dependent health imports, Gmail, calendar, push, and AI providers cannot be certified without credentials and deployed environment checks.
