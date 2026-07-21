# Phase E: Body, Recovery, and Training

## Status

Complete. Phase E makes Body, Recovery, Training, Labs, and body-photo metadata canonical, projection-backed, responsive, and connected to Today, Coach, and Supplements monitoring.

## Delivered

### Canonical commands and projections

- Body measurement, sleep, body-goal, strength-session, set, cardio, lab-panel, and body-photo actions emit canonical events.
- Corrections supersede prior facts; deletion tombstones the canonical chain so stale revisions do not return.
- Every canonical write queues outbox work for cross-device transport.
- Existing `po_coach_*`, `health:*`, `body:*`, `sleep:*`, `blood:*`, and `gym:*` data remains available through compatibility projections.
- Canonical same-day facts take precedence over legacy facts without duplicating totals.

### Body and recovery

- Overview, Composition, Recovery, Labs, and Photos consume one merged canonical/legacy state.
- Measurement edits preserve unrelated same-day body facts.
- Weight, body fat, lean mass, waist, sleep duration, sleep debt, and readiness update together.
- Goals persist through the canonical profile command while retaining compatibility with existing consumers.
- Body-photo metadata is canonical; image bytes remain in IndexedDB and orphan bytes are removed after failed writes.
- Photo deletion is confirmation-gated and removes both canonical metadata and local image bytes.

### Training

- Session start, strength sets, completion, cardio create/edit/repeat, and deletion use canonical commands.
- Set payloads retain session, exercise, load, repetitions, RPE, unit normalization, and occurrence time.
- A completed workout no longer remains resumable. A second same-day workout starts a new session and calculates its own set count and volume.
- Dashboard volume, weekly cadence, performance, PRs, muscle volume, cardio, history, and coach guidance share the same merged facts.

### Cross-surface behavior

- Body measurement and sleep update Today body, recovery, readiness, and Coach readiness.
- Strength and cardio update Today training state and Coach briefing.
- Out-of-range labs update Body Labs, Supplements monitoring, Today Attention, and Coach Signals/Follow-up.
- The shared attention adapter emits one ranked Bloodwork item with marker-level detail instead of duplicating warnings per page.

### Responsive UI

- All six Log domains remain visible in one desktop row and a fixed three-by-two tablet/phone grid.
- Body and Training internal tabs remain fully visible at every required viewport.
- Labs support cards use four columns on wide desktop, two columns at standard desktop widths, and one column on narrow layouts.
- Mobile Body context copy stacks naturally, and fixed bottom navigation does not cover the final card.

## Data Flow

`Body/Recovery/Training command -> canonical event -> repository -> Phase E projections -> Log + Today + Coach + Supplements -> outbox`

Legacy compatibility writes remain during the transition so older consumers continue to work while canonical projections become the source of truth.

## Verification

### Deterministic tests

- 33 suites passed.
- 770 checks passed.
- New Phase E runtime coverage verifies body measurements, sleep/readiness, goals, session/set/completion, multiple same-day cardio entries, lab attention, supplement monitoring, body photos, correction, deletion, legacy precedence, and outbox queuing.
- Today and Coach contracts now verify shared out-of-range lab propagation.

### Browser workflows

The live local app was exercised through the visible UI for:

- body measurement and same-day body composition;
- sleep logging and readiness recalculation;
- lab logging with two out-of-range markers;
- strength exercise creation, set logging, session completion, PR and weekly-volume updates;
- cardio logging;
- completed-session state reset;
- Today and Coach propagation.

The browser console reported no errors on the tested Body, Training, Today, and Coach views.

### Responsive runner

`tests/browser-phase-e-qa.mjs` passed 10 page/viewport combinations for Body and Training:

- 1440 x 900
- 1680 x 945
- 1792 x 1024
- 768 x 1024
- 390 x 844

The runner found zero document overflow, clipped controls, clipped labels, card collisions, tab loss, navigation-mode errors, bottom-navigation overlaps, or actionable console problems. Screenshots are stored in `docs/phase-e-screenshots/`.

## Phase Boundary

Phase E is sync-ready but does not deploy remote transport. Encrypted cross-device upload for photo bytes, authentication-backed ownership, conflict replay, and remote deletion validation remain Phase H work. No deployment or production migration was performed in this phase.
