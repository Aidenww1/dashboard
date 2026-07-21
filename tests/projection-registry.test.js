const Definitions = require('../projection-definitions.js');
const DataRegistry = require('../data-registry.js');

let pass = 0;
let fail = 0;
function ok(condition, message) { if (condition) { pass += 1; return; } fail += 1; console.error('FAIL: ' + message); }

const registry = Definitions.createRegistry();
const definitions = registry.list();
const requiredPhaseB = [
  'today.summary', 'life_score.daily', 'readiness.daily', 'data_quality.current',
  'nutrition.daily', 'nutrition.rolling_7d', 'nutrition.rolling_30d', 'nutrition.rolling_90d',
  'hydration.daily', 'hydration.timing', 'hydration.rolling_30d',
  'energy.current', 'energy.forecast_24h', 'energy.patterns',
  'sleep.daily', 'sleep.debt', 'training.load', 'training.program', 'training.progress', 'training.recovery',
  'body.current', 'body.trends', 'body.goal_progress', 'skin.current', 'skin.correlations', 'skin.progress',
  'supplements.schedule', 'supplements.adherence', 'supplements.inventory', 'supplements.monitoring',
  'labs.latest', 'labs.trends', 'labs.attention', 'labs.outlook',
  'finance.overview', 'finance.cashflow', 'finance.spending', 'finance.business', 'finance.wealth', 'finance.planning',
  'coach.briefing', 'coach.signals', 'coach.followups',
];

ok(registry.validate().length === 0, 'projection dependency registry validates without missing inputs or cycles');
ok(new Set(definitions.map((item) => item.id)).size === definitions.length, 'projection ids are unique');
ok(requiredPhaseB.every((id) => registry.get(id)), 'all required Phase B projections are registered');

const declared = [...new Set(DataRegistry.list().flatMap((item) => item.projectionIds))];
ok(declared.every((id) => registry.get(id)), 'every source-of-truth registry projection has a calculation definition');
ok(definitions.every((item) => item.outputProjection === item.id), 'every calculation declares its output projection');
ok(definitions.every((item) => item.version > 0 && item.timeWindow && item.recomputeStrategy), 'every calculation declares version, window, and recompute strategy');
ok(definitions.every((item) => item.outputSchema && Array.isArray(item.outputSchema.required)), 'every calculation declares an output schema');
ok(definitions.every((item) => ['deterministic', 'statistical', 'ai-generated'].includes(item.calculationType)), 'calculation classes are controlled values');
const nutritionAffected = registry.affected(['nutrition.meal.logged'], ['nutrition']);
ok(nutritionAffected.includes('nutrition.daily') && nutritionAffected.includes('today.summary') && nutritionAffected.includes('coach.briefing'), 'event invalidation expands through the dependency graph');
ok(registry.affected([], [], ['nutrition.daily']).includes('today.summary'), 'explicit projection invalidation expands to dependents');

const registeredEvents = new Set(DataRegistry.list().flatMap((item) => item.sourceEventTypes));
const unknownInputs = definitions.flatMap((item) => item.eventTypes.filter((type) => !registeredEvents.has(type)).map((type) => item.id + ':' + type));
ok(unknownInputs.length === 0, 'every direct event input belongs to the source-of-truth registry');

const outlook = registry.get('labs.outlook');
ok(outlook.truthClass === 'directional-estimate' && outlook.calculationType === 'statistical', 'lab outlook is labeled as an estimate');

console.log('projection-registry.test.js: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
