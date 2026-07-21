const Repositories = require('../event-repository.js');
const Commands = require('../data-commands.js');

let pass = 0;
let fail = 0;
function ok(condition, message) { if (condition) { pass += 1; return; } fail += 1; console.error('FAIL: ' + message); }

(async function () {
  const adapter = new Repositories.MemoryAdapter();
  const repository = Repositories.create({ adapter, userId: 'owner-1', deviceId: 'phone-1', timezone: 'Europe/Amsterdam' });
  const commands = Commands.create({ repository });

  const result = await commands.execute({
    id: 'cmd-meal-1', type: 'nutrition.meal.log', occurred_at: '2026-06-19T12:00:00Z',
    payload: { name: 'Chicken bowl', calories: 684, protein: 45, carbs: 66, fat: 18 },
    units: { calories: 'kcal', protein_g: 'g', carbs_g: 'g', fat_g: 'g' },
  });
  ok(result.events.length === 1, 'execute appends one canonical event');
  ok(result.events[0].payload.protein_g === 45 && result.events[0].payload.protein == null, 'command normalizes legacy macro field names');
  ok((await repository.getCommand('cmd-meal-1')).event_ids[0] === result.events[0].id, 'command history and event identity commit together');
  ok((await repository.pendingOutbox()).length === 1, 'command event is queued for sync');

  const again = await commands.execute({ id: 'cmd-meal-1', type: 'nutrition.meal.log', payload: { name: 'ignored duplicate' } });
  ok(again.events[0].id === result.events[0].id, 'command ID makes execution idempotent');
  ok((await repository.rawQuery({ domain: 'nutrition' })).length === 1, 'idempotent command creates no duplicate event');

  const undone = await commands.undo('cmd-meal-1');
  ok(undone.events.length === 1 && undone.events[0].deleted_at, 'undo appends a tombstone event');
  ok((await repository.query({ domain: 'nutrition' })).length === 0, 'undo removes the fact from effective reads');
  ok((await repository.getCommand('cmd-meal-1')).status === 'undone', 'undo state is persisted on the original command');

  const redone = await commands.redo('cmd-meal-1');
  ok(redone.events.length === 1 && !redone.events[0].deleted_at, 'redo appends a fresh canonical event');
  ok((await repository.query({ domain: 'nutrition' })).length === 1, 'redo restores the fact to effective reads');
  ok(redone.command.redo_of === 'cmd-meal-1', 'redo history points to the original command');

  const failingAdapter = new Repositories.MemoryAdapter();
  const failingRepo = Repositories.create({ adapter: failingAdapter, userId: 'owner-1', deviceId: 'phone-1' });
  const failingCommands = Commands.create({ repository: failingRepo });
  failingAdapter.failNextWrite(new Error('storage unavailable'));
  let rejected = false;
  try { await failingCommands.execute({ id: 'cmd-water-fail', type: 'hydration.intake.log', payload: { amount_ml: 500 } }); } catch (_) { rejected = true; }
  ok(rejected, 'failed command transaction is rejected');
  ok((await failingRepo.getCommand('cmd-water-fail')) == null, 'failed transaction writes no command record');
  ok((await failingRepo.rawQuery({})).length === 0, 'failed transaction writes no event');
  ok((await failingRepo.pendingOutbox()).length === 0, 'failed transaction writes no outbox work');

  console.log('data-commands.test.js: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
