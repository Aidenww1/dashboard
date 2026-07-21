# Life OS Ultimate Master Plan and Execution Prompt

Use this document as the implementation prompt for the final Life OS rebuild. It is intentionally specific. Do not replace its requirements with a simplified dashboard, disconnected mock pages, fictional data, or visual-only prototypes.

## 1. Role and Mission

You are the senior product designer, systems architect, data engineer, frontend engineer, and QA owner responsible for completing Life OS.

Build one coherent, offline-capable, account-synchronized personal operating system in which:

- Every page looks and behaves like the supplied premium dark Life OS references.
- Every domain uses the same authoritative data, units, dates, identity, and synchronization rules.
- Logging or editing information once updates every dependent page and derived signal automatically.
- Cross-domain effects are useful, explainable, confidence-scored, and never presented as medical certainty.
- Empty, loading, error, disconnected, offline, stale, and populated states are all designed intentionally.
- Desktop, tablet, and phone are distinct, polished experiences rather than the same grid stacked vertically.
- Existing working features and user data are preserved through migrations and compatibility adapters.

The job is not complete when pages merely render. It is complete only when the product looks premium, all primary workflows work, dependent information updates everywhere, data survives reload and synchronization, and the full verification matrix passes.

## 2. Product Standard

Life OS should feel like a calm, precise command center for daily life. It must combine the polish of the supplied references with the credibility of a real data product.

The experience must be:

- **Dense but calm:** high information value without visual clutter.
- **Action-first:** the next useful action is always obvious.
- **Evidence-aware:** measured facts, calculations, associations, forecasts, and advice are visually distinct.
- **Honest:** never invent meals, biometrics, messages, accounts, progress, trends, or integrations.
- **Connected:** every domain can contribute to shared projections through explicit dependencies.
- **Fast:** local changes feel immediate and remote synchronization is unobtrusive.
- **Reversible:** edits and destructive actions have history, confirmation where necessary, and real undo.
- **Private:** health, finance, photos, notes, and AI context are owner-scoped and never exposed through anonymous policies.

## 3. Non-Negotiable Rules

1. Do not create fake populated data to imitate screenshots. Use real data, test fixtures only inside isolated tests, and polished empty states in the product.
2. Do not let pages write directly to arbitrary localStorage keys. All new writes go through the shared command and repository layer.
3. Do not maintain separate calculations for the same metric on different pages.
4. Do not allow AI output to overwrite measured source facts.
5. Do not show an exact health prediction unless the model, evaluation, calibration, applicable population, version, uncertainty, and input coverage are known.
6. Do not describe an association as causation.
7. Do not silently infer water intake using a fixed amount per meal. Food-derived water is an estimate only when composition data supports it and must remain distinguishable from explicitly logged drinks.
8. Do not recommend medication, hormone, or compound dose changes. Surface measured data, reference information, monitoring reminders, and questions for a qualified clinician.
9. Do not claim that data is encrypted, connected, synchronized, or secure unless the implementation proves it.
10. Do not commit, push, apply database migrations, change production access, or deploy without explicit owner approval.

## 4. Existing Starting Point

Preserve and rationalize the useful foundations already present:

- `lifeos-core.js` provides deterministic score, readiness, quality, logging, search, and context functions.
- `ui/data.js` provides shared UI projections.
- `lifeos:logged`, `lifeos:activity`, and `lifeos:wearable` events provide coarse invalidation signals.
- `cloudsync.js` synchronizes local application state.
- The Supabase `events` table supports typed events with timestamps, domains, data, and source.
- Typed health tables, event ingestion, photo storage, browser tests, contract tests, and RLS migration work already exist in partial form.
- Existing canonical stores such as nutrition, Water, Body, Training, Supplements, Labs, Finance, Skin, Mood, Tasks, and wearable stores contain real user data and must not be discarded.

The current weakness is fragmentation: storage keys, event rows, typed health tables, page-level calculations, cloud state, and AI insights are not yet one authoritative dependency system.

## 5. Truth Model

Every value exposed to the UI must carry a truth class. The UI must make these classes understandable without technical jargon.

### 5.1 Truth classes

- **Measured:** directly entered, imported, photographed and confirmed, or received from a device.
- **Calculated:** deterministic arithmetic from measured values, with a visible formula or explanation.
- **Estimated:** a heuristic estimate with an uncertainty range and source.
- **Observed association:** a relationship found in the user's historical data, including sample size and strength.
- **Forecast:** an evaluated model output for a future outcome, including horizon and confidence.
- **Guidance:** a recommendation derived from known rules or qualified sources, never a measurement.

### 5.2 Required metadata

Every calculated, estimated, associated, or forecast value must expose:

- `as_of`
- `truth_class`
- `confidence`
- `data_coverage`
- `source_event_ids`
- `model_or_rule_version`
- `calculation_window`
- `explanation`
- `limitations`

The UI should present this through concise labels and a details popover, not technical clutter on every card.

## 6. Canonical Data Architecture

Adopt an append-only event ledger plus deterministic projections.

### 6.1 Event ledger

All domain changes become canonical events. The minimum event shape is:

```js
{
  id,
  user_id,
  type,
  domain,
  occurred_at,
  recorded_at,
  local_date,
  timezone,
  source,
  source_ref,
  schema_version,
  payload,
  units,
  confidence,
  provenance,
  supersedes_id,
  deleted_at,
  device_id,
  sync_state
}
```

Requirements:

- IDs are stable across offline, cloud, import, and device flows.
- Commands are idempotent through `id` or `source_ref`.
- Edits append a replacement event using `supersedes_id`; they do not mutate history invisibly.
- Deletes create tombstones so cloud synchronization cannot resurrect removed records.
- Domain payloads are schema-versioned and validated before persistence.
- Local dates and timezones are retained separately from UTC timestamps.
- Units are explicit at the boundary and normalized for calculations.
- Imported records retain their provider, original identifier, original units, and import timestamp.

### 6.2 Canonical domain events

At minimum support:

- `nutrition.meal.logged`, `nutrition.meal.edited`, `nutrition.target.changed`
- `hydration.intake.logged`, `hydration.intake.edited`, `hydration.target.changed`
- `sleep.night.logged`, `sleep.night.synced`
- `training.session.started`, `training.set.logged`, `training.cardio.logged`, `training.session.completed`
- `body.weight.logged`, `body.composition.logged`, `body.measurement.logged`, `body.photo.added`
- `recovery.energy.checkin`, `recovery.mood.checkin`, `recovery.symptom.checkin`
- `supplement.dose.logged`, `supplement.compound.changed`, `supplement.inventory.changed`
- `skin.checkin.logged`, `skin.routine.logged`, `skin.product.changed`, `skin.photo.added`
- `labs.panel.logged`, `labs.panel.imported`, `labs.marker.corrected`
- `finance.transaction.logged`, `finance.transaction.imported`, `finance.account.changed`
- `task.changed`, `goal.changed`, `calendar.event.changed`, `integration.status.changed`

### 6.3 Command layer

Expose one public write API such as:

```js
LifeOS.commands.execute(command)
LifeOS.commands.undo(commandId)
LifeOS.commands.redo(commandId)
```

Every command must:

1. Validate input.
2. Normalize dates and units.
3. Append an event locally in one transaction.
4. Update affected projections.
5. Notify subscribers with changed projection IDs.
6. Queue synchronization in the outbox.
7. Return the canonical event and affected projections.
8. Supply an inverse command when undo is allowed.

No page should need to know which storage keys or remote tables are involved.

### 6.4 Compatibility migration

Create read and migration adapters for current stores, including the established nutrition, water, body, training, supplement, bloodwork, skin, finance, mood, task, wearable, and photo namespaces.

Migration rules:

- Snapshot and verify existing data before migration.
- Generate stable legacy source references to prevent duplicate imports.
- Preserve original values and timestamps.
- Record migration version and counts per domain.
- Compare pre-migration and post-migration totals.
- Roll back atomically when validation fails.
- Keep compatibility readers during the transition.
- Stop new direct legacy writes only after parity tests pass.

## 7. Projection and Dependency Engine

Pages render from projections, not raw stores. A projection is a versioned, deterministic view derived from canonical events.

### 7.1 Required projections

- `today.summary`
- `life_score.daily`
- `readiness.daily`
- `data_quality.current`
- `nutrition.daily`
- `nutrition.rolling_7d`, `nutrition.rolling_30d`, `nutrition.rolling_90d`
- `hydration.daily`, `hydration.timing`, `hydration.rolling_30d`
- `energy.current`, `energy.forecast_24h`, `energy.patterns`
- `sleep.daily`, `sleep.debt`, `recovery.daily`
- `training.load`, `training.program`, `training.progress`, `training.recovery`
- `body.current`, `body.trends`, `body.goal_progress`
- `skin.current`, `skin.correlations`, `skin.progress`
- `supplements.schedule`, `supplements.adherence`, `supplements.inventory`, `supplements.monitoring`
- `labs.latest`, `labs.trends`, `labs.attention`, `labs.outlook`
- `finance.overview`, `finance.cashflow`, `finance.spending`, `finance.business`, `finance.wealth`, `finance.planning`
- `coach.briefing`, `coach.signals`, `coach.followups`

### 7.2 Explicit dependency graph

Maintain a central registry:

```js
dependencies.register({
  event: 'nutrition.meal.logged',
  invalidates: [
    'nutrition.daily',
    'nutrition.rolling_7d',
    'nutrition.rolling_30d',
    'nutrition.rolling_90d',
    'today.summary',
    'life_score.daily',
    'energy.forecast_24h',
    'coach.briefing',
    'labs.outlook'
  ]
});
```

Every dependency must declare:

- Inputs
- Time window
- Recompute strategy
- Version
- Output schema
- Handling for missing or stale data
- Whether the dependency is deterministic, statistical, or AI-generated

Prevent circular updates. Derived projections never become source events unless the user explicitly confirms a new measured fact.

### 7.3 Reactive update contract

When any canonical event changes:

- The originating control updates optimistically after validation.
- All affected local projections update within 250 ms on normal hardware.
- Every mounted page component subscribed to those projections rerenders without a full reload.
- Background tabs receive the same projection-change event.
- Remote changes update the local event ledger and projections after synchronization without duplicating events.
- The UI shows a subtle synchronization state only when useful: saving, saved, offline, conflict, or failed.

Expose:

```js
LifeOS.projections.get(id, params)
LifeOS.projections.subscribe(ids, callback)
LifeOS.projections.explain(id)
LifeOS.events.query(filters)
```

## 8. Cross-Domain Example: Food and Water

This flow is an acceptance test for the whole architecture.

### 8.1 User logs a meal

The system must:

1. Append `nutrition.meal.logged` with ingredients, portions, nutrients, meal time, source, and confidence.
2. Update today's calories, protein, carbohydrates, fat, fiber, sodium, sugar, and any available micronutrients.
3. Update recent meals, timeline, templates, and Today's Nutrition.
4. Update the Today dashboard Nutrition card.
5. Recalculate the next 24-hour energy forecast using meal timing and composition only as supported features.
6. Recalculate rolling 7, 30, and 90-day nutrition features.
7. Invalidate the lab outlook for markers whose evaluated model explicitly uses those rolling features.
8. Update the Coach briefing and follow-up queue only when the change produces a meaningful signal.
9. Never add a fixed amount of water merely because a meal exists.
10. If known food composition includes water, record it as `estimated_food_water_ml`, keep it separate from explicit beverage intake, and show how it contributes to total water.

### 8.2 User logs water

The system must:

1. Append `hydration.intake.logged` with amount, unit, time, beverage type, source, and confidence.
2. Update hydration totals, healthy-zone status, streak, history, timing pattern, and Today's entries.
3. Update Today, Coach, readiness inputs, and energy forecast where supported.
4. Update hydration-related lab-outlook context without claiming that one drink caused a future blood result.
5. Detect duplicate entries from manual and device sources using time, amount, and source references.

### 8.3 Energy forecast

Energy must be a forecast against a real outcome, not decorative scoring.

Inputs may include:

- Logged energy check-ins as ground truth
- Sleep duration, timing, consistency, and debt
- HRV and resting heart rate when available
- Meal timing and composition
- Hydration status and timing
- Caffeine timing and dose
- Recent training load and recovery
- Mood, stress, symptoms, and time of day

Requirements:

- Ask for lightweight energy check-ins so the model can learn the user rather than assume.
- Show a 24-hour curve with confidence bands.
- Identify the top positive and negative contributors.
- Show "insufficient data" instead of a confident forecast when ground truth or coverage is weak.
- Evaluate calibration against subsequent energy check-ins.
- Never imply that predicted energy is a diagnosis.

### 8.4 Bloodwork outlook

Call this feature **Bloodwork Outlook** until a clinically evaluated prediction model exists. Its default output is directional monitoring context, not fabricated future numbers.

Inputs may include only features supported by the selected model, such as:

- Actual historical lab panels collected under comparable conditions
- Rolling nutrition patterns
- Weight and body-composition trends
- Training load and recovery
- Sleep patterns
- Hydration context
- Medication and supplement records supplied by the user
- Relevant demographics and collection conditions

Requirements:

- Separate short-term collection-condition effects from longer-term physiological trends.
- Show the baseline panel, forecast horizon, contributing features, missing inputs, and uncertainty.
- Use language such as "upward pressure," "stable outlook," or "worth retesting," not "your LDL will be 142."
- Do not produce a numeric marker prediction unless an evaluated model explicitly supports it for this user context.
- Store model identity, version, intended population, training-data description, evaluation metrics, subgroup performance, calibration, and known limitations.
- Track every forecast against the next actual panel and report error.
- Disable or downgrade outputs when inputs are stale, collection conditions differ, the model is out of scope, or drift is detected.
- Out-of-range measured markers generate attention and retest workflows, not autonomous treatment changes.

Health prediction reporting should follow transparent prediction-model principles such as TRIPOD+AI, with clear model purpose, inputs, evaluation, fairness, and limitations. Patient-facing clinical recommendations require additional regulatory and clinical review.

## 9. AI Responsibilities

AI is an explanation and assistance layer, not the source of truth.

AI may:

- Parse user input into proposed structured events.
- Extract candidate data from images or documents for user confirmation.
- Summarize projections and explain contributors.
- Suggest questions, logging gaps, and low-risk actions.
- Detect potential patterns for deterministic or statistical verification.

AI may not:

- Insert unconfirmed measurements from ambiguous input.
- Change canonical data silently.
- Convert weak correlations into causal claims.
- Invent missing values.
- Make medication, hormone, or compound changes.
- Hide uncertainty, missing data, or model limitations.

Every AI action must record prompt purpose, model, timestamp, relevant input projection versions, result, user confirmation state, and failure state without logging secrets.

## 10. Synchronization and Consistency

Use an offline-capable local replica, a durable owner-scoped cloud event service, an outbox, and a deterministic merge strategy. "Local" means immediate and resilient on the current device; it does not mean device-only or backup-only synchronization.

Required behavior:

- The app remains fully usable offline for local workflows.
- Every unsynchronized event enters an outbox.
- Synchronization retries safely with exponential backoff and idempotency.
- Owner authentication and RLS scope all sensitive rows.
- Anonymous health, finance, event, app-state, and photo access is forbidden.
- Conflicts are resolved using entity history and event semantics, not blind last-write-wins across whole localStorage blobs.
- Tombstones synchronize before cleanup.
- Projection versions can be rebuilt from the event ledger.
- Import/export includes schema versions, event provenance, photos manifest, and integrity checks.
- Restore is transactional and rolls back partial writes.

## 11. Visual and Interaction System

Match the supplied Life OS references in composition and polish while keeping data honest.

### 11.1 Shared visual language

- Near-black neutral canvas with cooler elevated surfaces.
- One-pixel restrained borders and minimal shadows.
- Purple is the navigation and command accent, not the only color.
- Green communicates healthy or on-track states; amber communicates attention; red is reserved for real danger or destructive actions; blue supports hydration and information.
- Compact radii, stable card dimensions, and consistent spacing.
- Modern sans-serif typography with restrained weights, tabular numerals for metrics, and no oversized headings inside tools.
- Charts use consistent axes, legends, labels, smoothing rules, empty states, and tooltips.
- Icons come from the existing icon system and remain consistent in stroke, size, and alignment.
- No decorative blobs, nested cards, marketing hero sections, or unexplained visual noise.

### 11.2 Hierarchy

Each desktop page must establish:

1. Page identity and global command field.
2. Primary or secondary navigation.
3. A compact KPI or status strip.
4. One dominant working area.
5. Supporting analysis and action areas.
6. Attention and explanation surfaces.

Cards cannot all have equal visual weight. Empty content cannot consume the same space as a populated analytical panel.

### 11.3 Responsive behavior

- Desktop reference sizes: 1440x900, 1680x945, and 1792x1024.
- Tablet: 768x1024 with compact navigation and intentional two-column layouts where useful.
- Phone: 390x844 with bottom navigation, safe-area padding, compact metrics, and workflow-first ordering.
- The phone experience must not simply stack every desktop card at full height.
- Primary logging actions appear before secondary analytics on phone.
- Large tab sets use a stable compact treatment appropriate to the viewport; labels cannot clip or disappear.
- Fixed navigation may not cover interactive content.
- No horizontal document overflow at any required viewport.

### 11.4 Shared states

Implement reusable components for:

- Loading skeleton
- First-use empty state
- No results
- Stale data
- Disconnected integration
- Offline with queued changes
- Permission required
- Recoverable error with retry
- Destructive confirmation
- Real undo and redo
- Sync conflict
- Low-confidence forecast

## 12. Page Requirements

### 12.1 Today

- Three compact top metrics with real trends.
- Priority, schedule, and nutrition form the dominant first-viewport row.
- Recovery, Supplements, Money, and Inbox form the secondary operational row.
- Body, health details, and attention queue form the deeper analytical row.
- Logging anywhere updates Today immediately through projections.
- Empty modules collapse into compact action states rather than large blank cards.

### 12.2 Log: Food

- Fast entry through photo, search, template, barcode, and quick text.
- Nutrition progress, recent meals, timeline, templates, and summary share canonical events.
- Edit, duplicate, template, delete, and undo work from every list representation.
- Mobile actions are compact, not four full-width tall cards.

### 12.3 Log: Body

- Overview, Composition, Recovery, Labs, and Photos use the same body and lab events.
- Composition trends, recovery, goals, measurement history, and progress photos are linked.
- Body Labs is the canonical source for lab panels throughout Life OS.

### 12.4 Log: Training

- Overview, Cardio, Progress, and History support the full-body 3x/week framework.
- Session logging, templates, warmups, rest timer, progression, PRs, volume, and recovery work together.
- Training load updates readiness, energy, hydration context, Coach, and Today.

### 12.5 Log: Skin

- Overview, Routine, Products, Lab, and Photos are image-led where real images exist.
- Product changes, routine adherence, environmental context, symptoms, and photos contribute to correlation views.
- Correlations require adequate observations and display sample size and confidence.

### 12.6 Log: Water

- Overview, Target, History, and Settings share one canonical hydration model.
- Values are rounded professionally and preserve exact values internally.
- Target calculation shows components, units, and assumptions.
- Hydration totals distinguish explicit drinks, device imports, and estimated food water.

### 12.7 Log: Supplements

- Overview, Schedule, Compounds, Monitoring, Inventory, and Notes share canonical compounds and doses.
- Monitoring reads Body Labs instead of duplicating panels.
- Schedule, adherence, inventory burn rate, notes, and reminders update from the same dose events.
- Health attention does not prescribe unsupervised dose changes.

### 12.8 Coach

- Briefing, Readiness, Ask, Inbox, Opportunities, and Reviews render canonical projections.
- Ask is the only explicit generative action unless the user enables scheduled briefing generation.
- Every answer identifies the relevant measured data and uncertainty.
- Remove object-string rendering, duplicated signals, and generic advice.

### 12.9 Money

- Overview, Accounts, Cash Flow, Spending, Business, Wealth, and Planning use canonical accounts and transactions.
- Imports are deduplicated, reconciled, reversible, and auditable.
- Business Labs shares the canonical business finance source.
- Financial estimates are visibly distinct from bank-sourced facts.

### 12.10 More

- Settings, Integrations, Notifications, Data, Life, and About accurately report connection, permission, sync, storage, and version status.
- Data export, restore, reset, and privacy controls have transactional verification.

## 13. Accessibility and Interaction Quality

- Full keyboard navigation, visible focus, and logical tab order.
- Semantic landmarks, headings, buttons, tables, labels, and status announcements.
- Dialog focus trap and focus restoration.
- Minimum touch targets and safe spacing.
- Contrast suitable for dark mode and color-independent status communication.
- Reduced-motion support.
- Charts include accessible summaries and data tables where appropriate.
- Validation errors explain what happened and how to fix it.

## 14. Performance Requirements

- No full-page rerender for one card-level projection change.
- Avoid repeated parsing of the complete event ledger on every render.
- Cache projections by version and invalidation key.
- Window long tables and timelines where needed.
- Load photos and heavy charts lazily without layout shifts.
- The shell and current page remain usable offline after first load.
- Track render time, projection recompute time, sync latency, error rate, and storage growth locally without collecting private content.

## 15. Implementation Phases

### Phase A: Truth and data foundation

- Document every current store and owner.
- Add canonical schemas, event repository, command layer, outbox, tombstones, migrations, and compatibility adapters.
- Prove data round-trip and rollback before changing page writes.

### Phase B: Projection engine

- Build the registry, dependency graph, projection cache, subscriptions, provenance, and explanation API.
- Port shared score, readiness, quality, nutrition, hydration, body, finance, and training calculations.
- Add deterministic fixture tests.

### Phase C: Shared UI system

- Finalize tokens, typography, spacing, cards, charts, states, dialogs, tables, navigation, responsive shell, and accessibility.
- Produce the component reference at all required viewports.

### Phase D: Today and Food

- Establish the final visual standard.
- Complete the meal-to-projection acceptance flow.
- Verify desktop, tablet, phone, empty, populated, loading, error, and offline states.

### Phase E: Body, Recovery, and Training

- Unify measurements, wearable data, training load, readiness, goals, labs, and photos.
- Complete session, measurement, lab, and photo workflows.

### Phase F: Water and Energy

- Complete hydration provenance, target builder, history, and settings.
- Add measured energy check-ins and confidence-scored energy forecasting.

### Phase G: Skin and Supplements

- Rebuild the largest visual gaps.
- Complete shared lab monitoring and safe cross-domain insights.

### Phase H: Coach, Money, and More

- Convert Coach into an explanation and action workspace.
- Finish financial projections and reconciliation.
- Finish integration, notification, backup, privacy, and status surfaces.

### Phase I: Bloodwork Outlook

- Start with directional, provenance-rich outlooks.
- Add model registry, evaluation harness, calibration tracking, drift handling, and safety review.
- Do not unlock numeric predictions merely to satisfy a screenshot.

### Phase J: Reliability and cutover

- Migrate remaining legacy writes.
- Apply authenticated synchronization only after owner approval.
- Complete offline, reconnect, conflict, import, restore, security, integration, and device tests.
- Run the full visual and functional acceptance matrix before requesting deployment approval.

Stop after every phase for owner review. Provide before-and-after screenshots, changed files, migration impact, tests run, failures, blocked external checks, and the next recommended phase.

## 16. Test Strategy

### 16.1 Unit and contract tests

- Schema validation and migration identity
- Date, timezone, unit, and rollover rules
- Projection determinism
- Dependency invalidation
- Score and forecast bounds
- Data-quality and confidence rules
- Undo, redo, tombstone, and restore behavior
- Deduplication and idempotency
- Model versioning and provenance

### 16.2 Cross-domain integration tests

At minimum automate:

1. Log meal -> Food, Today, energy, Coach, and lab outlook update.
2. Edit meal -> all dependent totals update once, without duplicates.
3. Delete meal -> projections reverse and undo restores exactly.
4. Log water -> Water, Today, energy, and Coach update.
5. Log sleep -> readiness, energy, Training, Today, and Coach update.
6. Complete workout -> Training, hydration context, readiness, energy, and Today update.
7. Log lab panel -> Body Labs, Supplements Monitoring, Coach, attention, and outlook update.
8. Remote event -> local projections update without refresh.
9. Offline event -> UI updates immediately, then syncs once after reconnect.
10. Conflict and deletion -> no stale cloud resurrection.

### 16.3 Browser workflow tests

For every primary domain:

- Create
- Edit
- Delete with confirmation
- Undo and redo
- Reload persistence
- Cross-tab propagation
- Offline queue and reconnect
- Empty, loading, error, and disconnected states
- Keyboard path
- Mobile path

### 16.4 Visual regression tests

Capture all major pages at:

- 1440x900
- 1680x945
- 1792x1024
- 768x1024
- 390x844

Assert:

- No clipping or document overflow
- Navigation and major actions remain visible
- First-viewport hierarchy matches the references
- Stable card and chart dimensions
- No overlapping fixed navigation
- No raw objects, unrounded floats, placeholder strings, or fake content
- Empty states are compact and actionable

### 16.5 Medical prediction gates

- Model purpose and intended population documented
- Input and outcome definitions documented
- Training and evaluation separation documented
- Discrimination and calibration reported where applicable
- Subgroup performance and fairness reviewed
- Missingness and drift behavior tested
- Forecast audit trail retained
- Patient-facing language reviewed
- Numeric prediction disabled until all gates pass

## 17. Definition of Done

The rebuild is complete only when:

- Every required page and subtab matches the supplied visual language and interaction density.
- All page writes use the command layer.
- All shared values use canonical projections.
- Cross-domain updates occur without reload and are covered by integration tests.
- Legacy data migrates without loss or duplication.
- Offline, cloud, deletion, undo, restore, and conflict behavior pass.
- No page contains raw floats, `[object Object]`, fake values, dead actions, or unexplained placeholders.
- All required desktop, tablet, and phone screenshots pass visual review.
- Accessibility and keyboard checks pass.
- Security and owner-scoped access are verified in the deployed environment.
- Health estimates display provenance, confidence, limitations, and safe language.
- External credential or device checks are explicitly completed or marked blocked, never assumed.
- The owner approves the final phase report and deployment.

## 18. Required Agent Reporting Format

After each phase report:

1. Objective completed
2. User-visible improvements
3. Architecture changes
4. Data migrations and rollback plan
5. Changed files
6. Tests run with exact results
7. Screenshots and viewport sizes
8. Cross-domain propagation demonstrated
9. Known limitations and blocked external checks
10. Security and privacy impact
11. Recommended next phase
12. Explicit request for owner approval

Do not say "done," "working," "responsive," "secure," "connected," or "tested" without the corresponding evidence.

## 19. Execution Entry Point

Begin with Phase A. Read the existing implementation before editing. Preserve user changes and mature workflows. Make narrowly owned changes, but follow the architecture above even when a quicker page-specific patch is tempting. Build, migrate, test, render, inspect, and iterate until the phase acceptance criteria are genuinely met. Then stop for owner review before continuing.

## 20. Health Prediction Reference Standards

Use these as review inputs, not as proof that Life OS itself is clinically validated:

- TRIPOD+AI reporting guidance for transparent development and evaluation of clinical prediction models: https://www.bmj.com/content/385/bmj-2023-078378
- FDA Clinical Decision Support Software final guidance: https://www.fda.gov/media/162880/download
- FDA Clinical Decision Support Software FAQs: https://www.fda.gov/medical-devices/software-medical-device-samd/clinical-decision-support-software-frequently-asked-questions-faqs
- Example evidence that hydration effects vary by biomarker, protocol, duration, and collection conditions: https://pubmed.ncbi.nlm.nih.gov/39420215/

These references reinforce the need to disclose model purpose, inputs, intended population, evaluation, uncertainty, limitations, and the basis of recommendations. They also reinforce why Life OS must not assume a simple universal relationship between a water entry and a future blood concentration.

## 21. Honest Current Integration Verdict

Do not begin by claiming that the existing dashboard is fully integrated. It is not yet possible to prove that claim.

Known integration gaps in the starting implementation include:

- Core data readers and writers still access localStorage directly.
- The Log page contains direct store edits followed by one generic `lifeos:logged` event.
- Money, More, and several compatibility pages have their own direct write paths.
- Cloud sync groups page-owned keys into `app_state` records rather than synchronizing canonical domain events.
- The server context independently reads typed Supabase health tables.
- The AI agent can write derived rows that may not match local projections.
- Pages can calculate the same concept independently and format it differently.
- Generic events do not declare which projections changed or why.
- A successful render test does not prove cross-page propagation, cloud consistency, deletion consistency, or prediction validity.

Therefore the first integration objective is not to add more relationships. It is to remove split-brain ownership and make every relationship traceable.

The product may claim that a domain is integrated only when all of the following are true:

1. Its source events are registered.
2. Its command handlers are the only supported write path.
3. Its projections are registered and versioned.
4. Its downstream dependencies are listed.
5. Its pages subscribe to those projections.
6. Its local, cloud, import, device, edit, delete, and undo paths use the same identities.
7. Automated tests prove propagation in both directions where supported.
8. A runtime audit can explain the source of every displayed value.

## 22. Source-of-Truth Registry

Create a machine-readable registry. Documentation alone is insufficient.

Each domain entry must include:

```js
{
  domain,
  sourceEventTypes,
  commandTypes,
  projectionIds,
  legacySources,
  cloudTables,
  identityRules,
  unitRules,
  dateRules,
  retentionRules,
  privacyClass,
  consumers,
  owner,
  migrationVersion
}
```

The registry must cover at least:

| Domain | Canonical facts | Primary projections | Main consumers |
|---|---|---|---|
| Profile | Demographics, units, goals, preferences | `profile.current` | Every personalized target and forecast |
| Nutrition | Meals, ingredients, portions, nutrients, targets | Daily and rolling nutrition | Food, Today, Coach, energy, lab outlook |
| Hydration | Explicit drinks, estimated food water, targets | Daily hydration, timing, history | Water, Today, Coach, readiness, energy |
| Sleep | Nights, stages, source, quality | Sleep daily, debt, consistency | Recovery, Today, Training, Coach, energy |
| Wearables | HRV, RHR, steps, activity, source quality | Recovery and activity summaries | Today, Body, Training, Coach, energy |
| Training | Sessions, exercises, sets, cardio, RPE | Load, progress, program, recovery | Training, Today, Coach, energy, hydration |
| Body | Weight, composition, measurements, goals | Current body, trends, goal progress | Body, Today, nutrition, training, lab outlook |
| Energy | User check-ins and forecast evaluations | Current, forecast, patterns | Today, Coach, recovery |
| Mood and stress | Check-ins, symptoms, context | Trends and associations | Coach, readiness, energy, skin |
| Labs | Panels, markers, units, ranges, conditions | Latest, trends, attention, outlook | Body Labs, Supplements, Coach, Today |
| Supplements | Compounds, schedules, doses, inventory | Adherence, schedule, inventory, monitoring | Supplements, Today, Coach, lab context |
| Skin | Check-ins, routine, products, photos, environment | Current, progress, correlations | Skin, Coach, attention |
| Finance | Accounts, transactions, subscriptions, goals | All Money projections | Money, Today, Coach, planning |
| Productivity | Tasks, goals, habits, calendar | Day plan, focus, completion | Today, Coach, notifications |
| Communications | Mail and opportunity summaries | Inbox and follow-up projections | Today, Coach |
| Photos | Photo metadata, binary asset, consent | Body and Skin photo views | Body, Skin, export, privacy |

Registry enforcement requirements:

- CI fails when a new source event, projection, cloud table, or direct store is not registered.
- CI fails when a UI page imports a legacy repository after its migration phase is complete.
- A developer-only Data Graph screen lists each domain, current source count, projection version, freshness, consumers, and last recomputation.
- The Data Graph can answer: "Why is this number on screen?" and "What will change if this event changes?"

## 23. Complete Cross-Domain Influence Matrix

Implement this matrix as configuration plus tests. A checkmark in a design document is not proof.

Legend:

- `I`: immediate deterministic effect
- `R`: rolling historical feature
- `A`: possible observed association after sufficient data
- `F`: forecast input only when the model supports it
- `C`: contextual information, not a causal input
- `-`: no automatic relationship

| Source change | Today | Readiness | Energy | Coach | Training | Body | Skin | Labs outlook | Finance |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Meal logged | I | C | F | I | C | R | A | R/F | - |
| Water logged | I | C/F | F | I | C | C | A | C/F | - |
| Sleep logged | I | I | F | I | I | C | A | C/F | - |
| Energy check-in | I | C | I | I | C | - | A | - | - |
| Mood or stress check-in | I | I | F | I | C | - | A | - | - |
| Strength workout completed | I | I | F | I | I | R | C | C/F | - |
| Cardio completed | I | I | F | I | I | R | C | C/F | - |
| Weight logged | I | C | C/F | I | C | I | - | R/F | - |
| Body composition logged | I | C | - | I | C | I | - | R/F | - |
| Lab panel logged | I | C | - | I | C | C | - | I | - |
| Supplement dose logged | I | C | C/F | I | C | C | A | C/F | - |
| Supplement definition changed | C | - | - | I | - | - | C | C | - |
| Skin check-in logged | C | - | - | I | - | - | I | - | - |
| Finance transaction logged | I | - | C | I | - | - | - | - | I |
| Task or calendar change | I | C | C | I | C | - | - | - | - |
| Integration disconnected | I | C | C | I | C | C | C | C | C |

Matrix rules:

- `I` relationships require deterministic integration tests.
- `R` relationships require correct time-window invalidation and backfill tests.
- `A` relationships remain hidden until sample-size and quality gates pass.
- `F` relationships require a registered model and feature contract.
- `C` relationships may be displayed as context but cannot change a score unless a versioned rule explicitly promotes them.
- Every matrix cell must link to its implementation, rule or model version, tests, and UI consumers.
- Unsupported relationships must stay `-`; do not create a connection merely to make Life OS appear intelligent.

## 24. Typed Signal Contract

Cross-domain intelligence must travel through typed signals, not arbitrary strings or AI-written cards.

Use a shape such as:

```js
{
  id,
  signal_type,
  domain,
  title,
  summary,
  truth_class,
  status,
  severity,
  observed_at,
  valid_until,
  source_event_ids,
  source_projection_versions,
  contributors: [
    { key, label, direction, value, unit, weight, evidence }
  ],
  confidence: {
    level,
    score,
    coverage,
    sample_size,
    calibration_state
  },
  explanation,
  limitations,
  action: {
    type,
    label,
    target,
    requires_confirmation
  },
  rule_or_model_version,
  supersedes_signal_id
}
```

Signal requirements:

- One signal has one canonical identity across Today, Coach, attention queues, and notifications.
- Reading or resolving a signal anywhere updates every representation.
- A signal cannot be duplicated merely because several pages consume it.
- Signals expire or become stale based on explicit rules.
- An insight generated from incomplete data cannot have a high-confidence style.
- Users can inspect inputs, dismiss a signal, correct a source fact, or provide feedback.
- Feedback becomes a separate event and never rewrites the original evidence.

## 25. Calculation and Model Governance

Create a Calculation Registry for every score, target, trend, estimate, association, and forecast.

Each registry entry must include:

```js
{
  id,
  displayName,
  outputProjection,
  truthClass,
  inputProjectionVersions,
  formulaOrModelRef,
  version,
  units,
  allowedRange,
  minimumCoverage,
  freshnessRules,
  missingDataBehavior,
  confidenceMethod,
  evaluationMethod,
  limitations,
  owner,
  tests
}
```

Governance requirements:

- The same readiness score cannot be calculated independently in client and server code without parity tests and a shared version.
- Formula changes create a new version and trigger a controlled historical recompute.
- Historical charts disclose when a calculation version changed.
- Default scores must not imply measured health. When data is absent, show no score or explicitly label a baseline estimate.
- Thresholds cannot be buried in templates. They belong in the registry with rationale and tests.
- Unit conversion occurs before calculation and after validation.
- Rounding occurs only for display, never in stored source facts or intermediate calculations.
- Inputs outside plausible ranges are quarantined for correction rather than silently included.
- Every model tracks evaluation data separately from training or fitting data.
- Confidence reflects coverage, noise, freshness, and model performance rather than a decorative percentage.

### 25.1 Prediction maturity ladder

Every predictive feature must declare its maturity:

1. **Unavailable:** required facts are missing.
2. **Descriptive:** summarizes what has happened.
3. **Rule-based estimate:** transparent deterministic estimate.
4. **Personal association:** repeated relationship observed in this user's history.
5. **Evaluated forecast:** future prediction with tracked out-of-sample performance.
6. **Clinically reviewed support:** evaluated for the intended medical use and reviewed appropriately.

The UI must never style level 2 or 3 as if it were level 5 or 6.

## 26. Personal Baseline and Learning Loop

Life OS must learn from the user without allowing the model to rewrite history.

### 26.1 Baseline layers

- Profile baseline: age, sex where relevant, units, timezone, goals, preferences.
- Physiological baseline: rolling sleep, HRV, RHR, weight, activity, energy, and mood.
- Behavioral baseline: meal timing, hydration timing, training schedule, routines, task rhythm.
- Financial baseline: recurring income, expenses, account balances, savings behavior.
- Collection baseline: device sources, lab collection conditions, usual logging times.

### 26.2 Feedback loop

1. The system forecasts or recommends.
2. The user later logs the actual outcome.
3. The system scores forecast error and usefulness.
4. Calibration and confidence update.
5. The user can mark advice useful, wrong, irrelevant, or unsafe.
6. Model changes are versioned and auditable.

Do not personalize by silently changing goals or reference ranges. User-defined goals and clinician-provided targets require explicit records and remain distinguishable from system suggestions.

## 27. Global Experience That Connects Every Page

The product should feel connected even before the user understands the data architecture.

### 27.1 Universal Quick Log

- Available from every page.
- Parses food, water, weight, sleep, mood, energy, training, supplements, tasks, and finance.
- Always previews the structured event before ambiguous or high-impact writes.
- Shows which areas will update after confirmation.
- Supports undo from the global toast and activity history.

Example confirmation:

> Log 500 ml water at 15:05. This will update Today, Water, hydration timing, energy context, and Coach.

### 27.2 Universal activity timeline

- Shows all canonical events in one chronological view.
- Supports domain filters, source filters, edits, tombstones, and provenance.
- Opening an event shows every projection and signal affected by it.
- Corrections propagate from this timeline exactly as they do from domain pages.

### 27.3 Global attention queue

- Uses canonical signal identities.
- Merges health, tasks, finance, integrations, inventory, reviews, and data-quality issues.
- Supports priority, due time, snooze, resolve, dismiss, and source correction.
- Resolution anywhere updates Today, Coach, notifications, and the originating domain.

### 27.4 Explain this value

Every important metric offers one consistent explanation surface containing:

- What it means
- Whether it was measured, calculated, estimated, associated, or forecast
- When it was updated
- Which facts contributed
- Which data is missing or stale
- Formula or model version
- How to correct the source data

### 27.5 What changed

After meaningful edits, show a concise impact summary:

- Nutrition: 1,760 -> 2,040 kcal
- Hydration: unchanged
- Energy outlook: moderate -> good, low confidence
- Coach focus: protein target completed

Do not show this for trivial changes that do not affect downstream meaning.

## 28. External Integration Contracts

Every integration must implement the same lifecycle:

```text
unavailable -> disconnected -> connecting -> connected -> syncing
-> current | stale | permission_lost | rate_limited | error
```

Each integration adapter must define:

- Authentication and permission scopes
- Source identity and deduplication keys
- Cursor or incremental synchronization strategy
- Supported record types
- Unit, timezone, and date normalization
- Freshness expectation
- Retry and rate-limit behavior
- Delete and disconnect behavior
- Provenance retained on imported events
- User-visible status and recovery action
- Test fixture and contract test

Required adapter groups:

- Health and wearable providers
- Mail and calendar
- Finance and statement imports
- Nutrition search, barcode, photo, and AI extraction
- Body and Skin photos
- Notifications and push
- Cloud backup and multi-device synchronization

Disconnecting an integration must not delete historical facts without explicit confirmation. It must stop future sync, mark freshness, and explain which features will become limited.

## 29. Data Quality, Missingness, and Trust

Data quality is multidimensional. One percentage is not enough.

Track per domain and projection:

- Coverage
- Freshness
- Source reliability
- Completeness
- Consistency
- Plausibility
- Duplication risk
- Unit certainty
- Temporal alignment
- User confirmation state

Quality rules:

- Missing data stays missing. Do not replace it with healthy defaults.
- Device and manual records use precedence rules and duplicate detection.
- Conflicting records are shown for resolution when safe automatic reconciliation is impossible.
- A low-quality input cannot produce a high-confidence forecast.
- Stale facts remain available historically but do not silently drive current advice.
- Data-quality issues create actionable signals linked to the exact source.

## 30. Security, Privacy, and Sensitive-Domain Boundaries

Treat health, labs, compounds, photos, communications, and finance as highly sensitive.

Requirements:

- Owner authentication before remote sensitive reads or writes.
- RLS negative tests proving another user and an anonymous client cannot read or mutate owner rows.
- Server secrets only on the server.
- API request authentication, validation, rate limiting, and safe error responses.
- No sensitive content in URLs, analytics, console logs, or notification previews by default.
- Explicit AI context controls per domain.
- Photo consent, retention, export, and deletion controls.
- Audit history for imports, AI extraction confirmation, edits, deletions, restores, and account access.
- Backup encryption claims only when verified.
- Account deletion and remote purge are separate from local-device reset and clearly explained.
- Safety boundaries for lab, supplement, medication, hormone, and compound content.

## 31. End-to-End Update Scenarios

The following scenarios must pass before Life OS can claim seamless integration.

### 31.1 Meal correction

1. Log a meal containing 700 kcal and 40 g protein.
2. Confirm Food totals, Today, Coach, and energy context update once.
3. Edit it to 600 kcal and 50 g protein from Recent Meals.
4. Confirm every consumer reflects the delta, not an additional meal.
5. Confirm rolling windows are invalidated only for the relevant dates.
6. Delete and undo.
7. Confirm the original canonical event identity and history remain traceable.

### 31.2 Water from two sources

1. Log 500 ml manually.
2. Import the same entry from a wearable source.
3. Confirm duplicate detection prevents 1,000 ml total.
4. Resolve the duplicate and retain provenance.
5. Confirm Water, Today, Coach, timing, and energy context agree.

### 31.3 Poor sleep and planned training

1. Sync a short night of sleep.
2. Confirm readiness and energy update.
3. Confirm Training shows recovery context without automatically deleting the workout.
4. Confirm Coach explains the contributors and offers an optional adjustment.
5. Accept or reject the adjustment and verify calendar and plan behavior.

### 31.4 New lab panel

1. Import and confirm a lab panel.
2. Confirm Body Labs is canonical.
3. Confirm Supplements Monitoring reads the same panel.
4. Confirm attention signals use the same marker identity and range metadata.
5. Confirm Bloodwork Outlook evaluates its previous forecast against the actual panel.
6. Correct one marker and verify every consumer updates without creating a second panel.

### 31.5 Supplement inventory and adherence

1. Log a scheduled dose.
2. Confirm adherence and inventory decrement once.
3. Confirm Today no longer shows the dose as due.
4. Confirm low-stock timing changes when inventory crosses its threshold.
5. Undo and verify all dependent projections reverse.

### 31.6 Financial transaction

1. Import a transaction and reconcile it.
2. Confirm account balance, cash flow, spending category, budget, savings rate, Today, and Coach agree.
3. Reclassify it and verify only category-dependent projections change.
4. Delete or exclude it and verify audit and reconciliation state.

### 31.7 Multi-device offline conflict

1. Edit the same entity on two devices while offline.
2. Reconnect both.
3. Confirm event identity, supersession, and conflict policy behave deterministically.
4. Confirm no duplication, silent loss, or deleted-record resurrection.
5. Confirm every open page receives the final projection version.

## 32. No Disconnected Islands Gate

Add one mandatory final gate named `integration-completeness`.

The gate must fail when:

- A production UI file writes directly to localStorage, IndexedDB, or a remote table outside an approved repository or migration adapter.
- A page calculates a registered shared metric outside its projection implementation.
- A displayed metric lacks a source projection.
- A projection lacks registered dependencies.
- A source event lacks a schema or migration path.
- A shared signal is copied instead of referenced by canonical ID.
- Client and server calculation versions differ.
- A delete path lacks a tombstone or undo policy.
- An integration import lacks a source reference or deduplication test.
- A page requires reload to observe a local canonical change.
- A remote event fails to update mounted consumers after sync.
- A forecast lacks truth class, confidence, provenance, limitations, or evaluation state.
- A visual state invents data when facts are missing.

The gate produces a report with:

- All pages and components
- Source events read
- Commands emitted
- Projections consumed
- Signals consumed
- Cloud tables touched
- Integration adapters used
- Direct legacy accesses remaining
- Missing tests
- Last verified date and commit

The report must reach 100 percent registered ownership and zero unapproved direct writes before the final cutover.

## 33. Expanded Completion Evidence

The final owner review must include more than screenshots and pass counts.

Required evidence:

1. A generated architecture map from events to projections to pages.
2. A source-of-truth registry report with no unowned stores.
3. A calculation registry report with matching client and server versions.
4. A cross-domain matrix with linked passing tests for every `I` relationship.
5. A seven-day offline and reconnect soak-test report.
6. A cloud conflict and deletion-resurrection report.
7. A prediction evaluation and calibration report.
8. Accessibility results and keyboard walkthroughs.
9. Performance measurements for write, projection recompute, render, and sync.
10. Security negative tests for anonymous and wrong-owner access.
11. Data migration counts and before-after checksums.
12. Full visual regression results at every required viewport.
13. A list of blocked real-provider checks with exact reasons.
14. A manual owner journey recording covering Today, every Log domain, Coach, Money, and More.

## 34. Final Lock

Do not declare seamless integration based on the existence of the architecture alone. Implement it incrementally, remove bypasses, and prove every registered relationship through automated and manual evidence. The final product must be able to explain every value, propagate every supported change, preserve every source fact, and admit every uncertainty.

## 35. Product North Star: An Answer-First Personal Operating System

The final product is not only a collection of dashboards. It is one trusted place where the owner can ask a practical question about their life and receive the best answer available from their own connected information.

The north-star promise is:

> Capture once. Understand everywhere. Ask anything practical. See the evidence. Take action safely.

Life OS should replace the need to manually search through many separate apps for routine personal answers. It does not need to reproduce every specialized editor, bank, messenger, medical device, or provider. It must become the operating layer above those systems:

- It captures or imports the useful facts.
- It links facts that refer to the same person, place, object, account, goal, event, or period.
- It calculates shared projections once.
- It retrieves the right evidence for a question.
- It explains what is known, inferred, missing, or stale.
- It offers safe actions that use the same canonical data.
- It deep-links to a specialist provider when Life OS should not perform the task itself.

Success is not "every phone app copied into one website." Success is "the common jobs across those apps unified into one coherent memory, answer, planning, and action system."

## 36. Product Scope and Explicit Boundaries

### 36.1 In scope

Life OS should cover practical, loggable, importable, or documentable parts of life:

- Daily overview and attention
- Calendar, schedule, tasks, projects, goals, habits, focus, and reminders
- Food, groceries, nutrition, water, and meal planning
- Training, cardio, body measurements, sleep, recovery, wearables, and energy
- Labs, appointments, health records, supplements, and monitoring context
- Skin routines, products, check-ins, and progress photos
- Accounts, transactions, cash flow, budgets, subscriptions, business, tax context, wealth, debt, and planning
- Work projects, clients, invoices, contracts, notes, and follow-ups
- Mail and calendar summaries where connected and permitted
- Travel plans, bookings, packing, documents, timing, and trip spending
- Home inventory, warranties, maintenance, utilities, recurring household costs, and important documents
- Vehicles, insurance, maintenance, mileage, costs, and renewal dates
- Shopping lists, wishlists, purchases, receipts, return windows, and replenishment
- Books, courses, learning plans, notes, and progress
- Personal documents, identity records, expiration dates, policies, and emergency information
- Device and digital-service usage, backups, storage, permissions, and account status
- Weather, location, and environmental context when explicitly enabled
- Search, questions, explanations, planning, comparisons, reminders, and safe actions across all included domains

### 36.2 Out of scope by default

- Social relationship scoring
- Friendship or romantic relationship analysis
- Private-message sentiment surveillance
- Social popularity or influence scoring
- Mental-health diagnosis
- Therapy replacement
- Depression, anxiety, or psychiatric predictions
- Inferences about another person's feelings, motives, or health
- Autonomous medical, financial, legal, or interpersonal decisions

Optional energy, stress, or mood check-ins are subjective self-reports only. They may help the owner describe a day, but they must not be represented as mental-health measurements or diagnoses.

### 36.3 Specialist-system boundary

Life OS may summarize, prepare, initiate, or deep-link to specialist systems. It must not pretend to replace capabilities that require a regulated provider, secure transaction processor, professional editor, or dedicated communication service.

Examples:

- Show bank information and prepare a transfer, but do not move money without an approved provider flow and explicit confirmation.
- Show appointment records and questions for a clinician, but do not diagnose or prescribe.
- Draft an email, but do not send without explicit confirmation.
- Store a document and extract dates, but preserve the original file and link to it.
- Summarize travel bookings, but use the provider for ticket changes or payment.

## 37. Complete Practical-Life Domain Map

Expand the Source-of-Truth Registry with these domain groups.

### 37.1 Time and execution

Canonical entities:

- Calendar event
- Task
- Project
- Goal
- Habit definition and completion
- Focus session
- Reminder
- Routine
- Deadline
- Time block

Shared projections:

- Today plan
- Week plan
- Workload
- Upcoming deadlines
- Focus trend
- Habit consistency
- Goal progress
- Scheduling conflicts
- Available time

### 37.2 Work and business

Canonical entities:

- Client
- Lead
- Project
- Contract
- Invoice
- Business expense
- Billable session
- Deliverable
- Follow-up
- Business document

Shared projections:

- Revenue and profit
- Outstanding invoices
- Capacity
- Effective hourly rate
- Client status
- Follow-up queue
- Tax context
- Project risk

### 37.3 Home and possessions

Canonical entities:

- Home
- Room
- Appliance
- Device
- Valuable item
- Warranty
- Maintenance task
- Utility account
- Service provider
- Household document

Shared projections:

- Maintenance calendar
- Warranty expiration
- Replacement forecast
- Household costs
- Inventory value
- Required action queue
- Relevant manuals and receipts

### 37.4 Vehicle and mobility

Canonical entities:

- Vehicle
- Mileage record
- Fuel or charging entry
- Service record
- Insurance policy
- Tax or registration
- Parking or toll expense
- Trip

Shared projections:

- Cost per month and kilometer
- Next service
- Renewal dates
- Running cost
- Mileage trend
- Trip readiness

### 37.5 Travel

Canonical entities:

- Trip
- Booking
- Flight or train segment
- Accommodation
- Activity
- Packing item
- Travel document
- Reservation
- Trip expense

Shared projections:

- Unified itinerary
- Countdown and readiness
- Missing bookings or documents
- Packing status
- Budget and actual spending
- Timezone and schedule impact
- Weather context

### 37.6 Shopping and replenishment

Canonical entities:

- Shopping-list item
- Wishlist item
- Product
- Purchase
- Receipt
- Subscription
- Return window
- Stocked household item

Shared projections:

- Grocery list from meal plan
- Replenishment queue
- Price history
- Return deadlines
- Subscription renewals
- Spending impact
- Duplicate-purchase warning

### 37.7 Learning and personal knowledge

Canonical entities:

- Book
- Course
- Article
- Note
- Highlight
- Learning goal
- Study session
- Source document

Shared projections:

- Learning queue
- Progress
- Notes by topic
- Review schedule
- Connections between sources
- Questions answered from the owner's library

### 37.8 Personal records and administration

Canonical entities:

- Identity document
- Policy
- Certificate
- Membership
- License
- Tax document
- Medical document
- Contract
- Emergency record
- Renewal

Shared projections:

- Expiration and renewal calendar
- Missing-document checklist
- Searchable document index
- Emergency pack
- Related payments
- Related tasks

### 37.9 Digital life

Canonical entities:

- Device
- App or service
- Account connection
- Subscription
- Backup
- Permission
- Storage report
- Security event

Shared projections:

- Service and subscription inventory
- Backup status
- Permission health
- Storage pressure
- Renewal cost
- Disconnected integrations
- Account attention

## 38. Personal Knowledge Graph

An all-of-life answer system needs more than event lists. Build a personal knowledge graph on top of canonical events and documents.

### 38.1 Entity model

At minimum support these reusable entity types:

- Person, limited to practical identity or provider roles
- Organization
- Account
- Project
- Goal
- Place
- Trip
- Event
- Task
- Product
- Asset
- Vehicle
- Home
- Document
- Transaction
- Subscription
- Meal
- Workout
- Measurement
- Lab panel and marker
- Medication or supplement record
- Appointment
- Note
- Source

### 38.2 Relationship examples

- Transaction `paid_for` subscription
- Receipt `documents` purchase
- Purchase `covered_by` warranty
- Warranty `applies_to` device
- Task `belongs_to` project
- Calendar event `fulfills` workout plan
- Meal `contributes_to` nutrition day
- Lab panel `collected_during` protocol phase
- Booking `belongs_to` trip
- Trip `uses` travel document
- Invoice `issued_to` client
- Note `references` book or meeting
- Reminder `protects` deadline

### 38.3 Graph rules

- Relationships have source evidence, confidence, created time, and update history.
- Deterministic relationships are preferred over AI guesses.
- AI-proposed links remain pending until confidence or confirmation requirements pass.
- Deleting a source does not silently delete unrelated entities.
- Merging duplicate entities is reversible and audited.
- Sensitive domains retain permission boundaries even when linked.
- The graph cannot expose excluded social or mental-health inferences.

### 38.4 Entity resolution

Resolve duplicates using stable provider IDs first, then exact normalized identifiers, then cautious similarity matching. Never merge solely because names look alike when the consequence could affect health, finance, identity, or documents.

## 39. Universal Answer Engine

The primary AI experience is: ask a practical question and receive an evidence-grounded answer from Life OS.

### 39.1 Answer pipeline

For every question:

1. Classify intent: lookup, calculation, comparison, explanation, forecast, planning, search, or action.
2. Determine relevant domains and whether the owner has allowed them in AI context.
3. Resolve dates, units, entities, and ambiguous references.
4. Retrieve canonical projections and exact source facts first.
5. Retrieve semantically relevant notes and documents second.
6. Run registered deterministic calculations where needed.
7. Use registered forecasts only when their gates pass.
8. Generate a concise answer grounded in retrieved evidence.
9. Attach sources, as-of dates, confidence, missing information, and limitations.
10. Offer safe next actions without running them automatically.

### 39.2 Answer contract

```js
{
  question,
  normalized_intent,
  answer,
  answer_type,
  as_of,
  confidence,
  facts_used: [
    { value, unit, source_id, projection_id, occurred_at }
  ],
  calculations: [
    { calculation_id, version, inputs, output }
  ],
  documents_used: [
    { document_id, title, section, captured_at }
  ],
  missing_information,
  stale_information,
  conflicts,
  limitations,
  suggested_actions
}
```

### 39.3 Required answer behavior

- Answer directly before providing detail.
- Prefer exact canonical facts over generated prose.
- Cite the user's source records in a human-readable way.
- State when information is missing, stale, conflicting, estimated, or unavailable.
- Ask one clarifying question when ambiguity materially changes the answer.
- Never fabricate an answer to preserve conversational flow.
- Support "show me why" and "open the source."
- Maintain the same answer whether asked from Today, Coach, search, or a domain page.
- Respect current units, timezone, locale, and owner preferences.
- Never include a sensitive domain that is disabled for AI context.

### 39.4 Answer modes

- **Quick answer:** one result with source and as-of time.
- **Explain:** contributors, calculations, uncertainty, and source trail.
- **Compare:** periods, options, or scenarios using common units.
- **Plan:** proposed steps, dependencies, timing, and costs.
- **What changed:** delta since a selected time or event.
- **Find:** locate the relevant record, file, receipt, booking, or event.
- **Forecast:** registered prediction with confidence and limitations.
- **Audit:** show inconsistencies, missing data, duplicates, or stale sources.

### 39.5 Example questions the completed product must answer

- What do I need to do today?
- When is my next open two-hour block?
- What did I spend on subscriptions this year?
- Can I afford this purchase without delaying my house goal?
- Which invoice needs follow-up first?
- How much protein and water do I have left today?
- Why is my energy forecast low this afternoon?
- When did I last train legs and what should progress next?
- Which supplements are due and which are running low?
- When was my last blood panel and which markers require attention?
- What changed before my skin irritation increased?
- Where is the receipt and warranty for my laptop?
- When does my passport expire and which trip needs it?
- What maintenance is due on my car or home?
- Which recurring costs increased this quarter?
- What books or notes do I have about a specific topic?
- What data is stale or missing across Life OS?
- What will update if I correct this meal, transaction, or measurement?

Each example requires a deterministic test fixture and an answer-grounding assertion.

## 40. Universal Search and Personal Memory

Search must cover structured records and approved unstructured content.

### 40.1 Search sources

- Canonical events and entities
- Projections and signals
- Notes
- Documents and extracted text
- Receipts
- Mail metadata and content when connected and permitted
- Calendar
- Tasks and projects
- Books and courses
- Trips and bookings
- Photos through metadata, not unsupported visual claims

### 40.2 Indexing requirements

- Local-first index where practical.
- Permission-aware namespaces.
- Source-level deletion and reindexing.
- Incremental updates after every canonical change.
- Language and spelling tolerance.
- Entity, date, amount, and unit filters.
- Exact-match priority for IDs, names, titles, and reference numbers.
- Semantic retrieval cannot bypass domain permissions.
- Search result snippets show source, date, domain, and freshness.

### 40.3 Memory rules

- Memory is made of source-backed facts and user-approved preferences.
- The AI cannot create a permanent fact merely by mentioning it in an answer.
- Proposed memories require confirmation unless extracted deterministically from a confirmed event.
- The owner can inspect, edit, export, or delete remembered facts.
- Contradictory memories remain visible until resolved.
- Memory retention follows privacy class and owner settings.

## 41. Universal Action Engine

Questions and actions share one reasoning context but have different safety rules.

### 41.1 Action lifecycle

```text
understand -> retrieve facts -> propose plan -> preview effects
-> request confirmation -> execute through command adapter
-> verify result -> update projections -> show audit and undo
```

### 41.2 Action risk classes

- **Read only:** search, explain, compare, calculate. No confirmation needed.
- **Low risk and reversible:** add task, log water, update a list. One clear confirmation when parsed from ambiguous input; direct controls may execute immediately with undo.
- **External communication:** draft first, explicit send confirmation, verify provider result.
- **Financial:** never move money without provider-native authorization and explicit confirmation.
- **Health:** may log, summarize, remind, or prepare questions; may not diagnose, prescribe, or alter treatment autonomously.
- **Destructive:** show affected records and projections, require confirmation, create tombstone, offer real undo when possible.

### 41.3 Impact preview

Before a multi-domain or high-impact action, show:

- Facts that will be created or changed
- Pages and projections that will update
- External systems contacted
- Messages or files sent
- Whether the action is reversible
- Expected costs or deadlines
- Required permissions

### 41.4 Verification

An action is successful only when the adapter confirms the result and the canonical event is stored. A toast without verification is not success.

## 42. Capture and Ingestion System

The dashboard becomes useful when capturing life is easier than maintaining separate apps.

Support:

- Quick text
- Voice converted to previewed structured input
- Share target from phone apps
- Photo and document upload
- Barcode
- Receipt and invoice import
- Calendar and mail connection
- Wearable and health provider sync
- Bank statement import
- File drop
- Browser clipping
- Reusable templates
- Automation rules with explicit permission

Every ingestion path must use the same sequence:

1. Preserve the original source.
2. Extract candidate facts.
3. Validate schema, units, dates, and identity.
4. Show confidence and ambiguous fields.
5. Require confirmation according to risk.
6. Create canonical events.
7. Update entities, projections, graph links, search index, and signals.
8. Retain provenance and extraction version.

## 43. Information Architecture for an All-of-Life Product

Keep the top-level navigation calm. Do not add twenty permanent sidebar items.

### 43.1 Top-level navigation

- **Today:** current state, plan, priority, signals, and next actions.
- **Log:** fast capture and detailed health or performance domains.
- **Coach:** universal questions, explanations, plans, and follow-ups.
- **Money:** complete financial operating area.
- **More:** practical-life areas, integrations, records, and system controls.

### 43.2 More area groups

Organize practical-life modules into clear groups:

- Plan: Tasks, Projects, Goals, Habits, Calendar, Reminders
- Life admin: Documents, Home, Vehicle, Insurance, Renewals
- Explore: Travel, Library, Learning, Notes
- Work: Clients, Invoices, Contracts, Business tools
- Digital: Devices, Services, Usage, Backups, Permissions
- System: Settings, Integrations, Notifications, Data, Privacy, About

The answer engine can reach every domain without requiring the user to know this structure.

### 43.3 Dashboard composition

Today should not show a card for every possible domain. It should select modules based on urgency, recency, user pinning, and available data while preserving a stable layout. The attention queue and universal answer field provide access to everything else.

## 44. Completeness Model

"All of your life" is an extensible promise, not a finite list of cloned applications. Define completeness through supported jobs and registered domains.

Each domain has a status:

- Not supported
- Connector only
- Read-only summary
- Searchable
- Canonical capture
- Full CRUD
- Reactive projections
- Cross-domain signals
- Answer-enabled
- Action-enabled
- Offline and synchronized
- Fully verified

The product is allowed to show partial support, but the status must be honest.

Create a Coverage screen showing:

- Domains available
- Connected providers
- Last successful sync
- Data freshness
- Supported questions
- Supported actions
- Missing permissions
- Verification level
- Known limitations

This prevents the interface from appearing omniscient while silently lacking the information needed to answer.

## 45. Final All-of-Life Acceptance Gate

Add a second mandatory final gate named `answer-completeness`.

It fails when:

- An example question has no registered intent or answer test.
- An answer includes a fact without a source record.
- The same question produces conflicting canonical values on different pages.
- Search returns content from a disabled domain.
- A deleted source remains in search or AI memory.
- An action bypasses the command layer.
- An external action is reported successful without provider verification.
- The AI converts a guess into permanent memory.
- A plan omits known schedule, cost, deadline, or permission conflicts.
- A health or financial answer omits required limitations.
- Excluded social or mental-health inferences appear.
- A practical-life domain claims full support before its workflow and sync tests pass.

The final dashboard can be called an AI-powered personal operating system only when both `integration-completeness` and `answer-completeness` pass.

## 46. Final Product Definition

The finished Life OS is a private, offline-capable, cross-device synchronized, AI-assisted operating layer for the owner's practical life. It remembers confirmed facts, connects related records, calculates shared state, answers questions with evidence, helps plan across constraints, and executes approved actions through verified adapters.

It is not an omniscient assistant, social judge, therapist, clinician, bank, or replacement for every specialist app. Its strength comes from knowing exactly what it knows, connecting that knowledge consistently, and admitting what it cannot know.

## 47. Cross-Device Authority and Replica Model

Life OS must work across phone, tablet, and desktop under one owner account. Every signed-in device has a local replica for speed and offline use. The owner-scoped cloud event service is the durable synchronization rendezvous and recovery source. No individual device or page-owned storage bundle may become a competing source of truth.

### 47.1 Shared truth

The authoritative history is the accepted set of canonical owner events, identified consistently across all replicas.

- Every event has one globally unique ID generated before synchronization.
- Every accepted cloud event receives an owner-scoped server sequence or revision.
- Every entity edit records its predecessor or base revision.
- Every device stores the latest synchronization cursor it has fully applied.
- Projection values are reproducible from the same accepted event set and calculation versions.
- Device-local preferences are explicitly separated from account-wide preferences.
- A local pending event remains visible immediately but is labeled pending until accepted remotely.
- Rejected or conflicted events remain recoverable and visible to the owner.

### 47.2 Device responsibilities

Each device must:

- Maintain a transactional local event replica.
- Maintain local projections and search indexes for fast operation.
- Queue pending events and file operations in an outbox.
- Apply remote events in server sequence order.
- Rebuild invalidated projections after each applied batch.
- Persist sync cursors atomically with the applied batch.
- Continue supported workflows offline.
- Clearly expose pending, failed, stale, and conflicted state.
- Never discard pending work during logout, update, crash, or storage pressure without warning and recovery.

### 47.3 Cloud responsibilities

The cloud service must:

- Authenticate the owner and device session.
- Enforce owner-scoped authorization on every event, snapshot, file, and query.
- Accept idempotent event batches.
- Assign monotonic owner-scoped sequence values.
- Retain tombstones and supersession history according to policy.
- Serve incremental changes after a cursor.
- Provide a verified bootstrap snapshot plus subsequent event tail.
- Publish real-time invalidations or event notices to active devices.
- Store encrypted transport only through TLS and accurately document provider-side encryption at rest.
- Store photos and documents in owner-scoped object storage with signed access rather than local-only IndexedDB.
- Track file hashes, sizes, MIME types, versions, upload state, and deletion state.
- Support session revocation, device removal, account export, and remote purge.

### 47.4 Synchronization protocol

Use a cursor-based protocol:

1. Device writes and projects a valid local event.
2. Device adds the event to its outbox.
3. Device pushes an idempotent batch with device ID and known server cursor.
4. Server validates ownership, schema, identity, and base revision.
5. Server accepts, rejects, or marks a semantic conflict for each event.
6. Server returns accepted sequence values and all remote events after the device cursor.
7. Device applies the remote batch transactionally.
8. Device recomputes only invalidated projections and indexes.
9. Device advances its cursor only after the transaction succeeds.
10. Device acknowledges completion and updates visible sync status.

Requirements:

- Retrying the same batch cannot duplicate facts.
- Pulling after a stale cursor cannot skip events.
- Event application and cursor advancement are one transaction.
- Real-time notifications are hints to pull, not the only delivery mechanism.
- Opening or resuming the application always performs a catch-up pull.
- Periodic reconciliation compares event counts, recent hashes, and projection versions.
- Service-worker or background synchronization is treated as opportunistic because platform support and operating-system restrictions vary.
- The product cannot promise instant background updates when the platform prevents them; it must promise convergence after the app resumes or a supported push wakes it.

### 47.5 Conflict policy

Do not apply one generic last-write-wins rule to every domain.

- Append-only independent events, such as two different water entries, coexist.
- Same-source duplicates are deduplicated by stable source reference.
- Concurrent edits to the same entity use base revision and semantic merge rules.
- Set-like fields may merge when both changes are non-destructive.
- Scalar conflicts with materially different values require a deterministic winner plus visible conflict history, or owner resolution where safety matters.
- Health, lab, identity, finance, and document conflicts cannot be silently combined.
- Tombstones prevent deleted records from reappearing.
- Resolution creates a new canonical event; it does not rewrite both histories invisibly.

### 47.6 New-device bootstrap

On a new signed-in device:

1. Verify the account and register the device session.
2. Download the latest verified event snapshot and projection manifest.
3. Verify snapshot checksum, owner, schema, and calculation versions.
4. Download and apply the event tail after the snapshot cursor.
5. Rebuild or verify local projections.
6. Build the permission-aware search index.
7. Download lightweight photo and document metadata first.
8. Fetch binary assets lazily, with explicit offline-download controls.
9. Compare domain counts and integrity hashes with the cloud manifest.
10. Mark the device current only after verification passes.

A new device must never begin with an apparently empty dashboard while cloud data silently remains elsewhere.

### 47.7 Files, photos, and documents

IndexedDB may cache binary assets but cannot remain the only copy for a cross-device product.

- Originals upload to owner-scoped object storage after explicit capture or confirmation.
- Metadata becomes a canonical event or entity record.
- Uploads support resume, retry, hash verification, and duplicate detection.
- Thumbnails and optimized previews are derived assets linked to the original.
- Deletion synchronizes metadata and object tombstones.
- Offline availability is selectable per asset or collection.
- Sensitive previews are hidden from notifications and device switchers by default.
- Export includes originals or a verifiable retrieval manifest.

## 48. Cross-Device Experience

The owner should understand device state without thinking about replication technology.

### 48.1 Global sync status

Use one shared status component with these states:

- Current
- Saving locally
- Syncing
- Offline, changes saved on this device
- Changes waiting to sync
- Sync delayed
- Action required
- Conflict requires review
- Session expired

Do not show a permanent green "synced" badge when no verification has occurred.

### 48.2 Device management

More > Data or Privacy must show:

- Registered devices
- Device name and type
- First and last activity
- Last verified cursor
- Last successful sync
- Pending event and file counts where available
- Current session
- Revoke session
- Remove device
- Remote data removal policy

Removing a device revokes future access. Remote wiping cached local data is only claimed when the platform and device application can verify it.

### 48.3 Account-wide and device-only settings

Clearly classify settings:

- Account-wide: units, goals, enabled domains, AI permissions, notification rules, calculation preferences.
- Device-specific: theme contrast, downloaded files, biometric unlock, local notification permission, camera selection.
- Provider-specific: health connector, mail account, calendar account, bank import source.

Changing an account-wide setting updates every device and invalidates affected projections. A device-specific setting remains local and does not create misleading conflicts.

### 48.4 Live cross-device behavior

When Device A logs or edits data while Device B is active:

- Device A updates immediately.
- The cloud accepts the canonical event.
- Device B receives a real-time hint, pulls the event, applies it, and rerenders affected projections.
- Device B does not reload the page.
- Both devices display the same canonical values and projection versions.

Target under a normal healthy connection: active Device B reflects accepted changes within five seconds. This is a measured service target, not a guarantee under offline or platform-restricted conditions.

## 49. Cross-Device Acceptance Matrix

Before claiming cross-device support, test at least two independent browser profiles and one mobile-size installed or installable PWA context.

Required scenarios:

1. **Fresh-device recovery:** Create data on A, bootstrap B, compare event counts, entities, projections, settings, and visible totals.
2. **Live propagation:** Log water on A and verify Water, Today, Coach context, and energy context update on B without reload.
3. **Edit propagation:** Edit a meal on B and verify A receives the delta once.
4. **Delete and undo:** Delete on A, verify tombstone on B, undo on B, and verify one restored record on A.
5. **Concurrent independent entries:** Log separate entries offline on A and B, reconnect, and retain both.
6. **Concurrent same-entity edit:** Edit the same task, transaction, or measurement on A and B and verify the domain conflict policy.
7. **Timezone boundary:** Use devices in different timezones and verify occurred time, local date, nutrition rollover, and Today placement.
8. **Photo and document:** Upload on A, verify metadata and preview on B, download the original, then delete and verify removal state on both.
9. **Settings propagation:** Change units or goals on A and verify account-wide recalculation on B without changing device-only preferences.
10. **Long offline interval:** Keep B offline beyond normal snapshot rotation, then resume and verify snapshot or cursor recovery.
11. **Expired session:** Revoke B and prove it cannot read, write, subscribe, or fetch files afterward.
12. **Wrong owner:** Prove another account cannot access any event, projection, object, or search result.
13. **Crash during apply:** Interrupt a remote batch and verify event application and cursor rollback atomically.
14. **Duplicate retry:** Retry accepted pushes and prove no duplicated meal, water, finance, task, or file records.
15. **Projection parity:** Compare calculation IDs, versions, inputs, and outputs across devices after convergence.

The `integration-completeness` gate must include this matrix. Cross-device status remains partial until every non-provider-dependent scenario passes and blocked platform checks are documented explicitly.
