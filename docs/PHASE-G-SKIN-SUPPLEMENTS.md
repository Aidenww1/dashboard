# Phase G: Skin and Supplements

## Status

Complete for owner review. Phase G rebuilds Skin and Supplements on the canonical event and projection layer, keeps their dense Log workflows responsive, and shares laboratory context without inventing causality, diagnoses, dose advice, or numeric bloodwork predictions.

## Delivered

### Canonical Skin

- Check-ins, products, routine completion, photos, breakouts, treatments, ingredients, and goals use canonical commands.
- Overview, Routine, Products, Lab, and Photos read shared Phase G projections.
- Product and routine changes propagate from one source of truth instead of maintaining disconnected tab state.
- Legacy Skin stores bridge idempotently with semantic duplicate checks.
- Photo metadata and stable identifiers participate in canonical projections; local image bytes are merged back into the projected records for display.
- Destructive product, ingredient, goal, check-in, and photo actions remain confirmation-gated or immediately undoable as appropriate.

### Canonical Supplements

- Compound configuration, schedule metadata, dose completion, inventory, and notes use canonical commands.
- Overview, Schedule, Compounds, Monitoring, Inventory, and Notes read shared projections.
- Compound changes update schedule, adherence, inventory, Today inputs, and monitoring context from the same canonical record.
- Compound deletion removes dependent local compatibility records optimistically and supports Undo with canonical restoration.
- Inventory keeps remaining quantity, unit, reorder threshold, expiry, and low-stock state attached to the compound identity.
- Existing stack, taken-dose, low-stock, and notes stores remain compatible while canonical facts take precedence.

### Shared Labs and Safety

- Body Labs remains the canonical source for laboratory panels used by Supplements Monitoring.
- Latest panel, marker trends, attention items, and outlook context are projected once and reused.
- Supplements can provide contextual compound metadata but cannot emit a causal compound-to-marker claim without a registered evaluated rule.
- Numeric bloodwork prediction is disabled.
- No view recommends starting, stopping, or changing a dose.
- Skin associations remain empty until minimum sample, registered-analysis, and review gates are satisfied.
- Skin guidance describes logged behavior and coverage only; it does not diagnose a condition or assign cause.

### Cross-surface Behavior

- A Skin product edit updates Products, Routine, Overview counts, and shared Skin projections.
- A routine completion updates adherence and the current-day Skin state.
- A supplement dose updates Schedule, Overview adherence, and downstream Today/Coach inputs that consume canonical supplement facts.
- A compound edit updates schedule and inventory without creating a second identity.
- A Body Labs panel appears in Supplements Monitoring from the same lab projection.
- A second runtime using the shared repository observes the same canonical Skin and Supplements state.

## Data Flow

`Skin or Supplements action -> canonical command -> canonical event repository -> Phase G projections -> Log tabs + Today + Coach + Labs context -> outbox`

Compatibility stores remain during cutover for pages that still consume them. The bridge is idempotent, canonical facts take precedence, and semantic duplicate checks prevent the same ingredient or goal from being imported twice.

## Changed Files

- `data-registry.js`
- `canonical-events.js`
- `data-commands.js`
- `ui/canonical-runtime.js`
- `projection-definitions.js`
- `ui/log.html`
- `tests/canonical-phase-g-runtime.test.js`
- `tests/log-skin-contract.test.js`
- `tests/log-supplements-contract.test.js`
- `tests/browser-phase-g-qa.mjs`
- `tests/canonical-phase-f-runtime.test.js`

## Verification

### Deterministic Tests

- 36 suites passed.
- 853 checks passed.
- Phase G runtime: 25/25.
- Skin contract: 23/23.
- Supplements contract: 22/22.
- The full suite also verifies registry coverage, event schemas, command routing, projection dependencies, security, reliability, Today, Food, Body, Training, Water, Money, Coach, and shared UI behavior.
- The verification pass fixed an older hydration settings bug where a nested target command dropped its explicit as-of date.

### Browser Workflows

- Existing Skin regression passed fresh and populated states, all five tabs, check-in CRUD, product CRUD, photo capture, mobile navigation, and actionable-console checks.
- Existing Supplements regression passed all six tabs, compound CRUD, inventory, Body Labs deep-link reuse, notes, deletion, Undo, mobile navigation, and actionable-console checks.
- The Phase G acceptance runner seeded canonical Skin, Supplements, and Labs data and checked all 55 internal tab states.

### Responsive Matrix

`tests/browser-phase-g-qa.mjs` passed Skin and Supplements at:

- 1440 x 900
- 1680 x 945
- 1792 x 1024
- 768 x 1024
- 390 x 844

The runner found zero document overflow, clipped controls, clipped labels, tab loss, navigation-mode errors, runtime errors, or actionable console problems. The only network message was the expected missing local favicon. Screenshots are stored in `docs/phase-g-screenshots/`.

## Migration Impact

- No destructive database migration was performed.
- No production deployment was performed.
- Canonical writes queue outbox records, but this phase does not enable authenticated remote transport.
- Legacy Skin and Supplements stores remain available to unfinished consumers.

## Known Limits

- Photo metadata can synchronize through the canonical ledger, but original image bytes remain device-local until a private remote blob transport is implemented.
- The second-device test validates repository-level convergence; real signed-in cloud transport, offline replay, and multi-device conflict testing remain later-phase work.
- Lab and Skin association views intentionally remain conservative until evaluated analysis rules and enough personal observations exist.
- Live wearable, laboratory-provider, and pharmacy integrations are outside this phase.

## Next Phase

Phase H should continue the canonical cutover for Coach and Money, then use their projections in Today without duplicating business logic. Production deployment should remain paused until owner review of Phase G.
