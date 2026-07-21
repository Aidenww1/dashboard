const Engine = require('../projection-engine.js');
const Repositories = require('../event-repository.js');

let pass = 0;
let fail = 0;
function ok(condition, message) { if (condition) { pass += 1; return; } fail += 1; console.error('FAIL: ' + message); }

function definition(id, extra) {
  return Object.assign({
    id, displayName: id, outputProjection: id, version: 1, truthClass: 'measured', eventTypes: [], eventDomains: [],
    projectionDeps: [], timeWindow: 'current', recomputeStrategy: 'on-input-change', calculationType: 'deterministic',
    outputSchema: { type: 'object', required: ['value'] }, missingData: 'Explicitly missing.', compute: () => ({ value: { value: 0 } }),
  }, extra || {});
}

(async function () {
  let baseComputes = 0;
  let dependentComputes = 0;
  const definitions = [
    definition('base', { eventTypes: ['hydration.intake.logged'], eventDomains: ['hydration'], compute(ctx) { baseComputes += 1; return { value: { value: ctx.events.length }, sourceEventIds: ctx.events.map((event) => event.id) }; } }),
    definition('dependent', { projectionDeps: ['base'], compute(ctx) { dependentComputes += 1; return { value: { value: ctx.value('base').value * 2 } }; } }),
  ];
  const repository = Repositories.create({ adapter: new Repositories.MemoryAdapter(), userId: 'owner-1', deviceId: 'device-a', timezone: 'Europe/Amsterdam' });
  const engine = Engine.create({ repository, definitions, clock: () => new Date('2026-06-19T12:00:00Z') });

  const first = await engine.get('dependent');
  const cached = await engine.get('dependent');
  ok(first.value.value === 0 && cached.value.value === 0, 'projection values resolve through dependencies');
  ok(baseComputes === 1 && dependentComputes === 1, 'projection and dependency results are cached');

  let subscriberUpdate = null;
  engine.subscribe('dependent', (update) => { subscriberUpdate = update; });
  engine.subscribe('dependent', () => { throw new Error('consumer render failed'); });
  const started = Date.now();
  const water = await repository.append({ type: 'hydration.intake.logged', occurred_at: '2026-06-19T10:00:00Z', source_ref: 'water-1', payload: { amount_ml: 500 }, units: { amount_ml: 'ml' } });
  await engine.whenIdle();
  ok(Date.now() - started < 250, 'subscribed projections update within the 250ms local target');
  ok(subscriberUpdate && subscriberUpdate.projections[0].value.value === 2, 'event changes invalidate transitive dependents and notify subscribers');
  ok(baseComputes === 2 && dependentComputes === 2, 'affected dependency chain recomputes exactly once');

  const explanation = await engine.explain('dependent');
  ok(explanation.source_event_ids.includes(water.id), 'explanation carries transitive source event provenance');
  ok(explanation.source_projection_versions.base === 1, 'explanation carries source projection versions');

  let cycleRejected = false;
  try { Engine.createRegistry([definition('a', { projectionDeps: ['b'] }), definition('b', { projectionDeps: ['a'] })]).validate().forEach(() => { cycleRejected = true; }); } catch (_) { cycleRejected = true; }
  ok(cycleRejected, 'registry rejects dependency cycles');

  const bad = Engine.create({ repository, definitions: [definition('bad', { outputSchema: { type: 'object', required: ['required'] }, compute: () => ({ value: {} }) })] });
  let schemaRejected = false;
  try { await bad.get('bad'); } catch (error) { schemaRejected = /output validation failed/.test(error.message); }
  ok(schemaRejected, 'projection outputs are schema checked');

  console.log('projection-engine.test.js: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
