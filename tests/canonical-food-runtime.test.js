const Runtime = require('../ui/canonical-runtime.js');
const Repositories = require('../event-repository.js');
const Events = require('../canonical-events.js');

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) { pass += 1; return; }
  fail += 1;
  console.error('FAIL: ' + message);
}

function storage(seed) {
  const values = Object.assign({}, seed);
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setItem(key, value) { values[key] = String(value); },
    removeItem(key) { delete values[key]; },
  };
}

(async function () {
  const date = Events.localDateFor(Date.now(), 'Europe/Amsterdam');
  const adapter = new Repositories.MemoryAdapter();
  const repository = Repositories.create({ adapter, userId: 'owner-food', deviceId: 'device-food', timezone: 'Europe/Amsterdam' });
  const local = storage({
    'nt:logs': JSON.stringify([{ id: 'legacy-breakfast', dateKey: date, name: 'Oats', calories: 410, protein: 24, carbs: 62, fat: 8, loggedAt: date + 'T06:30:00Z' }]),
    'nt:targets': JSON.stringify({ calories: 2400, protein: 180, carbs: 250, fat: 75, fiber: 30 }),
  });
  const runtime = Runtime.create({ storage: local, repository, userId: 'owner-food', deviceId: 'device-food', timezone: 'Europe/Amsterdam' });

  let daily = (await runtime.nutritionDaily(date)).value;
  ok(daily.entries === 1 && daily.calories === 410, 'legacy meals remain visible through compatibility projections');
  ok(daily.targets.configured && daily.targets.calories === 2400 && daily.targets.fiber_g === 30, 'legacy targets remain explicit and configured');

  const row = {
    id: 'meal-lunch', dateKey: date, loggedAt: date + 'T11:30:00Z', source: 'barcode',
    name: 'Chicken bowl', servingSize: 420, calories: 684, protein: 45, carbs: 66, fat: 18, fiber: 9,
    ingredients: ['chicken', 'rice', 'vegetables'], estimated_food_water_ml: 120,
  };
  const logged = await runtime.appendMeal(row);
  await runtime.projections.whenIdle();
  daily = (await runtime.nutritionDaily(date)).value;
  ok(daily.entries === 2 && daily.calories === 1094, 'canonical meal updates the shared daily projection');
  ok(daily.estimated_food_water_ml === 120, 'food water remains separately estimated');
  ok(daily.meals.some((meal) => meal.id === logged.canonical_event_id && meal.carbs_g === 66), 'projected rows retain full nutrients and canonical identity');

  const event = await repository.get(logged.canonical_event_id);
  ok(event.payload.ingredients.length === 3 && event.payload.portion.amount === 420, 'canonical meal retains ingredients and portion');
  ok(event.source === 'barcode' && event.confidence === 0.98, 'capture source and confidence are retained');

  const edited = await runtime.editMeal(Object.assign({}, row, { canonical_event_id: logged.canonical_event_id, calories: 700, protein: 48 }));
  await runtime.projections.whenIdle();
  daily = (await runtime.nutritionDaily(date)).value;
  ok(daily.calories === 1110 && daily.protein_g === 72, 'editing supersedes the original meal in every total');

  const removed = await runtime.deleteMeal({ id: row.id, canonical_event_id: edited.canonical_event_id });
  await runtime.projections.whenIdle();
  daily = (await runtime.nutritionDaily(date)).value;
  ok(removed.events.length === 2, 'deleting an edited meal tombstones its complete revision chain');
  ok(daily.entries === 1 && daily.calories === 410, 'deleted meal does not expose an older revision');

  const restored = await runtime.restoreMeal(row);
  await runtime.projections.whenIdle();
  daily = (await runtime.nutritionDaily(date)).value;
  ok(daily.entries === 2 && daily.meals.some((meal) => meal.id === restored.canonical_event_id), 'undo restore appends a new effective meal fact');

  await runtime.setNutritionTargets({ calories: 2600, protein: 200, carbs: 280, fat: 80, fiber: 35, sugar: 70 });
  await runtime.projections.whenIdle();
  daily = (await runtime.nutritionDaily(date)).value;
  ok(daily.targets.calories === 2600 && daily.targets.protein_g === 200 && daily.targets.configured, 'canonical targets update Food and Today projections');
  ok((await repository.pendingOutbox()).length === 6, 'every canonical mutation is queued for cross-device synchronization');

  console.log('canonical-food-runtime.test.js: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
