const Events = require('../canonical-events.js');

let pass = 0;
let fail = 0;
function ok(condition, message) { if (condition) { pass += 1; return; } fail += 1; console.error('FAIL: ' + message); }
function throws(fn, code, message) {
  try { fn(); fail += 1; console.error('FAIL: ' + message + ' (did not throw)'); }
  catch (error) { ok(!code || error.code === code, message + ' (got ' + error.code + ')'); }
}

const context = { userId: 'owner-1', deviceId: 'device-a', timezone: 'Europe/Amsterdam' };
const meal = Events.create({
  type: 'nutrition.meal.logged',
  occurred_at: '2026-06-19T22:30:00.000Z',
  source_ref: 'manual-meal-1',
  payload: { name: 'Oats', calories: 450, protein_g: 30 },
  units: { calories: 'kcal', protein_g: 'g' },
  provenance: { input: 'manual' },
}, context);

ok(meal.domain === 'nutrition', 'event domain is derived from registry ownership');
ok(meal.local_date === '2026-06-20', 'local date retains the event timezone rather than UTC date');
ok(meal.schema_version === 1, 'event schema is versioned');
ok(meal.sync_state === 'pending', 'new event enters pending sync state');
ok(meal.id === Events.stableId('manual-meal-1', 'owner-1', 'nutrition.meal.logged'), 'source_ref produces a stable offline ID');

const duplicate = Events.create({
  type: 'nutrition.meal.logged', occurred_at: meal.occurred_at, source_ref: 'manual-meal-1',
  payload: { name: 'Oats', calories: 450, protein_g: 30 }, units: meal.units,
}, context);
ok(duplicate.id === meal.id, 'same owner, type, and source_ref reproduce the same ID');

throws(() => Events.create({ type: 'unknown.event', payload: {} }, context), 'EVENT_VALIDATION_FAILED', 'unregistered event is rejected');
throws(() => Events.create({ type: 'body.weight.logged', payload: { weight_kg: 0 } }, context), 'EVENT_VALIDATION_FAILED', 'invalid domain payload is rejected');
throws(() => Events.create({ type: 'body.weight.logged', payload: { weight_kg: 82 } }, { deviceId: 'd' }), 'EVENT_VALIDATION_FAILED', 'ownerless event is rejected');
throws(() => Events.create({ type: 'body.weight.logged', domain: 'nutrition', payload: { weight_kg: 82 } }, context), 'EVENT_VALIDATION_FAILED', 'domain ownership mismatch is rejected');

const deleted = Events.tombstone(meal, 'test delete', context);
ok(deleted.deleted_at != null, 'delete creates a tombstone timestamp');
ok(deleted.supersedes_id === meal.id, 'tombstone points to the deleted event');
ok(deleted.payload.target_event_id === meal.id, 'tombstone payload preserves target identity');
ok(deleted.sync_state === 'tombstone', 'tombstone has an explicit sync state');

console.log('canonical-events.test.js: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
