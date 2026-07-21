# Phase H: Coach, Money, and More

## Status

Complete for owner review. Phase H converts Coach, Money, and More to canonical-first workspaces, completes deterministic financial projections and reconciliation status, and makes device, synchronization, backup, privacy, and integration boundaries explicit.

## Delivered

### Coach Workspace

- Briefing, Readiness, Ask, Inbox, Opportunities, and Reviews read Phase H projections with legacy fallback during cutover.
- Briefing combines readiness, nutrition, hydration, training, finance, inbox, and health-attention facts without duplicating their business rules.
- Follow-ups, opportunities, reviews, and recent plans are projected from their registered sources.
- Empty or unavailable domains stay explicit instead of being replaced with generated measurements.
- Generative behavior remains user initiated through Ask Coach; page load and background refreshes are deterministic.
- The interface subscribes to canonical invalidation so downstream Coach views update after source facts change.

### Money Workspace

- Transactions and accounts bridge into canonical finance events with stable source identity and idempotent imports.
- Overview, Accounts, Cash Flow, Spending, Business, Wealth, and Planning use shared finance projections.
- Manual and imported transactions retain visible source classes.
- Quick Log writes a canonical transaction first and keeps the legacy transaction store compatible during cutover.
- Cash flow, category spending, balances, asset allocation, business P&L, savings goals, and affordability context reaggregate from the same event ledger.
- Transaction reconciliation reports schema and identity checks honestly; it does not claim live bank verification.

### More, Privacy, and Device Status

- Settings, Integrations, Notifications, Data, Life, and About use canonical system status where applicable.
- Integrations distinguish configured connection evidence from a currently reachable live service.
- Data status shows canonical event count, pending sync, synced events, device-cache size, and backup metadata.
- Complete device export includes canonical events, pending outbox records, and compatibility storage in one versioned snapshot.
- Clear Device Data is confirmation gated and removes the canonical device repository plus compatibility storage transactionally.
- Copy states that remote data is not deleted and can return after synchronization.
- Mood and social telemetry were removed from the Life summary because those domains are not reliably measurable from the available inputs.

### Cross-Surface Behavior

- A Money transaction updates cash flow, spending, business, wealth, planning, Today, and Coach consumers through shared projections.
- A Finance account update changes net worth and allocation everywhere without maintaining a second dashboard total.
- Food, hydration, training, recovery, lab, and finance changes invalidate the relevant Coach briefing inputs.
- Imported transaction identity survives repeated bridging without duplicate financial facts.
- A second runtime over the same repository observes the same Phase H finance and Coach state.
- Device status reads the same canonical repository and outbox used by every prior phase.

## Data Flow

`Domain action or import -> canonical event repository -> projection engine -> Money / Coach / Today / More -> outbox -> authenticated sync boundary`

Local-first means the device cache remains usable offline. Cross-device continuity still requires an authenticated remote transport; the UI now states that boundary instead of presenting local configuration as live synchronization.

## Changed Files

- `data-registry.js`
- `projection-definitions.js`
- `ui/canonical-runtime.js`
- `ui/coach.html`
- `ui/money.html`
- `ui/more.html`
- `ui/components.css`
- `tests/canonical-phase-h-runtime.test.js`
- `tests/coach-contract.test.js`
- `tests/money-contract.test.js`
- `tests/more-contract.test.js`
- `tests/browser-phase-h-qa.mjs`
- `tests/canonical-food-runtime.test.js`

## Verification

### Deterministic Tests

- 37 suites passed.
- 885 checks passed.
- Phase H runtime: 32/32.
- Coach contract: 25/25.
- Money contract: 25/25.
- More contract: 23/23.
- JavaScript syntax checks passed for the projection definitions, canonical runtime, and Phase H browser runner.
- The final run also fixed a pre-existing midnight-boundary fixture: Food now tests its current date using the canonical `Europe/Amsterdam` date conversion instead of UTC.

### Browser Workflows

- All six Coach tabs were activated and inspected at every required viewport.
- All seven Money tabs were activated and inspected at every required viewport.
- All six More tabs were activated and inspected at every required viewport.
- Each state checked rendered content, load-error text, document overflow, clipped controls, tab count, tab wrapping, and browser warnings/errors.
- The core matrix covered 15 page-size renders and 110 internal UI states, followed by targeted Coach desktop and phone reruns after visual polish.
- Representative overview screenshots were visually inspected in addition to automated geometry checks.
- The standalone CDP runner is syntax-valid, but the local headless Chrome target crashed in this environment. The same acceptance matrix completed through the in-app browser with zero failures.

### Responsive Matrix

Coach, Money, and More passed at:

- 1440 x 900
- 1680 x 945
- 1792 x 1024
- 768 x 1024
- 390 x 844

The matrix found zero horizontal overflow, clipped controls, missing tabs, excessive tab rows, page load failures, or actionable console messages. Screenshots are stored in `docs/phase-h-screenshots/`.

## Migration Impact

- No destructive database migration was performed.
- No production deployment was performed.
- Canonical finance, Coach, and system events queue outbox records, but this phase does not enable authenticated remote transport.
- Legacy stores remain available for unfinished consumers while canonical facts take precedence on converted surfaces.

## Known Limits

- Cross-device synchronization still needs authenticated backend transport, server authorization, reconnect replay, and real multi-device conflict testing.
- A configured integration is not proof that its remote API is currently reachable.
- Financial reconciliation currently verifies identity, schema, and duplicate handling; it is not bank-statement settlement verification.
- Coach explanations are constrained by available source data. They do not replace medical or financial professionals and do not invent missing facts.
- Inbox and opportunity detail workflows continue to depend on their existing Mail and Radar products.

## Next Phase

Phase I should implement Bloodwork Outlook as directional, provenance-rich context with a model registry, evaluation harness, calibration tracking, drift handling, and safety review. Numeric prediction should remain locked until its evidence and validation gates are genuinely met. Production deployment remains paused until owner review of Phase H.
