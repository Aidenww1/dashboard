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
  const date = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const adapter = new Repositories.MemoryAdapter();
  const repository = Repositories.create({ adapter, userId: 'owner-phase-e', deviceId: 'device-phase-e', timezone: 'Europe/Amsterdam' });
  const local = storage({
    'po_coach_weights': JSON.stringify([{ dateKey: yesterday, weight: 82.4 }]),
    'health:body:v1': JSON.stringify([{ date: yesterday, bf: 19.2 }]),
    'body:logs': JSON.stringify([{ date: yesterday, waist: 84.2, chest: 104.5 }]),
    'gym:goals:v1': JSON.stringify({ weight: 78, bf: 16 }),
    'sleep:logs': JSON.stringify([{ id: 'legacy-sleep', date: yesterday, duration: 450 }]),
    'blood:logs': JSON.stringify([{ id: 'legacy-labs', date: yesterday, phase: 'normal', markers: { ldl: 142, hdl: 54 } }]),
    'body:photos:v1': JSON.stringify([{ id: 'legacy-photo', date: yesterday, angle: 'front', flexed: false }]),
    'po_coach_v1': JSON.stringify({ exercises: [], logs: {} }),
    'po_coach_workout_done': JSON.stringify({}),
    'gym:cardio:v1': JSON.stringify([]),
  });
  const runtime = Runtime.create({ storage: local, repository, userId: 'owner-phase-e', deviceId: 'device-phase-e', timezone: 'Europe/Amsterdam' });

  let body = (await runtime.projections.get('body.current', { date })).value;
  ok(body.weight_kg === 82.4 && body.body_fat_pct === 19.2, 'legacy weight and composition feed body.current');
  ok(body.measurements_cm.waist === 84.2 && body.measurements_cm.chest === 104.5, 'legacy tape measurements feed body.current');
  const goal = (await runtime.projections.get('body.goal_progress', { date })).value;
  ok(goal.configured && goal.target_weight_kg === 78 && goal.target_body_fat_pct === 16, 'legacy goals feed canonical goal progress');
  const legacyLabs = (await runtime.projections.get('labs.attention', { date })).value;
  ok(legacyLabs.count === 1 && legacyLabs.items[0].key === 'ldl', 'legacy lab values are normalized against reference ranges');
  const legacyPhotos = (await runtime.projections.get('photos.body', { date })).value;
  ok(legacyPhotos.assets.length === 1 && legacyPhotos.assets[0].metadata.storage_id === 'legacy-photo', 'legacy photo metadata feeds photos.body');

  const measurement = await runtime.saveBodyMeasurement({ date, weight: 81.7, bf: 18.8, measurements_cm: { waist: 83.6, arms: 36.4 } });
  ok(measurement.canonical_event_ids.length === 3, 'one measurement save emits weight, composition, and tape facts');
  await runtime.saveSleep({ date: yesterday, duration: 495, score: 82 });
  const started = await runtime.startTrainingSession({ date, workout: 'Upper body' });
  const firstSet = await runtime.logTrainingSet({ id: 'set-1', date, session_id: started.session_id, exercise: 'Bench Press', exercise_id: 'bench', weight: 90, reps: 8, rpe: 8 });
  await runtime.logTrainingSet({ id: 'set-2', date, session_id: started.session_id, exercise: 'Bench Press', exercise_id: 'bench', weight: 95, reps: 6, rpe: 8 });
  await runtime.completeTrainingSession({ id: started.session_id, session_id: started.session_id, date, duration_seconds: 3600, sets: 2, volume_kg: 1290 });
  const cardioOne = await runtime.saveCardio({ id: 'cardio-1', date, type: 'Run', duration: 30, distance: 5.2, hr: 142 });
  await runtime.saveCardio({ id: 'cardio-2', date, type: 'Cycle', duration: 40, distance: 18, hr: 131 });
  await runtime.saveLabPanel({ date, phase: 'normal', markers: [{ key: 'ldl', name: 'LDL', value: 96, unit: 'mg/dL', ref_low: 0, ref_high: 100, status: 'ok' }, { key: 'vitaminD', name: 'Vitamin D', value: 22, unit: 'ng/mL', ref_low: 30, ref_high: 100, status: 'low' }] });
  await runtime.addBodyPhoto({ id: 'photo-2', date, angle: 'side', flexed: true, weightKg: 81.7, mime: 'image/jpeg' });
  await runtime.projections.whenIdle();

  body = (await runtime.projections.get('body.current', { date })).value;
  ok(body.weight_kg === 81.7 && body.body_fat_pct === 18.8 && body.measurements_cm.arms === 36.4, 'canonical body facts replace same-day summaries');
  const sleep = (await runtime.projections.get('sleep.daily', { date })).value;
  ok(sleep.logged && sleep.duration_minutes === 495, 'sleep correction supersedes the legacy night');
  const readiness = (await runtime.projections.get('readiness.daily', { date })).value;
  ok(readiness.parts.some((part) => part.key === 'sleep' && part.detail === '8.3h'), 'sleep propagates into readiness');
  let load = (await runtime.projections.get('training.load', { date })).value;
  ok(load.sessions_7d === 1 && load.sets_7d === 2 && load.volume_kg_7d === 1290, 'completed strength session propagates into training load');
  ok(load.cardio_minutes_7d === 70, 'multiple same-day cardio sessions remain independent');
  const progress = (await runtime.projections.get('training.progress', { date })).value;
  ok(progress.exercises[0].name === 'Bench Press' && progress.exercises[0].history.length === 2, 'sets propagate into exercise progress and PR history');
  const labs = (await runtime.projections.get('labs.attention', { date })).value;
  ok(labs.count === 1 && labs.items[0].key === 'vitaminD', 'canonical lab panel propagates to attention monitoring');
  const monitoring = (await runtime.projections.get('supplements.monitoring', { date })).value;
  ok(monitoring.status === 'review' && monitoring.watch_items.length === 1, 'lab attention propagates into supplement monitoring');
  const photos = (await runtime.projections.get('photos.body', { date })).value;
  ok(photos.assets.some((asset) => asset.metadata.photo_id === 'photo-2'), 'canonical body photo propagates into photos.body');

  const cardioEdit = await runtime.saveCardio({ id: 'cardio-1', canonical_event_id: cardioOne.canonical_event_id, date, type: 'Run', duration: 35, distance: 6, hr: 140 });
  await runtime.projections.whenIdle();
  load = (await runtime.projections.get('training.load', { date })).value;
  ok(cardioEdit.canonical_event_id !== cardioOne.canonical_event_id && load.cardio_minutes_7d === 75, 'editing one cardio entry supersedes only that entry');
  await runtime.deleteCanonical(firstSet.canonical_event_id, 'user-deleted-training-set');
  await runtime.projections.whenIdle();
  load = (await runtime.projections.get('training.load', { date })).value;
  ok(load.sets_7d === 1 && load.volume_kg_7d === 570, 'deleting a set removes it from all training projections');
  ok((await repository.pendingOutbox()).length >= 13, 'Phase E mutations are queued for cross-device synchronization');

  console.log('canonical-phase-e-runtime.test.js: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
