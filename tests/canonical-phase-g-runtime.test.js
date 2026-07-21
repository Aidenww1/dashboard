const Runtime = require('../ui/canonical-runtime.js');
const Repositories = require('../event-repository.js');

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
  const date = '2026-07-21';
  const adapter = new Repositories.MemoryAdapter();
  const repository = Repositories.create({ adapter, userId: 'owner-phase-g', deviceId: 'device-phase-g', timezone: 'Europe/Amsterdam' });
  const local = storage({
    'stack:items': JSON.stringify([
      { id: 'creatine', name: 'Creatine', dose: '5 g', window: 'morning', time: '07:30', category: 'Supplement', route: 'Oral', stock: 6, stockUnit: 'servings', reorderAt: 10 },
      { id: 'test-cyp', name: 'Test Cypionate', dose: '100 mg', window: 'morning', category: 'Compound', route: 'Injection' },
    ]),
    'stack:low': JSON.stringify(['creatine']),
    ['stack:taken:' + date]: JSON.stringify({ creatine: true }),
    'supps:notes:v1': JSON.stringify([{ id: 1, date, text: 'Recovery stable', tag: 'Recovery' }]),
    'skin:logs': JSON.stringify([{ id: 'skin-1', date, rating: 4, concerns: ['redness'], water: 2.4, sleep: 7.5, notes: 'Baseline' }]),
    'skin:products': JSON.stringify([{ id: 'spf', name: 'Daily SPF', brand: 'Test', type: 'spf', time: 'am', freq: 'daily' }]),
    'skin:routine:v1': JSON.stringify({ [date]: ['spf'] }),
    'skin:breakouts': JSON.stringify([]),
    'skin:device_sessions': JSON.stringify([{ id: 'led-1', date, type: 'led', notes: '10 minutes' }]),
    'skin:ingredients': JSON.stringify(['Fragrance']),
    'skin:goals': JSON.stringify([{ text: 'Reduce redness', done: false }]),
    'blood:logs': JSON.stringify([{ date, markers: { vitaminD: 24, ldl: 120 } }]),
  });
  const runtime = Runtime.create({ storage: local, repository, userId: 'owner-phase-g', deviceId: 'device-phase-g', timezone: 'Europe/Amsterdam' });

  let phase = await runtime.phaseG(date);
  ok(phase['supplements.schedule'].value.total === 2, 'legacy compounds bridge into one canonical schedule');
  ok(phase['supplements.adherence'].value.taken === 1 && phase['supplements.adherence'].value.taken_compound_ids[0] === 'creatine', 'legacy dose completion bridges with compound identity');
  ok(phase['supplements.inventory'].value.low_stock.length === 1, 'legacy inventory and low-stock provenance bridge together');
  ok(phase['supplements.notes'].value.total === 1, 'legacy supplement notes bridge into the canonical feed');
  ok(phase['skin.current'].value.checkin.rating === 4, 'legacy Skin check-in becomes the current canonical fact');
  ok(phase['skin.products'].value.total === 1 && phase['skin.products'].value.items[0].id === 'spf', 'legacy Skin products bridge with stable identity');
  ok(phase['skin.routine'].value.today_product_ids.includes('spf'), 'legacy routine completion bridges into the shared routine projection');
  ok(phase['skin.support'].value.treatments.length === 1 && phase['skin.support'].value.ingredients.length === 1 && phase['skin.support'].value.goals.length === 1, 'legacy Skin support records bridge once without semantic duplicates');
  ok(phase['skin.progress'].value.checkins.length === 1, 'Skin progress exposes bridged dated check-ins once');
  ok(phase['skin.correlations'].value.status === 'insufficient-sample' && phase['skin.correlations'].value.associations.length === 0, 'Skin correlations refuse to invent patterns from one check-in');
  ok(phase['supplements.monitoring'].value.status === 'review' && phase['supplements.monitoring'].value.numeric_predictions_enabled === false, 'shared lab monitoring stays contextual and non-predictive');
  ok((await runtime.bridgeSupplementsLegacy(date)).length === 0 && (await runtime.bridgeSkinLegacy()).length === 0, 'Phase G legacy bridges are idempotent');

  const creatine = phase['supplements.schedule'].value.items.find((item) => item.id === 'creatine');
  await runtime.saveSupplementCompound(Object.assign({}, creatine, { dose: '6 g', canonical_event_id: creatine.canonical_event_id }));
  await runtime.saveSupplementInventory({ id: 'creatine', remaining: 20, unit: 'servings', reorder_at: 10, low_stock: false });
  await runtime.setSupplementDose({ id: 'test-cyp', name: 'Test Cypionate', dose: '100 mg', date, taken: true });
  await runtime.projections.whenIdle();
  phase = await runtime.phaseG(date);
  ok(phase['supplements.schedule'].value.items.find((item) => item.id === 'creatine').dose === '6 g', 'compound edits replace the effective canonical revision');
  ok(phase['supplements.inventory'].value.low_stock.length === 0, 'inventory edits recalculate low stock from canonical values');
  ok(phase['supplements.adherence'].value.taken === 2 && phase['supplements.adherence'].value.due === 0, 'dose logging updates shared adherence');

  await runtime.setSupplementDose({ id: 'test-cyp', date, taken: false });
  const note = await runtime.saveSupplementNote({ id: 'note-2', date, text: 'Monitor sleep quality', tag: 'Recovery' });
  await runtime.deleteCanonical(note.canonical_event_id, 'user-deleted-note');
  await runtime.projections.whenIdle();
  phase = await runtime.phaseG(date);
  ok(phase['supplements.adherence'].value.taken === 1, 'unlogging a dose tombstones only that compound completion');
  ok(!phase['supplements.notes'].value.items.some((item) => item.id === 'note-2'), 'note deletion removes the effective canonical note');

  const checkin = phase['skin.current'].value.checkin;
  await runtime.saveSkinCheckin({ id: 'skin-1', canonical_event_id: checkin.canonical_event_id, date, rating: 5, concerns: ['dryness'], water: 2.8, sleep: 8, notes: 'Updated' });
  const product = phase['skin.products'].value.items[0];
  await runtime.saveSkinProduct(Object.assign({}, product, { brand: 'Updated', canonical_event_id: product.canonical_event_id }));
  await runtime.setSkinRoutineStep({ product_id: 'spf', date, completed: false });
  await runtime.saveSkinTreatment({ id: 'led-2', date, type: 'led', notes: '12 minutes' });
  await runtime.saveSkinIngredient({ id: 'niacinamide', date, name: 'Niacinamide' });
  await runtime.saveSkinGoal({ id: 'goal-2', date, text: 'Improve consistency', done: false });
  await runtime.projections.whenIdle();
  phase = await runtime.phaseG(date);
  ok(phase['skin.current'].value.checkin.rating === 5 && phase['skin.current'].value.checkin.concerns[0] === 'dryness', 'Skin check-in correction replaces the prior effective fact');
  ok(phase['skin.products'].value.items[0].brand === 'Updated', 'Skin product edits replace the prior effective product');
  ok(!phase['skin.routine'].value.today_product_ids.includes('spf'), 'routine uncompletion tombstones the dated step');
  ok(phase['skin.support'].value.treatments.some((item) => item.id === 'led-2') && phase['skin.support'].value.ingredients.some((item) => item.name === 'Niacinamide') && phase['skin.support'].value.goals.some((item) => item.text === 'Improve consistency'), 'Skin support projection exposes canonical treatments, ingredients, and goals');
  ok(phase['skin.insights'].value.items.some((item) => item.id === 'skin-more-checkins'), 'Skin insights communicate coverage limits instead of causality');

  const skinEvents = await repository.query({ domain: 'skin' });
  ok(skinEvents.some((event) => event.type === 'skin.treatment.logged') && skinEvents.some((event) => event.type === 'skin.ingredient.changed') && skinEvents.some((event) => event.type === 'skin.goal.changed'), 'Skin supporting workflows use distinct canonical event types');
  const secondDevice = Runtime.create({ storage: storage({}), repository, userId: 'owner-phase-g', deviceId: 'device-phase-g-2', timezone: 'Europe/Amsterdam' });
  const secondDevicePhase = await secondDevice.phaseG(date);
  ok(secondDevicePhase['skin.current'].value.checkin.rating === 5 && secondDevicePhase['supplements.schedule'].value.items.some((item) => item.id === 'creatine' && item.dose === '6 g'), 'a second device projects the same effective Skin and Supplements facts without legacy storage');
  ok((await repository.pendingOutbox()).length >= 18, 'Phase G mutations are queued for cross-device synchronization');

  console.log('canonical-phase-g-runtime.test.js: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
