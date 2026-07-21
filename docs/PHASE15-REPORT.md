# Phase 15 - Live integration validation

## Production deployment checked

The linked production project is `dashboard` on Vercel. Its latest ready production deployment was built from an earlier repository commit, so the current Phase 9-15 workspace changes are not deployed yet. No deployment, push, or promotion was performed during this phase.

## Provider results

| Integration | Result | Evidence / boundary |
| --- | --- | --- |
| Google Calendar | Configured | Production `/api/gcal-nlp` returned a Google OAuth client ID. Calendar writes remain behind preview and explicit Add confirmation. A user OAuth consent session was not automated. |
| Gmail | Configured, not connected in clean profile | Uses the same configured Google client and bounded `gmail.modify` scope. Trash and bulk archive require confirmation. A user OAuth consent session was not automated. |
| AI | Live pass | Production nutrition AI returned a structured medium-banana result. |
| Photo analysis | Configured and guarded | Production visual AI reached input validation and returned `Provide an image`; no supplied image and no write occurred. Body and Skin keep analysis separate from Save. |
| Lab analysis | Configured and guarded | Production lab OCR reached input validation and returned `image_base64 required`; no supplied report and no write occurred. |
| Push | Configured | Production returned a VAPID public key. No notification permission or device subscription was created during automation. |
| Share target | Local installed-app pass | A controlled service worker accepted a multipart image share, cached metadata and the exact file, and the test removed both cache entries afterward. |
| Backup / restore | Pass | Phase 12 performed an actual JSON restore. Restore and destructive reset remain confirmation-gated. |
| Installed PWA / offline | Pass | Phase 14 verified service-worker control and offline Money navigation; Phase 15 reverified installation readiness. |
| Bank connections | Not implemented | Money exposes CSV import and local account data. No bank-provider adapter exists, so the UI does not claim a connection. A provider choice and credentials are still required. |

## Production configuration names

Vercel reports configured encrypted variables for Google OAuth, Anthropic AI, Supabase, and VAPID push. Values were not downloaded or exposed. The push session-enforcement flag and owner UID are not configured; this is handled as a Phase 16 security gate.

## Automated evidence

- `tests/live-integrations-contract.test.js`: 27 passed, 0 failed.
- `node --experimental-websocket tests/browser-live-local-qa.mjs`: passed.
- Production nutrition AI: HTTP 200 with structured nutrition data.
- Production visual AI: validated request and rejected missing image.
- Production lab OCR: validated request and rejected missing image.
- Screenshot: `docs/phase15-screenshots/integrations-local-state-1440x900.png`.

## Result

Phase 15 local and production-safe validation is complete. Provider configuration and non-destructive live paths pass. User-consent actions, real photo/lab uploads, device notification enrollment, and bank-provider onboarding were not fabricated; their exact remaining requirements are recorded above.
