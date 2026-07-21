# Phase 12 - Remaining Workflows

## Phase summary

Status: complete for local and deterministic workflows. Credential-, provider-, and device-dependent execution remains assigned to Phase 15.

## Workflow closure

| Capability | Result | Evidence |
|---|---|---|
| Overlays | Sheet/dialog semantics, focus entry, Escape close, and trigger-focus restoration verified | `browser-workflows-qa.mjs` |
| Entry forms | Domain form coverage retained across Food, Body, Training, Skin, Water, Supplements, Money, and More | domain browser suites |
| Editing | Body, Training, Skin, Water, Supplements, targets, context, and Money workflows verified | domain browser suites |
| Deletion | Destructive domain flows remain confirmation-gated | domain browser suites |
| Undo | Shared rollback contract and browser row restoration verified | `ui-contract.test.js`, `browser-workflows-qa.mjs` |
| Imports | Finance parsing and JSON restore verified; provider/device imports reserved for Phase 15 | `finance-parse.test.js`, browser restore |
| Confirmations | Shared `alertdialog` contract and action path verified | workflow contract/browser suite |
| Integration setup | More links to canonical Mail, Calendar, Finance, Health, and Reminders owners; truthful status verified | Phase 11 browser suite |
| Backup/restore | Snapshot identity, junk tolerance, and actual browser File restore verified | `backup.test.js`, browser workflow suite |
| Search | Food/More/domain searches and explicit no-results state verified | domain browser suites |
| Notifications | Canonical reminder stores, explicit permission request, and More summary verified | workflow contract, Phase 11 browser suite |

## Link integrity

- Audited every static local anchor in `ui/*.html`.
- No missing local targets were found.
- Compatibility destinations remain available until their owning workflows are fully retired.

## Verification

- `node tests/workflow-contract.test.js`: 12 passed, 0 failed.
- `node --experimental-websocket tests/browser-workflows-qa.mjs`: passed.
- Full `npm test`: all 19 suites passed before adding the workflow suite; the suite is now auto-discovered by the same runner.
- Browser console: no actionable problems.
- Expected local-only noise: missing `favicon.ico`.

## Evidence

- `docs/phase12-screenshots/workflow-overlays-1440x900.png`
- `docs/phase12-screenshots/workflow-backup-1440x900.png`
