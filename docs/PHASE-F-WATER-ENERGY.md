# Phase F: Water and Energy

## Status

Complete for owner review. Phase F makes hydration canonical and provenance-aware, connects it to Today and readiness, and adds measured energy check-ins with confidence-scored directional forecasting.

## Delivered

### Canonical hydration

- Manual hydration, edits, deletion, target changes, settings changes, imports, and reset use canonical runtime commands.
- Hydration entries retain amount, occurrence time, source, source reference, beverage type, and confidence.
- Repeated provider records deduplicate by source reference.
- Corrections supersede prior facts; deletion tombstones the full canonical chain.
- Every canonical write queues outbox work for later cross-device transport.
- Existing `po_water_v1` data is bridged idempotently, remains available to legacy consumers, and is not counted twice when canonical facts exist.

### Hydration projections

- Daily hydration distinguishes explicit beverage intake from estimated food water.
- Explicit intake provenance is separated into manual, device import, legacy, and other sources.
- Personalized targets retain their component formula: body weight, activity, caffeine, compounds, age, sex, and supported food context.
- Daily, 30-day, streak, healthy-zone, history, and timing views consume the merged canonical state.
- Hydration now updates Water, Today health details, readiness inputs, and energy contributors from the same projection snapshot.

### Energy forecasting

- Energy check-ins are measured 1-5 outcomes, not inferred ground truth.
- Fewer than three check-ins produce an explicit `insufficient-data` state with no fabricated score or curve.
- Once minimum evidence exists, the UI shows a directional 24-hour curve, lower and upper confidence bands, sample size, confidence level, and top contributors.
- Calibration is evaluated against subsequent check-ins through a rolling backtest.
- Confidence stays low for early samples and only increases with sufficient observations and calibration evidence.
- Forecast copy is explicitly non-diagnostic. Numeric bloodwork prediction remains locked.

### Water UI

- Overview, Target, History, and Settings are complete and remain visible at every required viewport.
- Quick adds, Undo, target builder, bottle plan, profile settings, display units, JSON export/import, and reset are functional.
- Import and reset remain confirmation-gated; confirmations now expose stable accessible names.
- Water Overview includes compact energy check-in and forecast panels without hiding the insufficient-data state.
- Liter formatting is consistent across Water and Today.

### Cross-surface behavior

- A Water quick add updates canonical hydration, Water totals/history, Today hydration, readiness context, and the energy forecast contributor set.
- An energy check-in updates Water and Today through the shared energy projections.
- Today now consumes canonical Life Score and readiness envelopes, removing the legacy bottle-count wording mismatch.
- Nutrition and hydration remain separate signals: meals do not receive a fixed water amount merely because they exist.

## Data Flow

`Water or energy action -> canonical event -> repository -> Phase F projections -> Water + Today + readiness + Coach inputs -> outbox`

Legacy Water storage remains as a transition adapter for older modules. Canonical facts take precedence and the compatibility bridge is idempotent.

## Changed Files

- `ui/canonical-runtime.js`
- `projection-definitions.js`
- `ui/log.html`
- `ui/today.js`
- `ui/ui.js`
- `tests/canonical-phase-f-runtime.test.js`
- `tests/log-water-contract.test.js`
- `tests/today-contract.test.js`
- `tests/browser-phase-f-qa.mjs`

## Migration Impact

- No destructive database migration was performed.
- No production deployment was performed.
- Legacy Water data is copied into the canonical event ledger through an idempotent compatibility bridge.
- The legacy store remains intact for modules that have not completed cutover.
- Canonical writes queue outbox records, but authenticated remote transport is not enabled by this phase.

## Verification

### Deterministic tests

- 35 suites passed.
- 807 checks passed.
- Phase F runtime coverage verifies legacy bridging, idempotence, provenance, target components, manual and provider intake, deduplication, insufficient energy evidence, confidence bands, calibration, contributors, deletion, and outbox queuing.
- Water and Today contracts verify canonical commands, projection subscriptions, shared hydration/energy rendering, and accessible confirmation gates.

### Browser workflows

The legacy Water browser regression passed with:

- fresh and populated states;
- quick add and Undo;
- settings and unit conversion without changing historical milliliters;
- personalized target recalculation;
- confirmation-gated import and reset;
- imported history rendering;
- desktop and phone tab visibility.

The Phase F browser workflow passed hydration provenance, a canonical quick add, readiness propagation, energy check-ins, confidence state, contributor rendering, all four Water subtabs, and Today synchronization.

### Responsive matrix

`tests/browser-phase-f-qa.mjs` passed 10 page/viewport combinations for Water and Today:

- 1440 x 900
- 1680 x 945
- 1792 x 1024
- 768 x 1024
- 390 x 844

The runner found zero document overflow, clipped controls, clipped labels, card collisions, tab loss, navigation-mode errors, runtime errors, or actionable console problems. The only network message was the expected missing local favicon. Screenshots are stored in `docs/phase-f-screenshots/`; focused Target, History, and Settings screenshots are in `docs/phase7-screenshots/`.

## Known Limits

- Energy forecasting is an early directional model, not a medical or diagnostic model.
- Stronger confidence requires more measured energy outcomes and subsequent calibration checks.
- Device-provider hydration imports are modeled and deduplicated but were not tested against a live provider account.
- Signed-in cross-device synchronization, offline reconnect replay, conflict resolution across two devices, and remote deletion validation remain Phase J work.
- Bloodwork Outlook may use hydration as provenance-rich context only; numeric marker predictions remain disabled without an evaluated model.

## Next Phase

Phase G: rebuild Skin and Supplements against the shared visual system, complete canonical routine/product/protocol/inventory workflows, and unify lab monitoring and safe cross-domain insights.
