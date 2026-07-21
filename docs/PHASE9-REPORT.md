# Phase 9 - Coach

## Scope

Rebuilt the deployed Coach page around the locked information architecture:

- Briefing
- Readiness
- Ask
- Inbox
- Opportunities
- Reviews

## Functional recovery

- Briefing and Readiness use the deterministic `LifeOS` core calculations.
- Ask keeps one AI entry point and calls `LifeOSCmd.ask` only after explicit submission.
- Inbox reads `mail:summary:v1` and shows a truthful disconnected state when absent.
- Opportunities reads `radar:summary:v1` and shows a truthful unscanned state when absent.
- Reviews reads `review:ritual:v1` and `coach:plans:v1` without manufacturing insights.
- View rendering is isolated behind an error state with retry.
- Hash routes preserve the active Coach view.

## Visual parity

- Added a restrained segmented view control matching the Life OS shell.
- Rebalanced content across the shared 12-column grid using 4/8/12-column cards.
- Kept all six Coach tabs visible at 390px by wrapping into two stable rows.
- Verified no desktop or mobile horizontal overflow.

## Verification

- `node tests/coach-contract.test.js`: 18 passed, 0 failed.
- `node --experimental-websocket tests/browser-coach-qa.mjs`: passed.
- Ask engine invocation count: 0 on view/prompt selection, 1 after submit.
- Browser console: no actionable problems.
- Expected local-only noise: missing `favicon.ico`.

## Evidence

- `docs/phase9-screenshots/coach-briefing-1440x900.png`
- `docs/phase9-screenshots/coach-reviews-mobile-390x844.png`
