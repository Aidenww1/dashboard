# Phase B: Projection and Dependency Engine

## Status

Phase B is implemented as a shared calculation foundation. It does not yet replace page reads or writes. Existing pages continue to use their current stores until a later approved cutover phase.

## Delivered

- A versioned calculation registry with 64 projection definitions.
- Coverage for every projection ID declared in `data-registry.js`.
- Dependency validation and cycle detection.
- In-memory result caching and transitive invalidation.
- Repository-driven subscriptions with local updates under the 250 ms target.
- Projection envelopes with confidence, provenance, calculation version, window, explanation, and limitations.
- Explicit missing data rather than fabricated measurements.
- Mixed legacy-envelope and canonical-event compatibility during migration.
- Safety-gated statistical outputs. `labs.outlook` never returns numeric marker predictions.

## Public API

Install the engine with the canonical event repository:

```js
var projections = LifeOSProjectionEngine.install({
  repository: LifeOS.data,
  definitions: LifeOSProjectionDefinitions.definitions,
});
```

The installer exposes:

```js
LifeOS.projections.get('today.summary', { date: '2026-06-19' });
LifeOS.projections.subscribe(['nutrition.daily', 'today.summary'], onChange);
LifeOS.projections.explain('energy.forecast_24h', { date: '2026-06-19' });
LifeOS.events.query({ domain: 'nutrition' });
```

`get()` returns a derived envelope, not a new source fact:

```js
{
  id: 'nutrition.daily',
  version: 1,
  value: {},
  truth_class: 'measured',
  calculation_type: 'deterministic',
  confidence: {},
  provenance: {
    source_event_ids: [],
    source_projection_versions: {},
    calculation_id: 'nutrition.daily',
    calculation_version: 1,
    calculation_window: 'local day'
  },
  explanation: '',
  limitations: []
}
```

## Cross-Domain Propagation

Canonical event changes invalidate every dependent projection and notify active subscribers without a reload.

Meal logging updates:

- daily and rolling nutrition
- Today summary and Life Score
- energy outlook
- lab outlook context and provenance
- Coach signals and briefing

Water logging updates:

- daily, timing, and rolling hydration
- Today summary and Life Score
- energy outlook
- lab outlook context and provenance
- Coach signals and briefing

Food water is stored and displayed as `estimated_food_water_ml`. It never creates a hydration event and never increases `explicit_beverage_ml`.

## Compatibility Rules

- New canonical facts and imported legacy envelopes can coexist during migration.
- Canonical facts win when a deterministic fingerprint identifies the same legacy fact.
- Historical nutrition, hydration, sleep, training, body, habit, and supplement information remains visible after new canonical facts arrive.
- Empty-state parity is preserved: Life Score is 47 and readiness is 53 with no data.

## Projection Groups

- Today, Life Score, readiness, data quality, recovery, and energy
- nutrition, hydration, sleep, wearables, and activity
- training, body, skin, photos, mood, stress, and symptoms
- supplements and labs
- finance, productivity, communications, and lifestyle
- Coach briefing, signals, and follow-ups
- system data graph, sync status, and migration status

## Safety and Truthfulness

- Deterministic, statistical, and AI-generated calculations are separate registry classes.
- Statistical projections expose sample size, coverage, confidence, and calibration state.
- Skin and symptom associations remain empty until sample and analysis gates pass.
- Bloodwork outlook is directional context only. Numeric prediction is locked pending evaluation and clinical safety review.
- Subscriber failures are isolated so one broken component cannot stop other projection updates.

## Verification

The repository suite passes 31 suites and 708 checks with zero failures.

New Phase B coverage includes:

- registry completeness, metadata, schemas, and cycle prevention
- cache behavior and transitive invalidation
- subscriber updates inside the local 250 ms target
- provenance and explanation chains
- explicit missing-data behavior across every registered projection
- food, water, sleep, training, body, finance, Today, energy, labs, and Coach propagation
- mixed legacy and canonical migration behavior

## Rollout Boundary

No page has been switched to these projections yet. No live migration, database migration, deployment, commit, or push was performed. The next approved phase should install the engine in the shared browser bootstrap and cut pages over by workflow with dual-read parity checks and screenshot-based UI verification.
