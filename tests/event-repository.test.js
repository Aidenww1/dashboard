const Repositories = require('../event-repository.js');

let pass = 0;
let fail = 0;
function ok(condition, message) { if (condition) { pass += 1; return; } fail += 1; console.error('FAIL: ' + message); }

(async function () {
  const adapter = new Repositories.MemoryAdapter();
  const repository = Repositories.create({ adapter, userId: 'owner-1', deviceId: 'device-a', timezone: 'Europe/Amsterdam' });
  const input = {
    type: 'body.weight.logged', occurred_at: '2026-06-19T07:00:00Z', source_ref: 'weight:2026-06-19',
    payload: { weight_kg: 82.4 }, units: { weight_kg: 'kg' },
  };

  const first = await repository.append(input);
  ok(!!first.id, 'append returns a canonical event');
  ok((await repository.pendingOutbox()).length === 1, 'append queues the event in the outbox');

  const duplicate = await repository.append(input);
  ok(duplicate.id === first.id, 'idempotent append returns the existing event');
  ok((await repository.rawQuery({ domain: 'body' })).length === 1, 'idempotent append does not duplicate history');
  ok((await repository.pendingOutbox()).length === 1, 'idempotent append does not duplicate outbox work');

  let conflict = null;
  try { await repository.append({ ...input, payload: { weight_kg: 90 } }); } catch (error) { conflict = error; }
  ok(conflict && conflict.code === 'IDEMPOTENCY_CONFLICT', 'same source identity with different facts is rejected');

  const replacement = await repository.replace(first.id, { payload: { weight_kg: 81.9 }, units: { weight_kg: 'kg' } });
  let effective = await repository.query({ domain: 'body' });
  ok(effective.length === 1 && effective[0].id === replacement.id, 'replacement hides the superseded fact from effective reads');
  ok((await repository.rawQuery({ domain: 'body' })).length === 2, 'replacement preserves raw history');

  await repository.tombstone(replacement.id, 'undo correction');
  effective = await repository.query({ domain: 'body' });
  ok(effective.length === 1 && effective[0].id === first.id, 'tombstoning a replacement restores the prior effective fact');
  ok((await repository.pendingOutbox()).length === 3, 'replacement and tombstone are independently syncable');

  await repository.acknowledge(first.id, 'cloud-1');
  ok((await repository.get(first.id)).sync_state === 'synced', 'acknowledgement updates operational sync state');
  ok((await repository.pendingOutbox()).length === 2, 'acknowledged outbox item leaves the pending queue');

  const beforeEvents = (await adapter.all('events')).length;
  const beforeOutbox = (await adapter.all('outbox')).length;
  adapter.failNextWrite(new Error('disk full'));
  let writeFailed = false;
  try {
    await repository.append({ type: 'hydration.intake.logged', source_ref: 'water-fail', payload: { amount_ml: 500 }, units: { amount_ml: 'ml' } });
  } catch (_) { writeFailed = true; }
  ok(writeFailed, 'adapter failure rejects the append');
  ok((await adapter.all('events')).length === beforeEvents, 'failed transaction writes no event');
  ok((await adapter.all('outbox')).length === beforeOutbox, 'failed transaction writes no outbox record');

  let validationFailed = false;
  try {
    await repository.appendBatch([
      { type: 'hydration.intake.logged', source_ref: 'water-valid', payload: { amount_ml: 250 } },
      { type: 'hydration.intake.logged', source_ref: 'water-invalid', payload: { amount_ml: 0 } },
    ]);
  } catch (_) { validationFailed = true; }
  ok(validationFailed, 'invalid event rejects the full batch');
  ok((await repository.rawQuery({ domain: 'hydration' })).length === 0, 'invalid batch produces no partial event writes');

  console.log('event-repository.test.js: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
