const assert = require('assert');
const Models = require('../bloodwork-model-registry.js');
const Outlook = require('../bloodwork-outlook.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; }
  catch (error) { console.error('FAIL: ' + name); throw error; }
}

const model = Models.active();
const gate = Models.evaluateGates(model);

test('numeric predictions stay locked while medical gates are incomplete', () => {
  assert.strictEqual(gate.numeric_predictions_enabled, false);
  assert.ok(gate.failed_gates.includes('calibration'));
  assert.ok(gate.failed_gates.includes('independent_safety_review'));
});

test('no baseline panel produces explicit missing data', () => {
  const value = Outlook.build({ panels: [], model, gate, asOf: '2026-07-22' });
  assert.strictEqual(value.status, 'needs-baseline-panel');
  assert.strictEqual(value.numeric_predictions_enabled, false);
  assert.deepStrictEqual(value.directions, []);
});

test('one panel is a baseline and never a trend', () => {
  const value = Outlook.build({ panels: [{ id: 'a', date: '2026-07-01', markers: { ldl: 120 } }], model, gate, asOf: '2026-07-22' });
  assert.strictEqual(value.status, 'baseline-only');
  assert.deepStrictEqual(value.directions, []);
  assert.ok(value.missing_inputs.includes('a second comparable panel'));
});

test('two panels produce measured directions without future numbers', () => {
  const value = Outlook.build({
    panels: [
      { id: 'a', date: '2026-04-01', markers: { ldl: { name: 'LDL', value: 100, unit: 'mg/dL' }, hdl: { name: 'HDL', value: 50, unit: 'mg/dL' } } },
      { id: 'b', date: '2026-07-01', markers: { ldl: { name: 'LDL', value: 112, unit: 'mg/dL' }, hdl: { name: 'HDL', value: 51, unit: 'mg/dL' } }, conditions: { fasted: true, time_of_day: 'morning', intense_training_24h: false, acute_illness: false } },
    ],
    nutrition30: { logged_days: 24 }, nutrition90: { logged_days: 70 }, hydration30: { logged_days: 25 }, model, gate, asOf: '2026-07-22',
  });
  assert.strictEqual(value.status, 'directional-context-only');
  assert.strictEqual(value.numeric_predictions_enabled, false);
  assert.strictEqual(value.directions.find(item => item.key === 'ldl').direction, 'upward');
  assert.strictEqual(value.directions.find(item => item.key === 'hdl').direction, 'stable');
  assert.ok(!JSON.stringify(value).includes('predicted_value'));
});

test('stale panels suppress directional output', () => {
  const value = Outlook.build({ panels: [{ id: 'a', date: '2025-01-01', markers: { ldl: 100 } }, { id: 'b', date: '2025-04-01', markers: { ldl: 120 } }], model, gate, asOf: '2026-07-22' });
  assert.strictEqual(value.status, 'stale-baseline');
  assert.deepStrictEqual(value.directions, []);
});

test('recorded snapshots are evaluated against the next measured panel', () => {
  const value = Outlook.evaluate({
    panels: [
      { id: 'a', date: '2026-01-01', markers: { ldl: 100 } },
      { id: 'b', date: '2026-04-01', markers: { ldl: 110 } },
      { id: 'c', date: '2026-07-01', markers: { ldl: 120 } },
    ],
    snapshots: [{ id: 's1', date: '2026-04-01', baseline_date: '2026-04-01', baseline_panel_id: 'b', directions: [{ key: 'ldl', direction: 'upward' }] }],
  });
  assert.strictEqual(value.evaluated_snapshots, 1);
  assert.strictEqual(value.directional_agreement, 1);
  assert.strictEqual(value.numeric_error_metrics, null);
});

console.log('bloodwork-outlook.test.js: ' + passed + ' passed');
