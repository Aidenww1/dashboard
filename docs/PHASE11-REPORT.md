# Phase 11 - More

## Scope

Replaced the previous destination directory with the locked More views:

- Settings
- Integrations
- Notifications
- Data
- Life
- About

## Functional recovery

- Settings edits `settings:v1` and shares calorie/protein targets with `nt:tdee`.
- Coach context controls persist finance and bloodwork inclusion preferences.
- Integrations report truthful connection status from Calendar, Mail, bank, health, and browser signals.
- Notifications summarize `reminders:v1` and the canonical morning briefing keys.
- Data reports current browser storage, exports a complete JSON snapshot, and links to full ZIP/CSV/restore tools.
- Clear-local-data remains confirm-gated and cancellation leaves data untouched.
- Life retains real extended workflows without duplicating the primary navigation.
- About reports local storage and service-worker build facts.
- Search filters only the active section and exposes an explicit no-results state.

## Information architecture

- Removed templates, roadmap, support-directory, subscription, and marketplace filler.
- Removed incorrect Lifestyle to GlowLab routing.
- Preserved only operational links to existing workflows.

## Visual parity

- Added a quiet six-view segmented control in the shared shell.
- All six tabs wrap into two stable rows at 390px.
- Verified no desktop or mobile horizontal overflow.

## Verification

- `node tests/more-contract.test.js`: 19 passed, 0 failed.
- `node --experimental-websocket tests/browser-more-qa.mjs`: passed.
- Settings, context, integrations, notifications, export, reset cancellation, search, Life, and About were exercised.
- Browser console: no actionable problems.
- Expected local-only noise: missing `favicon.ico`.

## Evidence

- `docs/phase11-screenshots/more-integrations-1440x900.png`
- `docs/phase11-screenshots/more-settings-mobile-390x844.png`
