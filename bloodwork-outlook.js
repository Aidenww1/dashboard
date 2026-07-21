/* ============================================================
   Pure, directional bloodwork outlook and retrospective evaluator.

   This module never produces a future marker value. It describes recorded
   trajectory, data freshness, comparability, and what is worth retesting.
   ============================================================ */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LifeOSBloodworkOutlook = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function round(value, places) {
    if (value == null || !isFinite(value)) return null;
    var power = Math.pow(10, places || 0);
    return Math.round(value * power) / power;
  }
  function daysBetween(a, b) { return Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000); }
  function markerRows(markers) {
    if (Array.isArray(markers)) return markers;
    return Object.keys(markers || {}).map(function (key) {
      var item = markers[key];
      return Object.assign({ key: key }, item && typeof item === 'object' ? item : { value: item });
    });
  }
  function normalizePanel(panel) {
    var payload = panel && panel.payload || panel || {};
    return {
      id: panel && panel.id || payload.id || null,
      date: panel && (panel.local_date || panel.date) || payload.date || null,
      markers: markerRows(payload.markers),
      conditions: payload.collection_conditions || payload.conditions || {},
      provider: payload.provider || null,
    };
  }
  function markerMap(panel) {
    var map = {};
    (panel.markers || []).forEach(function (marker) {
      var key = marker.key || marker.name || marker.marker;
      var value = Number(marker.value);
      if (key && isFinite(value)) map[key] = Object.assign({}, marker, { key: key, value: value });
    });
    return map;
  }
  function measuredDirection(previous, current) {
    if (!isFinite(previous) || !isFinite(current)) return 'unknown';
    var threshold = Math.max(Math.abs(previous) * 0.05, 0.01);
    if (current > previous + threshold) return 'upward';
    if (current < previous - threshold) return 'downward';
    return 'stable';
  }
  function contextFeature(label, logged, required) {
    var coverage = required ? Math.min(1, Number(logged || 0) / required) : 0;
    return { label: label, logged_days: Number(logged || 0), required_days: required, coverage: round(coverage, 2), state: coverage >= 0.7 ? 'usable-context' : coverage > 0 ? 'partial-context' : 'missing' };
  }
  function build(options) {
    options = options || {};
    var panels = (options.panels || []).map(normalizePanel).filter(function (panel) { return panel.date; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var latest = panels[panels.length - 1] || null;
    var previous = panels[panels.length - 2] || null;
    var model = options.model || {};
    var gate = options.gate || { numeric_predictions_enabled: false, failed_gates: ['model-registry-unavailable'], release_state: 'numeric-locked' };
    var asOf = options.asOf || new Date().toISOString().slice(0, 10);
    var features = [
      contextFeature('Nutrition, 30 days', options.nutrition30 && options.nutrition30.logged_days, 30),
      contextFeature('Nutrition, 90 days', options.nutrition90 && options.nutrition90.logged_days, 90),
      contextFeature('Hydration, 30 days', options.hydration30 && options.hydration30.logged_days, 30),
    ];
    if (!latest) return {
      status: 'needs-baseline-panel', horizon: { min_days: 30, max_days: 90 }, model: model,
      numeric_predictions_enabled: false, directions: [], features: features,
      missing_inputs: ['baseline bloodwork panel'], stale_inputs: [], comparability: { state: 'unknown', missing_conditions: ['fasting status', 'collection time', 'recent intense training', 'acute illness'] },
      confidence: { level: 'unavailable', score: 0, sample_size: 0, calibration_state: 'not-evaluable' }, gate: gate,
      patient_language: 'Add a measured panel before Life OS can summarize marker direction.',
    };
    var latestMap = markerMap(latest), previousMap = previous ? markerMap(previous) : {};
    var directions = Object.keys(latestMap).filter(function (key) { return previousMap[key]; }).map(function (key) {
      var direction = measuredDirection(previousMap[key].value, latestMap[key].value);
      var label = latestMap[key].name || key;
      return {
        key: key, label: label, unit: latestMap[key].unit || previousMap[key].unit || null,
        direction: direction, baseline_date: latest.date, comparison_date: previous.date,
        current_value: latestMap[key].value, previous_value: previousMap[key].value,
        statement: direction === 'stable' ? label + ' has been broadly stable between the two latest measured panels.' : 'The latest measured ' + label + ' is ' + direction + ' versus the prior panel; it is worth retesting under comparable conditions.',
        truth_class: 'measured-direction',
      };
    });
    var ageDays = Math.max(0, daysBetween(latest.date, asOf));
    var stale = ageDays > 180 ? ['latest panel is more than 180 days old'] : [];
    var conditions = latest.conditions || {};
    var requiredConditions = [['fasted', 'fasting status'], ['time_of_day', 'collection time'], ['intense_training_24h', 'recent intense training'], ['acute_illness', 'acute illness']];
    var missingConditions = requiredConditions.filter(function (item) { return conditions[item[0]] == null; }).map(function (item) { return item[1]; });
    var missingInputs = [];
    if (!previous) missingInputs.push('a second comparable panel');
    features.forEach(function (feature) { if (feature.state === 'missing') missingInputs.push(feature.label.toLowerCase()); });
    var usable = features.filter(function (feature) { return feature.state === 'usable-context'; }).length;
    var status = stale.length ? 'stale-baseline' : previous ? 'directional-context-only' : 'baseline-only';
    var level = stale.length || !previous ? 'low' : missingConditions.length > 1 || usable < 2 ? 'guarded' : 'moderate';
    var score = level === 'moderate' ? 0.62 : level === 'guarded' ? 0.38 : 0.2;
    return {
      status: status,
      horizon: { min_days: 30, max_days: 90, label: 'Next comparable panel, usually 30-90 days' },
      model: model,
      numeric_predictions_enabled: gate.numeric_predictions_enabled === true,
      directions: stale.length ? [] : directions,
      features: features,
      baseline: { panel_id: latest.id, date: latest.date, age_days: ageDays, provider: latest.provider, marker_count: Object.keys(latestMap).length },
      missing_inputs: missingInputs,
      stale_inputs: stale,
      comparability: { state: missingConditions.length ? 'partially-documented' : 'documented', missing_conditions: missingConditions, recorded_conditions: conditions },
      confidence: { level: level, score: score, sample_size: panels.length, calibration_state: 'directional-retrospective-only' },
      gate: gate,
      patient_language: stale.length ? 'The latest panel is too old for a current direction. A repeat panel would be more useful.' : previous ? 'This view summarizes measured direction and what is worth retesting. It does not predict a future number.' : 'One panel is a baseline, not a trend. Add a comparable repeat panel to see direction.',
      limitations: (model.limitations || []).concat(['Nutrition and hydration coverage are context only; they are not treated as causes of marker change.']),
    };
  }

  function evaluate(options) {
    options = options || {};
    var panels = (options.panels || []).map(normalizePanel).filter(function (panel) { return panel.date; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var snapshots = (options.snapshots || []).slice().sort(function (a, b) { return String(a.local_date || a.date).localeCompare(String(b.local_date || b.date)); });
    var evaluations = [];
    snapshots.forEach(function (event) {
      var payload = event.payload || event;
      var baselineDate = payload.baseline_date || event.local_date || event.date;
      var next = panels.filter(function (panel) { return panel.date > baselineDate; })[0];
      var baseline = panels.filter(function (panel) { return panel.date === baselineDate || panel.id === payload.baseline_panel_id; }).slice(-1)[0];
      if (!next || !baseline) { evaluations.push({ snapshot_id: event.id || payload.snapshot_id, status: 'awaiting-next-panel', baseline_date: baselineDate, next_panel_date: null, assessed: 0, matched: 0 }); return; }
      var baseMap = markerMap(baseline), nextMap = markerMap(next), assessed = 0, matched = 0;
      (payload.directions || []).forEach(function (forecast) {
        if (!baseMap[forecast.key] || !nextMap[forecast.key]) return;
        var actual = measuredDirection(baseMap[forecast.key].value, nextMap[forecast.key].value);
        assessed += 1;
        if (actual === forecast.direction) matched += 1;
      });
      evaluations.push({ snapshot_id: event.id || payload.snapshot_id, status: assessed ? 'evaluated' : 'insufficient-overlap', baseline_date: baselineDate, next_panel_date: next.date, assessed: assessed, matched: matched, directional_agreement: assessed ? round(matched / assessed, 2) : null });
    });
    var completed = evaluations.filter(function (item) { return item.status === 'evaluated'; });
    var totalAssessed = completed.reduce(function (total, item) { return total + item.assessed; }, 0);
    var totalMatched = completed.reduce(function (total, item) { return total + item.matched; }, 0);
    return {
      evaluations: evaluations,
      evaluated_snapshots: completed.length,
      pending_snapshots: evaluations.filter(function (item) { return item.status === 'awaiting-next-panel'; }).length,
      directional_agreement: totalAssessed ? round(totalMatched / totalAssessed, 2) : null,
      calibration_state: completed.length >= 3 ? 'directional-monitoring-active' : 'insufficient-evaluated-snapshots',
      numeric_error_metrics: null,
      limitations: ['Directional agreement is not numeric calibration and does not validate a clinical prediction model.'],
    };
  }

  return Object.freeze({ build: build, evaluate: evaluate, measuredDirection: measuredDirection });
});
