const assert = require('assert');
const Repositories = require('../event-repository.js');
const Sync = require('../canonical-sync.js');

const owner = '11111111-1111-4111-8111-111111111111';
const session = { access_token: 'jwt-owner', user: { id: owner } };
const auth = value => ({ session: () => value });
const repo = (device, seed) => Repositories.create({ adapter: new Repositories.MemoryAdapter(seed), userId: owner, deviceId: device, timezone: 'Europe/Amsterdam' });

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed += 1; }
  catch (error) { console.error('FAIL: ' + name); throw error; }
}

(async () => {
  await test('unauthenticated sync is blocked before transport calls', async () => {
    const repository = repo('device-a'); let calls = 0;
    const sync = Sync.create({ repository, auth: auth(null), transport: { pull: async () => { calls++; return { events: [] }; }, push: async () => { calls++; } } });
    const result = await sync.sync();
    assert.strictEqual(result.status, 'blocked-authentication-required');
    assert.strictEqual(calls, 0);
  });

  await test('owner mismatch is blocked before transport calls', async () => {
    const repository = repo('device-a'); let calls = 0;
    const sync = Sync.create({ repository, auth: auth({ access_token: 'x', user: { id: 'other-owner' } }), transport: { pull: async () => { calls++; return { events: [] }; }, push: async () => { calls++; } } });
    assert.strictEqual((await sync.sync()).status, 'blocked-owner-mismatch');
    assert.strictEqual(calls, 0);
  });

  await test('offline sync preserves the outbox and avoids transport', async () => {
    const repository = repo('device-a'); await repository.append({ type: 'hydration.intake.logged', source_ref: 'water:1', payload: { amount_ml: 500 } }); let calls = 0;
    const sync = Sync.create({ repository, auth: auth(session), online: () => false, transport: { pull: async () => { calls++; return { events: [] }; }, push: async () => { calls++; } } });
    assert.strictEqual((await sync.sync()).status, 'offline');
    assert.strictEqual((await repository.pendingOutbox()).length, 1);
    assert.strictEqual(calls, 0);
  });

  await test('successful push acknowledges local outbox records', async () => {
    const repository = repo('device-a'); const event = await repository.append({ type: 'hydration.intake.logged', source_ref: 'water:2', payload: { amount_ml: 250 } }); const remote = [];
    const sync = Sync.create({ repository, auth: auth(session), transport: { pull: async () => ({ events: remote, cursor: 'c0' }), push: async request => { remote.push(request.event); return { id: request.event.id }; } } });
    const result = await sync.sync();
    assert.strictEqual(result.status, 'current');
    assert.strictEqual(result.pushed, 1);
    assert.strictEqual((await repository.get(event.id)).sync_state, 'synced');
    assert.strictEqual((await repository.pendingOutbox()).length, 0);
  });

  await test('remote pull is ingested without creating an echo outbox item', async () => {
    const source = repo('device-source'); const event = await source.append({ type: 'body.weight.logged', source_ref: 'weight:remote', payload: { weight_kg: 80 } }); event.sync_state = 'synced';
    const target = repo('device-target');
    const sync = Sync.create({ repository: target, auth: auth(session), transport: { pull: async () => ({ events: [event], cursor: 'c1' }), push: async () => { throw new Error('should not push'); } } });
    const result = await sync.sync();
    assert.strictEqual(result.pulled, 1);
    assert.strictEqual((await target.query({ domain: 'body' })).length, 1);
    assert.strictEqual((await target.pendingOutbox()).length, 0);
  });

  await test('conflicting remote identity is retained as evidence', async () => {
    const target = repo('device-target'); const existing = await target.append({ type: 'body.weight.logged', occurred_at: '2026-01-01T08:00:00Z', source_ref: 'weight:conflict', payload: { weight_kg: 80 } });
    const incoming = { ...existing, id: 'evt_remote_conflict', payload: { weight_kg: 95 }, sync_state: 'synced' };
    const sync = Sync.create({ repository: target, auth: auth(session), transport: { pull: async () => ({ events: [incoming], cursor: 'c2' }), push: async request => ({ id: request.event.id }) } });
    const result = await sync.sync();
    assert.strictEqual(result.status, 'conflict');
    assert.strictEqual(result.conflicts[0].code, 'REMOTE_IDEMPOTENCY_CONFLICT');
    assert.strictEqual((await target.getMeta('sync:conflicts')).length, 1);
    assert.strictEqual((await target.query({ domain: 'body' }))[0].payload.weight_kg, 80);
  });

  await test('failed pushes stay queued with bounded backoff metadata', async () => {
    const target = repo('device-target'); await target.append({ type: 'hydration.intake.logged', source_ref: 'water:retry', payload: { amount_ml: 300 } });
    const sync = Sync.create({ repository: target, auth: auth(session), clock: () => Date.parse('2026-07-22T10:00:00Z'), transport: { pull: async () => ({ events: [] }), push: async () => { throw new Error('network down'); } } });
    const result = await sync.sync(); const pending = await target.pendingOutbox();
    assert.strictEqual(result.status, 'partial');
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0].attempts, 1);
    assert.ok(pending[0].next_attempt_at);
  });

  await test('validated snapshot restore preserves tombstones and pending work', async () => {
    const source = repo('device-source'); const first = await source.append({ type: 'body.weight.logged', source_ref: 'weight:restore', payload: { weight_kg: 80 } }); await source.tombstone(first.id, 'remove');
    const snapshot = { canonical_events: await source.rawQuery({ includeDeleted: true, includeSuperseded: true }), pending_outbox: await source.pendingOutbox() };
    const target = repo('device-target'); const result = await target.restoreSnapshot(snapshot);
    assert.strictEqual(result.restored_events, 2);
    assert.strictEqual((await target.query({ domain: 'body' })).length, 0);
    assert.strictEqual((await target.pendingOutbox()).length, 2);
  });

  console.log('canonical-sync.test.js: ' + passed + ' passed');
})().catch(error => { console.error(error); process.exit(1); });
