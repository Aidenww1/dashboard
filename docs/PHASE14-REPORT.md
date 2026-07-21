# Phase 14 - Hardening

## Reliability and data safety

- Fault-injected malformed JSON into core health, nutrition, body, finance, Coach, reminder, and settings stores.
- Today, Log, Coach, Money, and More remained nonblank and raised no uncaught JavaScript errors.
- Confirmed per-key timestamp conflict resolution and corrupt-value filtering through the existing sync tests.
- Confirmed local-day, nutrition rollover, leap-day, timezone, and Amsterdam DST behavior through the existing date tests.
- Log and Coach isolate renderer failures without changing stored data.

## Accessibility and motion

- Log, Coach, Money, and More now maintain one selected and one keyboard-tabbable primary tab.
- Log and Coach support Arrow Left/Right plus Home/End activation with focus movement.
- Dialog, alertdialog, focus trap, Escape close, and focus restoration remain covered by Phase 12.
- Reduced-motion mode now suppresses shared animations, transitions, smooth scrolling, and skeleton shimmer.

## Layout and performance

- Reserved the desktop sidebar width before JavaScript shell mount.
- Cumulative layout shift dropped from approximately 0.15 to 0.000-0.002 across the five core destinations.
- The browser gate now fails above CLS 0.05.
- Local page loads measured between 63 ms and 814 ms in the reliability run, below the 5-second gate.

## PWA and offline behavior

- Redesign pages now expose `/manifest.json`, the theme color, and `/pwa.js` registration through the shared shell.
- Added an external install icon and aligned shortcuts with the locked UI information architecture.
- Updated notification routes to redesigned Log and Coach destinations.
- Bumped the service-worker cache to `dashboard-v59`.
- Verified every precache path exists.
- Verified a controlled installed-app session can navigate to Money while the network is offline.

## Evidence

- `npm test`: 21 suites passed.
- `tests/reliability-contract.test.js`: 79 passed, 0 failed.
- `node --experimental-websocket tests/browser-reliability-qa.mjs`: passed.
- Screenshot: `docs/phase14-screenshots/reliability-offline-money-1440x900.png`.

## Result

Phase 14 passes. Corrupt data, conflict resolution, timezone boundaries, error isolation, accessibility, reduced motion, loading, layout stability, performance, and service-worker versioning have deterministic coverage.
