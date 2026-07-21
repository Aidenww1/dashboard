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
  const date = '2026-07-20';
  const yesterday = '2026-07-19';
  const adapter = new Repositories.MemoryAdapter();
  const repository = Repositories.create({ adapter, userId: 'owner-phase-f', deviceId: 'device-phase-f', timezone: 'Europe/Amsterdam' });
  const local = storage({
    'po_water_v1': JSON.stringify({
      unit: 'bottle', bottleMl: 500, glassMl: 250,
      logs: { [yesterday]: 2, [date]: 1 },
      profile: { weightKg: 80, age: 30, sex: 'm', activityHrsPerWeek: 7 },
      caffeineMgPerDay: 300,
    }),
    'nt:logs': JSON.stringify([]),
  });
  const runtime = Runtime.create({ storage: local, repository, userId: 'owner-phase-f', deviceId: 'device-phase-f', timezone: 'Europe/Amsterdam' });

  const bridge = await runtime.bridgeHydrationLegacy();
  ok(bridge.length === 2, 'legacy Water history bridges once into canonical intake events');
  ok((await runtime.bridgeHydrationLegacy()).length === 0, 'legacy bridge is idempotent after canonical hydration exists');

  let phase = await runtime.phaseF(date);
  let hydration = phase['hydration.daily'].value;
  ok(hydration.explicit_beverage_ml === 500, 'bridged Water total is not double-counted with compatibility data');
  ok(hydration.sources.legacy_ml === 500 && hydration.sources.manual_ml === 0, 'hydration provenance separates legacy and manual sources');
  ok(hydration.target_ml === 3650, 'legacy target includes body, activity, caffeine, and demographic components');

  const manual = await runtime.logHydration({ id: 'manual-water', date, occurred_at: date + 'T10:00:00+02:00', amount_ml: 250, beverage_type: 'water', source: 'manual' });
  await runtime.projections.whenIdle();
  hydration = (await runtime.projections.get('hydration.daily', { date })).value;
  ok(hydration.explicit_beverage_ml === 750 && hydration.sources.manual_ml === 250, 'manual intake updates the shared total and source breakdown');
  ok(hydration.entries.some((entry) => entry.id === manual.canonical_event_id && entry.amount_ml === 250), 'daily hydration exposes canonical entries');

  const deviceOne = await runtime.logHydration({ date, occurred_at: date + 'T11:00:00+02:00', amount_ml: 400, beverage_type: 'water', source: 'samsung-health', source_ref: 'provider:water:42' });
  const deviceDuplicate = await runtime.logHydration({ date, occurred_at: date + 'T11:00:30+02:00', amount_ml: 400, beverage_type: 'water', source: 'samsung-health', source_ref: 'provider:water:42' });
  ok(!deviceOne.duplicate && deviceDuplicate.duplicate && deviceDuplicate.canonical_event_id === deviceOne.canonical_event_id, 'provider source references deduplicate repeated imports');

  await runtime.saveHydrationSettings({
    date,
    occurred_at: date + 'T12:00:00+02:00',
    profile: { weight: 80, weight_unit: 'kg', age: 30, sex: 'm', activity_hours_week: 7, caffeine_mg_day: 300 },
    display: { water_unit: 'bottle', bottle_ml: 500, glass_ml: 250 },
    target: { target_ml: 3200, healthy_zone_low_ml: 2560, healthy_zone_high_ml: 3840, components: { base: 2800, activity: 500, caffeine: 150 }, formula_version: 'hydration-target-v1' },
  });
  await runtime.projections.whenIdle();
  hydration = (await runtime.projections.get('hydration.daily', { date })).value;
  ok(hydration.target_ml === 3200 && hydration.target_components.base === 2800, 'target builder stores exact components and formula provenance');

  let forecast = (await runtime.projections.get('energy.forecast_24h', { date })).value;
  ok(forecast.status === 'insufficient-data' && forecast.score_1_to_5 == null && forecast.curve.length === 0, 'energy forecast refuses to guess without personal outcomes');

  const values = [3, 4, 2, 4, 3, 5, 4, 3];
  for (let index = 0; index < values.length; index += 1) {
    const day = index < 4 ? yesterday : date;
    const hour = 7 + (index % 4) * 4;
    await runtime.checkInEnergy({ id: 'energy-' + index, date: day, occurred_at: day + 'T' + String(hour).padStart(2, '0') + ':00:00+02:00', value: values[index], context: 'test' });
  }
  await runtime.projections.whenIdle();
  phase = await runtime.phaseF(date);
  forecast = phase['energy.forecast_24h'].value;
  const confidence = phase['energy.forecast_24h'].confidence;
  ok(forecast.status === 'early-directional' && forecast.curve.length === 8, 'personal outcomes unlock a directional 24-hour curve');
  ok(forecast.curve.every((point) => point.lower <= point.score && point.score <= point.upper), 'every energy point carries a confidence band');
  ok(forecast.calibration.status === 'evaluated' && forecast.calibration.paired_samples === 5, 'forecast calibration backtests against subsequent check-ins');
  ok(confidence.level === 'low' && confidence.sample_size === 8, 'small samples remain visibly low confidence');
  ok(forecast.contributors.some((item) => item.key === 'hydration'), 'hydration is a documented contextual energy contributor');

  await runtime.deleteHydration(manual.canonical_event_id, 'user-undid-hydration-entry');
  await runtime.projections.whenIdle();
  hydration = (await runtime.projections.get('hydration.daily', { date })).value;
  ok(hydration.explicit_beverage_ml === 900 && hydration.sources.manual_ml === 0, 'undo removes one manual event without erasing legacy or device hydration');
  ok((await repository.pendingOutbox()).length >= 15, 'Phase F mutations are queued for cross-device synchronization');

  console.log('canonical-phase-f-runtime.test.js: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
