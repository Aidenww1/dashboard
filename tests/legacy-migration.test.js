const Repositories = require('../event-repository.js');
const Migration = require('../legacy-migration.js');

function makeStorage(seed, failKey) {
  const data = { ...(seed || {}) };
  return {
    get length() { return Object.keys(data).length; },
    key(index) { return Object.keys(data).sort()[index] || null; },
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { if (key === failKey) throw new Error('quota'); data[key] = String(value); },
    removeItem(key) { delete data[key]; },
    dump() { return { ...data }; },
  };
}

let pass = 0;
let fail = 0;
function ok(condition, message) { if (condition) { pass += 1; return; } fail += 1; console.error('FAIL: ' + message); }

(async function () {
  const seed = {
    'nt:logs': JSON.stringify([{ dateKey: '2026-06-19', name: 'Oats', calories: 450 }]),
    'po_water_v1': JSON.stringify({ days: { '2026-06-19': { totalMl: 2100 } } }),
    'tasks:v1': JSON.stringify([{ id: 't1', title: 'Review plan' }]),
    'gcal:token': JSON.stringify({ access_token: 'secret' }),
    'unknown:key': JSON.stringify({ keep: true }),
  };
  const storage = makeStorage(seed);
  const adapter = new Repositories.MemoryAdapter();
  const repository = Repositories.create({ adapter, userId: 'owner-1', deviceId: 'laptop-1', timezone: 'Europe/Amsterdam' });
  const migration = Migration.create({ repository, storage });

  const before = storage.dump();
  const plan = migration.preview({ at: '2026-06-20T08:00:00Z' });
  ok(plan.dry_run === true, 'preview is explicitly a dry run');
  ok(plan.events.length === 3, 'preview creates one canonical envelope per migratable legacy key');
  ok(plan.counts.nutrition === 1 && plan.counts.hydration === 1 && plan.counts.productivity === 1, 'preview reports per-domain counts');
  ok(plan.skipped.some((item) => item.key === 'gcal:token'), 'credential stores are registered but excluded from event payloads');
  ok(plan.unregistered_keys.includes('unknown:key'), 'preview reports unregistered stores instead of guessing ownership');
  ok(JSON.stringify(storage.dump()) === JSON.stringify(before), 'preview does not mutate legacy data');
  ok(plan.events.every((event) => event.payload.raw_value === seed[event.payload.legacy_key]), 'preview preserves exact raw legacy bytes');

  const applied = await migration.apply(plan);
  ok(applied.ok, 'apply verifies the canonical round trip');
  ok(applied.actual_events === 3, 'verification proves expected event count');
  ok(JSON.stringify(storage.dump()) === JSON.stringify(before), 'apply keeps legacy stores unchanged during compatibility period');
  ok((await repository.pendingOutbox()).length === 3, 'migrated events are queued for cross-device sync');

  const appliedAgain = await migration.apply(plan);
  ok(appliedAgain.ok && (await repository.rawQuery({ source: 'legacy-migration' })).length === 3, 'reapplying the same plan is idempotent');
  const compat = await migration.read('nutrition');
  ok(compat.canonical.length === 1 && Array.isArray(compat.legacy['nt:logs']), 'compatibility reader exposes canonical and legacy values together');

  storage.setItem('temporary:after-migration', 'remove-on-rollback');
  const rolledBack = await migration.rollback(plan.id, { restoreLegacy: true });
  ok(rolledBack.ok && rolledBack.tombstones === 3, 'rollback appends one tombstone per imported event');
  ok(storage.getItem('temporary:after-migration') == null, 'rollback restores the exact preview snapshot');
  ok(Migration.checksum(storage.dump()) === Migration.checksum(before), 'rollback restores every original raw value');
  ok((await repository.query({ domain: 'nutrition' })).length === 0, 'rolled-back imports disappear from effective reads');
  ok((await repository.rawQuery({ domain: 'nutrition' })).length === 2, 'rollback retains import and tombstone audit history');

  const driftStorage = makeStorage({ 'nt:logs': '[]' });
  const driftRepo = Repositories.create({ adapter: new Repositories.MemoryAdapter(), userId: 'owner-1', deviceId: 'desktop-1' });
  const driftMigration = Migration.create({ repository: driftRepo, storage: driftStorage });
  const driftPlan = driftMigration.preview({ at: '2026-06-20T08:00:00Z' });
  driftStorage.setItem('nt:logs', '[{"changed":true}]');
  let driftError = null;
  try { await driftMigration.apply(driftPlan); } catch (error) { driftError = error; }
  ok(driftError && driftError.code === 'MIGRATION_SOURCE_DRIFT', 'apply refuses data changed after preview');
  ok((await driftRepo.rawQuery({})).length === 0, 'drift rejection writes no canonical events');

  const failStorage = makeStorage({ 'keep': 'old' }, 'boom');
  let restoreError = null;
  try { Migration.restoreSnapshotAtomic(failStorage, { keep: 'new', boom: 'blocked' }); } catch (error) { restoreError = error; }
  ok(restoreError && restoreError.code === 'LEGACY_RESTORE_FAILED', 'failed localStorage restore is reported');
  ok(failStorage.getItem('keep') === 'old' && failStorage.getItem('boom') == null, 'failed restore compensates to the exact prior state');

  const txStorage = makeStorage({ 'nt:logs': '[]' });
  const txAdapter = new Repositories.MemoryAdapter();
  const txRepo = Repositories.create({ adapter: txAdapter, userId: 'owner-1', deviceId: 'desktop-1' });
  const txMigration = Migration.create({ repository: txRepo, storage: txStorage });
  const txPlan = txMigration.preview({ at: '2026-06-20T08:00:00Z' });
  txAdapter.failNextWrite(new Error('disk full'));
  let txFailed = false;
  try { await txMigration.apply(txPlan); } catch (_) { txFailed = true; }
  ok(txFailed, 'failed migration transaction is rejected');
  ok((await txRepo.rawQuery({})).length === 0, 'failed migration transaction writes no events');
  ok((await txRepo.getMeta('migration:' + txPlan.id)) == null, 'failed migration transaction writes no applied marker');

  console.log('legacy-migration.test.js: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
