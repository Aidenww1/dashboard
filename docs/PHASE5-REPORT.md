# Phase 5 Report: Training

## Navigation

- Locked Training navigation is now exactly Overview, Cardio, Progress, and History.
- The duplicate Strength tab was removed.
- Exercise, template, progression, cycle, and nutrition-target workflows remain reachable through Overview and its Manage lifts/framework actions.

## Functional Recovery

- Workout sessions preserve exercise CRUD, set logging, weight, reps, RPE, warm-up flow, rest timers, prescriptions, and automatic PR detection.
- Cardio supports add, prefilled edit, repeat, and confirm-gated delete against `gym:cardio:v1`.
- Set, session, exercise, template, compound, and cardio removal require confirmation.
- Progress and History continue to derive from canonical training stores rather than sample data.
- Fresh profiles render explicit empty states.

## Visual QA

- Desktop: `docs/phase5-screenshots/training-overview-1440x900.png`
- Mobile: `docs/phase5-screenshots/training-mobile-390x844.png`
- All four Training subtabs fit at 390px.
- Document width equals viewport width at desktop and mobile.
- Inherited malformed punctuation in `ui/log.html` was normalized to ASCII.

## Verification

- Browser QA: exercise creation, set logging, RPE, PR detection, confirmation cancel, framework management, cardio add/edit, all four views, desktop, mobile, and console monitoring.
- Contract coverage: `tests/log-training-contract.test.js`.
- Expected local-only network noise is limited to the missing favicon and unavailable cloud/API endpoints.
