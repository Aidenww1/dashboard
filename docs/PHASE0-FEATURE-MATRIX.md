# Phase 0 Feature Parity Matrix

Legend: `present` means a current implementation was found; `partial` means the workflow or target structure is incomplete; `blocked` means runtime verification requires the unavailable process host, credentials, deployment, or a device.

## Top-Level Areas

| Area | Current implementation | Target reference | Status | Recovery requirement |
|---|---|---|---|---|
| Today | `ui/today.html`, `ui/data.js` | Dense first-viewport dashboard | partial | Compact layout, live projections, loading/error/empty states, responsive verification |
| Log | `ui/log.html` plus root engines | Six domain tabs | partial | Preserve mature flows, split domain ownership, correct subtab IA |
| Coach | `ui/coach.html`, AI/context APIs | Data-aware briefing and chat | partial | Authenticate APIs, eliminate fictional defaults, verify recommendations |
| Money | `ui/money.html`, `finance.html`, `glowlab.html` | Seven subtabs | partial | Consolidate real personal/business stores and imports |
| More | `ui/more.html` plus compatibility pages | Five grouped sections | partial | Normalize Settings, Integrations, Notifications, Data, Life, About |

## Log Areas

| Area | Required subtabs or primary views | Current evidence | Status | Main gap |
|---|---|---|---|---|
| Food | Food dashboard and logging | Nutrition engine plus new Food panel | partial | End-to-end photo/search/template/barcode, edits, targets, timeline validation |
| Body | Overview, Composition, Recovery, Labs, Photos | All five labels present; body/health engines and IndexedDB photos exist | partial | Canonical metric/lab source, photo lifecycle, responsive parity |
| Training | Overview, Cardio, Progress, History | Overview, Strength, Cardio, Progress, History | partial | Remove standalone Strength tab and fold strength workflows into required views |
| Skin | Overview, Routine, Products, Lab, Photos | Existing skin engine and new panels | partial | Verify all five views, product/routine CRUD, photo and analysis paths |
| Water | Overview, Target, History, Settings | Existing hydration engine and new panels | partial | Verify target builder, history, settings, delete/undo, unit behavior |
| Supplements | Overview, Schedule, Compounds, Monitoring, Inventory, Notes | Overview, Schedule, Labs, Notes | partial | Add Compounds and Inventory; replace Labs label with Monitoring projection from Body Labs |

## Data and Workflow Parity

| Capability | Evidence | Status | Gate |
|---|---|---|---|
| Create logs | Mature root engines and new-panel handlers | present | Browser flow test |
| Edit logs | Present in multiple mature pages | partial | Verify each domain and sync propagation |
| Delete logs | Confirmation handlers present | partial | Verify tombstones and real Undo |
| Undo destructive action | Toast-only implementation in `ui/ui.js` | missing | Implement rollback before claiming Undo |
| Local persistence | Multiple localStorage namespaces | present | Document namespace ownership |
| Cloud sync | Supabase `app_state` adapter | partial | Auth, deletion, conflict, request-volume tests |
| Event ingestion | `/api/events/add` plus bridge | partial | Authenticate and improve deduplication |
| Health ingestion/read | Typed health APIs/tables | partial | Close fail-open/auth gaps; verify RLS |
| Photos | IndexedDB `LifeOSPhotos` | partial | Export/delete/storage-limit and device tests |
| Import/export | Root and More flows exist | partial | Round-trip and schema-version tests |
| Offline/PWA | Manifest/service worker assets exist | partial | Install, update, offline-write, reconnect tests |
| Authentication | Staged, disabled by default | partial | Owner-approved cutover and deployed RLS verification |
| Authorization | Draft RLS plus anonymous legacy policy | missing | Applied migration proof and negative access tests |
| AI features | Nutrition, visual, health agent, context APIs | partial | Authentication, quota, error, privacy tests |
| Integrations | Gmail/calendar/health/push references | blocked | Credentials, provider configuration, and device required |

## UI State Parity

| State | Current coverage | Status |
|---|---|---|
| Populated | Many reference-like panels | partial |
| Honest empty | Present on current dashboard | partial |
| Loading | Not consistently standardized | missing |
| Error | Not consistently standardized | missing |
| Disconnected integration | Present in selected cards | partial |
| Confirmation | Shared confirm dialog exists | present |
| Undo | Visual feedback without rollback | missing |
| Keyboard/focus | Shared overlay focus trap exists | partial |
| Reduced motion | Shared CSS support exists | present |
| Tablet | Shared compact shell exists | blocked |
| Mobile | Shared bottom navigation exists | blocked |

## Runtime Verification Queue

The following is queued immediately after the Windows process host is restored:

1. Run `npm test` and record exact pass/fail totals.
2. Run Semgrep and Gitleaks using verified repository configuration.
3. Serve the repository locally without modifying application code.
4. Capture Today, Coach, Money, More, and each Log area at 1440x900, 1792x1024, 768x1024, and 390x844.
5. Capture every major subtab at desktop and sample tablet/mobile overflow behavior.
6. Record console errors, failed requests, broken links, layout overflow, and inaccessible controls.
7. Test create/edit/delete/confirm/undo/import/export/offline/sync behavior with isolated test data.
8. Mark credential-, deployment-, or device-dependent checks explicitly blocked rather than passing them by assumption.
