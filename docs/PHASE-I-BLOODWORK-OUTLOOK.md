# Phase I: Bloodwork Outlook

Status: implementation complete; numeric prediction remains intentionally locked.

## 1. Objective completed

Life OS now produces a directional, provenance-rich bloodwork outlook from measured panels and registered rolling context. It does not invent future lab values, diagnose conditions, or recommend treatment changes.

## 2. User-visible improvements

- Body > Labs includes Bloodwork Outlook and Model Safety & Provenance panels.
- A single panel is labelled as a baseline, not a trend.
- Comparable repeat panels can produce directional labels with explicit input coverage, missing context, collection comparability, and limitations.
- The UI shows model id/version, safety-gate count, evaluation count, and the numeric-prediction lock.
- Outlook snapshots can be recorded for later retrospective evaluation.

## 3. Architecture changes

- `bloodwork-model-registry.js` is the single model registry and unlock gate.
- `bloodwork-outlook.js` is a pure directional outlook and retrospective evaluation engine.
- `projection-definitions.js` publishes `labs.model_status`, `labs.outlook`, and `labs.outlook_evaluation`.
- `canonical-events.js` validates recorded outlook events.
- `ui/canonical-runtime.js` records outlook snapshots through the canonical repository.

The numeric gate requires separated training/evaluation data, discrimination, calibration, subgroup/fairness review, drift handling, and independent safety review. Five of ten required gates are currently satisfied, so numeric output is locked.

## 4. Data migrations and rollback plan

No destructive migration is required. The new event is additive. Rollback consists of removing the three projections and hiding the two Labs panels; existing lab panels remain unchanged.

## 5. Changed files

- `bloodwork-model-registry.js`
- `bloodwork-outlook.js`
- `canonical-events.js`
- `data-commands.js`
- `data-registry.js`
- `projection-definitions.js`
- `ui/canonical-runtime.js`
- `ui/log.html`
- `sw.js`
- `tests/bloodwork-outlook.test.js`
- `tests/bloodwork-ui-contract.test.js`

## 6. Tests run with exact results

- Bloodwork engine: 6 passed.
- Bloodwork UI contract: 9 passed.
- Full repository suite after Phase J integration: 41 suites, 947 assertions/tests passed, 0 failed.

Command:

```powershell
& 'C:\Users\maila\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests\run.js
```

## 7. Screenshots and viewport sizes

- `docs/phase-i-screenshots/labs-desktop-1440x900.png`
- `docs/phase-i-screenshots/labs-mobile-390x844.png`

Browser measurements also passed at 1680x945, 1792x1024, and 768x1024. At every target size, document scroll width equalled client width and no visible interactive control was clipped.

## 8. Cross-domain propagation demonstrated

Lab outlook inputs are selected from canonical measured panels plus registered 30/90-day nutrition and hydration projections. Missing inputs reduce coverage and are disclosed; they are not replaced by assumptions. New meal and water events invalidate dependent projections through the projection registry.

## 9. Known limitations and blocked external checks

- Only one comparable panel currently exists in the local QA dataset, so the live page correctly shows `Baseline only`.
- Clinical validation, independent safety review, subgroup analysis, and numeric calibration are not complete.
- Numeric marker values therefore remain locked.

## 10. Security and privacy impact

Outlooks remain owner-scoped canonical records. The export path excludes authentication secrets. The engine prohibits diagnosis, causal claims, treatment advice, and dose-change advice.

## 11. Recommended next phase

Proceed to reliability and authenticated cross-device cutover while keeping numeric prediction locked.

## 12. Owner approval

Implementation is ready for owner review. This report does not request or imply clinical approval.
