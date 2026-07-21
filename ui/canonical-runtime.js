/* ============================================================
   Browser bridge for canonical events and projections.

   The existing UI adapter remains at LifeOS.data. Canonical storage lives at
   LifeOS.canonical so pages can migrate independently without breaking legacy
   modules. Legacy nutrition values are exposed to projections as ephemeral
   compatibility events; this does not silently run the destructive migration.
   ============================================================ */
(function (root, factory) {
  'use strict';
  var registry = root && root.LifeOSDataRegistry;
  var events = root && root.LifeOSCanonicalEvents;
  var repositories = root && root.LifeOSEventRepository;
  var projectionEngine = root && root.LifeOSProjectionEngine;
  var projectionDefinitions = root && root.LifeOSProjectionDefinitions;
  var canonicalSync = root && root.LifeOSCanonicalSync;
  if (typeof require === 'function') {
    if (!registry) registry = require('../data-registry.js');
    if (!events) events = require('../canonical-events.js');
    if (!repositories) repositories = require('../event-repository.js');
    if (!projectionEngine) projectionEngine = require('../projection-engine.js');
    if (!projectionDefinitions) projectionDefinitions = require('../projection-definitions.js');
    if (!canonicalSync) canonicalSync = require('../canonical-sync.js');
  }
  var api = factory(
    registry, events, repositories, projectionEngine, projectionDefinitions, canonicalSync,
    root
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LifeOSCanonicalRuntime = api;
  if (root && root.document) api.install();
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Registry, Events, Repositories, ProjectionEngine, ProjectionDefinitions, CanonicalSync, root) {
  'use strict';

  var OWNER_KEY = 'lifeos:canonical-owner:v1';
  var DEVICE_KEY = 'lifeos:canonical-device:v1';
  var SYNC_ENABLED_KEY = 'lifeos:canonical-sync-enabled:v1';
  var SUPABASE_URL = 'https://nwdyuiimfqhlqscnbqmq.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_KFOU1sDCxRp8c1M3kSytHg_nuQWzfPT';
  var NUTRITION_PROJECTIONS = ['nutrition.daily', 'nutrition.rolling_7d', 'nutrition.rolling_30d', 'nutrition.rolling_90d', 'hydration.daily', 'today.summary', 'coach.signals', 'coach.briefing'];
  var PHASE_E_PROJECTIONS = [
    'sleep.daily', 'sleep.debt', 'sleep.consistency',
    'training.load', 'training.progress', 'training.program', 'training.recovery',
    'body.current', 'body.trends', 'body.goal_progress', 'photos.body',
    'labs.latest', 'labs.trends', 'labs.attention', 'labs.model_status', 'labs.outlook', 'labs.outlook_evaluation',
    'readiness.daily', 'recovery.daily', 'wearables.current', 'activity.daily',
    'today.summary', 'coach.signals', 'coach.briefing', 'coach.followups', 'supplements.monitoring',
  ];
  var PHASE_F_PROJECTIONS = [
    'hydration.daily', 'hydration.timing', 'hydration.rolling_30d',
    'energy.current', 'energy.patterns', 'energy.forecast_24h',
    'readiness.daily', 'life_score.daily', 'today.summary',
    'coach.signals', 'coach.briefing', 'coach.followups', 'labs.outlook',
  ];
  var PHASE_G_PROJECTIONS = [
    'skin.current', 'skin.products', 'skin.routine', 'skin.support', 'skin.progress', 'skin.correlations', 'skin.insights', 'photos.skin',
    'supplements.schedule', 'supplements.adherence', 'supplements.inventory', 'supplements.monitoring', 'supplements.notes',
    'labs.latest', 'labs.trends', 'labs.attention', 'labs.outlook',
    'life_score.daily', 'today.summary', 'coach.signals', 'coach.briefing', 'coach.followups',
  ];
  var PHASE_H_PROJECTIONS = [
    'readiness.daily', 'data_quality.current', 'today.summary',
    'communications.inbox', 'communications.followups',
    'coach.signals', 'coach.briefing', 'coach.followups', 'coach.opportunities', 'coach.reviews', 'coach.context',
    'finance.overview', 'finance.transactions', 'finance.accounts', 'finance.cashflow', 'finance.spending', 'finance.business', 'finance.wealth', 'finance.planning', 'finance.history', 'finance.reconciliation',
  ];
  var LEGACY_COMPATIBILITY = {
    nutrition: ['nt:logs', 'nt:targets', 'nt:tdee'],
    hydration: ['po_water_v1'],
    energy: ['energy:logs:v1'],
    sleep: ['sleep:logs'],
    training: ['po_coach_workout_done', 'po_coach_v1', 'gym:cardio:v1', 'gym:cycle:v1', 'gym:goals:v1', 'gym:prs:v1', 'gym:templates:v1', 'gym:rest:v1'],
    body: ['po_coach_weights', 'health:body:v1', 'body:logs', 'body:photos:v1', 'gym:goals:v1'],
    labs: ['blood:logs', 'health:labs:v1'],
    wearables: ['wearable:today:v1', 'health:metrics:v1'],
    supplements: ['stack:items', 'stack:low', 'supps:notes:v1'],
    skin: ['skin:logs', 'skin:products', 'skin:routine:v1', 'skin:breakouts', 'skin:device_sessions', 'skin:ingredients', 'skin:goals'],
    finance: ['ing:tx', 'fin:accounts:v1', 'nw:bank', 'nw:stocks', 'nw:crypto', 'nw:other', 'nw:history', 'fin:budgets', 'fin:subs', 'sav:goals', 'gl:revenue', 'gl:expenses'],
    communications: ['mail:summary:v1'],
    system: ['radar:summary:v1', 'review:ritual:v1', 'coach:plans:v1', 'backup:last:v1', 'settings:v1', 'reminders:v1', 'briefing:enabled:v1', 'briefing:waketime:v1'],
  };

  function randomId(prefix) {
    try { if (root.crypto && root.crypto.randomUUID) return prefix + root.crypto.randomUUID(); } catch (_) {}
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  function storageGet(storage, key) {
    try { return storage.getItem(key); } catch (_) { return null; }
  }
  function storageSet(storage, key, value) {
    try { storage.setItem(key, value); } catch (_) {}
  }
  function stableLocalId(storage, key, prefix) {
    var value = storageGet(storage, key);
    if (!value) { value = randomId(prefix); storageSet(storage, key, value); }
    return value;
  }
  function timezone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (_) { return 'UTC'; }
  }
  function parse(raw) {
    try { return JSON.parse(raw); } catch (_) { return raw; }
  }
  function iso(value) {
    var date = new Date(value || Date.now());
    return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }
  function localDate(value) {
    var text = String(value || '').replace(/\//g, '-').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : iso().slice(0, 10);
  }
  function number(value) {
    value = Number(value);
    return isFinite(value) && value >= 0 ? value : 0;
  }
  function mealPayload(row) {
    var micros = row && row.micros || {};
    return {
      name: String(row && row.name || 'Meal').slice(0, 120),
      ingredients: Array.isArray(row && row.ingredients) ? row.ingredients : [],
      portion: { amount: number(row && (row.amount || row.servingSize || 1)), unit: String(row && (row.unit || 'serving')) },
      calories: number(row && row.calories),
      protein_g: number(row && row.protein),
      carbs_g: number(row && row.carbs),
      fat_g: number(row && row.fat),
      fiber_g: number(row && (row.fiber != null ? row.fiber : micros.fiber)),
      sodium_mg: number(row && (row.sodium != null ? row.sodium : micros.sodium)),
      sugar_g: number(row && (row.sugar != null ? row.sugar : micros.sugar)),
      estimated_food_water_ml: number(row && row.estimated_food_water_ml),
      meal: row && row.meal || null,
    };
  }
  function confidenceFor(source) {
    if (source === 'barcode') return 0.98;
    if (source === 'ai_scan') return 0.65;
    return 0.9;
  }

  function create(options) {
    options = options || {};
    if (!Registry || !Events || !Repositories || !ProjectionEngine || !ProjectionDefinitions) throw new Error('Canonical runtime dependencies are unavailable');
    var storage = options.storage || root.localStorage;
    var storedOwner = stableLocalId(storage, OWNER_KEY, 'local-owner:');
    var authUser = root.LifeOSAuth && root.LifeOSAuth.user && root.LifeOSAuth.user();
    var userId = options.userId || authUser && authUser.id || storedOwner;
    var deviceId = options.deviceId || stableLocalId(storage, DEVICE_KEY, 'device:');
    var zone = options.timezone || timezone();
    var repository = options.repository || Repositories.create({
      userId: userId,
      deviceId: deviceId,
      timezone: zone,
      source: 'lifeos-ui',
      indexedDBOptions: options.indexedDBOptions,
    });
    var ownerClaim = userId !== storedOwner && /^local-owner:/.test(storedOwner) && repository.claimLocalOwner
      ? repository.claimLocalOwner(storedOwner).then(function (result) { storageSet(storage, OWNER_KEY, userId); return result; })
      : Promise.resolve({ claimed: 0 });
    ownerClaim.catch(function () {});
    var syncController = null;
    if (CanonicalSync && root.fetch) {
      try {
        syncController = CanonicalSync.create({
          repository: repository,
          auth: root.LifeOSAuth,
          transport: CanonicalSync.createSupabaseTransport({ url: SUPABASE_URL, key: SUPABASE_KEY, fetch: root.fetch.bind(root) }),
        });
      } catch (_) { syncController = null; }
    }
    var syncTimer = null;
    function syncEnabled() { return storageGet(storage, SYNC_ENABLED_KEY) === '1'; }
    function syncNow() {
      if (!syncEnabled()) return Promise.resolve({ status: 'blocked-owner-approval-required', pulled: 0, pushed: 0, conflicts: [] });
      if (!syncController) return Promise.resolve({ status: 'blocked-transport-unavailable', pulled: 0, pushed: 0, conflicts: [] });
      return ownerClaim.then(function () { return syncController.sync(); });
    }
    function scheduleSync() {
      if (!syncEnabled() || !syncController) return;
      clearTimeout(syncTimer); syncTimer = setTimeout(function () { syncNow().catch(function () {}); }, 750);
    }
    function syncStatus() {
      if (!syncController) return Promise.resolve({ enabled: syncEnabled(), authenticated: false, owner_match: false, online: root.navigator ? root.navigator.onLine !== false : true, pending: 0, conflicts: 0, state: 'transport-unavailable' });
      return syncController.status().then(function (status) { status.enabled = syncEnabled(); status.state = !status.enabled ? 'approval-required' : !status.authenticated ? 'authentication-required' : !status.owner_match ? 'owner-mismatch' : !status.online ? 'offline' : status.conflicts ? 'conflict' : status.pending ? 'pending' : 'current'; return status; });
    }
    function setSyncEnabled(enabled) {
      if (enabled) {
        var session = root.LifeOSAuth && root.LifeOSAuth.session && root.LifeOSAuth.session();
        if (!session || !session.user || session.user.id !== userId) return Promise.reject(new Error('Sign in as the canonical data owner before enabling cross-device sync'));
      }
      storageSet(storage, SYNC_ENABLED_KEY, enabled ? '1' : '0');
      return enabled ? syncNow() : Promise.resolve({ status: 'disabled' });
    }
    repository.subscribe(scheduleSync);
    if (root.addEventListener) root.addEventListener('online', scheduleSync);
    if (syncEnabled()) scheduleSync();

    function legacyEvent(key, domain) {
      var raw = storageGet(storage, key);
      if (raw == null) return null;
      var checksum = Events.hash(raw);
      return Events.create({
        type: domain + '.legacy.imported',
        source: 'legacy-compatibility',
        source_ref: 'compat:' + domain + ':' + key + ':' + checksum,
        payload: { legacy_key: key, raw_value: raw, parsed_value: parse(raw), format: 'json', checksum: checksum },
        confidence: 1,
        provenance: { provider: 'localStorage-compatibility', original_key: key },
      }, repository.context);
    }
    function compatibleEvents() {
      var result = [];
      Object.keys(LEGACY_COMPATIBILITY).forEach(function (domain) {
        LEGACY_COMPATIBILITY[domain].forEach(function (key) {
          var event = legacyEvent(key, domain);
          if (event) result.push(event);
        });
      });
      return result;
    }
    function matches(event, filters) {
      if (!filters) return true;
      if (filters.domain && event.domain !== filters.domain) return false;
      if (filters.type && event.type !== filters.type) return false;
      if (filters.source && event.source !== filters.source) return false;
      if (filters.sourceRef && event.source_ref !== filters.sourceRef) return false;
      if (filters.localDate && event.local_date !== filters.localDate) return false;
      return true;
    }
    var projectionRepository = {
      context: repository.context,
      get: repository.get,
      subscribe: repository.subscribe,
      query: function (filters) {
        return repository.query(filters).then(function (events) {
          return events.concat(compatibleEvents().filter(function (event) { return matches(event, filters); }));
        });
      },
    };
    var projections = ProjectionEngine.create({ repository: projectionRepository, definitions: ProjectionDefinitions.definitions });

    function eventInput(row, type, sourceRef, supersedesId) {
      var source = row.source || 'manual';
      return {
        type: type,
        domain: 'nutrition',
        occurred_at: iso(row.loggedAt || row.occurred_at),
        local_date: localDate(row.dateKey || row.local_date),
        source: source,
        source_ref: sourceRef,
        supersedes_id: supersedesId || null,
        payload: mealPayload(row),
        units: { energy: 'kcal', macros: 'g', sodium: 'mg', estimated_food_water: 'ml' },
        confidence: row.confidence == null ? confidenceFor(source) : Number(row.confidence),
        provenance: { capture: source, legacy_id: row.id == null ? null : String(row.id), interface: 'ui/log#food' },
      };
    }
    function appendMeal(row) {
      var ref = 'meal:' + String(row.id || randomId('meal_'));
      return repository.append(eventInput(row, 'nutrition.meal.logged', ref)).then(function (event) {
        return { event: event, canonical_event_id: event.id };
      });
    }
    function editMeal(row) {
      var targetId = row.canonical_event_id || (/^evt_/.test(String(row.id || '')) ? row.id : null);
      if (!targetId) {
        return repository.append(eventInput(row, 'nutrition.meal.edited', 'meal-edit:' + String(row.id || randomId('meal_')) + ':' + Events.hash(JSON.stringify(mealPayload(row))))).then(function (event) {
          return { event: event, canonical_event_id: event.id };
        });
      }
      return repository.replace(targetId, eventInput(row, 'nutrition.meal.edited', null, targetId)).then(function (event) {
        return { event: event, canonical_event_id: event.id };
      });
    }
    function deleteMeal(row) {
      var targetId = row && (row.canonical_event_id || (/^evt_/.test(String(row.id || '')) ? row.id : null));
      if (!targetId) return Promise.resolve({ event: null, target_event_id: null });
      return repository.rawQuery({ domain: 'nutrition' }).then(function (events) {
        var byId = {};
        events.forEach(function (event) { byId[event.id] = event; });
        var chain = [], cursor = byId[targetId];
        while (cursor && !cursor.deleted_at && chain.indexOf(cursor.id) < 0) {
          chain.push(cursor.id);
          cursor = cursor.supersedes_id ? byId[cursor.supersedes_id] : null;
        }
        return chain.reduce(function (promise, eventId) {
          return promise.then(function (deleted) {
            return repository.tombstone(eventId, 'user-deleted-meal', { source: 'lifeos-ui' }).then(function (event) { deleted.push(event); return deleted; });
          });
        }, Promise.resolve([]));
      }).then(function (events) {
        return { event: events[0] || null, events: events, target_event_id: targetId };
      });
    }
    function restoreMeal(row) {
      var restored = Object.assign({}, row, { loggedAt: Date.now(), source: row.source || 'manual' });
      return repository.append(eventInput(restored, 'nutrition.meal.logged', 'meal-restore:' + String(row.id || randomId('meal_')) + ':' + restored.loggedAt)).then(function (event) {
        return { event: event, canonical_event_id: event.id };
      });
    }
    function setNutritionTargets(targets) {
      var payload = {
        calories: number(targets.calories), protein_g: number(targets.protein), carbs_g: number(targets.carbs), fat_g: number(targets.fat),
        fiber_g: number(targets.fiber), sugar_g: number(targets.sugar),
      };
      return repository.append({
        type: 'nutrition.target.changed', domain: 'nutrition', source: 'manual',
        source_ref: 'nutrition-targets:' + Events.hash(JSON.stringify(payload)), payload: payload,
        units: { energy: 'kcal', macros: 'g' }, confidence: 1, provenance: { interface: 'ui/log#food' },
      });
    }
    function refresh(ids) {
      projections.invalidate(ids || NUTRITION_PROJECTIONS);
    }
    function nutritionDaily(date) {
      return projections.get('nutrition.daily', { date: localDate(date) });
    }
    function subscribeNutrition(callback, date) {
      return projections.subscribe(NUTRITION_PROJECTIONS, callback, { params: { date: localDate(date) } });
    }

    function input(domain, type, row, payload, units, sourceRef, supersedesId, interfaceName) {
      row = row || {};
      return {
        type: type,
        domain: domain,
        occurred_at: iso(row.occurred_at || row.loggedAt || (row.date || row.dateKey ? localDate(row.date || row.dateKey) + 'T12:00:00' : null)),
        local_date: localDate(row.date || row.dateKey || row.local_date),
        source: row.source || 'manual',
        source_ref: sourceRef || null,
        supersedes_id: supersedesId || null,
        payload: payload,
        units: units || {},
        confidence: row.confidence == null ? 0.95 : Number(row.confidence),
        provenance: {
          capture: row.source || 'manual',
          legacy_id: row.id == null ? null : String(row.id),
          interface: interfaceName || 'ui/log',
        },
      };
    }
    function latestEffective(type, date) {
      return repository.query({ type: type, localDate: localDate(date) }).then(function (rows) {
        return rows.sort(function (a, b) { return String(a.recorded_at).localeCompare(String(b.recorded_at)); }).pop() || null;
      });
    }
    function upsertDate(type, date, makeInput) {
      return latestEffective(type, date).then(function (target) {
        var eventInput = makeInput(target && target.id);
        return target ? repository.replace(target.id, eventInput) : repository.append(eventInput);
      }).then(function (event) { return { event: event, canonical_event_id: event.id }; });
    }
    function tombstoneChain(targetId, reason) {
      if (!targetId) return Promise.resolve({ event: null, events: [], target_event_id: null });
      return repository.rawQuery().then(function (rows) {
        var byId = {};
        rows.forEach(function (event) { byId[event.id] = event; });
        var chain = [], cursor = byId[targetId];
        while (cursor && !cursor.deleted_at && chain.indexOf(cursor.id) < 0) {
          chain.push(cursor.id);
          cursor = cursor.supersedes_id ? byId[cursor.supersedes_id] : null;
        }
        return chain.reduce(function (promise, eventId) {
          return promise.then(function (deleted) {
            return repository.tombstone(eventId, reason || 'user-deleted-entry', { source: 'lifeos-ui' }).then(function (event) { deleted.push(event); return deleted; });
          });
        }, Promise.resolve([]));
      }).then(function (events) { return { event: events[0] || null, events: events, target_event_id: targetId }; });
    }
    function saveRevision(targetId, eventInput) {
      return (targetId ? repository.replace(targetId, eventInput) : repository.append(eventInput)).then(function (event) {
        return { event: event, canonical_event_id: event.id };
      });
    }
    function saveBodyMeasurement(row) {
      row = row || {};
      var date = localDate(row.date || row.dateKey);
      var operations = [];
      if (number(row.weight) > 0) operations.push(upsertDate('body.weight.logged', date, function (targetId) {
        return input('body', 'body.weight.logged', row, { weight_kg: number(row.weight) }, { weight: 'kg' }, targetId ? null : 'body-weight:' + date, targetId, 'ui/log#body');
      }));
      if (number(row.bf) > 0 || number(row.lean_mass_kg) > 0) operations.push(upsertDate('body.composition.logged', date, function (targetId) {
        var payload = {};
        if (number(row.bf) > 0) payload.body_fat_pct = number(row.bf);
        if (number(row.lean_mass_kg) > 0) payload.lean_mass_kg = number(row.lean_mass_kg);
        return input('body', 'body.composition.logged', row, payload, { body_fat: 'percent', lean_mass: 'kg' }, targetId ? null : 'body-composition:' + date, targetId, 'ui/log#body');
      }));
      var measurements = row.measurements_cm || {};
      if (Object.keys(measurements).length) operations.push(upsertDate('body.measurement.logged', date, function (targetId) {
        return input('body', 'body.measurement.logged', row, { measurements_cm: measurements }, { measurements: 'cm' }, targetId ? null : 'body-measurements:' + date, targetId, 'ui/log#body');
      }));
      return Promise.all(operations).then(function (results) {
        return { results: results, canonical_event_ids: results.map(function (result) { return result.canonical_event_id; }) };
      });
    }
    function saveSleep(row) {
      var date = localDate(row && row.date);
      return upsertDate('sleep.night.logged', date, function (targetId) {
        return input('sleep', 'sleep.night.logged', row, { duration_minutes: number(row.duration || row.duration_minutes), score: row.score == null ? null : number(row.score) }, { duration: 'minutes' }, targetId ? null : 'sleep-night:' + date, targetId, 'ui/log#body-recovery');
      });
    }
    function setBodyGoals(goals) {
      goals = goals || {};
      return projections.get('profile.current', { date: localDate() }).then(function (envelope) {
        var settings = Object.assign({}, envelope && envelope.value && envelope.value.settings || {});
        if (number(goals.weight) > 0) settings.target_weight_kg = number(goals.weight); else delete settings.target_weight_kg;
        if (number(goals.bf) > 0) settings.target_body_fat_pct = number(goals.bf); else delete settings.target_body_fat_pct;
        settings.body_measurement_goals_cm = Object.assign({}, goals.measurements_cm || {});
        return repository.append({
          type: 'profile.settings.changed', domain: 'profile', source: 'manual',
          source_ref: 'body-goals:' + Events.hash(JSON.stringify(settings)), payload: settings,
          units: { weight: 'kg', body_fat: 'percent', measurements: 'cm' }, confidence: 1,
          provenance: { interface: 'ui/log#body-goals' },
        });
      });
    }
    function startTrainingSession(row) {
      row = row || {};
      var sessionId = String(row.session_id || row.id || randomId('session_'));
      return repository.append(input('training', 'training.session.started', row, {
        session_id: sessionId, program: row.program || null, workout: row.workout || null,
      }, {}, 'training-start:' + sessionId, null, 'ui/log#training')).then(function (event) {
        return { event: event, canonical_event_id: event.id, session_id: sessionId };
      });
    }
    function logTrainingSet(row) {
      row = row || {};
      var setId = String(row.id || randomId('set_'));
      return repository.append(input('training', 'training.set.logged', row, {
        session_id: String(row.session_id), exercise: String(row.exercise || row.exercise_name || 'Exercise'), exercise_id: row.exercise_id || null,
        load_kg: number(row.load_kg != null ? row.load_kg : row.weight), reps: number(row.reps), rpe: row.rpe == null ? null : number(row.rpe), set_id: setId,
      }, { load: 'kg', reps: 'count', rpe: '0-10' }, 'training-set:' + setId, null, 'ui/log#training')).then(function (event) {
        return { event: event, canonical_event_id: event.id, set_id: setId };
      });
    }
    function completeTrainingSession(row) {
      row = row || {};
      var sessionId = String(row.session_id || row.id);
      var targetId = row.canonical_event_id || null;
      return saveRevision(targetId, input('training', 'training.session.completed', row, {
        session_id: sessionId, duration_seconds: number(row.duration_seconds), notes: row.notes || null,
        sets: number(row.sets), volume_kg: number(row.volume_kg),
      }, { duration: 'seconds', volume: 'kg' }, targetId ? null : 'training-complete:' + sessionId, targetId, 'ui/log#training'));
    }
    function saveCardio(row) {
      row = row || {};
      var date = localDate(row.date);
      var refId = String(row.id || randomId('cardio_'));
      var targetId = row.canonical_event_id || null;
      return saveRevision(targetId, input('training', 'training.cardio.logged', row, {
        activity: String(row.type || row.activity || 'Cardio'), duration_seconds: number(row.duration_seconds != null ? row.duration_seconds : number(row.duration) * 60),
        distance_km: number(row.distance_km != null ? row.distance_km : row.distance), avg_hr_bpm: number(row.avg_hr_bpm != null ? row.avg_hr_bpm : row.hr), notes: row.notes || null,
      }, { duration: 'seconds', distance: 'km', heart_rate: 'bpm' }, targetId ? null : 'training-cardio:' + refId, targetId, 'ui/log#training-cardio'));
    }
    function saveLabPanel(row) {
      row = row || {};
      var date = localDate(row.date);
      return upsertDate('labs.panel.logged', date, function (targetId) {
        return input('labs', 'labs.panel.logged', row, { markers: row.markers || {}, phase: row.phase || 'normal', provider: row.provider || null, collection_conditions: row.collection_conditions || row.conditions || {} }, { markers: 'source-units' }, targetId ? null : 'labs-panel:' + date, targetId, 'ui/log#body-labs');
      });
    }
    function recordLabOutlook(outlook) {
      outlook = outlook || {};
      var model = outlook.model || {};
      var baseline = outlook.baseline || {};
      if (!baseline.panel_id || !baseline.date) return Promise.reject(new Error('A measured baseline panel is required'));
      var snapshotId = randomId('lab_outlook_');
      return repository.append(input('labs', 'labs.outlook.recorded', { date: baseline.date }, {
        snapshot_id: snapshotId,
        model_id: model.id,
        model_version: model.version,
        baseline_panel_id: baseline.panel_id,
        baseline_date: baseline.date,
        horizon: outlook.horizon || { min_days: 30, max_days: 90 },
        directions: (outlook.directions || []).map(function (item) { return { key: item.key, direction: item.direction, statement: item.statement }; }),
        confidence: outlook.confidence || null,
        comparability: outlook.comparability || null,
        numeric_predictions_enabled: false,
      }, {}, 'labs-outlook:' + snapshotId, null, 'ui/log#body-labs-outlook')).then(function (event) {
        return { event: event, canonical_event_id: event.id, snapshot_id: snapshotId };
      });
    }
    function addBodyPhoto(row) {
      row = row || {};
      var photoId = String(row.photo_id || row.id || randomId('photo_'));
      return repository.append(input('body', 'body.photo.added', row, {
        photo_id: photoId, storage_id: row.storage_id || photoId, angle: row.angle || 'front', flexed: !!row.flexed,
        weight_kg: row.weightKg == null ? null : number(row.weightKg), mime: row.mime || null, context: 'body', kind: 'body',
      }, { weight: 'kg' }, 'body-photo:' + photoId, null, 'ui/log#body-photos')).then(function (event) {
        return { event: event, canonical_event_id: event.id, photo_id: photoId };
      });
    }
    function hydrationUnitMl(state) {
      state = state || {};
      if (state.unit === 'glass') return number(state.glassMl) || 250;
      if (state.unit === 'oz') return 30;
      if (state.unit === 'ml') return 1;
      return number(state.bottleMl) || 500;
    }
    function legacyHydrationRows(state) {
      state = state || {};
      var rows = [];
      var unitMl = hydrationUnitMl(state);
      var entries = Array.isArray(state.entries) ? state.entries : [];
      entries.forEach(function (entry, index) {
        var amount = number(entry.amount_ml != null ? entry.amount_ml : entry.amountMl != null ? entry.amountMl : entry.ml);
        if (!amount) return;
        var date = localDate(entry.date || entry.local_date);
        rows.push({
          id: entry.id || 'entry-' + index,
          date: date,
          occurred_at: entry.occurred_at || entry.time || date + 'T12:00:00',
          amount_ml: amount,
          beverage_type: entry.beverage_type || entry.type || 'water',
          source: entry.source || 'legacy-import',
        });
      });
      if (!entries.length) {
        Object.keys(state.logs || {}).sort().forEach(function (date) {
          var amount = number(state.logs[date]) * unitMl;
          if (amount) rows.push({ id: 'daily-' + date, date: localDate(date), occurred_at: localDate(date) + 'T12:00:00', amount_ml: amount, beverage_type: 'water', source: 'legacy-import' });
        });
      }
      return rows;
    }
    function bridgeHydrationLegacy(state, force) {
      state = state || parse(storageGet(storage, 'po_water_v1')) || {};
      var rows = legacyHydrationRows(state);
      var importBatch = force ? randomId('import_') : '';
      return repository.rawQuery({ domain: 'hydration' }).then(function (existing) {
        var refs = {};
        existing.forEach(function (event) { if (event.source_ref) refs[event.source_ref] = true; });
        if (!force && existing.some(function (event) { return event.type === 'hydration.intake.logged' || event.type === 'hydration.intake.edited'; })) return [];
        return rows.reduce(function (promise, row) {
          return promise.then(function (created) {
            var ref = 'hydration-legacy:' + (force ? importBatch + ':' : '') + row.id + ':' + Events.hash([row.date, row.amount_ml, row.occurred_at].join('|'));
            if (!force && refs[ref]) return created;
            return repository.append(input('hydration', 'hydration.intake.logged', row, {
              amount_ml: row.amount_ml,
              beverage_type: row.beverage_type,
              original_amount: row.amount_ml,
              original_unit: 'ml',
              source_kind: 'legacy-bridge',
            }, { amount: 'ml' }, ref, null, 'ui/log#water-legacy-bridge')).then(function (event) {
              created.push(event); return created;
            });
          });
        }, Promise.resolve([]));
      });
    }
    function logHydration(row) {
      row = row || {};
      var amountMl = number(row.amount_ml != null ? row.amount_ml : row.amount);
      var date = localDate(row.date || row.local_date);
      if (!amountMl) return Promise.reject(new Error('Hydration amount must be greater than zero'));
      return bridgeHydrationLegacy().then(function () {
        return repository.query({ type: 'hydration.intake.logged', localDate: date });
      }).then(function (existing) {
        var at = new Date(row.occurred_at || row.loggedAt || Date.now()).getTime();
        var duplicate = existing.find(function (event) {
          var sameRef = row.source_ref && event.source_ref === row.source_ref;
          var crossSourceMatch = row.source && row.source !== 'manual' && event.source !== row.source &&
            payloadAmount(event) === amountMl && Math.abs(new Date(event.occurred_at).getTime() - at) <= 5 * 60 * 1000;
          return sameRef || crossSourceMatch;
        });
        if (duplicate) return { event: duplicate, canonical_event_id: duplicate.id, duplicate: true };
        var entryId = String(row.id || randomId('water_'));
        return repository.append(input('hydration', 'hydration.intake.logged', row, {
          amount_ml: amountMl,
          beverage_type: row.beverage_type || 'water',
          original_amount: number(row.original_amount != null ? row.original_amount : amountMl),
          original_unit: row.original_unit || 'ml',
          source_kind: row.source_kind || (row.source && row.source !== 'manual' ? 'device-import' : 'explicit-drink'),
          note: row.note || null,
        }, { amount: 'ml' }, row.source_ref || 'hydration-entry:' + entryId, null, 'ui/log#water')).then(function (event) {
          return { event: event, canonical_event_id: event.id, duplicate: false };
        });
      });
    }
    function payloadAmount(event) { return number(event && event.payload && event.payload.amount_ml); }
    function editHydration(row) {
      row = row || {};
      var targetId = row.canonical_event_id || row.event_id || null;
      var amountMl = number(row.amount_ml != null ? row.amount_ml : row.amount);
      if (!targetId || !amountMl) return Promise.reject(new Error('A hydration event and positive amount are required'));
      return saveRevision(targetId, input('hydration', 'hydration.intake.edited', row, {
        amount_ml: amountMl,
        beverage_type: row.beverage_type || 'water',
        original_amount: number(row.original_amount != null ? row.original_amount : amountMl),
        original_unit: row.original_unit || 'ml',
        source_kind: row.source_kind || 'explicit-drink',
        note: row.note || null,
      }, { amount: 'ml' }, null, targetId, 'ui/log#water'));
    }
    function setHydrationTarget(row) {
      row = row || {};
      var payload = {
        target_ml: number(row.target_ml),
        healthy_zone_low_ml: number(row.healthy_zone_low_ml),
        healthy_zone_high_ml: number(row.healthy_zone_high_ml),
        components: row.components || {},
        formula_version: row.formula_version || 'hydration-target-v1',
        assumptions: Array.isArray(row.assumptions) ? row.assumptions : [],
      };
      if (!payload.target_ml) return Promise.reject(new Error('Hydration target must be greater than zero'));
      return repository.append(input('hydration', 'hydration.target.changed', row, payload, { target: 'ml/day' }, 'hydration-target:' + Events.hash(JSON.stringify(payload)), null, 'ui/log#water-target')).then(function (event) {
        return { event: event, canonical_event_id: event.id };
      });
    }
    function saveHydrationSettings(row) {
      row = row || {};
      return projections.get('profile.current', { date: localDate() }).then(function (envelope) {
        var settings = Object.assign({}, envelope && envelope.value && envelope.value.settings || {}, {
          hydration: Object.assign({}, row.profile || {}, row.display || {}),
        });
        return repository.append({
          type: 'profile.settings.changed', domain: 'profile', source: 'manual',
          source_ref: 'hydration-settings:' + Events.hash(JSON.stringify(settings)), payload: settings,
          units: { weight: row.profile && row.profile.weight_unit || 'kg', volume: 'ml' }, confidence: 1,
          provenance: { interface: 'ui/log#water-settings' },
        });
      }).then(function (profileEvent) {
        var targetInput = Object.assign({}, row.target || row);
        if (!targetInput.date && row.date) targetInput.date = row.date;
        if (!targetInput.occurred_at && row.occurred_at) targetInput.occurred_at = row.occurred_at;
        if (!targetInput.timezone && row.timezone) targetInput.timezone = row.timezone;
        return setHydrationTarget(targetInput).then(function (targetResult) {
          return { profile_event: profileEvent, target_event: targetResult.event, canonical_event_ids: [profileEvent.id, targetResult.event.id] };
        });
      });
    }
    function clearHydration() {
      return repository.query({ domain: 'hydration' }).then(function (rows) {
        return rows.reduce(function (promise, event) {
          return promise.then(function (deleted) {
            return tombstoneChain(event.id, 'user-reset-hydration').then(function (result) { return deleted.concat(result.events); });
          });
        }, Promise.resolve([]));
      }).then(function (events) { return { events: events }; });
    }
    function replaceHydrationFromLegacy(state) {
      return clearHydration().then(function () { return bridgeHydrationLegacy(state, true); });
    }
    function checkInEnergy(row) {
      row = row || {};
      var value = number(row.value);
      if (value < 1 || value > 5) return Promise.reject(new Error('Energy must be between 1 and 5'));
      var checkinId = String(row.id || randomId('energy_'));
      return repository.append(input('energy', 'recovery.energy.checkin', row, {
        value: value,
        context: row.context || null,
        note: row.note || null,
      }, { value: '1-5' }, row.source_ref || 'energy-checkin:' + checkinId, null, 'ui/energy-checkin')).then(function (event) {
        return { event: event, canonical_event_id: event.id };
      });
    }
    function doseParts(value) {
      var text = String(value == null ? '' : value).trim();
      var match = text.match(/^([0-9]+(?:\.[0-9]+)?)\s*(.*)$/);
      return { amount: match ? number(match[1]) : 0, unit: match && match[2] ? match[2].trim() : null, label: text };
    }
    function effectiveByPayload(type, key, value) {
      return repository.query({ type: type }).then(function (rows) {
        return rows.filter(function (event) { return String(event.payload && event.payload[key]) === String(value); })
          .sort(function (a, b) { return String(a.recorded_at).localeCompare(String(b.recorded_at)); }).pop() || null;
      });
    }
    function saveSupplementCompound(row) {
      row = row || {};
      var compoundId = String(row.compound_id || row.id || randomId('supp_'));
      var dose = doseParts(row.dose);
      var payload = {
        compound_id: compoundId, compound: compoundId, name: String(row.name || '').trim(), dose: dose.label,
        dose_amount: dose.amount, dose_unit: dose.unit, window: row.window || 'anytime', time: row.time || null,
        frequency: row.frequency || 'Daily', category: row.category || 'Supplement', route: row.route || 'Oral',
        note: row.note || null, ordered: row.ordered !== false,
      };
      if (!payload.name) return Promise.reject(new Error('Compound name is required'));
      return effectiveByPayload('supplement.compound.changed', 'compound_id', compoundId).then(function (existing) {
        var targetId = row.canonical_event_id || existing && existing.id || null;
        return saveRevision(targetId, input('supplements', 'supplement.compound.changed', row, payload, { dose: dose.unit || 'source-unit' }, targetId ? null : 'supplement-compound:' + compoundId, targetId, 'ui/log#supplements-compounds'));
      });
    }
    function saveSupplementInventory(row) {
      row = row || {};
      var itemId = String(row.item_id || row.compound_id || row.id || '');
      if (!itemId) return Promise.reject(new Error('Inventory item is required'));
      var payload = {
        item_id: itemId, compound: itemId, remaining: number(row.remaining != null ? row.remaining : row.stock),
        unit: row.unit || row.stockUnit || null, reorder_at: number(row.reorder_at != null ? row.reorder_at : row.reorderAt),
        expiry: row.expiry || null, low_stock: !!row.low_stock,
      };
      return effectiveByPayload('supplement.inventory.changed', 'item_id', itemId).then(function (existing) {
        var targetId = row.inventory_canonical_event_id || existing && existing.id || null;
        return saveRevision(targetId, input('supplements', 'supplement.inventory.changed', row, payload, { remaining: payload.unit || 'source-unit' }, targetId ? null : 'supplement-inventory:' + itemId, targetId, 'ui/log#supplements-inventory'));
      });
    }
    function setSupplementDose(row) {
      row = row || {};
      var compoundId = String(row.compound_id || row.id || row.compound || '');
      var date = localDate(row.date || row.local_date);
      if (!compoundId) return Promise.reject(new Error('Compound is required'));
      return repository.query({ type: 'supplement.dose.logged', localDate: date }).then(function (rows) {
        var existing = rows.find(function (event) { return String(event.payload.compound_id || event.payload.compound) === compoundId; });
        if (row.taken === false) {
          var removedDose = doseParts(row.dose);
          return saveRevision(existing && existing.id, input('supplements', 'supplement.dose.logged', row, {
            compound: compoundId, compound_id: compoundId, name: row.name || null, amount: removedDose.amount,
            unit: removedDose.unit, dose: removedDose.label, scheduled_time: row.time || null, window: row.window || null, taken: false,
          }, { amount: removedDose.unit || 'source-unit' }, existing ? null : 'supplement-dose-state:' + date + ':' + compoundId, existing && existing.id, 'ui/log#supplements-overview'));
        }
        var dose = doseParts(row.dose);
        if (existing && existing.payload.taken !== false) return { event: existing, canonical_event_id: existing.id, duplicate: true };
        return (existing ? repository.replace(existing.id, input('supplements', 'supplement.dose.logged', row, {
          compound: compoundId, compound_id: compoundId, name: row.name || null, amount: dose.amount,
          unit: dose.unit, dose: dose.label, scheduled_time: row.time || null, window: row.window || null, taken: true,
        }, { amount: dose.unit || 'source-unit' }, null, existing.id, 'ui/log#supplements-overview')) : repository.append(input('supplements', 'supplement.dose.logged', row, {
          compound: compoundId, compound_id: compoundId, name: row.name || null, amount: dose.amount,
          unit: dose.unit, dose: dose.label, scheduled_time: row.time || null, window: row.window || null, taken: true,
        }, { amount: dose.unit || 'source-unit' }, row.source_ref || 'supplement-dose:' + date + ':' + compoundId, null, 'ui/log#supplements-overview'))).then(function (event) {
          return { event: event, canonical_event_id: event.id, duplicate: false };
        });
      });
    }
    function saveSupplementNote(row) {
      row = row || {};
      var noteId = String(row.note_id || row.id || randomId('supp_note_'));
      var payload = { note_id: noteId, text: String(row.text || '').trim(), tag: row.tag || 'General' };
      if (!payload.text) return Promise.reject(new Error('Note text is required'));
      return effectiveByPayload('supplement.note.logged', 'note_id', noteId).then(function (existing) {
        var targetId = row.canonical_event_id || existing && existing.id || null;
        return saveRevision(targetId, input('supplements', 'supplement.note.logged', row, payload, {}, targetId ? null : 'supplement-note:' + noteId, targetId, 'ui/log#supplements-notes'));
      });
    }
    function saveSkinCheckin(row) {
      row = row || {};
      var checkinId = String(row.checkin_id || row.id || randomId('skin_check_'));
      var payload = {
        checkin_id: checkinId, rating: number(row.rating), concerns: Array.isArray(row.concerns) ? row.concerns : [],
        treatments: row.treatments || null, water_l: row.water == null ? null : number(row.water),
        sleep_hours: row.sleep == null ? null : number(row.sleep), notes: row.notes || null,
        has_photo: !!row.photo, photo_id: row.photo_id || (row.photo ? 'skin-photo-' + checkinId : null),
        breakouts: row.breakouts == null ? 0 : number(row.breakouts), redness: row.redness == null ? 0 : number(row.redness),
        dryness: row.dryness == null ? 0 : number(row.dryness), irritation: row.irritation == null ? 0 : number(row.irritation),
        sensitivity: row.sensitivity == null ? 0 : number(row.sensitivity),
      };
      return effectiveByPayload('skin.checkin.logged', 'checkin_id', checkinId).then(function (existing) {
        var targetId = row.canonical_event_id || existing && existing.id || null;
        return saveRevision(targetId, input('skin', 'skin.checkin.logged', row, payload, { rating: '1-5', severity: '0-10', water: 'L', sleep: 'hours' }, targetId ? null : 'skin-checkin:' + checkinId, targetId, 'ui/log#skin-checkin'));
      }).then(function (result) {
        if (!row.photo || row.photo_canonical_event_id) return result;
        return addSkinPhoto({ id: payload.photo_id, photo_id: payload.photo_id, date: row.date, occurred_at: row.occurred_at, checkin_id: checkinId, mime: row.photo_mime || null }).then(function (photoResult) {
          result.photo_event = photoResult.event; result.photo_canonical_event_id = photoResult.canonical_event_id; return result;
        });
      });
    }
    function restoreSkinCheckin(row) {
      row = Object.assign({}, row || {});
      delete row.canonical_event_id; delete row.photo_canonical_event_id;
      row.checkin_id = String(row.id || randomId('skin_check_')) + ':restore:' + Date.now();
      return saveSkinCheckin(row);
    }
    function saveSkinProduct(row) {
      row = row || {};
      var productId = String(row.product_id || row.id || randomId('skin_product_'));
      var payload = {
        product_id: productId, name: String(row.name || '').trim(), brand: row.brand || null, product_type: row.type || 'other',
        time: row.time || 'both', frequency: row.freq || row.frequency || 'daily', concern: row.concern || null,
        notes: row.notes || null, active: row.active !== false,
      };
      if (!payload.name) return Promise.reject(new Error('Product name is required'));
      return effectiveByPayload('skin.product.changed', 'product_id', productId).then(function (existing) {
        var targetId = row.canonical_event_id || existing && existing.id || null;
        return saveRevision(targetId, input('skin', 'skin.product.changed', row, payload, {}, targetId ? null : 'skin-product:' + productId, targetId, 'ui/log#skin-products'));
      });
    }
    function setSkinRoutineStep(row) {
      row = row || {};
      var productId = String(row.product_id || row.id || '');
      var date = localDate(row.date || row.local_date);
      if (!productId) return Promise.reject(new Error('Routine product is required'));
      return repository.query({ type: 'skin.routine.logged', localDate: date }).then(function (rows) {
        var existing = rows.find(function (event) { return String(event.payload.product_id) === productId; });
        if (row.completed === false) return saveRevision(existing && existing.id, input('skin', 'skin.routine.logged', row, {
          product_id: productId, completed: false, time: row.time || null, product_name: row.name || null,
        }, {}, existing ? null : 'skin-routine-state:' + date + ':' + productId, existing && existing.id, 'ui/log#skin-routine'));
        if (existing && existing.payload.completed !== false) return { event: existing, canonical_event_id: existing.id, duplicate: true };
        return (existing ? repository.replace(existing.id, input('skin', 'skin.routine.logged', row, {
          product_id: productId, completed: true, time: row.time || null, product_name: row.name || null,
        }, {}, null, existing.id, 'ui/log#skin-routine')) : repository.append(input('skin', 'skin.routine.logged', row, {
          product_id: productId, completed: true, time: row.time || null, product_name: row.name || null,
        }, {}, 'skin-routine:' + date + ':' + productId, null, 'ui/log#skin-routine'))).then(function (event) {
          return { event: event, canonical_event_id: event.id, duplicate: false };
        });
      });
    }
    function addSkinPhoto(row) {
      row = row || {};
      var photoId = String(row.photo_id || row.id || randomId('skin_photo_'));
      return repository.append(input('skin', 'skin.photo.added', row, {
        photo_id: photoId, checkin_id: row.checkin_id || null, storage_id: row.storage_id || photoId,
        angle: row.angle || 'front', mime: row.mime || null, context: 'skin', kind: 'skin',
      }, {}, 'skin-photo:' + photoId, null, 'ui/log#skin-photos')).then(function (event) {
        return { event: event, canonical_event_id: event.id, photo_id: photoId };
      });
    }
    function saveSkinSupport(type, idKey, prefix, row, payload) {
      var id = String(row[idKey] || row.id || randomId(prefix + '_'));
      payload[idKey] = id;
      return effectiveByPayload(type, idKey, id).then(function (existing) {
        var targetId = row.canonical_event_id || existing && existing.id || null;
        return saveRevision(targetId, input('skin', type, row, payload, {}, targetId ? null : prefix + ':' + id, targetId, 'ui/log#skin-lab'));
      });
    }
    function saveSkinBreakout(row) { row = row || {}; return saveSkinSupport('skin.breakout.logged', 'breakout_id', 'skin-breakout', row, { locations: row.locations || [], breakout_type: row.type || null, trigger: row.trigger || null, notes: row.notes || null }); }
    function saveSkinTreatment(row) { row = row || {}; return saveSkinSupport('skin.treatment.logged', 'treatment_id', 'skin-treatment', row, { treatment_type: row.type || row.treatment_type || 'other', notes: row.notes || null }); }
    function saveSkinIngredient(row) { row = row || {}; var name = String(row.name || row.text || '').trim(); if (!name) return Promise.reject(new Error('Ingredient is required')); return saveSkinSupport('skin.ingredient.changed', 'ingredient_id', 'skin-ingredient', row, { name: name, status: row.status || 'watch' }); }
    function saveSkinGoal(row) { row = row || {}; var text = String(row.text || '').trim(); if (!text) return Promise.reject(new Error('Goal is required')); return saveSkinSupport('skin.goal.changed', 'goal_id', 'skin-goal', row, { text: text, done: !!row.done }); }
    function saveFinanceTransaction(row) {
      row = row || {};
      var amountMinor = row.amount_minor != null ? Math.round(Number(row.amount_minor) || 0) : Math.round((Number(row.amount) || 0) * 100);
      var imported = !!(row.imported || row.provider_record_id || row.source === 'legacy-bridge' || row.source === 'bank-import');
      var id = String(row.transaction_id || (imported && row.provider_record_id) || row.id || randomId('finance-tx:'));
      var providerId = String(row.provider_record_id || id);
      var payload = {
        transaction_id: id,
        amount_minor: amountMinor,
        currency: String(row.currency || 'EUR').toUpperCase(),
        description: String(row.description || row.name || row.client || 'Transaction').slice(0, 160),
        category: row.category || null,
        account_id: row.account_id || null,
        provider: row.provider || (imported ? 'legacy-store' : 'manual'),
        provider_record_id: providerId,
        business: !!row.business,
        scope: row.scope || (row.business ? 'business' : 'personal'),
        reconciled: row.reconciled !== false,
        original_amount: row.original_amount == null ? Number(row.amount != null ? row.amount : amountMinor / 100) : Number(row.original_amount),
        original_currency: row.original_currency || row.currency || 'EUR',
      };
      var type = imported ? 'finance.transaction.imported' : 'finance.transaction.logged';
      var sourceRef = imported ? 'finance-import:' + payload.provider + ':' + providerId : 'finance-manual:' + id;
      var sourceRow = Object.assign({}, row, { source: row.source || (imported ? 'provider-import' : 'manual') });
      return saveRevision(row.canonical_event_id, input('finance', type, sourceRow, payload, { amount: 'minor', currency: payload.currency }, sourceRef, row.canonical_event_id, 'ui/money'));
    }
    function saveFinanceAccount(row) {
      row = row || {};
      var id = String(row.account_id || row.id || row.name || randomId('finance-account:'));
      var balanceMinor = row.balance_minor != null ? Math.round(Number(row.balance_minor) || 0) : Math.round((Number(row.balance != null ? row.balance : row.amount) || 0) * 100);
      var payload = { account_id: id, name: row.name || id, type: row.type || 'other', balance_minor: balanceMinor, currency: String(row.currency || 'EUR').toUpperCase(), liability: !!row.liability, institution: row.institution || null, source_kind: row.source_kind || 'manual' };
      return saveRevision(row.canonical_event_id, input('finance', 'finance.account.changed', row, payload, { balance: 'minor', currency: payload.currency }, 'finance-account:' + id, row.canonical_event_id, 'ui/money'));
    }
    function bridgeFinanceLegacy() {
      var transactions = parse(storageGet(storage, 'ing:tx')) || [];
      var accounts = parse(storageGet(storage, 'fin:accounts:v1')) || [];
      var categories = [['nw:bank', 'cash'], ['nw:stocks', 'investment'], ['nw:crypto', 'crypto'], ['nw:other', 'other']];
      var revenue = parse(storageGet(storage, 'gl:revenue')) || [];
      var expenses = parse(storageGet(storage, 'gl:expenses')) || [];
      return repository.query({ domain: 'finance' }).then(function (existing) {
        var txIds = {}, accountIds = {};
        existing.forEach(function (event) { var p = event.payload || {}; if (/^finance\.transaction\./.test(event.type)) txIds[String(p.provider_record_id || p.transaction_id || '')] = true; if (event.type === 'finance.account.changed') accountIds[String(p.account_id || '')] = true; });
        var work = [];
        transactions.forEach(function (row, index) { var id = String(row.provider_record_id || row.id || (String(row.date || '') + ':' + String(row.description || '') + ':' + String(row.amount || '') + ':' + index)); if (!txIds[id]) work.push(saveFinanceTransaction(Object.assign({}, row, { id: id, provider_record_id: id, imported: true, source: 'legacy-bridge' }))); });
        accounts.forEach(function (row, index) { var id = String(row.id || row.name || index); if (!accountIds[id]) work.push(saveFinanceAccount(Object.assign({}, row, { id: id, account_id: id, source: 'legacy-bridge', source_kind: 'legacy-account' }))); });
        categories.forEach(function (pair) { (parse(storageGet(storage, pair[0])) || []).forEach(function (row, index) { var id = pair[0] + ':' + String(row.id || row.name || index); if (!accountIds[id]) work.push(saveFinanceAccount({ id: id, account_id: id, name: row.name || pair[1], type: pair[1], amount: row.amount, currency: row.currency || 'EUR', source: 'legacy-bridge', source_kind: pair[0] })); }); });
        revenue.forEach(function (row, index) { var id = 'gl-revenue:' + String(row.id || index); if (!txIds[id]) work.push(saveFinanceTransaction(Object.assign({}, row, { id: id, provider_record_id: id, amount: Math.abs(Number(row.amount) || 0), business: true, scope: 'business', category: row.category || 'Revenue', imported: true, source: 'legacy-bridge' }))); });
        expenses.forEach(function (row, index) { var id = 'gl-expense:' + String(row.id || index); if (!txIds[id]) work.push(saveFinanceTransaction(Object.assign({}, row, { id: id, provider_record_id: id, amount: -Math.abs(Number(row.amount) || 0), business: true, scope: 'business', category: row.category || 'Business expense', imported: true, source: 'legacy-bridge' }))); });
        return Promise.all(work);
      });
    }
    function bridgeSupplementsLegacy(date) {
      date = localDate(date);
      var items = parse(storageGet(storage, 'stack:items')) || [];
      var low = parse(storageGet(storage, 'stack:low')) || [];
      var taken = parse(storageGet(storage, 'stack:taken:' + date)) || {};
      var notes = parse(storageGet(storage, 'supps:notes:v1')) || [];
      return repository.query({ domain: 'supplements' }).then(function (existing) {
        var keys = {};
        existing.forEach(function (event) {
          var p = event.payload || {};
          keys[event.type + ':' + String(p.compound_id || p.item_id || p.note_id || p.compound || '')] = true;
        });
        var work = [];
        items.forEach(function (item, index) {
          var id = String(item.id || item.name || index);
          if (!keys['supplement.compound.changed:' + id]) work.push(saveSupplementCompound(Object.assign({}, item, { id: id, source: 'legacy-bridge' })));
          if ((item.stock != null || item.reorderAt != null || item.expiry || low.some(function (lowId) { return String(lowId) === id; })) && !keys['supplement.inventory.changed:' + id]) work.push(saveSupplementInventory(Object.assign({}, item, { id: id, low_stock: low.some(function (lowId) { return String(lowId) === id; }), source: 'legacy-bridge' })));
          if (taken[id] && !existing.some(function (event) { return event.type === 'supplement.dose.logged' && event.local_date === date && String(event.payload.compound_id || event.payload.compound) === id; })) work.push(setSupplementDose(Object.assign({}, item, { id: id, date: date, taken: true, source: 'legacy-bridge' })));
        });
        notes.forEach(function (note, index) {
          var id = String(note.id || index);
          if (!keys['supplement.note.logged:' + id]) work.push(saveSupplementNote(Object.assign({}, note, { id: id, date: note.date || date, source: 'legacy-bridge' })));
        });
        return Promise.all(work);
      });
    }
    function bridgeSkinLegacy() {
      var logs = parse(storageGet(storage, 'skin:logs')) || [];
      var products = parse(storageGet(storage, 'skin:products')) || [];
      var routine = parse(storageGet(storage, 'skin:routine:v1')) || {};
      var breakouts = parse(storageGet(storage, 'skin:breakouts')) || [];
      var treatments = parse(storageGet(storage, 'skin:device_sessions')) || [];
      var ingredients = parse(storageGet(storage, 'skin:ingredients')) || [];
      var goals = parse(storageGet(storage, 'skin:goals')) || [];
      return repository.query({ domain: 'skin' }).then(function (existing) {
        var keys = {};
        existing.forEach(function (event) {
          var p = event.payload || {};
          keys[event.type + ':' + String(p.checkin_id || p.product_id || p.photo_id || p.breakout_id || p.treatment_id || p.ingredient_id || p.goal_id || '')] = true;
        });
        var work = [];
        logs.forEach(function (row, index) { var id = String(row.id != null ? row.id : row.date || index); if (!keys['skin.checkin.logged:' + id]) work.push(saveSkinCheckin(Object.assign({}, row, { id: id, source: 'legacy-bridge' }))); });
        products.forEach(function (row, index) { var id = String(row.id || row.name || index); if (!keys['skin.product.changed:' + id]) work.push(saveSkinProduct(Object.assign({}, row, { id: id, source: 'legacy-bridge' }))); });
        Object.keys(routine).forEach(function (date) { (routine[date] || []).forEach(function (productId) { if (!existing.some(function (event) { return event.type === 'skin.routine.logged' && event.local_date === date && String(event.payload.product_id) === String(productId); })) work.push(setSkinRoutineStep({ product_id: productId, date: date, completed: true, source: 'legacy-bridge' })); }); });
        breakouts.forEach(function (row, index) { var id = String(row.id || index); if (!keys['skin.breakout.logged:' + id]) work.push(saveSkinBreakout(Object.assign({}, row, { id: id, source: 'legacy-bridge' }))); });
        treatments.forEach(function (row, index) { var id = String(row.id || index); if (!keys['skin.treatment.logged:' + id]) work.push(saveSkinTreatment(Object.assign({}, row, { id: id, source: 'legacy-bridge' }))); });
        ingredients.forEach(function (name, index) { var id = String(index) + ':' + Events.hash(String(name)); var known = existing.some(function (event) { return event.type === 'skin.ingredient.changed' && String(event.payload.name || '').trim().toLowerCase() === String(name || '').trim().toLowerCase(); }); if (!known && !keys['skin.ingredient.changed:' + id]) work.push(saveSkinIngredient({ id: id, name: name, source: 'legacy-bridge' })); });
        goals.forEach(function (row, index) { var id = String(row.id || index) + ':' + Events.hash(String(row.text || '')); var known = existing.some(function (event) { return event.type === 'skin.goal.changed' && String(event.payload.text || '').trim().toLowerCase() === String(row.text || '').trim().toLowerCase(); }); if (!known && !keys['skin.goal.changed:' + id]) work.push(saveSkinGoal(Object.assign({}, row, { id: id, source: 'legacy-bridge' }))); });
        return Promise.all(work);
      });
    }
    function phaseG(date) {
      var params = { date: localDate(date) };
      return Promise.all([bridgeSupplementsLegacy(params.date), bridgeSkinLegacy()]).then(function () {
        return Promise.all(PHASE_G_PROJECTIONS.map(function (id) {
          return projections.get(id, params).then(function (value) { return [id, value]; });
        }));
      }).then(function (rows) { var result = {}; rows.forEach(function (row) { result[row[0]] = row[1]; }); return result; });
    }
    function subscribePhaseG(callback, date) { return projections.subscribe(PHASE_G_PROJECTIONS, callback, { params: { date: localDate(date) } }); }
    function refreshPhaseG() { projections.invalidate(PHASE_G_PROJECTIONS); }
    function phaseH(date) {
      var params = { date: localDate(date) };
      return bridgeFinanceLegacy().then(function () { return Promise.all(PHASE_H_PROJECTIONS.map(function (id) {
        return projections.get(id, params).then(function (value) { return [id, value]; });
      })); }).then(function (rows) { var result = {}; rows.forEach(function (row) { result[row[0]] = row[1]; }); return result; });
    }
    function subscribePhaseH(callback, date) { return projections.subscribe(PHASE_H_PROJECTIONS, callback, { params: { date: localDate(date) } }); }
    function refreshPhaseH() { projections.invalidate(PHASE_H_PROJECTIONS); }
    function systemStatus() {
      return Promise.all([
        repository.rawQuery({ includeDeleted: true, includeSuperseded: true }),
        repository.pendingOutbox(),
        syncStatus(),
      ]).then(function (rows) {
        var events = rows[0] || []; var pending = rows[1] || []; var remoteSync = rows[2] || {}; var domains = {};
        events.forEach(function (event) { domains[event.domain] = (domains[event.domain] || 0) + 1; });
        var backup = parse(storageGet(storage, 'backup:last:v1')) || null;
        return {
          user_id: userId, device_id: deviceId, canonical_events: events.length,
          pending_sync: pending.length, synced_events: events.filter(function (event) { return event.sync_state === 'synced'; }).length,
          domain_counts: domains, backup: backup,
          connections: {
            calendar: !!(storageGet(storage, 'gcal:token') || storageGet(storage, 'gcal:events') || domains.productivity),
            mail: !!(storageGet(storage, 'mail:summary:v1') || storageGet(storage, 'gmail:connected') || domains.communications),
            finance: !!(storageGet(storage, 'ing:tx') || storageGet(storage, 'fin:accounts:v1') || domains.finance),
            health: !!(storageGet(storage, 'health:metrics:v1') || storageGet(storage, 'aw:today') || storageGet(storage, 'activity:today') || domains.wearables),
          },
          sync_status: pending.length ? 'pending' : events.length ? 'device-current' : 'empty',
          cross_device_sync: remoteSync,
          limitations: ['Device-current means the local canonical repository is readable. Cross-device availability requires an authenticated sync service and acknowledged outbox records.', 'Connection presence is inferred from recorded credentials, imported facts, or canonical events; it does not prove the remote provider is reachable now.'],
        };
      });
    }
    function exportSnapshot() {
      return Promise.all([
        repository.rawQuery({ includeDeleted: true, includeSuperseded: true }),
        repository.pendingOutbox(),
      ]).then(function (rows) {
        var local = {};
        for (var index = 0; index < storage.length; index += 1) {
          var key = storage.key(index); var raw = storageGet(storage, key);
          if (/^(?:sb-|supabase)|(?:token|secret|password|lifeos:auth-session)/i.test(key)) continue;
          local[key] = parse(raw); if (local[key] == null && raw != null) local[key] = raw;
        }
        return { schema_version: 1, exported_at: new Date().toISOString(), user_id: userId, device_id: deviceId, canonical_events: rows[0] || [], pending_outbox: rows[1] || [], local_storage: local };
      });
    }
    function restoreSnapshot(snapshot) {
      snapshot = snapshot || {};
      if (snapshot.schema_version !== 1 || !Array.isArray(snapshot.canonical_events) || !snapshot.local_storage || typeof snapshot.local_storage !== 'object') return Promise.reject(new Error('This is not a supported Life OS snapshot'));
      if (snapshot.user_id !== userId) return Promise.reject(new Error('Snapshot owner does not match the signed-in canonical owner'));
      return exportSnapshot().then(function (before) {
        var protectedKeys = {}; [OWNER_KEY, DEVICE_KEY, SYNC_ENABLED_KEY].forEach(function (key) { protectedKeys[key] = storageGet(storage, key); });
        return repository.restoreSnapshot(snapshot).then(function (result) {
          try {
            Object.keys(snapshot.local_storage).forEach(function (key) {
              if (/^(?:sb-|supabase)|(?:token|secret|password|lifeos:auth-session)/i.test(key) || Object.prototype.hasOwnProperty.call(protectedKeys, key)) return;
              storageSet(storage, key, JSON.stringify(snapshot.local_storage[key]));
            });
            Object.keys(protectedKeys).forEach(function (key) { if (protectedKeys[key] != null) storageSet(storage, key, protectedKeys[key]); });
            projections.invalidate();
            return Object.assign({ rolled_back: false }, result);
          } catch (error) {
            return repository.restoreSnapshot(before).then(function () { throw error; });
          }
        });
      });
    }
    function clearDeviceData() {
      return repository.adapter.clear().then(function () { storage.clear(); projections.invalidate(); return { cleared: true, device_id: deviceId }; });
    }
    function phaseF(date) {
      var params = { date: localDate(date) };
      return Promise.all(PHASE_F_PROJECTIONS.map(function (id) {
        return projections.get(id, params).then(function (value) { return [id, value]; });
      })).then(function (rows) {
        var result = {}; rows.forEach(function (row) { result[row[0]] = row[1]; }); return result;
      });
    }
    function subscribePhaseF(callback, date) {
      return projections.subscribe(PHASE_F_PROJECTIONS, callback, { params: { date: localDate(date) } });
    }
    function refreshPhaseF() { projections.invalidate(PHASE_F_PROJECTIONS); }
    function phaseE(date) {
      var params = { date: localDate(date) };
      return Promise.all(PHASE_E_PROJECTIONS.map(function (id) {
        return projections.get(id, params).then(function (value) { return [id, value]; });
      })).then(function (rows) {
        var result = {};
        rows.forEach(function (row) { result[row[0]] = row[1]; });
        return result;
      });
    }
    function subscribePhaseE(callback, date) {
      return projections.subscribe(PHASE_E_PROJECTIONS, callback, { params: { date: localDate(date) } });
    }
    function refreshPhaseE() { projections.invalidate(PHASE_E_PROJECTIONS); }

    return Object.freeze({
      userId: userId,
      deviceId: deviceId,
      repository: repository,
      projections: projections,
      appendMeal: appendMeal,
      editMeal: editMeal,
      deleteMeal: deleteMeal,
      restoreMeal: restoreMeal,
      setNutritionTargets: setNutritionTargets,
      nutritionDaily: nutritionDaily,
      subscribeNutrition: subscribeNutrition,
      saveBodyMeasurement: saveBodyMeasurement,
      saveSleep: saveSleep,
      setBodyGoals: setBodyGoals,
      startTrainingSession: startTrainingSession,
      logTrainingSet: logTrainingSet,
      completeTrainingSession: completeTrainingSession,
      saveCardio: saveCardio,
      saveLabPanel: saveLabPanel,
      recordLabOutlook: recordLabOutlook,
      addBodyPhoto: addBodyPhoto,
      logHydration: logHydration,
      editHydration: editHydration,
      deleteHydration: tombstoneChain,
      setHydrationTarget: setHydrationTarget,
      saveHydrationSettings: saveHydrationSettings,
      bridgeHydrationLegacy: bridgeHydrationLegacy,
      replaceHydrationFromLegacy: replaceHydrationFromLegacy,
      clearHydration: clearHydration,
      checkInEnergy: checkInEnergy,
      saveSupplementCompound: saveSupplementCompound,
      saveSupplementInventory: saveSupplementInventory,
      setSupplementDose: setSupplementDose,
      saveSupplementNote: saveSupplementNote,
      bridgeSupplementsLegacy: bridgeSupplementsLegacy,
      saveSkinCheckin: saveSkinCheckin,
      restoreSkinCheckin: restoreSkinCheckin,
      saveSkinProduct: saveSkinProduct,
      setSkinRoutineStep: setSkinRoutineStep,
      addSkinPhoto: addSkinPhoto,
      saveSkinBreakout: saveSkinBreakout,
      saveSkinTreatment: saveSkinTreatment,
      saveSkinIngredient: saveSkinIngredient,
      saveSkinGoal: saveSkinGoal,
      bridgeSkinLegacy: bridgeSkinLegacy,
      saveFinanceTransaction: saveFinanceTransaction,
      saveFinanceAccount: saveFinanceAccount,
      bridgeFinanceLegacy: bridgeFinanceLegacy,
      deleteCanonical: tombstoneChain,
      phaseE: phaseE,
      subscribePhaseE: subscribePhaseE,
      refreshPhaseE: refreshPhaseE,
      phaseF: phaseF,
      subscribePhaseF: subscribePhaseF,
      refreshPhaseF: refreshPhaseF,
      phaseG: phaseG,
      subscribePhaseG: subscribePhaseG,
      refreshPhaseG: refreshPhaseG,
      phaseH: phaseH,
      subscribePhaseH: subscribePhaseH,
      refreshPhaseH: refreshPhaseH,
      systemStatus: systemStatus,
      exportSnapshot: exportSnapshot,
      restoreSnapshot: restoreSnapshot,
      syncNow: syncNow,
      syncStatus: syncStatus,
      syncEnabled: syncEnabled,
      setSyncEnabled: setSyncEnabled,
      clearDeviceData: clearDeviceData,
      refresh: refresh,
      mealPayload: mealPayload,
    });
  }

  function install(options) {
    root.LifeOS = root.LifeOS || {};
    if (root.LifeOS.canonical) return root.LifeOS.canonical;
    try {
      var runtime = create(options);
      root.LifeOS.canonical = runtime;
      root.CanonicalRuntime = runtime;
      root.LifeOS.repository = runtime.repository;
      root.LifeOS.projections = runtime.projections;
      root.LifeOS.canonicalReady = Promise.resolve(runtime);
      root.dispatchEvent(new root.CustomEvent('lifeos:canonical-ready', { detail: { userId: runtime.userId, deviceId: runtime.deviceId } }));
      return runtime;
    } catch (error) {
      root.LifeOS.canonicalError = error;
      root.LifeOS.canonicalReady = Promise.reject(error);
      root.LifeOS.canonicalReady.catch(function () {});
      try { root.dispatchEvent(new root.CustomEvent('lifeos:canonical-error', { detail: { message: String(error && error.message || error) } })); } catch (_) {}
      return null;
    }
  }

  return Object.freeze({ create: create, install: install, mealPayload: mealPayload });
});
