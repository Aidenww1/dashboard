/* ============================================================
   Bloodwork outlook model registry and release gates.

   A model can only enable numeric outputs when every medical-model gate is
   explicitly satisfied. The shipped model is deliberately directional and
   keeps numeric predictions locked.
   ============================================================ */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LifeOSBloodworkModels = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var REQUIRED_NUMERIC_GATES = [
    'purpose_and_population', 'input_and_outcome_definitions',
    'train_evaluation_separation', 'discrimination', 'calibration',
    'subgroup_fairness', 'missingness_and_drift', 'audit_trail',
    'patient_language', 'independent_safety_review',
  ];

  var MODELS = [{
    id: 'lifeos-labs-directional-context',
    version: '1.0.0',
    status: 'directional-only',
    purpose: 'Summarize measured marker direction and data readiness before a repeat panel.',
    intended_population: 'The authenticated owner using their own longitudinal records for self-monitoring context.',
    supported_outputs: ['measured-direction', 'retest-context', 'data-readiness'],
    prohibited_outputs: ['numeric-marker-forecast', 'diagnosis', 'causal-effect', 'treatment-or-dose-change'],
    training_data: 'No trained predictive model is used. Rules operate only on the owner\'s recorded panels.',
    evaluation: {
      design: 'Retrospective directional agreement against the next recorded panel.',
      minimum_evaluated_snapshots: 3,
      discrimination: null,
      calibration: null,
      subgroup_results: null,
    },
    gates: {
      purpose_and_population: true,
      input_and_outcome_definitions: true,
      train_evaluation_separation: false,
      discrimination: false,
      calibration: false,
      subgroup_fairness: false,
      missingness_and_drift: true,
      audit_trail: true,
      patient_language: true,
      independent_safety_review: false,
    },
    limitations: [
      'This is not a clinical prediction model and has no population-level training data.',
      'Changes between panels may reflect collection conditions, illness, medication, supplements, laboratory variation, or other unrecorded factors.',
      'Measured out-of-range results require appropriate clinical review; this model never recommends treatment changes.',
    ],
  }];

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function get(id, version) {
    var model = MODELS.filter(function (item) {
      return item.id === id && (!version || item.version === version);
    })[0];
    return model ? clone(model) : null;
  }
  function list() { return clone(MODELS); }
  function evaluateGates(model) {
    model = model || {};
    var gates = model.gates || {};
    var failed = REQUIRED_NUMERIC_GATES.filter(function (key) { return gates[key] !== true; });
    return {
      numeric_predictions_enabled: failed.length === 0 && (model.supported_outputs || []).indexOf('numeric-marker-forecast') >= 0,
      directional_outputs_enabled: (model.supported_outputs || []).indexOf('measured-direction') >= 0,
      required_gates: REQUIRED_NUMERIC_GATES.slice(),
      passed_gates: REQUIRED_NUMERIC_GATES.filter(function (key) { return gates[key] === true; }),
      failed_gates: failed,
      release_state: failed.length ? 'numeric-locked' : 'eligible-for-numeric-safety-review',
    };
  }
  function active() { return get(MODELS[0].id, MODELS[0].version); }

  return Object.freeze({ requiredNumericGates: REQUIRED_NUMERIC_GATES.slice(), list: list, get: get, active: active, evaluateGates: evaluateGates });
});
