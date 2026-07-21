const Engine = require('../projection-engine.js');
const Definitions = require('../projection-definitions.js');
const Repositories = require('../event-repository.js');

let pass = 0;
let fail = 0;
function ok(condition, message) { if (condition) { pass += 1; return; } fail += 1; console.error('FAIL: ' + message); }

(async function () {
  const repository = Repositories.create({ adapter: new Repositories.MemoryAdapter(), userId: 'owner-1', deviceId: 'device-a', timezone: 'Europe/Amsterdam' });
  const engine = Engine.create({ repository, definitions: Definitions.definitions, clock: () => new Date('2026-06-19T12:00:00Z') });

  const emptyScore = await engine.get('life_score.daily');
  const emptyReadiness = await engine.get('readiness.daily');
  ok(emptyScore.value.total === 47, 'empty Life Score preserves the current 47-point baseline');
  ok(emptyReadiness.value.score === 53, 'empty readiness preserves the current 53-point baseline');

  for (const item of engine.registry.list()) await engine.get(item.id);
  ok(true, 'all registered projections compute safely with explicit missing data');

  const meal = await repository.append({
    type: 'nutrition.meal.logged', occurred_at: '2026-06-19T11:30:00Z', source_ref: 'meal-1',
    payload: { name: 'Chicken bowl', calories: 684, protein_g: 45, carbs_g: 66, fat_g: 18, estimated_food_water_ml: 120 },
    units: { calories: 'kcal', protein_g: 'g', estimated_food_water_ml: 'ml' },
  });
  await engine.whenIdle();
  const nutrition = await engine.get('nutrition.daily');
  const hydrationAfterMeal = await engine.get('hydration.daily');
  const todayAfterMeal = await engine.get('today.summary');
  const outlookAfterMeal = await engine.get('labs.outlook');
  ok(nutrition.value.entries === 1 && nutrition.value.calories === 684, 'meal updates daily nutrition');
  ok((await engine.get('nutrition.rolling_30d')).value.logged_days === 1, 'meal updates rolling nutrition windows');
  ok(hydrationAfterMeal.value.explicit_beverage_ml === 0 && hydrationAfterMeal.value.estimated_food_water_ml === 120, 'meal water remains estimated and never creates explicit intake');
  ok(todayAfterMeal.value.nutrition.calories === 684, 'meal propagates into Today summary');
  ok(todayAfterMeal.value.energy.contributors.some((item) => item.key === 'nutrition'), 'meal propagates into the energy outlook');
  ok(outlookAfterMeal.provenance.source_event_ids.includes(meal.id), 'meal propagates into bloodwork outlook provenance without numeric prediction');
  ok(outlookAfterMeal.value.numeric_predictions_enabled === false, 'bloodwork numeric prediction remains safety-gated');

  const water = await repository.append({
    type: 'hydration.intake.logged', occurred_at: '2026-06-19T04:30:00Z', timezone: 'Europe/Amsterdam', source_ref: 'water-1',
    payload: { amount_ml: 500 }, units: { amount_ml: 'ml' },
  });
  await engine.whenIdle();
  const hydration = await engine.get('hydration.daily');
  const timing = await engine.get('hydration.timing');
  ok(hydration.value.explicit_beverage_ml === 500 && hydration.value.total_water_ml === 620, 'water updates explicit and combined hydration totals');
  ok(timing.value.buckets.overnight_ml === 0 && timing.value.buckets.morning_ml === 500, 'hydration timing uses the event local timezone');
  ok((await engine.get('coach.briefing')).provenance.source_event_ids.includes(water.id), 'water propagates to Coach briefing provenance');

  await repository.appendBatch([
    { type: 'sleep.night.logged', occurred_at: '2026-06-19T06:00:00Z', source_ref: 'sleep-1', payload: { duration_minutes: 450, score: 80 }, units: { duration_minutes: 'min' } },
    { type: 'training.session.completed', occurred_at: '2026-06-19T09:00:00Z', source_ref: 'training-1', payload: { session_id: 'session-1', duration_seconds: 3600 }, units: { duration_seconds: 's' } },
    { type: 'training.set.logged', occurred_at: '2026-06-19T09:10:00Z', source_ref: 'set-1', payload: { session_id: 'session-1', exercise: 'Bench Press', load_kg: 100, reps: 6, rpe: 8 }, units: { load_kg: 'kg' } },
    { type: 'body.weight.logged', occurred_at: '2026-06-19T07:00:00Z', source_ref: 'weight-1', payload: { weight_kg: 82.4 }, units: { weight_kg: 'kg' } },
    { type: 'body.composition.logged', occurred_at: '2026-06-19T07:02:00Z', source_ref: 'body-1', payload: { body_fat_pct: 19.2 }, units: { body_fat_pct: '%' } },
    { type: 'finance.transaction.logged', occurred_at: '2026-06-19T08:00:00Z', source_ref: 'income-1', payload: { amount_minor: 200000, currency: 'EUR', direction: 'income', business: true } },
    { type: 'finance.transaction.logged', occurred_at: '2026-06-19T08:10:00Z', source_ref: 'expense-1', payload: { amount_minor: 50000, currency: 'EUR', direction: 'expense', category: 'Software', business: true } },
  ]);
  await engine.whenIdle();
  ok((await engine.get('training.load')).value.volume_kg_7d === 600, 'training set updates training load');
  ok((await engine.get('training.progress')).value.personal_records[0].estimated_1rm_kg === 120, 'training set updates exercise progress');
  ok((await engine.get('body.current')).value.lean_mass_kg === 66.58, 'body composition derives lean mass from canonical facts');
  ok((await engine.get('finance.cashflow')).value.net_minor === 150000, 'finance transactions update monthly cash flow');
  ok((await engine.get('finance.business')).value.profit_minor === 150000, 'business transactions update business profitability');
  ok((await engine.get('life_score.daily')).value.total > 47, 'cross-domain facts update the shared Life Score');

  const explanation = await engine.explain('today.summary');
  ok(explanation.source_event_ids.includes(meal.id) && explanation.source_event_ids.includes(water.id), 'Today explanation traces back to food and water source facts');

  const mixedRepository = Repositories.create({ adapter: new Repositories.MemoryAdapter(), userId: 'owner-1', deviceId: 'device-b', timezone: 'Europe/Amsterdam' });
  const mixedEngine = Engine.create({ repository: mixedRepository, definitions: Definitions.definitions, clock: () => new Date('2026-06-19T12:00:00Z') });
  await mixedRepository.appendBatch([
    { type: 'nutrition.legacy.imported', occurred_at: '2026-06-19T10:00:00Z', source_ref: 'legacy:nt:logs', payload: { legacy_key: 'nt:logs', raw_value: 'legacy nutrition', checksum: 'n1', parsed_value: [{ dateKey: '2026-06-18', name: 'Legacy breakfast', calories: 400, protein: 25 }] } },
    { type: 'hydration.legacy.imported', occurred_at: '2026-06-19T10:00:00Z', source_ref: 'legacy:po_water_v1', payload: { legacy_key: 'po_water_v1', raw_value: 'legacy water', checksum: 'w1', parsed_value: { bottleMl: 500, logs: { '2026-06-19': 1 } } } },
    { type: 'supplements.legacy.imported', occurred_at: '2026-06-19T10:00:00Z', source_ref: 'legacy:stack:items', payload: { legacy_key: 'stack:items', raw_value: 'legacy stack', checksum: 's1', parsed_value: [{ id: 'creatine', name: 'Creatine' }] } },
    { type: 'supplements.legacy.imported', occurred_at: '2026-06-19T10:01:00Z', source_ref: 'legacy:stack:taken:2026-06-19', payload: { legacy_key: 'stack:taken:2026-06-19', raw_value: 'legacy taken', checksum: 's2', parsed_value: { creatine: true } } },
    { type: 'nutrition.meal.logged', occurred_at: '2026-06-19T11:30:00Z', source_ref: 'canonical-meal', payload: { name: 'Canonical lunch', calories: 600, protein_g: 40 } },
    { type: 'hydration.intake.logged', occurred_at: '2026-06-19T12:00:00Z', source_ref: 'canonical-water', payload: { amount_ml: 500 }, units: { amount_ml: 'ml' } },
  ]);
  await mixedEngine.whenIdle();
  ok((await mixedEngine.get('nutrition.rolling_7d')).value.logged_days === 2, 'legacy and canonical nutrition history coexist during migration');
  ok((await mixedEngine.get('hydration.daily')).value.explicit_beverage_ml === 1000, 'legacy and canonical water totals coexist during migration');
  ok((await mixedEngine.get('supplements.adherence')).value.taken === 1, 'legacy supplement adherence remains available during migration');

  console.log('projection-fixtures.test.js: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
