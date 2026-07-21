# Phase D: Today and Food

## Status

Complete. Phase D establishes the final Today/Food visual standard and proves the canonical meal-to-projection flow.

## Delivered

### Canonical nutrition runtime

- Added a browser runtime over the canonical event repository and projection engine.
- Meal add, edit, duplicate, delete, restore, and nutrition-target changes now emit canonical events.
- Meal facts retain ingredients, portions, nutrients, source, confidence, provenance, date, and identity.
- Edits supersede the prior fact. Deletes tombstone the full supersession chain so old revisions cannot reappear.
- Every canonical write queues outbox work for the later cross-device sync phase.
- Existing `nt:*` data remains available through a compatibility projection without silently migrating or duplicating it.

### Food workspace

- Food totals, recent meals, timeline, templates, and daily summary consume the shared nutrition projection.
- Every meal surface uses one action set: Edit, Duplicate, Save as template, and Delete.
- Manual, photo, barcode, AI, multi-item, and target workflows preserve loading, success, error, and retry behavior.
- Delete is confirmation-gated and immediately undoable.
- Empty and unconfigured-target states do not invent progress or recommendations.

### Today command center

- The Nutrition card subscribes to the same `nutrition.daily` projection as Food.
- With configured targets it reports remaining calories and protein.
- Without targets it reports measured logged calories and protein instead of hiding known facts.
- Canonical changes update mounted pages without a reload.
- The error state retains local data and offers retry.

### Responsive UI

- Desktop Food uses the reference-aligned three-column, two-row operational grid.
- All six domain tabs remain visible: one row on desktop and a fixed three-by-two grid on tablet and phone.
- Phone quick-log actions use a compact two-column layout.
- Timeline controls no longer overflow their cards.
- Today reserves enough space for the fixed mobile navigation, including its final Attention card.

## Data Flow

`Food command -> canonical nutrition event -> event repository -> nutrition.daily projection -> Food + Today subscribers -> outbox`

Estimated water contained in food remains a separate projected field. It does not create or inflate an explicit hydration log.

## Verification

### Deterministic tests

- 33 suites passed.
- 761 checks passed.
- New canonical Food coverage includes append, source confidence, full nutrient payloads, superseding edits, full-chain tombstones, restore, targets, legacy compatibility, and outbox queuing.

### Browser QA

`tests/browser-phase-d-qa.mjs` passed 10 page/viewport combinations:

- 1440 x 900
- 1680 x 945
- 1792 x 1024
- 768 x 1024
- 390 x 844

For both Today and Food the runner found:

- no document-level horizontal overflow;
- no clipped controls or button labels;
- no card collisions;
- correct desktop/mobile navigation;
- no actionable console errors;
- no fixed-navigation overlap.

Food additionally passed six-tab visibility, expected tab-row count, and zero timeline overflow at every viewport.

### Acceptance workflow

A fresh browser profile appended a canonical meal with 321 kcal and 23 g protein. Food rendered the meal, Today rendered the same measured values, and canonical deletion returned the projection to zero. The same add, duplicate, action-menu, confirmation, delete, and live Today update flow was also exercised manually in the in-app browser.

Screenshots are stored in `docs/phase-d-screenshots/`.

## Phase Boundary

Phase D makes Food and Today canonical and sync-ready. Remote cross-device transport, authentication-backed ownership, conflict resolution, and replay validation remain Phase H work; no deployment or migration was performed here.
