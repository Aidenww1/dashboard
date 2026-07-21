/* ============================================================
   Life OS source-of-truth registry.

   This file is deliberately data-first: tests and migration tooling can
   inspect it without loading a page or touching browser storage. It is the
   ownership boundary for canonical events, commands, projections, legacy
   stores, cloud tables, units, dates, retention, privacy, and consumers.
   ============================================================ */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LifeOSDataRegistry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = 1;

  function source(key, owner, options) {
    options = options || {};
    return {
      kind: options.kind || 'localStorage',
      key: key,
      match: options.match || 'exact',
      owner: owner,
      format: options.format || 'json',
      sensitive: !!options.sensitive,
      migrate: options.migrate !== false,
    };
  }

  function entry(config) {
    return Object.freeze({
      domain: config.domain,
      sourceEventTypes: Object.freeze(config.sourceEventTypes || []),
      commandTypes: Object.freeze(config.commandTypes || []),
      projectionIds: Object.freeze(config.projectionIds || []),
      legacySources: Object.freeze(config.legacySources || []),
      cloudTables: Object.freeze(config.cloudTables || []),
      identityRules: Object.freeze(config.identityRules || ['event.id is globally stable', 'source_ref is idempotent per owner and type']),
      unitRules: Object.freeze(config.unitRules || ['units are explicit at ingestion', 'canonical calculations use SI units']),
      dateRules: Object.freeze(config.dateRules || ['occurred_at is UTC ISO-8601', 'local_date and IANA timezone are retained']),
      retentionRules: Object.freeze(config.retentionRules || ['events are append-only', 'deletes append tombstones']),
      privacyClass: config.privacyClass || 'private',
      consumers: Object.freeze(config.consumers || []),
      owner: config.owner,
      migrationVersion: config.migrationVersion || 1,
    });
  }

  var REGISTRY = Object.freeze([
    entry({
      domain: 'profile',
      sourceEventTypes: ['profile.settings.changed', 'profile.legacy.imported'],
      commandTypes: ['profile.settings.change'],
      projectionIds: ['profile.current'],
      legacySources: [source('settings:v1', 'settings.html'), source('auth:required:v1', 'auth.js', { format: 'raw', sensitive: true, migrate: false })],
      cloudTables: ['app_state'],
      unitRules: ['preferred display units are profile facts', 'weight canonical unit is kg', 'volume canonical unit is ml'],
      privacyClass: 'sensitive',
      consumers: ['all personalized targets', 'all forecasts', 'settings', 'privacy'],
      owner: 'platform/profile',
    }),
    entry({
      domain: 'nutrition',
      sourceEventTypes: ['nutrition.meal.logged', 'nutrition.meal.edited', 'nutrition.target.changed', 'nutrition.legacy.imported'],
      commandTypes: ['nutrition.meal.log', 'nutrition.meal.edit', 'nutrition.target.change'],
      projectionIds: ['nutrition.daily', 'nutrition.rolling_7d', 'nutrition.rolling_30d', 'nutrition.rolling_90d'],
      legacySources: [
        source('nt:logs', 'nutrition.html'), source('nt:targets', 'nutrition.html'), source('nt:tdee', 'nutrition.html'),
        source('nt:grocery:v1', 'nutrition.html'), source('nt:meal_templates', 'nutrition.html'), source('nt:photoCache:v1', 'nutrition.html'),
        source('nt:recipes:v1', 'nutrition.html'), source('gym:nutrition-targets:v1', 'gym.html'),
        source('health:caffeine:v1', 'nutrition.html'),
      ],
      cloudTables: ['nutrition', 'events', 'app_state'],
      unitRules: ['energy is kcal', 'macros are grams', 'micronutrients retain source units'],
      privacyClass: 'health',
      consumers: ['Log Food', 'Today', 'Coach', 'energy', 'body', 'labs outlook'],
      owner: 'health/nutrition',
    }),
    entry({
      domain: 'hydration',
      sourceEventTypes: ['hydration.intake.logged', 'hydration.intake.edited', 'hydration.target.changed', 'hydration.legacy.imported'],
      commandTypes: ['hydration.intake.log', 'hydration.intake.edit', 'hydration.target.change'],
      projectionIds: ['hydration.daily', 'hydration.timing', 'hydration.rolling_30d'],
      legacySources: [source('po_water_v1', 'water.html')],
      cloudTables: ['hydration', 'events', 'app_state'],
      unitRules: ['intake canonical unit is ml', 'targets canonical unit is ml/day', 'food water is estimated and labeled separately'],
      privacyClass: 'health',
      consumers: ['Log Water', 'Today', 'Coach', 'readiness', 'energy', 'labs outlook'],
      owner: 'health/hydration',
    }),
    entry({
      domain: 'sleep',
      sourceEventTypes: ['sleep.night.logged', 'sleep.night.synced', 'sleep.legacy.imported'],
      commandTypes: ['sleep.night.log', 'sleep.night.sync'],
      projectionIds: ['sleep.daily', 'sleep.debt', 'sleep.consistency', 'recovery.daily'],
      legacySources: [source('sleep:logs', 'sleep modules'), source('sleep:manual:v1', 'events-bridge.js'), source('health:sleep:v1', 'health.html')],
      cloudTables: ['sleep', 'sleep_stage', 'events', 'app_state'],
      unitRules: ['duration canonical unit is minutes', 'stages canonical unit is minutes', 'scores remain source-scaled with provenance'],
      privacyClass: 'health',
      consumers: ['Recovery', 'Today', 'Training', 'Coach', 'energy'],
      owner: 'health/recovery',
    }),
    entry({
      domain: 'wearables',
      sourceEventTypes: ['wearables.sample.synced', 'wearables.legacy.imported'],
      commandTypes: ['wearables.sample.sync'],
      projectionIds: ['wearables.current', 'recovery.daily', 'activity.daily'],
      legacySources: [source('wearable:today:v1', 'health.html'), source('activity:summary:v1', 'activity integrations'), source('health:metrics:v1', 'health.html')],
      cloudTables: ['heart_rate', 'steps', 'calories', 'oxygen_saturation', 'exercise', 'hrv', 'skin_temperature', 'respiratory_rate', 'floors_climbed', 'distance'],
      unitRules: ['provider units are retained in provenance', 'HRV and RHR normalize to ms and bpm', 'steps are integer counts'],
      privacyClass: 'health-sensitive',
      consumers: ['Today', 'Body', 'Training', 'Coach', 'energy'],
      owner: 'integrations/wearables',
    }),
    entry({
      domain: 'training',
      sourceEventTypes: ['training.session.started', 'training.set.logged', 'training.cardio.logged', 'training.session.completed', 'training.legacy.imported'],
      commandTypes: ['training.session.start', 'training.set.log', 'training.cardio.log', 'training.session.complete'],
      projectionIds: ['training.load', 'training.program', 'training.progress', 'training.recovery'],
      legacySources: [
        source('po_coach_v1', 'gym.html'), source('po_coach_workout_done', 'gym.html'), source('gym:cardio:v1', 'gym.html'),
        source('gym:cycle:v1', 'gym.html'), source('gym:goals:v1', 'gym.html'), source('gym:prs:v1', 'gym.html'),
        source('gym:prs:suppressed:v1', 'gym.html'), source('gym:rest:v1', 'gym.html'), source('gym:templates:v1', 'gym.html'),
      ],
      cloudTables: ['exercise', 'events', 'app_state'],
      unitRules: ['load canonical unit is kg', 'distance canonical unit is km', 'duration canonical unit is seconds', 'RPE is 0-10'],
      privacyClass: 'health',
      consumers: ['Log Training', 'Today', 'Coach', 'energy', 'hydration', 'body'],
      owner: 'health/training',
    }),
    entry({
      domain: 'body',
      sourceEventTypes: ['body.weight.logged', 'body.composition.logged', 'body.measurement.logged', 'body.photo.added', 'body.legacy.imported'],
      commandTypes: ['body.weight.log', 'body.composition.log', 'body.measurement.log', 'body.photo.add'],
      projectionIds: ['body.current', 'body.trends', 'body.goal_progress'],
      legacySources: [
        source('po_coach_weights', 'gym.html/body.html'), source('body:logs', 'body.html'), source('health:body:v1', 'health.html'),
        source('body:photo_reports:v1', 'body.html', { sensitive: true }), source('gym:goals:v1', 'body.html'),
      ],
      cloudTables: ['weight', 'height', 'body_fat', 'events', 'app_state'],
      unitRules: ['weight and lean mass canonical unit is kg', 'circumference canonical unit is cm', 'body fat is percent'],
      privacyClass: 'health-sensitive',
      consumers: ['Log Body', 'Today', 'nutrition', 'training', 'labs outlook'],
      owner: 'health/body',
    }),
    entry({
      domain: 'energy',
      sourceEventTypes: ['recovery.energy.checkin', 'energy.legacy.imported'],
      commandTypes: ['recovery.energy.checkin'],
      projectionIds: ['energy.current', 'energy.forecast_24h', 'energy.patterns'],
      legacySources: [source('energy:logs:v1', 'calendar.html')],
      cloudTables: ['events', 'app_state'],
      unitRules: ['check-ins use a documented 1-5 scale', 'forecasts carry confidence and model version'],
      privacyClass: 'health',
      consumers: ['Today', 'Coach', 'Recovery', 'Training'],
      owner: 'health/energy',
    }),
    entry({
      domain: 'mood',
      sourceEventTypes: ['recovery.mood.checkin', 'recovery.symptom.checkin', 'mood.legacy.imported'],
      commandTypes: ['recovery.mood.checkin', 'recovery.symptom.checkin'],
      projectionIds: ['mood.trends', 'stress.trends', 'symptoms.associations'],
      legacySources: [
        source('mind:mood:v1', 'mood.html', { sensitive: true }), source('mood:logs:v1', 'events-bridge.js', { sensitive: true }),
        source('mind:gratitude:v1', 'mood.html', { sensitive: true }), source('mind:journal:v1', 'mood.html', { sensitive: true }),
        source('mind:meditation:v1', 'mood.html'),
      ],
      cloudTables: ['mood', 'mindfulness', 'events', 'app_state'],
      unitRules: ['mood and energy normalize to 1-5', 'free text never becomes a causal fact'],
      privacyClass: 'highly-sensitive',
      consumers: ['Coach', 'readiness', 'energy', 'skin'],
      owner: 'health/checkins',
    }),
    entry({
      domain: 'labs',
      sourceEventTypes: ['labs.panel.logged', 'labs.panel.imported', 'labs.marker.corrected', 'labs.outlook.recorded', 'labs.legacy.imported'],
      commandTypes: ['labs.panel.log', 'labs.panel.import', 'labs.marker.correct', 'labs.outlook.record'],
      projectionIds: ['labs.latest', 'labs.trends', 'labs.attention', 'labs.model_status', 'labs.outlook', 'labs.outlook_evaluation'],
      legacySources: [source('blood:logs', 'health.html', { sensitive: true }), source('health:labs:v1', 'health.html', { sensitive: true })],
      cloudTables: ['bloodwork', 'events', 'app_state'],
      unitRules: ['each marker retains original and normalized units', 'reference range and collection conditions are source facts'],
      privacyClass: 'medical',
      consumers: ['Body Labs', 'Supplements', 'Coach', 'Today', 'outlook'],
      owner: 'health/labs',
    }),
    entry({
      domain: 'supplements',
      sourceEventTypes: ['supplement.dose.logged', 'supplement.compound.changed', 'supplement.inventory.changed', 'supplement.note.logged', 'supplements.legacy.imported'],
      commandTypes: ['supplement.dose.log', 'supplement.compound.change', 'supplement.inventory.change', 'supplement.note.log'],
      projectionIds: ['supplements.adherence', 'supplements.schedule', 'supplements.inventory', 'supplements.monitoring', 'supplements.notes'],
      legacySources: [
        source('stack:items', 'lifeos-core.js'), source('stack:taken:', 'lifeos-core.js', { match: 'prefix' }),
        source('supps:stack', 'reminders.html'), source('supps:taken', 'reminders.html'),
      ],
      cloudTables: ['events', 'app_state'],
      unitRules: ['dose amount and unit are separate', 'compound form and route are explicit'],
      privacyClass: 'medical',
      consumers: ['Log Supplements', 'Today', 'Coach', 'labs context'],
      owner: 'health/supplements',
    }),
    entry({
      domain: 'skin',
      sourceEventTypes: ['skin.checkin.logged', 'skin.routine.logged', 'skin.product.changed', 'skin.photo.added', 'skin.breakout.logged', 'skin.treatment.logged', 'skin.ingredient.changed', 'skin.goal.changed', 'skin.legacy.imported'],
      commandTypes: ['skin.checkin.log', 'skin.routine.log', 'skin.product.change', 'skin.photo.add', 'skin.breakout.log', 'skin.treatment.log', 'skin.ingredient.change', 'skin.goal.change'],
      projectionIds: ['skin.current', 'skin.products', 'skin.routine', 'skin.support', 'skin.progress', 'skin.correlations', 'skin.insights'],
      legacySources: [
        source('skin:breakouts', 'skin.html'), source('skin:device_sessions', 'skin.html'), source('skin:goals', 'skin.html'),
        source('skin:ingredients', 'skin.html'), source('skin:logs', 'skin.html'), source('skin:products', 'skin.html'),
        source('skin:routine:v1', 'skin.html'),
      ],
      cloudTables: ['events', 'app_state'],
      unitRules: ['severity scales are versioned', 'environment values retain source and timestamp'],
      privacyClass: 'health-sensitive',
      consumers: ['Log Skin', 'Coach', 'attention', 'photos'],
      owner: 'health/skin',
    }),
    entry({
      domain: 'finance',
      sourceEventTypes: ['finance.transaction.logged', 'finance.transaction.imported', 'finance.account.changed', 'finance.legacy.imported'],
      commandTypes: ['finance.transaction.log', 'finance.transaction.import', 'finance.account.change'],
      projectionIds: ['finance.overview', 'finance.transactions', 'finance.accounts', 'finance.cashflow', 'finance.spending', 'finance.business', 'finance.wealth', 'finance.planning', 'finance.history', 'finance.reconciliation'],
      legacySources: [
        source('fin:accounts:v1', 'finance.html', { sensitive: true }), source('fin:budgets', 'finance.html', { sensitive: true }),
        source('fin:income', 'lifeos-core.js', { sensitive: true }), source('fin:subs', 'lifeos-core.js', { sensitive: true }),
        source('fin:debt_strat', 'finance.html', { sensitive: true }), source('fin:dividends:v1', 'finance.html', { sensitive: true }),
        source('fin:debts:v1', 'finance.html', { sensitive: true }),
        source('fin:mortgage:v1', 'finance.html', { sensitive: true }), source('fin:portfolio:v1', 'finance.html', { sensitive: true }),
        source('fin:recur_dismissed:v1', 'finance.html'), source('fin:tax:v1', 'finance.html', { sensitive: true }),
        source('finance:vehicles', 'finance.html', { sensitive: true }), source('finance_active_tab', 'finance.html', { format: 'raw' }),
        source('ing:income', 'finance.html', { sensitive: true }), source('ing:meta', 'finance.html', { sensitive: true }),
        source('ing:tx', 'finance.html/ui/money.html', { sensitive: true }), source('incoming_orders', 'events-bridge.js', { sensitive: true }),
        source('man:income', 'finance.html', { sensitive: true }), source('nw:activity', 'finance.html', { sensitive: true }),
        source('nw:history', 'finance.html', { sensitive: true }), source('nw_currency', 'finance.html', { format: 'raw' }),
        source('sav:goals', 'finance.html', { sensitive: true }), source('subs', 'money.html', { sensitive: true }),
        source('gl:revenue', 'glowlab.html', { sensitive: true }), source('gl:expenses', 'glowlab.html', { sensitive: true }),
        source('gl:rateInputs', 'glowlab.html', { sensitive: true }),
      ],
      cloudTables: ['events', 'app_state'],
      unitRules: ['amounts use integer minor units plus ISO currency', 'original import amount and currency are retained'],
      privacyClass: 'financial',
      consumers: ['Money', 'Today', 'Coach', 'planning'],
      owner: 'finance',
    }),
    entry({
      domain: 'productivity',
      sourceEventTypes: ['task.changed', 'goal.changed', 'calendar.event.changed', 'habit.changed', 'productivity.legacy.imported'],
      commandTypes: ['task.change', 'goal.change', 'calendar.event.change', 'habit.change'],
      projectionIds: ['productivity.day_plan', 'productivity.focus', 'productivity.completion'],
      legacySources: [
        source('tasks:v1', 'tasks.html/calendar.html'), source('tasks:projects:v1', 'tasks.html/calendar.html'),
        source('goals:', 'lifeos-core.js', { match: 'prefix' }), source('habits:v1', 'habits.html'), source('habits:logs:v1', 'habits.html'),
        source('planner:blocks:v1', 'calendar.html'), source('pomo:sessions:v1', 'calendar.html'), source('goal_streak_v1', 'index.html'),
        source('briefing:enabled:v1', 'reminders.html'), source('briefing:last:v1', 'reminders.html'), source('briefing:waketime:v1', 'reminders.html'),
        source('reminders:v1', 'reminders.html'),
      ],
      cloudTables: ['habits', 'events', 'app_state'],
      privacyClass: 'private',
      consumers: ['Today', 'Coach', 'notifications', 'Calendar', 'Tasks'],
      owner: 'productivity',
    }),
    entry({
      domain: 'communications',
      sourceEventTypes: ['integration.status.changed', 'communications.legacy.imported'],
      commandTypes: ['integration.status.change'],
      projectionIds: ['communications.inbox', 'communications.followups'],
      legacySources: [
        source('mail:aiclass:v1', 'mail.html', { sensitive: true }), source('mail:cache:v1', 'mail.html', { sensitive: true }),
        source('mail:orders:v1', 'mail.html', { sensitive: true }), source('mail:snooze:v1', 'mail.html', { sensitive: true }),
        source('mail:summary:v1', 'mail.html', { sensitive: true }), source('gmail:token:v1', 'mail.html', { sensitive: true, migrate: false }),
        source('gmail:was_connected', 'mail.html', { format: 'raw' }), source('gcal:token', 'calendar.html', { sensitive: true, migrate: false }),
        source('gcal:was_connected', 'calendar.html', { format: 'raw' }),
      ],
      cloudTables: ['events', 'app_state'],
      retentionRules: ['tokens are never copied into canonical event payloads', 'summaries follow provider retention settings'],
      privacyClass: 'highly-sensitive',
      consumers: ['Today', 'Coach', 'Mail', 'Calendar'],
      owner: 'integrations/communications',
    }),
    entry({
      domain: 'photos',
      sourceEventTypes: ['photo.asset.added', 'photo.asset.deleted', 'photos.legacy.imported'],
      commandTypes: ['photo.asset.add', 'photo.asset.delete'],
      projectionIds: ['photos.body', 'photos.skin'],
      legacySources: [
        source('po_coach_photos', 'gym.html', { sensitive: true }), source('body:photos:v1', 'body.html', { sensitive: true }),
        source('lifeos-photos', 'photo-store.js', { kind: 'indexedDB', sensitive: true }),
      ],
      cloudTables: ['object_storage', 'events'],
      retentionRules: ['binary assets require owner-scoped object storage', 'deletion tombstones metadata and removes the asset after sync acknowledgement'],
      privacyClass: 'biometric-media',
      consumers: ['Body', 'Skin', 'export', 'privacy'],
      owner: 'platform/media',
    }),
    entry({
      domain: 'lifestyle',
      sourceEventTypes: ['lifestyle.item.changed', 'lifestyle.legacy.imported'],
      commandTypes: ['lifestyle.item.change'],
      projectionIds: ['lifestyle.travel', 'lifestyle.library', 'lifestyle.contacts'],
      legacySources: [
        source('travel:trips:v1', 'travel.html'), source('library:books:v1', 'library.html'), source('library:courses:v1', 'library.html'),
        source('social:contacts:v1', 'social.html', { sensitive: true }), source('watch:comparison:v1', 'watch.html'), source('watch:data:v3', 'watch.html'),
      ],
      cloudTables: ['events', 'app_state'],
      privacyClass: 'private',
      consumers: ['More', 'Coach', 'Travel', 'Library'],
      owner: 'lifestyle',
    }),
    entry({
      domain: 'system',
      sourceEventTypes: ['system.audit.recorded', 'system.legacy.imported'],
      commandTypes: ['system.audit.record'],
      projectionIds: ['system.data_graph', 'system.sync_status', 'system.migrations'],
      legacySources: [
        source('ai:cache:v1', 'claude.js', { migrate: false }), source('audit:report:v1', 'review.html'), source('coach:chat:v1', 'command.js', { sensitive: true }),
        source('coach:plans:v1', 'ui/coach.html', { sensitive: true }), source('review:ritual:v1', 'review.html', { sensitive: true }),
        source('coach:insight_log:v1', 'index.html'), source('coach:report:v1', 'review.html'), source('experiments:v1', 'ai.html'),
        source('lifeos:hist:', 'ui/data.js', { match: 'prefix' }), source('radar:dismissed:v1', 'radar.html'),
        source('radar:news:v1', 'radar.html'), source('radar:saved:v1', 'radar.html'), source('radar:snoozed:v1', 'radar.html'),
        source('radar:summary:v1', 'radar.html'), source('share:handoff:v1', 'share.html', { sensitive: true }),
        source('errors:log:v1', 'errlog.js'), source('onboarding:done:v1', 'index.html', { format: 'raw' }),
        source('backup:last:v1', 'lifeos-core.js'),
        source('lifeos:auth-session:v1', 'auth.js', { sensitive: true, migrate: false }),
        source('sync:meta:', 'cloudsync.js', { match: 'prefix', migrate: false }),
      ],
      cloudTables: ['events', 'app_state'],
      retentionRules: ['operational metadata is bounded', 'AI cache is disposable', 'audit and migration records are append-only'],
      privacyClass: 'private-operational',
      consumers: ['Data Graph', 'status', 'backup', 'privacy'],
      owner: 'platform/data',
    }),
  ]);

  var byDomain = {};
  var byEvent = {};
  var byCommand = {};
  REGISTRY.forEach(function (item) {
    byDomain[item.domain] = item;
    item.sourceEventTypes.forEach(function (type) { byEvent[type] = item; });
    item.commandTypes.forEach(function (type) { byCommand[type] = item; });
  });

  function list() { return REGISTRY.slice(); }
  function get(domain) { return byDomain[domain] || null; }
  function findByEvent(type) { return byEvent[type] || null; }
  function findByCommand(type) { return byCommand[type] || null; }

  function matchesSource(item, key, kind) {
    kind = kind || 'localStorage';
    for (var i = 0; i < item.legacySources.length; i++) {
      var s = item.legacySources[i];
      if (s.kind !== kind) continue;
      if (s.match === 'prefix' ? key.indexOf(s.key) === 0 : key === s.key) return s;
    }
    return null;
  }

  function resolveLegacyKey(key, kind) {
    for (var i = 0; i < REGISTRY.length; i++) {
      var matched = matchesSource(REGISTRY[i], key, kind);
      if (matched) return { domain: REGISTRY[i].domain, source: matched, entry: REGISTRY[i] };
    }
    return null;
  }

  function validate() {
    var errors = [];
    var required = ['domain', 'sourceEventTypes', 'commandTypes', 'projectionIds', 'legacySources', 'cloudTables', 'identityRules', 'unitRules', 'dateRules', 'retentionRules', 'privacyClass', 'consumers', 'owner', 'migrationVersion'];
    var seenEvents = {};
    var seenCommands = {};
    REGISTRY.forEach(function (item) {
      required.forEach(function (field) {
        if (item[field] == null || item[field] === '' || (Array.isArray(item[field]) && !item[field].length)) errors.push(item.domain + ': missing ' + field);
      });
      item.sourceEventTypes.forEach(function (type) {
        if (seenEvents[type]) errors.push('duplicate event type: ' + type);
        seenEvents[type] = item.domain;
      });
      item.commandTypes.forEach(function (type) {
        if (seenCommands[type]) errors.push('duplicate command type: ' + type);
        seenCommands[type] = item.domain;
      });
    });
    return errors;
  }

  return Object.freeze({
    version: VERSION,
    list: list,
    get: get,
    findByEvent: findByEvent,
    findByCommand: findByCommand,
    resolveLegacyKey: resolveLegacyKey,
    validate: validate,
  });
});
