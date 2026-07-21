/* ============================================================
   Versioned Life OS projection and calculation registry.

   Every definition is pure and deterministic for a fixed event set, date,
   and parameters. No function writes storage, emits source events, calls AI,
   or reaches the network.
   ============================================================ */
(function (root, factory) {
  'use strict';
  var engine = root && root.LifeOSProjectionEngine;
  var bloodworkModels = root && root.LifeOSBloodworkModels;
  var bloodworkOutlook = root && root.LifeOSBloodworkOutlook;
  if (!engine && typeof require === 'function') engine = require('./projection-engine.js');
  if (!bloodworkModels && typeof require === 'function') bloodworkModels = require('./bloodwork-model-registry.js');
  if (!bloodworkOutlook && typeof require === 'function') bloodworkOutlook = require('./bloodwork-outlook.js');
  var api = factory(engine, bloodworkModels, bloodworkOutlook);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LifeOSProjectionDefinitions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ProjectionEngine, BloodworkModels, BloodworkOutlook) {
  'use strict';

  function round(value, places) {
    if (value == null || !isFinite(value)) return null;
    var power = Math.pow(10, places == null ? 0 : places);
    return Math.round(value * power) / power;
  }
  function sum(values) { return values.reduce(function (total, value) { return total + (Number(value) || 0); }, 0); }
  function unique(values) { return values.filter(function (value, index, all) { return all.indexOf(value) === index; }); }
  function addDays(date, offset) {
    var d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }
  function lastDates(date, count) { var out = []; for (var i = 0; i < count; i++) out.push(addDays(date, -i)); return out; }
  function eventsOf(ctx, types) { return ctx.allEvents.filter(function (event) { return types.indexOf(event.type) >= 0; }); }
  function latest(events, beforeDate) {
    return events.filter(function (event) { return !beforeDate || event.local_date <= beforeDate; })
      .sort(function (a, b) { return a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : a.recorded_at < b.recorded_at ? 1 : -1; })[0] || null;
  }
  function byDate(events, date) { return events.filter(function (event) { return event.local_date === date; }); }
  function inDates(events, dates) { return events.filter(function (event) { return dates.indexOf(event.local_date) >= 0; }); }
  function ids(events) { return unique(events.map(function (event) { return event.id; })); }
  function sourceId(event) { return event && String(event.id || '').split(':')[0]; }
  function mergeFacts(canonical, legacy, fingerprint) {
    var seen = {};
    canonical.forEach(function (event) { seen[fingerprint(event)] = true; });
    return canonical.concat(legacy.filter(function (event) { return !seen[fingerprint(event)]; }));
  }
  function payloadNumber(event, key, fallback) {
    var value = event && event.payload && event.payload[key];
    value = value == null ? fallback : Number(value);
    return isFinite(value) ? value : 0;
  }
  function legacyEvent(ctx, key) {
    return latest(ctx.allEvents.filter(function (event) { return /\.legacy\.imported$/.test(event.type) && event.payload && event.payload.legacy_key === key; }));
  }
  function legacyEventsByPrefix(ctx, prefix) {
    return ctx.allEvents.filter(function (event) {
      return /\.legacy\.imported$/.test(event.type) && event.payload && String(event.payload.legacy_key || '').indexOf(prefix) === 0;
    });
  }
  function legacyValue(ctx, key, fallback) {
    var event = legacyEvent(ctx, key);
    return event && event.payload && event.payload.parsed_value != null ? event.payload.parsed_value : fallback;
  }
  function coverageFromDays(days, total) { return total ? Math.min(1, days / total) : 0; }
  function valueOf(ctx, id) { return ctx.value(id) || {}; }

  function definition(config) {
    return Object.freeze(Object.assign({
      version: 1,
      truthClass: 'measured',
      eventTypes: [],
      eventDomains: [],
      projectionDeps: [],
      timeWindow: 'current',
      recomputeStrategy: 'on-input-change',
      calculationType: 'deterministic',
      outputSchema: { type: 'object', required: [] },
      missingData: 'Missing inputs are returned explicitly and never replaced with fake measurements.',
      limitations: [],
    }, config, { outputProjection: config.outputProjection || config.id }));
  }

  function nutritionTargets(ctx) {
    var event = latest(eventsOf(ctx, ['nutrition.target.changed']), ctx.date);
    var legacy = legacyValue(ctx, 'nt:targets', {}) || {};
    var tdee = legacyValue(ctx, 'nt:tdee', {}) || {};
    return {
      calories: event ? payloadNumber(event, 'calories', 2000) : Number(legacy.calories || tdee.calories || 2000),
      protein_g: event ? payloadNumber(event, 'protein_g', 150) : Number(legacy.protein || tdee.protein || 150),
      carbs_g: event ? payloadNumber(event, 'carbs_g', 0) : Number(legacy.carbs || tdee.carbs || 0),
      fat_g: event ? payloadNumber(event, 'fat_g', 0) : Number(legacy.fat || tdee.fat || 0),
      fiber_g: event ? payloadNumber(event, 'fiber_g', 0) : Number(legacy.fiber || 0),
      sugar_g: event ? payloadNumber(event, 'sugar_g', 0) : Number(legacy.sugar || 0),
      configured: !!event || Number(legacy.calories || tdee.calories || 0) > 0 && Number(legacy.protein || tdee.protein || 0) > 0,
      source_event_id: event && event.id,
    };
  }

  function legacyMeals(ctx) {
    var event = legacyEvent(ctx, 'nt:logs');
    var rows = event && Array.isArray(event.payload.parsed_value) ? event.payload.parsed_value : [];
    return rows.map(function (row, index) {
      return {
        id: row.canonical_event_id || event.id + ':' + index,
        local_date: String(row.dateKey || row.date || '').replace(/\//g, '-'),
        occurred_at: row.loggedAt || (String(row.dateKey || row.date || ctx.date).replace(/\//g, '-') + 'T12:00:00Z'),
        payload: {
          name: row.name || 'Meal', calories: Number(row.calories || 0), protein_g: Number(row.protein || 0),
          carbs_g: Number(row.carbs || 0), fat_g: Number(row.fat || 0), fiber_g: Number(row.fiber || 0),
          sodium_mg: Number(row.sodium || row.micros && row.micros.sodium || 0), sugar_g: Number(row.sugar || 0),
          estimated_food_water_ml: Number(row.estimated_food_water_ml || 0),
          legacy_id: row.id == null ? null : String(row.id), source: row.source || 'legacy', meal: row.meal || null,
        },
      };
    });
  }

  function allMeals(ctx) {
    var canonical = eventsOf(ctx, ['nutrition.meal.logged', 'nutrition.meal.edited']);
    return mergeFacts(canonical, legacyMeals(ctx), function (event) {
      return [event.local_date, event.payload.name || '', payloadNumber(event, 'calories'), payloadNumber(event, 'protein_g')].join('|');
    });
  }

  function nutritionForDate(ctx, date) {
    var meals = byDate(allMeals(ctx), date);
    var totals = {
      date: date, entries: meals.length, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
      fiber_g: 0, sodium_mg: 0, sugar_g: 0, estimated_food_water_ml: 0,
    };
    meals.forEach(function (event) {
      totals.calories += payloadNumber(event, 'calories'); totals.protein_g += payloadNumber(event, 'protein_g');
      totals.carbs_g += payloadNumber(event, 'carbs_g'); totals.fat_g += payloadNumber(event, 'fat_g');
      totals.fiber_g += payloadNumber(event, 'fiber_g'); totals.sodium_mg += payloadNumber(event, 'sodium_mg');
      totals.sugar_g += payloadNumber(event, 'sugar_g'); totals.estimated_food_water_ml += payloadNumber(event, 'estimated_food_water_ml');
    });
    Object.keys(totals).forEach(function (key) { if (typeof totals[key] === 'number') totals[key] = round(totals[key], key === 'calories' || /_ml|_mg/.test(key) ? 0 : 1); });
    totals.meals = meals.slice().sort(function (a, b) { return a.occurred_at < b.occurred_at ? -1 : 1; }).map(function (event) {
      return {
        id: event.id, legacy_id: event.payload.legacy_id || null, name: event.payload.name, occurred_at: event.occurred_at,
        local_date: event.local_date, calories: payloadNumber(event, 'calories'), protein_g: payloadNumber(event, 'protein_g'),
        carbs_g: payloadNumber(event, 'carbs_g'), fat_g: payloadNumber(event, 'fat_g'), fiber_g: payloadNumber(event, 'fiber_g'),
        sodium_mg: payloadNumber(event, 'sodium_mg'), sugar_g: payloadNumber(event, 'sugar_g'),
        estimated_food_water_ml: payloadNumber(event, 'estimated_food_water_ml'), source: event.payload.source || event.source,
        meal: event.payload.meal || null,
      };
    });
    return { totals: totals, events: meals };
  }

  function legacyWater(ctx, date) {
    var source = legacyEvent(ctx, 'po_water_v1');
    var state = source && source.payload.parsed_value || {};
    var bottle = Number(state.bottleMl || state.bottleSizeMl || 500);
    var count = state.logs && Number(state.logs[date] || 0);
    var entries = Array.isArray(state.entries) ? state.entries.filter(function (entry) { return (entry.date || entry.local_date) === date; }) : [];
    var amount = count ? count * bottle : sum(entries.map(function (entry) { return entry.amountMl || entry.amount_ml || entry.ml; }));
    var profile = state.profile || {};
    var weightRaw = Number(profile.weightKg || 75);
    var weight = state.weightUnit === 'lb' ? weightRaw / 2.20462 : weightRaw;
    var activity = Number(profile.activityHrsPerWeek || 0) / 7 * 500;
    var caffeine = Math.max(0, Number(state.caffeineMgPerDay == null ? 200 : state.caffeineMgPerDay) - 200) * 1.5;
    var compounds = (Array.isArray(state.substances) ? state.substances : []).reduce(function (total, item) { return total + Math.max(0, Number((item.dose != null ? item.dose : item.defaultDose) || 0) * Number(item.mlPerUnit || 0)); }, 0);
    var demographic = (profile.sex === 'm' ? 200 : 0) + (Number(profile.age || 0) >= 50 ? 100 : 0);
    var target = Math.max(1000, Math.round(weight * 35 + activity + caffeine + compounds + demographic));
    return { source: source, amount_ml: amount, target_ml: target, entries: entries };
  }

  function sleepFacts(ctx) {
    var canonical = eventsOf(ctx, ['sleep.night.logged', 'sleep.night.synced']);
    var source = legacyEvent(ctx, 'sleep:logs');
    var rows = source && Array.isArray(source.payload.parsed_value) ? source.payload.parsed_value : [];
    var legacy = rows.map(function (row, index) {
      return { id: source.id + ':' + index, local_date: row.date, occurred_at: row.date + 'T12:00:00Z', payload: { duration_minutes: Number(row.duration || row.duration_minutes || 0), score: row.score } };
    });
    return mergeFacts(canonical, legacy, function (event) { return event.local_date; });
  }

  function trainingFacts(ctx) {
    return eventsOf(ctx, ['training.session.started', 'training.set.logged', 'training.cardio.logged', 'training.session.completed']);
  }

  function legacyTraining(ctx) {
    var doneEvent = legacyEvent(ctx, 'po_coach_workout_done');
    var done = doneEvent && doneEvent.payload.parsed_value || {};
    var stateEvent = legacyEvent(ctx, 'po_coach_v1');
    var state = stateEvent && stateEvent.payload.parsed_value || {};
    var cardioEvent = legacyEvent(ctx, 'gym:cardio:v1');
    var cardio = cardioEvent && Array.isArray(cardioEvent.payload.parsed_value) ? cardioEvent.payload.parsed_value : [];
    var sessions = Object.keys(done).filter(function (date) { return !!done[date]; }).map(function (date) { return { id: doneEvent.id + ':' + date, local_date: date, payload: { session_id: 'legacy:' + date } }; });
    var sets = [];
    Object.keys(state.logs || {}).forEach(function (exerciseId) {
      var exercise = (state.exercises || []).find(function (item) { return item.id === exerciseId; }) || {};
      (state.logs[exerciseId] || []).forEach(function (row, index) {
        sets.push({ id: stateEvent.id + ':' + exerciseId + ':' + index, local_date: String(row.date || '').slice(0, 10), payload: { exercise: exercise.name || exerciseId, exercise_id: exerciseId, load_kg: Number(row.weight || 0), reps: Number(row.reps || 0), rpe: row.rpe } });
      });
    });
    var cardioRows = cardio.map(function (row, index) { return { id: cardioEvent.id + ':' + index, local_date: row.date, payload: { activity: row.type, duration_seconds: Number(row.duration || 0) * 60, distance_km: Number(row.distance || 0), avg_hr_bpm: Number(row.hr || 0) } }; });
    return { sessions: sessions, sets: sets, cardio: cardioRows, sourceIds: ids([doneEvent, stateEvent, cardioEvent].filter(Boolean)) };
  }

  function bodyWeightFacts(ctx) {
    var canonical = eventsOf(ctx, ['body.weight.logged']);
    var source = legacyEvent(ctx, 'po_coach_weights');
    var rows = source && Array.isArray(source.payload.parsed_value) ? source.payload.parsed_value : [];
    var legacy = rows.map(function (row, index) { return { id: source.id + ':' + index, local_date: row.dateKey, occurred_at: row.dateKey + 'T12:00:00Z', payload: { weight_kg: Number(row.weight || 0) } }; });
    return mergeFacts(canonical, legacy, function (event) { return event.local_date; });
  }

  function bodyCompositionFacts(ctx) {
    var canonical = eventsOf(ctx, ['body.composition.logged']);
    var source = legacyEvent(ctx, 'health:body:v1');
    var rows = source && Array.isArray(source.payload.parsed_value) ? source.payload.parsed_value : [];
    var legacy = rows.map(function (row, index) { return { id: source.id + ':' + index, local_date: row.date, occurred_at: row.date + 'T12:00:00Z', payload: { body_fat_pct: Number(row.bf || 0), lean_mass_kg: row.lean_mass_kg, waist_cm: row.waist } }; });
    return mergeFacts(canonical, legacy, function (event) { return event.local_date; });
  }

  function bodyMeasurementFacts(ctx) {
    var canonical = eventsOf(ctx, ['body.measurement.logged']);
    var source = legacyEvent(ctx, 'body:logs');
    var rows = source && Array.isArray(source.payload.parsed_value) ? source.payload.parsed_value : [];
    var legacy = rows.map(function (row, index) {
      var values = {};
      Object.keys(row || {}).forEach(function (key) {
        if (key !== 'date' && key !== 'id' && Number(row[key]) > 0) values[key] = Number(row[key]);
      });
      return { id: source.id + ':' + index, local_date: row.date, occurred_at: row.date + 'T12:00:00Z', payload: { measurements_cm: values } };
    });
    return mergeFacts(canonical, legacy, function (event) { return event.local_date; });
  }

  var LAB_RANGES = {
    hematocrit: [36, 52, 'Hematocrit', '%'], hemoglobin: [11.5, 17.5, 'Hemoglobin', 'g/dL'],
    testosterone: [250, 1100, 'Testosterone', 'ng/dL'], estradiol: [10, 200, 'Estradiol', 'pg/mL'],
    lh: [1.5, 9.3, 'LH', 'mIU/mL'], fsh: [1.5, 12.4, 'FSH', 'mIU/mL'],
    totalCholesterol: [0, 200, 'Total Cholesterol', 'mg/dL'], ldl: [0, 100, 'LDL', 'mg/dL'],
    hdl: [40, 999, 'HDL', 'mg/dL'], triglycerides: [0, 150, 'Triglycerides', 'mg/dL'],
    vitaminD: [30, 100, 'Vitamin D', 'ng/mL'], ferritin: [12, 300, 'Ferritin', 'ng/mL'],
    tsh: [0.5, 4.5, 'TSH', 'mIU/L'], freeT3: [2.3, 4.2, 'Free T3', 'pg/mL'], freeT4: [0.9, 1.7, 'Free T4', 'ng/dL'],
  };
  function normalizeLabMarkers(markers) {
    var rows = Array.isArray(markers) ? markers : Object.keys(markers || {}).map(function (key) {
      var value = markers[key];
      return Object.assign({ key: key }, value && typeof value === 'object' ? value : { value: value });
    });
    return rows.map(function (marker) {
      var key = marker.key || marker.name || marker.marker;
      var range = LAB_RANGES[key] || [];
      var value = Number(marker.value);
      var low = marker.ref_low == null ? range[0] : Number(marker.ref_low);
      var high = marker.ref_high == null ? range[1] : Number(marker.ref_high);
      var status = marker.status;
      if (!status && isFinite(value)) status = isFinite(low) && value < low ? 'low' : isFinite(high) && value > high ? 'high' : 'ok';
      return Object.assign({}, marker, {
        key: key, name: marker.name || range[2] || key, value: value, unit: marker.unit || range[3] || null,
        ref_low: isFinite(low) ? low : null, ref_high: isFinite(high) ? high : null, status: status || 'unknown',
        out_of_range: marker.out_of_range != null ? !!marker.out_of_range : status === 'low' || status === 'high' || status === 'watch',
      });
    });
  }
  function labPanelFacts(ctx) {
    var canonical = eventsOf(ctx, ['labs.panel.logged', 'labs.panel.imported']);
    var source = legacyEvent(ctx, 'blood:logs');
    var rows = source && Array.isArray(source.payload.parsed_value) ? source.payload.parsed_value : [];
    var legacy = rows.map(function (row, index) {
      return { id: source.id + ':' + index, local_date: row.date, occurred_at: row.date + 'T12:00:00Z', payload: { markers: normalizeLabMarkers(row.markers || {}), phase: row.phase || 'normal', provider: 'legacy-manual' } };
    });
    return mergeFacts(canonical, legacy, function (event) { return event.local_date; });
  }

  function bodyPhotoFacts(ctx) {
    var canonical = eventsOf(ctx, ['photo.asset.added', 'body.photo.added']).filter(function (event) { return event.type === 'body.photo.added' || event.payload.context === 'body' || event.payload.kind === 'body'; });
    var source = legacyEvent(ctx, 'body:photos:v1');
    var rows = source && Array.isArray(source.payload.parsed_value) ? source.payload.parsed_value : [];
    var legacy = rows.map(function (row, index) {
      return { id: source.id + ':' + index, local_date: row.date, occurred_at: row.date + 'T12:00:00Z', payload: Object.assign({ photo_id: row.id, storage_id: row.id, context: 'body', kind: 'body' }, row) };
    });
    return mergeFacts(canonical, legacy, function (event) { return event.payload.photo_id || event.payload.storage_id || event.id; });
  }

  function localHour(event) {
    try {
      var parts = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: event.timezone || 'UTC' }).formatToParts(new Date(event.occurred_at));
      var hour = parts.filter(function (part) { return part.type === 'hour'; })[0];
      return Number(hour && hour.value);
    } catch (_) { return new Date(event.occurred_at).getUTCHours(); }
  }

  function legacyHabitState(ctx) {
    var definitionsEvent = legacyEvent(ctx, 'habits:v1');
    var logsEvent = legacyEvent(ctx, 'habits:logs:v1');
    var definitions = definitionsEvent && Array.isArray(definitionsEvent.payload.parsed_value) ? definitionsEvent.payload.parsed_value : [];
    var logs = logsEvent && logsEvent.payload.parsed_value || {};
    return { definitions: definitions, done: Array.isArray(logs[ctx.date]) ? logs[ctx.date] : [], sourceIds: ids([definitionsEvent, logsEvent].filter(Boolean)) };
  }

  function financeTransactions(ctx) { return eventsOf(ctx, ['finance.transaction.logged', 'finance.transaction.imported']); }
  function transactionAmount(event) {
    var amount = payloadNumber(event, 'amount_minor');
    var direction = event.payload.direction || event.payload.kind || event.payload.type;
    if (direction === 'expense' || direction === 'debit') return -Math.abs(amount);
    if (direction === 'income' || direction === 'credit') return Math.abs(amount);
    return amount;
  }

  var DEFINITIONS = [];
  function add(config) { DEFINITIONS.push(definition(config)); }

  add({
    id: 'profile.current', displayName: 'Current profile', eventTypes: ['profile.settings.changed'], eventDomains: ['profile'],
    outputSchema: { type: 'object', required: ['settings'] },
    compute: function (ctx) {
      var fact = latest(eventsOf(ctx, ['profile.settings.changed']), ctx.date);
      var legacy = legacyValue(ctx, 'settings:v1', {}) || {};
      return { value: { settings: fact ? fact.payload : legacy, configured: !!fact || Object.keys(legacy).length > 0 }, sourceEventIds: fact ? [fact.id] : ids([legacyEvent(ctx, 'settings:v1')].filter(Boolean)) };
    },
  });

  add({
    id: 'nutrition.daily', displayName: 'Daily nutrition', eventTypes: ['nutrition.meal.logged', 'nutrition.meal.edited', 'nutrition.target.changed'], eventDomains: ['nutrition'],
    timeWindow: 'local day', outputSchema: { type: 'object', required: ['date', 'entries', 'calories', 'protein_g', 'targets', 'estimated_food_water_ml'] },
    compute: function (ctx) {
      var result = nutritionForDate(ctx, ctx.date); var targets = nutritionTargets(ctx); result.totals.targets = targets;
      return { value: result.totals, sourceEventIds: ids(result.events).concat(targets.source_event_id ? [targets.source_event_id] : []), coverage: result.totals.entries ? 1 : 0,
        explanation: 'Sums logged meal nutrients for the selected local day. Estimated food water is kept separate from explicit drinks.' };
    },
  });

  [7, 30, 90].forEach(function (days) {
    add({
      id: 'nutrition.rolling_' + days + 'd', displayName: days + '-day nutrition', eventTypes: ['nutrition.meal.logged', 'nutrition.meal.edited', 'nutrition.target.changed'], eventDomains: ['nutrition'],
      timeWindow: days + ' local days', outputSchema: { type: 'object', required: ['days', 'logged_days', 'averages', 'totals'] },
      compute: function (ctx) {
        var dates = lastDates(ctx.date, days); var rows = dates.map(function (date) { return nutritionForDate(ctx, date).totals; });
        var logged = rows.filter(function (row) { return row.entries > 0; }); var divisor = logged.length || 1;
        var keys = ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sodium_mg', 'sugar_g', 'estimated_food_water_ml'];
        var totals = {}; var averages = {};
        keys.forEach(function (key) { totals[key] = round(sum(rows.map(function (row) { return row[key]; })), 1); averages[key] = round(totals[key] / divisor, 1); });
        return { value: { days: days, logged_days: logged.length, totals: totals, averages: averages, daily: rows.slice().reverse() },
          sourceEventIds: ids(inDates(allMeals(ctx), dates)), coverage: coverageFromDays(logged.length, days),
          explanation: 'Aggregates only logged days and reports coverage so missing days are not silently treated as zero intake.' };
      },
    });
  });

  add({
    id: 'hydration.daily', displayName: 'Daily hydration', eventTypes: ['hydration.intake.logged', 'hydration.intake.edited', 'hydration.target.changed'], eventDomains: ['hydration'],
    projectionDeps: ['nutrition.daily', 'body.current'], timeWindow: 'local day',
    outputSchema: { type: 'object', required: ['date', 'explicit_beverage_ml', 'estimated_food_water_ml', 'total_water_ml', 'target_ml'] },
    compute: function (ctx) {
      var drinks = byDate(eventsOf(ctx, ['hydration.intake.logged', 'hydration.intake.edited']), ctx.date);
      var legacy = legacyWater(ctx, ctx.date);
      var hasLegacyBridge = drinks.some(function (event) { return /^hydration-legacy:/.test(event.source_ref || ''); });
      var legacyAmount = hasLegacyBridge ? 0 : legacy.amount_ml;
      var explicit = sum(drinks.map(function (event) { return payloadNumber(event, 'amount_ml'); })) + legacyAmount;
      var targetEvent = latest(eventsOf(ctx, ['hydration.target.changed']), ctx.date);
      var body = valueOf(ctx, 'body.current');
      var target = targetEvent ? payloadNumber(targetEvent, 'target_ml') : legacy.target_ml;
      if (!target) target = Math.max(2000, Math.ceil(Number(body.weight_kg || 75) * 35 / 250) * 250);
      var foodWater = Number(valueOf(ctx, 'nutrition.daily').estimated_food_water_ml || 0);
      var sources = { manual_ml: 0, device_import_ml: 0, legacy_ml: legacyAmount, other_ml: 0 };
      drinks.forEach(function (event) {
        var amount = payloadNumber(event, 'amount_ml');
        var kind = event.payload.source_kind || '';
        if (kind === 'legacy-bridge' || /^hydration-legacy:/.test(event.source_ref || '')) sources.legacy_ml += amount;
        else if (kind === 'device-import' || event.source !== 'manual' && event.source !== 'lifeos-ui') sources.device_import_ml += amount;
        else if (kind === 'explicit-drink' || event.source === 'manual' || event.source === 'lifeos-ui') sources.manual_ml += amount;
        else sources.other_ml += amount;
      });
      var entries = drinks.slice().sort(function (a, b) { return String(b.occurred_at).localeCompare(String(a.occurred_at)); }).map(function (event) {
        return { id: event.id, occurred_at: event.occurred_at, amount_ml: payloadNumber(event, 'amount_ml'), beverage_type: event.payload.beverage_type || 'water', source: event.source, source_kind: event.payload.source_kind || 'explicit-drink', confidence: event.confidence };
      });
      if (!hasLegacyBridge && legacyAmount) entries.push({ id: legacy.source && legacy.source.id || 'legacy-water', occurred_at: ctx.date + 'T12:00:00', amount_ml: legacyAmount, beverage_type: 'water', source: 'legacy-compatibility', source_kind: 'legacy-summary', confidence: 1 });
      return { value: { date: ctx.date, explicit_beverage_ml: round(explicit, 0), estimated_food_water_ml: round(foodWater, 0), total_water_ml: round(explicit + foodWater, 0), target_ml: round(target, 0), healthy_zone_low_ml: targetEvent && payloadNumber(targetEvent, 'healthy_zone_low_ml') || round(target * 0.8, 0), healthy_zone_high_ml: targetEvent && payloadNumber(targetEvent, 'healthy_zone_high_ml') || round(target * 1.2, 0), target_progress: round(explicit / target, 3), entry_count: entries.length, entries: entries, sources: sources, target_components: targetEvent && targetEvent.payload.components || null, target_formula_version: targetEvent && targetEvent.payload.formula_version || 'legacy-compatible-v1' },
        sourceEventIds: ids(drinks).concat(targetEvent ? [targetEvent.id] : legacy.source ? [legacy.source.id] : []), coverage: explicit > 0 ? 1 : 0,
        explanation: 'Explicit beverages, device imports, legacy history, and estimated food water are reported separately. Logging a meal never creates a drink event.' };
    },
  });

  add({
    id: 'hydration.timing', displayName: 'Hydration timing', eventTypes: ['hydration.intake.logged', 'hydration.intake.edited'], eventDomains: ['hydration'], timeWindow: 'local day',
    outputSchema: { type: 'object', required: ['date', 'buckets'] },
    compute: function (ctx) {
      var drinks = byDate(eventsOf(ctx, ['hydration.intake.logged', 'hydration.intake.edited']), ctx.date);
      var buckets = { morning_ml: 0, afternoon_ml: 0, evening_ml: 0, overnight_ml: 0 };
      drinks.forEach(function (event) {
        var hour = localHour(event); var key = hour < 6 ? 'overnight_ml' : hour < 12 ? 'morning_ml' : hour < 18 ? 'afternoon_ml' : 'evening_ml';
        buckets[key] += payloadNumber(event, 'amount_ml');
      });
      return { value: { date: ctx.date, buckets: buckets, entries: drinks.length }, sourceEventIds: ids(drinks), coverage: drinks.length ? 1 : 0,
        limitations: ['Timing uses the stored occurrence timestamp; local timezone transitions are preserved on each source event.'] };
    },
  });

  add({
    id: 'hydration.rolling_30d', displayName: '30-day hydration', eventTypes: ['hydration.intake.logged', 'hydration.intake.edited', 'hydration.target.changed'], eventDomains: ['hydration'],
    timeWindow: '30 local days', outputSchema: { type: 'object', required: ['days', 'logged_days', 'average_explicit_ml'] },
    compute: function (ctx) {
      var dates = lastDates(ctx.date, 30); var drinks = inDates(eventsOf(ctx, ['hydration.intake.logged', 'hydration.intake.edited']), dates);
      var hasLegacyBridge = drinks.some(function (event) { return /^hydration-legacy:/.test(event.source_ref || ''); });
      var legacySources = [];
      var daily = dates.map(function (date) { var legacy = legacyWater(ctx, date); if (legacy.source) legacySources.push(legacy.source); return { date: date, amount_ml: sum(byDate(drinks, date).map(function (event) { return payloadNumber(event, 'amount_ml'); })) + (hasLegacyBridge ? 0 : legacy.amount_ml) }; }).reverse();
      var logged = daily.filter(function (row) { return row.amount_ml > 0; });
      return { value: { days: 30, logged_days: logged.length, average_explicit_ml: round(sum(logged.map(function (row) { return row.amount_ml; })) / (logged.length || 1), 0), daily: daily }, sourceEventIds: ids(drinks).concat(ids(legacySources)), coverage: coverageFromDays(logged.length, 30) };
    },
  });

  add({
    id: 'sleep.daily', displayName: 'Daily sleep', eventTypes: ['sleep.night.logged', 'sleep.night.synced'], eventDomains: ['sleep'], timeWindow: 'last night',
    outputSchema: { type: 'object', required: ['date', 'logged'] },
    compute: function (ctx) {
      var candidates = sleepFacts(ctx); var event = latest(byDate(candidates, ctx.date).concat(byDate(candidates, addDays(ctx.date, -1))));
      return { value: event ? { date: event.local_date, logged: true, duration_minutes: payloadNumber(event, 'duration_minutes'), score: event.payload.score == null ? null : Number(event.payload.score), source: event.source || 'legacy' } : { date: ctx.date, logged: false, duration_minutes: null, score: null, source: null }, sourceEventIds: event ? [event.id.split(':')[0]] : [], coverage: event ? 1 : 0 };
    },
  });

  add({
    id: 'sleep.debt', displayName: 'Seven-day sleep debt', eventTypes: ['sleep.night.logged', 'sleep.night.synced'], eventDomains: ['sleep'], projectionDeps: ['profile.current'], timeWindow: '7 local nights',
    outputSchema: { type: 'object', required: ['target_minutes', 'logged_nights', 'debt_minutes'] },
    compute: function (ctx) {
      var dates = lastDates(ctx.date, 7); var facts = inDates(sleepFacts(ctx), dates); var settings = valueOf(ctx, 'profile.current').settings || {};
      var target = Number(settings.goalSleep || settings.sleep_goal_hours || 8) * 60;
      var debt = sum(facts.map(function (event) { return Math.max(0, target - payloadNumber(event, 'duration_minutes')); }));
      return { value: { target_minutes: target, logged_nights: facts.length, debt_minutes: round(debt, 0), debt_hours: facts.length ? round(debt / 60, 1) : null }, sourceEventIds: ids(facts), coverage: coverageFromDays(facts.length, 7) };
    },
  });

  add({
    id: 'training.load', displayName: 'Training load', eventTypes: ['training.session.completed', 'training.set.logged', 'training.cardio.logged'], eventDomains: ['training'], timeWindow: '7 local days',
    outputSchema: { type: 'object', required: ['sessions_7d', 'sets_7d', 'volume_kg_7d', 'cardio_minutes_7d'] },
    compute: function (ctx) {
      var dates = lastDates(ctx.date, 7); var canonical = trainingFacts(ctx); var legacy = legacyTraining(ctx);
       var sessions = inDates(mergeFacts(canonical.filter(function (event) { return event.type === 'training.session.completed'; }), legacy.sessions, function (event) { return event.local_date; }), dates);
       var sets = inDates(mergeFacts(canonical.filter(function (event) { return event.type === 'training.set.logged'; }), legacy.sets, function (event) { return [event.local_date, event.payload.exercise || event.payload.exercise_id || '', payloadNumber(event, 'load_kg'), payloadNumber(event, 'reps')].join('|'); }), dates);
       var cardio = inDates(mergeFacts(canonical.filter(function (event) { return event.type === 'training.cardio.logged'; }), legacy.cardio, function (event) { return [event.local_date, event.payload.activity || '', payloadNumber(event, 'duration_seconds')].join('|'); }), dates);
      return { value: { sessions_7d: sessions.length, sets_7d: sets.length, volume_kg_7d: round(sum(sets.map(function (event) { return payloadNumber(event, 'load_kg') * payloadNumber(event, 'reps'); })), 0), cardio_minutes_7d: round(sum(cardio.map(function (event) { return payloadNumber(event, 'duration_seconds') / 60; })), 0), completed_today: byDate(sessions, ctx.date).length > 0, completed_yesterday: byDate(sessions, addDays(ctx.date, -1)).length > 0, completed_two_days_ago: byDate(sessions, addDays(ctx.date, -2)).length > 0 },
        sourceEventIds: ids(sessions.concat(sets, cardio)).map(function (id) { return id.split(':')[0]; }), coverage: sessions.length ? Math.min(1, sessions.length / 3) : 0 };
    },
  });

  add({
    id: 'training.progress', displayName: 'Training progress', eventTypes: ['training.set.logged'], eventDomains: ['training'], timeWindow: 'all available history',
    outputSchema: { type: 'object', required: ['exercises', 'personal_records'] },
    compute: function (ctx) {
       var canonical = eventsOf(ctx, ['training.set.logged']); var sets = mergeFacts(canonical, legacyTraining(ctx).sets, function (event) { return [event.local_date, event.payload.exercise || event.payload.exercise_id || '', payloadNumber(event, 'load_kg'), payloadNumber(event, 'reps')].join('|'); }); var grouped = {};
      sets.forEach(function (event) {
        var name = event.payload.exercise || event.payload.exercise_id || 'Exercise'; var load = payloadNumber(event, 'load_kg'); var reps = payloadNumber(event, 'reps');
        var estimate = reps > 0 ? round(load * (1 + reps / 30), 1) : load;
        if (!grouped[name]) grouped[name] = [];
        grouped[name].push({ date: event.local_date, load_kg: load, reps: reps, estimated_1rm_kg: estimate, event_id: event.id });
      });
      var exercises = Object.keys(grouped).sort().map(function (name) {
        var history = grouped[name].sort(function (a, b) { return a.date < b.date ? -1 : 1; }); var pr = history.slice().sort(function (a, b) { return b.estimated_1rm_kg - a.estimated_1rm_kg; })[0];
        return { name: name, history: history, current_estimated_1rm_kg: history.length ? history[history.length - 1].estimated_1rm_kg : null, best: pr };
      });
      return { value: { exercises: exercises, personal_records: exercises.filter(function (exercise) { return exercise.best; }).map(function (exercise) { return { exercise: exercise.name, estimated_1rm_kg: exercise.best.estimated_1rm_kg, date: exercise.best.date, event_id: exercise.best.event_id }; }) }, sourceEventIds: ids(sets).map(function (id) { return id.split(':')[0]; }), coverage: sets.length ? 1 : 0 };
    },
  });

  add({
    id: 'training.program', displayName: 'Current training program', eventTypes: ['training.session.started'], eventDomains: ['training'],
    outputSchema: { type: 'object', required: ['configured'] },
    compute: function (ctx) { var event = latest(eventsOf(ctx, ['training.session.started']), ctx.date); return { value: event ? { configured: true, session_id: event.payload.session_id, program: event.payload.program || null, workout: event.payload.workout || null } : { configured: false, session_id: null, program: null, workout: null }, sourceEventIds: event ? [event.id] : [], coverage: event ? 1 : 0 }; },
  });

  add({
    id: 'body.current', displayName: 'Current body', eventTypes: ['body.weight.logged', 'body.composition.logged', 'body.measurement.logged'], eventDomains: ['body'],
    outputSchema: { type: 'object', required: ['weight_kg', 'body_fat_pct', 'lean_mass_kg'] },
    compute: function (ctx) {
      var weights = bodyWeightFacts(ctx).filter(function (event) { return event.local_date <= ctx.date; }); var comps = bodyCompositionFacts(ctx).filter(function (event) { return event.local_date <= ctx.date; });
      var measurements = bodyMeasurementFacts(ctx).filter(function (event) { return event.local_date <= ctx.date; });
      var weight = latest(weights, ctx.date); var comp = latest(comps, ctx.date); var measurement = latest(measurements, ctx.date);
      var weightKg = weight ? payloadNumber(weight, 'weight_kg') : null; var bf = comp ? payloadNumber(comp, 'body_fat_pct') : null;
      var lean = comp && comp.payload.lean_mass_kg != null ? payloadNumber(comp, 'lean_mass_kg') : weightKg != null && bf != null ? round(weightKg * (1 - bf / 100), 2) : null;
      return { value: { weight_kg: weightKg, body_fat_pct: bf, lean_mass_kg: lean, measurements_cm: measurement ? measurement.payload.measurements_cm || {} : {}, weight_date: weight && weight.local_date || null, composition_date: comp && comp.local_date || null, measurement_date: measurement && measurement.local_date || null, last_updated: [weight && weight.local_date, comp && comp.local_date, measurement && measurement.local_date].filter(Boolean).sort().pop() || null }, sourceEventIds: ids([weight, comp, measurement].filter(Boolean)).map(function (id) { return id.split(':')[0]; }), coverage: weight && comp ? 1 : weight || comp ? 0.5 : 0 };
    },
  });

  add({
    id: 'body.trends', displayName: 'Body trends', eventTypes: ['body.weight.logged', 'body.composition.logged', 'body.measurement.logged'], eventDomains: ['body'], timeWindow: 'available history',
    outputSchema: { type: 'object', required: ['weight_series', 'body_fat_series'] },
    compute: function (ctx) {
      var weights = bodyWeightFacts(ctx).filter(function (event) { return event.local_date <= ctx.date; }).sort(function (a, b) { return a.local_date < b.local_date ? -1 : 1; });
      var comps = bodyCompositionFacts(ctx).filter(function (event) { return event.local_date <= ctx.date; }).sort(function (a, b) { return a.local_date < b.local_date ? -1 : 1; });
      function delta(rows, key) { return rows.length > 1 ? round(payloadNumber(rows[rows.length - 1], key) - payloadNumber(rows[rows.length - 2], key), 2) : null; }
      return { value: { weight_series: weights.map(function (event) { return { date: event.local_date, value: payloadNumber(event, 'weight_kg') }; }), body_fat_series: comps.map(function (event) { return { date: event.local_date, value: payloadNumber(event, 'body_fat_pct') }; }), weight_delta_kg: delta(weights, 'weight_kg'), body_fat_delta_pct: delta(comps, 'body_fat_pct') }, sourceEventIds: ids(weights.concat(comps)).map(function (id) { return id.split(':')[0]; }), coverage: weights.length || comps.length ? 1 : 0 };
    },
  });

  add({
    id: 'body.goal_progress', displayName: 'Body goal progress', eventTypes: ['body.weight.logged', 'body.composition.logged', 'profile.settings.changed'], eventDomains: ['body', 'profile'], projectionDeps: ['body.current', 'profile.current'],
    outputSchema: { type: 'object', required: ['configured'] },
    compute: function (ctx) {
      var body = valueOf(ctx, 'body.current'); var settings = valueOf(ctx, 'profile.current').settings || {}; var goals = legacyValue(ctx, 'gym:goals:v1', {}) || {}; var targetWeight = Number(settings.targetWeight || settings.target_weight_kg || goals.weight || 0) || null; var targetBf = Number(settings.targetBodyFat || settings.target_body_fat_pct || goals.bf || 0) || null;
      return { value: { configured: targetWeight != null || targetBf != null, current_weight_kg: body.weight_kg, target_weight_kg: targetWeight, current_body_fat_pct: body.body_fat_pct, target_body_fat_pct: targetBf, weight_gap_kg: targetWeight != null && body.weight_kg != null ? round(targetWeight - body.weight_kg, 1) : null, body_fat_gap_pct: targetBf != null && body.body_fat_pct != null ? round(targetBf - body.body_fat_pct, 1) : null }, coverage: targetWeight || targetBf ? 1 : 0 };
    },
  });

  add({
    id: 'productivity.day_plan', displayName: 'Day plan', eventTypes: ['task.changed', 'goal.changed', 'calendar.event.changed'], eventDomains: ['productivity'], timeWindow: 'local day',
    outputSchema: { type: 'object', required: ['date', 'tasks', 'goals', 'calendar'] },
    compute: function (ctx) {
      var events = ctx.events.filter(function (event) { return event.local_date <= ctx.date; });
      function latestEntities(type, idKey) {
        var map = {}; events.filter(function (event) { return event.type === type; }).forEach(function (event) { var key = event.payload[idKey]; if (key) map[key] = event.payload.change || event.payload; }); return Object.keys(map).map(function (key) { return Object.assign({ id: key }, typeof map[key] === 'object' ? map[key] : { value: map[key] }); });
      }
      return { value: { date: ctx.date, tasks: latestEntities('task.changed', 'task_id'), goals: latestEntities('goal.changed', 'goal_id'), calendar: latestEntities('calendar.event.changed', 'event_id') }, sourceEventIds: ids(events), coverage: events.length ? 1 : 0 };
    },
  });

  add({
    id: 'productivity.focus', displayName: 'Productivity focus', eventTypes: ['task.changed', 'goal.changed', 'calendar.event.changed'], eventDomains: ['productivity'], projectionDeps: ['productivity.day_plan'],
    outputSchema: { type: 'object', required: ['open_items'] },
    compute: function (ctx) { var plan = valueOf(ctx, 'productivity.day_plan'); var all = (plan.tasks || []).concat(plan.goals || []); var open = all.filter(function (item) { return !item.done && item.status !== 'completed'; }); return { value: { open_items: open.length, next: open[0] || null }, coverage: all.length ? 1 : 0 }; },
  });

  add({
    id: 'productivity.completion', displayName: 'Productivity completion', eventTypes: ['task.changed', 'goal.changed', 'habit.changed'], eventDomains: ['productivity'], projectionDeps: ['productivity.day_plan'], timeWindow: 'local day',
    outputSchema: { type: 'object', required: ['goals_total', 'goals_done', 'tasks_done', 'habits_total', 'habits_done'] },
    compute: function (ctx) {
      var plan = valueOf(ctx, 'productivity.day_plan'); var goals = plan.goals || []; var tasks = plan.tasks || [];
      var habitEvents = eventsOf(ctx, ['habit.changed']).filter(function (event) { return event.local_date <= ctx.date; }); var habits = {};
      habitEvents.forEach(function (event) { var key = event.payload.habit_id || event.payload.id || event.source_ref; if (key) habits[key] = Object.assign({}, habits[key] || {}, event.payload.change || event.payload); });
      var canonicalHabits = Object.keys(habits).map(function (key) { return Object.assign({ id: key }, habits[key]); });
      var legacy = legacyHabitState(ctx); var legacyIds = legacy.definitions.map(function (habit) { return String(habit.id != null ? habit.id : habit.name || habit.title); });
      var canonicalIds = canonicalHabits.map(function (habit) { return String(habit.id); });
      var legacyOnly = legacyIds.filter(function (id) { return canonicalIds.indexOf(id) < 0; });
      var habitsTotal = canonicalHabits.filter(function (habit) { return habit.archived !== true && habit.deleted !== true; }).length + legacyOnly.length;
      var habitsDone = canonicalHabits.filter(function (habit) { return habit.done === true || habit.completed === true || habit.status === 'completed'; }).length + legacy.done.filter(function (id) { return canonicalIds.indexOf(String(id)) < 0; }).length;
      return { value: { goals_total: goals.length, goals_done: goals.filter(function (item) { return item.done || item.status === 'completed'; }).length, tasks_done: tasks.filter(function (item) { return item.done || item.status === 'completed'; }).length, habits_total: habitsTotal, habits_done: Math.min(habitsTotal, habitsDone), focus_minutes: 0 }, sourceEventIds: ids(habitEvents).concat(legacy.sourceIds), coverage: goals.length || tasks.length || habitsTotal ? 1 : 0 };
    },
  });

  add({
    id: 'finance.transactions', displayName: 'Finance transactions', eventTypes: ['finance.transaction.logged', 'finance.transaction.imported'], eventDomains: ['finance'], timeWindow: 'all effective transactions',
    outputSchema: { type: 'object', required: ['items', 'total'] },
    compute: function (ctx) {
      var events = financeTransactions(ctx).filter(function (event) { return event.local_date <= ctx.date; });
      var items = events.map(function (event) { var p = event.payload || {}; return { id: p.transaction_id || p.provider_record_id || event.id, canonical_event_id: event.id, date: event.local_date, occurred_at: event.occurred_at, description: p.description || 'Transaction', category: p.category || 'Other', amount_minor: transactionAmount(event), amount: transactionAmount(event) / 100, currency: p.currency || 'EUR', account_id: p.account_id || null, business: !!(p.business || p.scope === 'business'), source: event.source, provider: p.provider || null, provider_record_id: p.provider_record_id || null, reconciled: p.reconciled !== false, truth_class: event.type === 'finance.transaction.imported' ? 'provider-sourced' : 'manual' }; }).sort(function (a, b) { return String(a.occurred_at).localeCompare(String(b.occurred_at)); });
      return { value: { items: items, total: items.length, imported: items.filter(function (item) { return item.truth_class === 'provider-sourced'; }).length, manual: items.filter(function (item) { return item.truth_class === 'manual'; }).length }, sourceEventIds: ids(events), coverage: items.length ? 1 : 0, limitations: ['Imported facts retain provider identity; manual entries remain visibly distinct.'] };
    },
  });
  add({
    id: 'finance.accounts', displayName: 'Finance accounts', eventTypes: ['finance.account.changed'], eventDomains: ['finance'], timeWindow: 'latest effective account state',
    outputSchema: { type: 'object', required: ['items', 'assets_minor', 'liabilities_minor', 'net_worth_minor'] },
    compute: function (ctx) {
      var events = eventsOf(ctx, ['finance.account.changed']).filter(function (event) { return event.local_date <= ctx.date; }); var map = {};
      events.forEach(function (event) { var p = event.payload || {}; var key = p.account_id || event.source_ref; if (key) map[key] = Object.assign({ id: key, canonical_event_id: event.id }, p); });
      var items = Object.keys(map).map(function (key) { return map[key]; });
      var liabilities = sum(items.filter(function (row) { return row.type === 'credit' || row.type === 'loan' || row.liability; }).map(function (row) { return Math.abs(Number(row.balance_minor || 0)); }));
      var assets = sum(items.filter(function (row) { return !(row.type === 'credit' || row.type === 'loan' || row.liability); }).map(function (row) { return Number(row.balance_minor || 0); }));
      return { value: { items: items, total: items.length, assets_minor: round(assets, 0), liabilities_minor: round(liabilities, 0), net_worth_minor: round(assets - liabilities, 0), currency: items[0] && items[0].currency || 'EUR' }, sourceEventIds: ids(events), coverage: items.length ? 1 : 0 };
    },
  });
  add({
    id: 'finance.cashflow', displayName: 'Monthly cash flow', eventTypes: ['finance.transaction.logged', 'finance.transaction.imported'], eventDomains: ['finance'], timeWindow: 'calendar month',
    outputSchema: { type: 'object', required: ['month', 'income_minor', 'expenses_minor', 'net_minor'] },
    compute: function (ctx) {
      var month = ctx.date.slice(0, 7); var tx = financeTransactions(ctx).filter(function (event) { return event.local_date.slice(0, 7) === month; });
      var income = sum(tx.map(transactionAmount).filter(function (value) { return value > 0; })); var expenses = -sum(tx.map(transactionAmount).filter(function (value) { return value < 0; }));
      if (!tx.length) {
        var legacyIncome = legacyValue(ctx, 'fin:income', []) || []; var legacySubs = legacyValue(ctx, 'fin:subs', []) || []; var legacyBudgets = legacyValue(ctx, 'fin:budgets', {}) || {};
        income = sum(legacyIncome.filter(function (row) { return String(row.date || '').slice(0, 7) === month; }).map(function (row) { return Number(row.amount || 0) * 100; }));
        expenses = sum(legacySubs.filter(function (row) { return row.active !== false; }).map(function (row) { var amount = Number(row.cost || row.amount || 0); var freq = row.frequency || row.freq || 'monthly'; return (freq === 'yearly' || freq === 'annual' ? amount / 12 : freq === 'weekly' ? amount * 4.33 : amount) * 100; })) + sum(Object.keys(legacyBudgets).map(function (key) { return Number(legacyBudgets[key] || 0) * 100; }));
      }
      return { value: { month: month, currency: tx[0] && tx[0].payload.currency || 'EUR', income_minor: round(income, 0), expenses_minor: round(expenses, 0), net_minor: round(income - expenses, 0), savings_rate_pct: income ? round((income - expenses) / income * 100, 0) : null, transaction_count: tx.length, truth_class: tx.length ? (tx.every(function (event) { return event.type === 'finance.transaction.imported'; }) ? 'provider-sourced' : 'mixed-source') : 'legacy-estimate' }, sourceEventIds: ids(tx).concat(ids(['fin:income', 'fin:subs', 'fin:budgets'].map(function (key) { return legacyEvent(ctx, key); }).filter(Boolean))), coverage: tx.length || income ? 1 : 0 };
    },
  });

  add({
    id: 'finance.spending', displayName: 'Spending', eventTypes: ['finance.transaction.logged', 'finance.transaction.imported'], eventDomains: ['finance'], timeWindow: 'calendar month',
    outputSchema: { type: 'object', required: ['total_minor', 'categories'] },
    compute: function (ctx) { var month = ctx.date.slice(0, 7); var tx = financeTransactions(ctx).filter(function (event) { return event.local_date.slice(0, 7) === month && transactionAmount(event) < 0; }); var categories = {}; tx.forEach(function (event) { var key = event.payload.category || 'Other'; categories[key] = (categories[key] || 0) + Math.abs(transactionAmount(event)); }); return { value: { month: month, total_minor: sum(Object.keys(categories).map(function (key) { return categories[key]; })), categories: Object.keys(categories).sort().map(function (key) { return { category: key, amount_minor: categories[key] }; }) }, sourceEventIds: ids(tx), coverage: tx.length ? 1 : 0 }; },
  });

  add({
    id: 'finance.wealth', displayName: 'Wealth', eventTypes: ['finance.account.changed'], eventDomains: ['finance'], projectionDeps: ['finance.accounts'],
    outputSchema: { type: 'object', required: ['assets_minor', 'liabilities_minor', 'net_worth_minor'] },
    compute: function (ctx) { var accounts = valueOf(ctx, 'finance.accounts'); return { value: { assets_minor: accounts.assets_minor || 0, liabilities_minor: accounts.liabilities_minor || 0, net_worth_minor: accounts.net_worth_minor || 0, accounts: accounts.total || 0, currency: accounts.currency || 'EUR', items: accounts.items || [] }, sourceEventIds: ctx.envelope('finance.accounts').provenance.source_event_ids, coverage: accounts.total ? 1 : 0 }; },
  });

  add({ id: 'finance.history', displayName: 'Finance monthly history', eventTypes: ['finance.transaction.logged', 'finance.transaction.imported'], eventDomains: ['finance'], timeWindow: 'all recorded months', outputSchema: { type: 'object', required: ['months'] }, compute: function (ctx) { var grouped = {}; financeTransactions(ctx).filter(function (event) { return event.local_date <= ctx.date; }).forEach(function (event) { var month = event.local_date.slice(0, 7); grouped[month] = grouped[month] || { month: month, income_minor: 0, expenses_minor: 0, net_minor: 0 }; var amount = transactionAmount(event); if (amount >= 0) grouped[month].income_minor += amount; else grouped[month].expenses_minor += Math.abs(amount); grouped[month].net_minor += amount; }); return { value: { months: Object.keys(grouped).sort().map(function (key) { return grouped[key]; }) }, sourceEventIds: ids(financeTransactions(ctx)) }; } });
  add({ id: 'finance.reconciliation', displayName: 'Finance reconciliation', eventTypes: ['finance.transaction.logged', 'finance.transaction.imported'], eventDomains: ['finance'], projectionDeps: ['finance.transactions'], outputSchema: { type: 'object', required: ['status', 'imported', 'manual', 'unreconciled'] }, compute: function (ctx) { var tx = valueOf(ctx, 'finance.transactions').items || []; var imported = tx.filter(function (item) { return item.truth_class === 'provider-sourced'; }); var manual = tx.filter(function (item) { return item.truth_class === 'manual'; }); var unreconciled = tx.filter(function (item) { return item.reconciled === false; }); var currencies = unique(tx.map(function (item) { return item.currency; })); return { value: { status: !tx.length ? 'no-data' : unreconciled.length ? 'review' : 'reconciled', imported: imported.length, manual: manual.length, unreconciled: unreconciled.length, currencies: currencies, last_import_at: imported.length ? imported[imported.length - 1].occurred_at : null }, coverage: tx.length ? 1 : 0, limitations: ['Reconciled means records passed local identity and schema checks; it does not verify a live bank balance.'] }; } });
  add({ id: 'finance.overview', displayName: 'Finance overview', eventTypes: [], eventDomains: ['finance'], projectionDeps: ['finance.transactions', 'finance.accounts', 'finance.cashflow', 'finance.spending', 'finance.wealth', 'finance.history', 'finance.reconciliation'], outputSchema: { type: 'object', required: ['cashflow', 'spending', 'wealth'] }, compute: function (ctx) { return { value: { transactions: valueOf(ctx, 'finance.transactions'), accounts: valueOf(ctx, 'finance.accounts'), cashflow: valueOf(ctx, 'finance.cashflow'), spending: valueOf(ctx, 'finance.spending'), wealth: valueOf(ctx, 'finance.wealth'), history: valueOf(ctx, 'finance.history'), reconciliation: valueOf(ctx, 'finance.reconciliation') } }; } });
  add({ id: 'finance.business', displayName: 'Business finance', eventTypes: ['finance.transaction.logged', 'finance.transaction.imported'], eventDomains: ['finance'], timeWindow: 'calendar month and year to date', outputSchema: { type: 'object', required: ['revenue_minor', 'expenses_minor', 'profit_minor'] }, compute: function (ctx) { var all = financeTransactions(ctx).filter(function (event) { return event.local_date <= ctx.date && (event.payload.business || event.payload.scope === 'business'); }); var tx = all.filter(function (event) { return event.local_date.slice(0, 7) === ctx.date.slice(0, 7); }); var ytd = all.filter(function (event) { return event.local_date.slice(0, 4) === ctx.date.slice(0, 4); }); var revenue = sum(tx.map(transactionAmount).filter(function (amount) { return amount > 0; })); var expense = -sum(tx.map(transactionAmount).filter(function (amount) { return amount < 0; })); var ytdRevenue = sum(ytd.map(transactionAmount).filter(function (amount) { return amount > 0; })); var ytdExpense = -sum(ytd.map(transactionAmount).filter(function (amount) { return amount < 0; })); return { value: { revenue_minor: revenue, expenses_minor: expense, profit_minor: revenue - expense, margin_pct: revenue ? round((revenue - expense) / revenue * 100, 1) : null, ytd_revenue_minor: ytdRevenue, ytd_expenses_minor: ytdExpense, ytd_profit_minor: ytdRevenue - ytdExpense, truth_class: all.length ? 'recorded-transactions' : 'missing-data' }, sourceEventIds: ids(all), coverage: all.length ? 1 : 0 }; } });
  add({ id: 'finance.planning', displayName: 'Financial planning', eventTypes: ['finance.account.changed'], eventDomains: ['finance'], projectionDeps: ['finance.cashflow', 'finance.wealth'], outputSchema: { type: 'object', required: ['savings_rate_pct', 'net_worth_minor'] }, compute: function (ctx) { var cash = valueOf(ctx, 'finance.cashflow'); var wealth = valueOf(ctx, 'finance.wealth'); return { value: { savings_rate_pct: cash.savings_rate_pct, monthly_surplus_minor: cash.net_minor, net_worth_minor: wealth.net_worth_minor, status: cash.savings_rate_pct == null ? 'missing-income' : cash.savings_rate_pct >= 20 ? 'on-track' : 'review', truth_class: 'deterministic-estimate', assumptions: ['Current-month cash flow represents the planning baseline.', 'Account balances are current only as of their latest recorded update.'], limitations: ['This is a planning estimate, not financial advice or a live affordability decision.'] } }; } });

  add({
    id: 'supplements.schedule', displayName: 'Supplement schedule', eventTypes: ['supplement.compound.changed'], eventDomains: ['supplements'],
    outputSchema: { type: 'object', required: ['items', 'total'] },
    compute: function (ctx) {
      var events = eventsOf(ctx, ['supplement.compound.changed']); var items = {};
      events.forEach(function (event) { var key = String(event.payload.compound_id || event.payload.compound || event.source_ref); items[key] = Object.assign({ id: key, canonical_event_id: event.id }, event.payload); });
      var legacySource = legacyEvent(ctx, 'stack:items');
      (legacyValue(ctx, 'stack:items', []) || []).forEach(function (item, index) { var key = String(item.id || item.name || index); if (!items[key]) items[key] = Object.assign({ id: key, legacy: true }, item); });
      var rows = Object.keys(items).map(function (key) { return items[key]; }).filter(function (item) { return item.active !== false; });
      return { value: { items: rows, total: rows.length }, sourceEventIds: ids(events).concat(ids([legacySource].filter(Boolean))), coverage: rows.length ? 1 : 0 };
    },
  });
  add({
    id: 'supplements.adherence', displayName: 'Supplement adherence', eventTypes: ['supplement.dose.logged'], eventDomains: ['supplements'], projectionDeps: ['supplements.schedule'], timeWindow: 'local day', outputSchema: { type: 'object', required: ['scheduled', 'taken', 'due', 'taken_compound_ids'] },
    compute: function (ctx) {
      var schedule = valueOf(ctx, 'supplements.schedule'); var allDoseStates = byDate(eventsOf(ctx, ['supplement.dose.logged']), ctx.date);
      var doses = allDoseStates.filter(function (event) { return event.payload.taken !== false; });
      var blockedIds = unique(allDoseStates.filter(function (event) { return event.payload.taken === false; }).map(function (event) { return String(event.payload.compound_id || event.payload.compound); }));
      var canonicalIds = unique(doses.map(function (event) { return String(event.payload.compound_id || event.payload.compound); }));
      var legacy = legacyEventsByPrefix(ctx, 'stack:taken:').filter(function (event) { return event.payload.legacy_key === 'stack:taken:' + ctx.date; });
      var legacyTaken = legacy.length && legacy[legacy.length - 1].payload.parsed_value || {};
      var takenIds = unique(canonicalIds.concat(Object.keys(legacyTaken).filter(function (key) { return legacyTaken[key] && blockedIds.indexOf(String(key)) < 0; }).map(String)));
      var scheduledIds = (schedule.items || []).map(function (item) { return String(item.id || item.compound_id || item.compound); });
      takenIds = takenIds.filter(function (id) { return scheduledIds.indexOf(id) >= 0; });
      var dueIds = scheduledIds.filter(function (id) { return takenIds.indexOf(id) < 0; });
      return { value: { scheduled: scheduledIds.length, taken: takenIds.length, due: dueIds.length, adherence_pct: scheduledIds.length ? round(takenIds.length / scheduledIds.length * 100, 0) : null, taken_compound_ids: takenIds, due_compound_ids: dueIds }, sourceEventIds: ids(allDoseStates).concat(ids(legacy)), coverage: scheduledIds.length ? Math.min(1, takenIds.length / scheduledIds.length) : 0 };
    },
  });
  add({
    id: 'supplements.inventory', displayName: 'Supplement inventory', eventTypes: ['supplement.inventory.changed'], eventDomains: ['supplements'], projectionDeps: ['supplements.schedule'], outputSchema: { type: 'object', required: ['items', 'low_stock'] },
    compute: function (ctx) {
      var map = {}; var events = eventsOf(ctx, ['supplement.inventory.changed']);
      events.forEach(function (event) { var key = String(event.payload.item_id || event.payload.compound); map[key] = Object.assign({ id: key, inventory_canonical_event_id: event.id }, event.payload); });
      var lowIds = (legacyValue(ctx, 'stack:low', []) || []).map(String);
      (valueOf(ctx, 'supplements.schedule').items || []).forEach(function (item) { var key = String(item.id || item.compound_id || item.compound); if (!map[key] && (item.stock != null || item.reorderAt != null || item.expiry || lowIds.indexOf(key) >= 0)) map[key] = { id: key, item_id: key, remaining: item.stock, unit: item.stockUnit, reorder_at: item.reorderAt, expiry: item.expiry, low_stock: lowIds.indexOf(key) >= 0, legacy: true }; });
      var rows = Object.keys(map).map(function (key) { return map[key]; });
      var low = rows.filter(function (item) { return item.low_stock || item.remaining != null && item.reorder_at != null && Number(item.remaining) <= Number(item.reorder_at); });
      return { value: { items: rows, low_stock: low, tracked: rows.filter(function (item) { return item.remaining != null; }).length }, sourceEventIds: ids(events).concat(ids([legacyEvent(ctx, 'stack:low')].filter(Boolean))), coverage: rows.length ? 1 : 0 };
    },
  });
  add({ id: 'supplements.notes', displayName: 'Supplement notes', eventTypes: ['supplement.note.logged'], eventDomains: ['supplements'], timeWindow: 'all available notes', outputSchema: { type: 'object', required: ['items'] }, compute: function (ctx) { var events = eventsOf(ctx, ['supplement.note.logged']); var rows = events.map(function (event) { return Object.assign({ id: event.payload.note_id, canonical_event_id: event.id, date: event.local_date }, event.payload); }); var legacy = legacyValue(ctx, 'supps:notes:v1', []) || []; legacy.forEach(function (note, index) { if (!rows.some(function (row) { return String(row.id) === String(note.id); })) rows.push(Object.assign({ id: note.id || index, legacy: true }, note)); }); rows.sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); }); return { value: { items: rows, total: rows.length }, sourceEventIds: ids(events).concat(ids([legacyEvent(ctx, 'supps:notes:v1')].filter(Boolean))), coverage: rows.length ? 1 : 0 }; } });
  add({
    id: 'supplements.monitoring', displayName: 'Supplement monitoring', eventTypes: ['supplement.compound.changed'], eventDomains: ['supplements'], projectionDeps: ['supplements.schedule', 'labs.latest', 'labs.attention'], outputSchema: { type: 'object', required: ['status', 'watch_items', 'context_items'] },
    compute: function (ctx) {
      var schedule = valueOf(ctx, 'supplements.schedule'); var labs = valueOf(ctx, 'labs.attention'); var latestLabs = valueOf(ctx, 'labs.latest');
      var context = [];
      if ((schedule.items || []).length && latestLabs.available) context.push({ id: 'shared-panel-context', title: 'Review measured labs with the active stack', detail: 'The latest panel and current compounds are shown together as context only.', truth_class: 'measured-context', severity: labs.count ? 'review' : 'info' });
      if ((schedule.items || []).some(function (item) { return String(item.route || '').toLowerCase() === 'injection'; })) context.push({ id: 'injection-monitoring', title: 'Injection protocol on record', detail: 'Use clinician-directed monitoring and do not infer dose changes from this dashboard.', truth_class: 'recorded-protocol', severity: 'info' });
      return { value: { status: labs.items && labs.items.length ? 'review' : latestLabs.available ? 'panel-current' : 'needs-baseline-panel', latest_panel_date: latestLabs.date || null, active_compounds: (schedule.items || []).length, watch_items: labs.items || [], context_items: context, numeric_predictions_enabled: false, limitations: ['Compound-to-marker effects are contextual only unless an evaluated rule is registered.', 'This view does not recommend starting, stopping, or changing a dose.'] }, coverage: latestLabs.available ? 1 : 0 };
    },
  });

  add({ id: 'labs.latest', displayName: 'Latest labs', eventTypes: ['labs.panel.logged', 'labs.panel.imported', 'labs.marker.corrected'], eventDomains: ['labs'], outputSchema: { type: 'object', required: ['available', 'markers'] }, compute: function (ctx) { var panel = latest(labPanelFacts(ctx), ctx.date); return { value: panel ? { available: true, date: panel.local_date, markers: normalizeLabMarkers(panel.payload.markers), provider: panel.payload.provider || null, phase: panel.payload.phase || null } : { available: false, date: null, markers: [] }, sourceEventIds: panel ? [sourceId(panel)] : [], coverage: panel ? 1 : 0 }; } });
  add({ id: 'labs.trends', displayName: 'Lab trends', eventTypes: ['labs.panel.logged', 'labs.panel.imported', 'labs.marker.corrected'], eventDomains: ['labs'], timeWindow: 'all available panels', outputSchema: { type: 'object', required: ['panels'] }, compute: function (ctx) { var panels = labPanelFacts(ctx).filter(function (event) { return event.local_date <= ctx.date; }).sort(function (a, b) { return a.local_date < b.local_date ? -1 : 1; }); return { value: { panels: panels.map(function (event) { return { id: event.id, date: event.local_date, markers: normalizeLabMarkers(event.payload.markers) }; }) }, sourceEventIds: ids(panels).map(sourceId), coverage: panels.length > 1 ? 1 : panels.length ? 0.5 : 0 }; } });
  add({ id: 'labs.attention', displayName: 'Lab attention', eventTypes: ['labs.panel.logged', 'labs.panel.imported', 'labs.marker.corrected'], eventDomains: ['labs'], projectionDeps: ['labs.latest'], outputSchema: { type: 'object', required: ['items'] }, compute: function (ctx) { var latestLabs = valueOf(ctx, 'labs.latest'); var markers = latestLabs.markers || {}; var rows = Array.isArray(markers) ? markers : Object.keys(markers).map(function (key) { return Object.assign({ name: key }, typeof markers[key] === 'object' ? markers[key] : { value: markers[key] }); }); var items = rows.filter(function (marker) { return marker.status === 'high' || marker.status === 'low' || marker.status === 'watch' || marker.out_of_range; }); return { value: { items: items, count: items.length }, coverage: latestLabs.available ? 1 : 0 }; } });
  add({
    id: 'labs.model_status', displayName: 'Bloodwork model status', eventTypes: ['labs.outlook.recorded'], eventDomains: ['labs'], truthClass: 'model-governance', calculationType: 'deterministic', timeWindow: 'current registered release', outputSchema: { type: 'object', required: ['model', 'gate'] },
    compute: function () {
      var model = BloodworkModels.active(); var gate = BloodworkModels.evaluateGates(model);
      return { value: { model: model, gate: gate, numeric_predictions_enabled: gate.numeric_predictions_enabled }, coverage: 1, confidence: { level: 'not-applicable', score: null, coverage: 1, sample_size: 0, calibration_state: gate.release_state }, limitations: model.limitations };
    },
  });
  add({
    id: 'labs.outlook', displayName: 'Bloodwork outlook', eventTypes: ['labs.panel.logged', 'labs.panel.imported', 'labs.marker.corrected'], eventDomains: ['labs'], projectionDeps: ['labs.model_status', 'labs.latest', 'nutrition.rolling_30d', 'nutrition.rolling_90d', 'hydration.rolling_30d', 'body.trends'], truthClass: 'directional-estimate', calculationType: 'statistical', timeWindow: '30-90 days', outputSchema: { type: 'object', required: ['status', 'features', 'numeric_predictions_enabled', 'directions', 'model'] }, missingData: 'Numeric outlooks remain disabled until every model evaluation, calibration, subgroup, drift, audit, language, and independent safety gate passes.',
    compute: function (ctx) {
      var panels = labPanelFacts(ctx).filter(function (event) { return event.local_date <= ctx.date; }).map(function (event) { return { id: event.id, local_date: event.local_date, payload: Object.assign({}, event.payload, { markers: normalizeLabMarkers(event.payload.markers) }) }; });
      var status = valueOf(ctx, 'labs.model_status'); var model = status.model || BloodworkModels.active(); var gate = status.gate || BloodworkModels.evaluateGates(model);
      var value = BloodworkOutlook.build({ panels: panels, nutrition30: valueOf(ctx, 'nutrition.rolling_30d'), nutrition90: valueOf(ctx, 'nutrition.rolling_90d'), hydration30: valueOf(ctx, 'hydration.rolling_30d'), body: valueOf(ctx, 'body.trends'), model: model, gate: gate, asOf: ctx.date });
      return { value: value, sourceEventIds: ids(panels).map(sourceId), coverage: value.confidence && value.confidence.score || 0, confidence: value.confidence, limitations: value.limitations || [] };
    },
  });
  add({
    id: 'labs.outlook_evaluation', displayName: 'Bloodwork outlook evaluation', eventTypes: ['labs.outlook.recorded', 'labs.panel.logged', 'labs.panel.imported'], eventDomains: ['labs'], projectionDeps: ['labs.model_status'], truthClass: 'retrospective-evaluation', calculationType: 'statistical', timeWindow: 'all recorded outlook snapshots', outputSchema: { type: 'object', required: ['evaluations', 'calibration_state', 'numeric_error_metrics'] },
    compute: function (ctx) {
      var panels = labPanelFacts(ctx).filter(function (event) { return event.local_date <= ctx.date; }).map(function (event) { return { id: event.id, local_date: event.local_date, payload: Object.assign({}, event.payload, { markers: normalizeLabMarkers(event.payload.markers) }) }; });
      var snapshots = eventsOf(ctx, ['labs.outlook.recorded']).filter(function (event) { return event.local_date <= ctx.date; });
      var value = BloodworkOutlook.evaluate({ panels: panels, snapshots: snapshots });
      return { value: value, sourceEventIds: ids(panels.concat(snapshots)).map(sourceId), coverage: Math.min(1, value.evaluated_snapshots / 3), confidence: { level: value.evaluated_snapshots >= 3 ? 'monitoring' : 'insufficient-sample', score: value.directional_agreement, coverage: Math.min(1, value.evaluated_snapshots / 3), sample_size: value.evaluated_snapshots, calibration_state: value.calibration_state }, limitations: value.limitations };
    },
  });

  add({ id: 'skin.products', displayName: 'Skin products', eventTypes: ['skin.product.changed'], eventDomains: ['skin'], outputSchema: { type: 'object', required: ['items', 'total'] }, compute: function (ctx) { var events = eventsOf(ctx, ['skin.product.changed']); var map = {}; events.forEach(function (event) { var id = String(event.payload.product_id); map[id] = Object.assign({ id: id, canonical_event_id: event.id, type: event.payload.product_type, freq: event.payload.frequency }, event.payload); }); (legacyValue(ctx, 'skin:products', []) || []).forEach(function (item, index) { var id = String(item.id || item.name || index); if (!map[id]) map[id] = Object.assign({ id: id, legacy: true }, item); }); var rows = Object.keys(map).map(function (id) { return map[id]; }).filter(function (item) { return item.active !== false; }); return { value: { items: rows, total: rows.length, categories: unique(rows.map(function (item) { return item.type || item.product_type || 'other'; })) }, sourceEventIds: ids(events).concat(ids([legacyEvent(ctx, 'skin:products')].filter(Boolean))), coverage: rows.length ? 1 : 0 }; } });
  add({ id: 'skin.routine', displayName: 'Skin routine', eventTypes: ['skin.routine.logged'], eventDomains: ['skin'], projectionDeps: ['skin.products'], timeWindow: '7 local days', outputSchema: { type: 'object', required: ['today_product_ids', 'adherence_7d_pct'] }, compute: function (ctx) { var events = inDates(eventsOf(ctx, ['skin.routine.logged']), lastDates(ctx.date, 7)); var byDay = {}, blocked = {}; events.forEach(function (event) { var id = String(event.payload.product_id); var key = event.local_date + ':' + id; if (event.payload.completed === false) { blocked[key] = true; return; } byDay[event.local_date] = byDay[event.local_date] || []; byDay[event.local_date].push(id); }); var legacy = legacyValue(ctx, 'skin:routine:v1', {}) || {}; lastDates(ctx.date, 7).forEach(function (date) { (legacy[date] || []).forEach(function (id) { id = String(id); if (blocked[date + ':' + id]) return; byDay[date] = byDay[date] || []; if (byDay[date].indexOf(id) < 0) byDay[date].push(id); }); }); var products = (valueOf(ctx, 'skin.products').items || []).filter(function (item) { return String(item.freq || item.frequency || 'daily') !== 'asNeeded'; }); var due = products.length; var completed = sum(lastDates(ctx.date, 7).map(function (date) { return (byDay[date] || []).filter(function (id) { return products.some(function (item) { return String(item.id) === id; }); }).length; })); return { value: { today_product_ids: unique(byDay[ctx.date] || []), by_date: byDay, scheduled_products: due, adherence_7d_pct: due ? round(completed / (due * 7) * 100, 0) : null, completed_steps_7d: completed }, sourceEventIds: ids(events).concat(ids([legacyEvent(ctx, 'skin:routine:v1')].filter(Boolean))), coverage: due ? Math.min(1, completed / (due * 7)) : 0 }; } });
  add({ id: 'skin.current', displayName: 'Current skin', eventTypes: ['skin.checkin.logged', 'skin.routine.logged', 'skin.product.changed'], eventDomains: ['skin'], projectionDeps: ['skin.products', 'skin.routine'], outputSchema: { type: 'object', required: ['checkin', 'routine_logs_7d'] }, compute: function (ctx) { var checks = eventsOf(ctx, ['skin.checkin.logged']); var legacyRows = legacyValue(ctx, 'skin:logs', []) || []; var legacySource = legacyEvent(ctx, 'skin:logs'); legacyRows.forEach(function (row, index) { if (!checks.some(function (event) { return String(event.payload.checkin_id) === String(row.id != null ? row.id : row.date); })) checks.push({ id: legacySource ? legacySource.id + ':' + index : 'legacy-skin:' + index, local_date: row.date, occurred_at: row.date + 'T12:00:00Z', payload: Object.assign({ checkin_id: row.id != null ? String(row.id) : row.date, rating: Number(row.rating || 0), water_l: row.water, sleep_hours: row.sleep }, row) }); }); var check = latest(checks, ctx.date); var routine = valueOf(ctx, 'skin.routine'); return { value: { checkin: check ? Object.assign({ canonical_event_id: /^evt_/.test(check.id) ? check.id : null, date: check.local_date }, check.payload) : null, routine_logs_7d: routine.completed_steps_7d || 0, routine: routine, products: valueOf(ctx, 'skin.products').items || [] }, sourceEventIds: ids([check].filter(Boolean)), coverage: check ? 1 : 0 }; } });
  add({ id: 'skin.support', displayName: 'Skin support records', eventTypes: ['skin.breakout.logged', 'skin.treatment.logged', 'skin.ingredient.changed', 'skin.goal.changed'], eventDomains: ['skin'], outputSchema: { type: 'object', required: ['breakouts', 'treatments', 'ingredients', 'goals'] }, compute: function (ctx) { function rows(type, idKey, legacyKey, normalizeLegacy) { var events = eventsOf(ctx, [type]); var out = events.map(function (event) { return Object.assign({ id: event.payload[idKey], canonical_event_id: event.id, date: event.local_date }, event.payload); }); (legacyValue(ctx, legacyKey, []) || []).forEach(function (row, index) { var normalized = normalizeLegacy ? normalizeLegacy(row, index) : Object.assign({}, row); var id = String(normalized.id != null ? normalized.id : index); if (!out.some(function (item) { return String(item.id) === id; })) out.push(Object.assign({ id: id, legacy: true }, normalized)); }); return out; } function semanticUnique(items, key) { var seen = {}; return items.filter(function (item) { var value = String(key(item) || '').trim().toLowerCase(); if (!value || seen[value]) return false; seen[value] = true; return true; }); } var breakouts = rows('skin.breakout.logged', 'breakout_id', 'skin:breakouts'); var treatments = rows('skin.treatment.logged', 'treatment_id', 'skin:device_sessions', function (row) { return Object.assign({ treatment_type: row.type }, row); }); var ingredients = semanticUnique(rows('skin.ingredient.changed', 'ingredient_id', 'skin:ingredients', function (name, index) { return { id: index + ':' + String(name), name: String(name), status: 'watch' }; }), function (item) { return item.name; }); var goals = semanticUnique(rows('skin.goal.changed', 'goal_id', 'skin:goals', function (row, index) { return Object.assign({ id: row.id || index }, row); }), function (item) { return item.text; }); return { value: { breakouts: breakouts, treatments: treatments, ingredients: ingredients, goals: goals }, sourceEventIds: ids(eventsOf(ctx, ['skin.breakout.logged', 'skin.treatment.logged', 'skin.ingredient.changed', 'skin.goal.changed'])), coverage: breakouts.length || treatments.length || ingredients.length || goals.length ? 1 : 0 }; } });
  add({ id: 'skin.progress', displayName: 'Skin progress', eventTypes: ['skin.checkin.logged', 'skin.photo.added'], eventDomains: ['skin'], projectionDeps: ['skin.current'], timeWindow: '30 local days', outputSchema: { type: 'object', required: ['checkins', 'photo_sets'] }, compute: function (ctx) { var dates = lastDates(ctx.date, 30); var checks = inDates(eventsOf(ctx, ['skin.checkin.logged']), dates); var legacyRows = (legacyValue(ctx, 'skin:logs', []) || []).filter(function (row) { return dates.indexOf(row.date) >= 0; }); var legacySource = legacyEvent(ctx, 'skin:logs'); legacyRows.forEach(function (row, index) { if (!checks.some(function (event) { return String(event.payload.checkin_id) === String(row.id != null ? row.id : row.date); })) checks.push({ id: legacySource ? legacySource.id + ':' + index : 'legacy-skin:' + index, local_date: row.date, occurred_at: row.date + 'T12:00:00Z', payload: Object.assign({ checkin_id: row.id != null ? String(row.id) : row.date, rating: Number(row.rating || 0) }, row) }); }); var photos = inDates(eventsOf(ctx, ['skin.photo.added']), dates); return { value: { checkins: checks.map(function (event) { return { id: event.payload.checkin_id || event.id, canonical_event_id: /^evt_/.test(event.id) ? event.id : null, date: event.local_date, values: event.payload }; }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }), photo_sets: photos.length || legacyRows.filter(function (row) { return !!row.photo; }).length }, sourceEventIds: ids(checks.concat(photos)), coverage: coverageFromDays(unique(checks.map(function (event) { return event.local_date; })).length, 30) }; } });
  add({ id: 'skin.correlations', displayName: 'Skin associations', eventTypes: ['skin.checkin.logged'], eventDomains: ['skin'], projectionDeps: ['skin.progress', 'nutrition.rolling_30d'], truthClass: 'observed-association', calculationType: 'statistical', timeWindow: '30 local days', outputSchema: { type: 'object', required: ['status', 'associations'] }, compute: function (ctx) { var progress = valueOf(ctx, 'skin.progress'); var sample = (progress.checkins || []).length; return { value: { status: sample >= 14 ? 'eligible-no-registered-analysis' : 'insufficient-sample', associations: [], required_checkins: 14, current_checkins: sample }, coverage: Math.min(1, sample / 14), confidence: { level: sample >= 14 ? 'low' : 'insufficient', score: 0, coverage: Math.min(1, sample / 14), sample_size: sample, calibration_state: 'no-analysis-registered' }, limitations: ['No association is emitted until a registered analysis, minimum sample-size gate, and multiple-testing review pass.', 'Product, food, sleep, and hydration records are context, not proof of cause.'] }; } });
  add({ id: 'skin.insights', displayName: 'Skin insights', eventTypes: ['skin.checkin.logged', 'skin.routine.logged', 'skin.product.changed', 'skin.breakout.logged'], eventDomains: ['skin'], projectionDeps: ['skin.current', 'skin.progress', 'skin.routine', 'skin.correlations'], truthClass: 'deterministic-guidance', outputSchema: { type: 'object', required: ['items'] }, compute: function (ctx) { var current = valueOf(ctx, 'skin.current'); var progress = valueOf(ctx, 'skin.progress'); var routine = valueOf(ctx, 'skin.routine'); var correlations = valueOf(ctx, 'skin.correlations'); var items = []; if (!current.checkin) items.push({ id: 'skin-baseline', title: 'Log a baseline check-in', detail: 'A rated check-in is needed before trends can be shown.', severity: 'info', truth_class: 'missing-data' }); if (routine.scheduled_products && routine.adherence_7d_pct < 60) items.push({ id: 'skin-routine-consistency', title: 'Routine completion is below 60%', detail: 'Review whether the current schedule is realistic before adding more steps.', severity: 'review', truth_class: 'measured' }); if ((progress.checkins || []).length < 14) items.push({ id: 'skin-more-checkins', title: 'More check-ins needed for pattern analysis', detail: (14 - (progress.checkins || []).length) + ' more dated check-ins are needed for eligibility.', severity: 'info', truth_class: 'coverage' }); if (correlations.status === 'eligible-no-registered-analysis') items.push({ id: 'skin-analysis-locked', title: 'Pattern analysis remains locked', detail: 'Enough observations exist, but no evaluated analysis is registered.', severity: 'info', truth_class: 'safety-gate' }); return { value: { items: items, correlation_status: correlations.status, limitations: ['Guidance summarizes logged behavior and coverage. It does not diagnose a skin condition or assign cause.'] }, coverage: current.checkin ? 1 : 0 }; } });

  add({
    id: 'readiness.daily', displayName: 'Daily readiness', eventTypes: ['recovery.mood.checkin'], eventDomains: ['mood', 'hydration'], projectionDeps: ['sleep.daily', 'sleep.debt', 'training.load', 'hydration.daily'], timeWindow: 'current plus 7 days',
    outputSchema: { type: 'object', required: ['score', 'label', 'parts'] },
    compute: function (ctx) {
      var parts = []; var total = 0;
      function part(key, label, points, max, detail) { points = Math.max(0, Math.min(max, Math.round(points))); parts.push({ key: key, label: label, pts: points, max: max, detail: detail }); total += points; }
      var sleep = valueOf(ctx, 'sleep.daily');
      if (sleep.logged) { var hours = sleep.duration_minutes / 60; var sleepPts = hours < 4 ? 8 : hours < 5 ? 16 : hours < 6 ? 24 : hours < 7 ? 32 : hours <= 8.5 ? 40 : 34; if (sleep.score != null) sleepPts = Math.max(0, Math.min(40, sleepPts + Math.round((sleep.score - 70) / 30 * 5))); part('sleep', 'Last night', sleepPts, 40, round(hours, 1) + 'h'); } else part('sleep', 'Last night', 20, 40, 'No sleep logged');
      var debt = valueOf(ctx, 'sleep.debt'); var debtHours = debt.debt_hours;
      if (debtHours != null) part('debt', 'Sleep debt', debtHours <= 0.5 ? 20 : debtHours <= 2 ? 17 : debtHours <= 4 ? 13 : debtHours <= 7 ? 8 : 4, 20, debtHours + 'h short'); else part('debt', 'Sleep debt', 10, 20, 'No 7d sleep data');
      var load = valueOf(ctx, 'training.load'); if (load.completed_yesterday && load.completed_two_days_ago) part('load', 'Training load', 5, 15, 'Trained 2 days straight'); else if (load.completed_yesterday) part('load', 'Training load', 9, 15, 'Trained yesterday'); else part('load', 'Training load', 15, 15, 'Rested yesterday');
      var moods = eventsOf(ctx, ['recovery.mood.checkin']).filter(function (event) { return event.local_date <= ctx.date; }).slice(-3).map(function (event) { return payloadNumber(event, 'value'); }).filter(function (value) { return value >= 1; });
      if (moods.length) { var avg = sum(moods) / moods.length; part('mood', 'Mood trend', avg / 5 * 15, 15, round(avg, 1) + '/5'); } else part('mood', 'Mood trend', 8, 15, 'No mood logged');
      var sleepFacts7 = inDates(sleepFacts(ctx), lastDates(ctx.date, 7)); part('consistency', 'Sleep logging', sleepFacts7.length / 7 * 5, 5, sleepFacts7.length + '/7 nights logged');
      var hydration = valueOf(ctx, 'hydration.daily'); var hydrationMeasured = hydration.explicit_beverage_ml > 0; var hydrationPts = !hydrationMeasured ? 0 : hydration.target_progress >= 0.8 ? 5 : hydration.target_progress >= 0.5 ? 4 : 2; part('hydration', 'Hydration context', hydrationPts, 5, hydrationMeasured ? round(hydration.target_progress * 100, 0) + '% of target' : 'No water logged');
      var worst = parts.slice().sort(function (a, b) { return a.pts / a.max - b.pts / b.max; })[0]; var advice = { sleep: 'Keep today light and protect an earlier bedtime.', debt: 'Sleep debt is accumulating; protect tonight.', load: 'Back-to-back training suggests an easier day.', mood: 'Choose one manageable win and reassess.', consistency: 'Log sleep nightly to improve readiness coverage.', hydration: 'Hydration is contextual, but logging and meeting your target can improve planning confidence.' };
      return { value: { score: total, label: total >= 75 ? 'Ready' : total >= 55 ? 'Moderate' : 'Low', parts: parts, sleep_debt_hours: debtHours, advice: advice[worst.key] }, sourceEventIds: ids(eventsOf(ctx, ['recovery.mood.checkin'])).concat(ctx.envelope('hydration.daily').provenance.source_event_ids), coverage: Math.min(1, (sleep.logged ? 0.55 : 0) + Math.min(0.35, sleepFacts7.length / 7 * 0.35) + (hydrationMeasured ? 0.1 : 0)) };
    },
  });

  add({ id: 'training.recovery', displayName: 'Training recovery', eventTypes: [], eventDomains: ['training', 'sleep', 'mood'], projectionDeps: ['readiness.daily', 'training.load'], outputSchema: { type: 'object', required: ['readiness_score', 'status'] }, compute: function (ctx) { var readiness = valueOf(ctx, 'readiness.daily'); var load = valueOf(ctx, 'training.load'); return { value: { readiness_score: readiness.score, status: readiness.score >= 75 ? 'ready' : readiness.score >= 55 ? 'moderate' : 'recover', sessions_7d: load.sessions_7d, advice: readiness.advice } }; } });
  add({ id: 'recovery.daily', displayName: 'Daily recovery', eventTypes: [], eventDomains: ['sleep', 'mood', 'wearables'], projectionDeps: ['readiness.daily', 'sleep.daily', 'sleep.debt'], outputSchema: { type: 'object', required: ['readiness', 'sleep', 'sleep_debt'] }, compute: function (ctx) { return { value: { readiness: valueOf(ctx, 'readiness.daily'), sleep: valueOf(ctx, 'sleep.daily'), sleep_debt: valueOf(ctx, 'sleep.debt') } }; } });

  add({
    id: 'data_quality.current', displayName: 'Current data quality', eventTypes: [], eventDomains: ['nutrition', 'hydration', 'sleep', 'training', 'body', 'mood', 'labs', 'finance', 'skin', 'photos'], timeWindow: 'domain-specific freshness windows',
    outputSchema: { type: 'object', required: ['score', 'checks', 'stale'] },
    compute: function (ctx) {
      var rules = [
        { key: 'weight', label: 'Weight', types: ['body.weight.logged'], legacy: 'po_coach_weights', max: 3 },
        { key: 'sleep', label: 'Sleep', types: ['sleep.night.logged', 'sleep.night.synced'], legacy: 'sleep:logs', max: 1 },
        { key: 'nutrition', label: 'Nutrition', types: ['nutrition.meal.logged', 'nutrition.meal.edited'], legacy: 'nt:logs', max: 1 },
        { key: 'training', label: 'Training', types: ['training.session.completed', 'training.cardio.logged'], legacy: 'po_coach_workout_done', max: 4 },
        { key: 'mood', label: 'Mood', types: ['recovery.mood.checkin'], legacy: 'mind:mood:v1', max: 2 },
        { key: 'bloodwork', label: 'Bloodwork', types: ['labs.panel.logged', 'labs.panel.imported'], legacy: 'blood:logs', max: 90 },
        { key: 'measurements', label: 'Measurements', types: ['body.measurement.logged'], legacy: 'body:logs', max: 30 },
        { key: 'finance', label: 'Finance', types: ['finance.transaction.logged', 'finance.transaction.imported'], legacy: 'fin:income', max: 35 },
        { key: 'photos', label: 'Progress photos', types: ['body.photo.added', 'skin.photo.added'], legacy: 'body:photos:v1', max: 14 },
        { key: 'skin', label: 'Skin checks', types: ['skin.checkin.logged'], legacy: 'skin:logs', max: 7 },
      ];
      var checks = rules.map(function (rule) {
        var event = latest(eventsOf(ctx, rule.types), ctx.date); var legacy = legacyEvent(ctx, rule.legacy); var lastDate = event && event.local_date;
        if (!lastDate && legacy) { var value = legacy.payload.parsed_value; var rows = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.keys(value).map(function (key) { return { date: key }; }) : []; lastDate = rows.map(function (row) { return row.date || row.dateKey; }).filter(Boolean).sort().pop() || null; }
        var age = lastDate ? Math.round((new Date(ctx.date + 'T12:00:00Z') - new Date(lastDate + 'T12:00:00Z')) / 86400000) : null;
        return { key: rule.key, label: rule.label, fresh: age != null && age <= rule.max, last_date: lastDate, days_ago: age, max_days: rule.max, source_event_id: event && event.id || legacy && legacy.id || null };
      });
      var fresh = checks.filter(function (check) { return check.fresh; }); var stale = checks.filter(function (check) { return !check.fresh; }).sort(function (a, b) { return (b.days_ago == null ? 9999 : b.days_ago) - (a.days_ago == null ? 9999 : a.days_ago); });
      return { value: { score: round(fresh.length / checks.length * 100, 0), checks: checks, stale: stale, worst: stale[0] || null }, sourceEventIds: checks.map(function (check) { return check.source_event_id; }).filter(Boolean), coverage: fresh.length / checks.length };
    },
  });

  add({
    id: 'life_score.daily', displayName: 'Daily Life Score', eventTypes: [], eventDomains: ['sleep', 'nutrition', 'training', 'productivity', 'finance', 'hydration', 'supplements'],
    projectionDeps: ['sleep.daily', 'nutrition.daily', 'training.load', 'productivity.completion', 'finance.cashflow', 'hydration.daily', 'supplements.adherence'], timeWindow: 'current day plus rolling inputs',
    outputSchema: { type: 'object', required: ['total', 'parts', 'drag', 'action'] },
    compute: function (ctx) {
      var parts = []; var total = 0;
      function part(key, label, points, max, detail, measured) { points = Math.max(0, Math.min(max, Math.round(points))); parts.push({ key: key, label: label, pts: points, max: max, detail: detail, measured: !!measured }); total += points; }
      var sleep = valueOf(ctx, 'sleep.daily'); if (sleep.logged) { var h = sleep.duration_minutes / 60; part('sleep', 'Sleep', h < 4 ? 2 : h < 5 ? 6 : h < 6 ? 10 : h < 7 ? 15 : h <= 8.5 ? 20 : 17, 20, round(h, 1) + 'h', true); } else part('sleep', 'Sleep', 10, 20, 'No data', false);
      var nutrition = valueOf(ctx, 'nutrition.daily'); if (nutrition.entries) { var ratio = nutrition.calories / nutrition.targets.calories; var np = ratio < 0.4 ? 3 : ratio < 0.6 ? 7 : ratio < 0.8 ? 10 : ratio <= 1.2 ? 15 : 10; if (nutrition.protein_g >= nutrition.targets.protein_g * 0.85) np = Math.min(15, np + 2); part('nutrition', 'Nutrition', np, 15, nutrition.calories + ' kcal, ' + nutrition.protein_g + 'g protein', true); } else part('nutrition', 'Nutrition', 7, 15, 'No data', false);
      var training = valueOf(ctx, 'training.load'); var tp = 6; if (training.completed_today && !training.completed_yesterday) tp = 12; else if (training.completed_today) tp = 10; else if (training.completed_yesterday) tp = 9; tp += training.sessions_7d >= 3 ? 3 : training.sessions_7d === 2 ? 2 : training.sessions_7d === 1 ? 1 : 0; part('training', 'Training', tp, 15, training.sessions_7d + ' sessions / 7d', training.sessions_7d > 0);
      var productivity = valueOf(ctx, 'productivity.completion'); var habitTotal = Number(productivity.habits_total || 0); var habitDone = Number(productivity.habits_done || 0); if (habitTotal) part('habits', 'Habits', habitDone / habitTotal * 10, 10, habitDone + '/' + habitTotal + ' done', true); else part('habits', 'Habits', 5, 10, 'No habits set', false);
      var focusPts = productivity.focus_minutes >= 90 ? 3 : productivity.focus_minutes >= 45 ? 2 : productivity.focus_minutes > 0 ? 1 : 0; if (productivity.goals_total) part('productivity', 'Productivity', Math.min(15, productivity.goals_done / productivity.goals_total * 9 + Math.min(3, productivity.tasks_done) + focusPts), 15, productivity.goals_done + '/' + productivity.goals_total + ' goals', true); else part('productivity', 'Productivity', 6 + focusPts, 15, 'No goals today', false);
      var finance = valueOf(ctx, 'finance.cashflow'); if (finance.savings_rate_pct != null) { var sr = finance.savings_rate_pct; part('finance', 'Finance', sr >= 40 ? 15 : sr >= 30 ? 13 : sr >= 20 ? 11 : sr >= 10 ? 8 : sr >= 0 ? 5 : 2, 15, sr + '% savings rate', true); } else part('finance', 'Finance', 8, 15, 'No income data', false);
      var water = valueOf(ctx, 'hydration.daily'); if (water.explicit_beverage_ml > 0) part('hydration', 'Hydration', Math.min(5, water.explicit_beverage_ml / water.target_ml * 5), 5, water.explicit_beverage_ml + '/' + water.target_ml + ' ml', true); else part('hydration', 'Hydration', 2, 5, 'No data', false);
      var supplements = valueOf(ctx, 'supplements.adherence'); if (supplements.scheduled) part('supplements', 'Supplements', supplements.taken / supplements.scheduled * 5, 5, supplements.taken + '/' + supplements.scheduled + ' taken', true); else part('supplements', 'Supplements', 3, 5, 'No stack', false);
      var measured = parts.filter(function (item) { return item.measured; }); var dragPool = measured.length ? measured : parts; var drag = dragPool.slice().sort(function (a, b) { return a.pts / a.max - b.pts / b.max; })[0]; var actions = { sleep: 'Protect an earlier bedtime.', nutrition: 'Log meals and close the protein gap.', training: 'Schedule or complete the next session.', habits: 'Complete one habit.', productivity: 'Choose one goal and finish it.', finance: 'Review this month\'s spending.', hydration: 'Log and drink water.', supplements: 'Take the remaining scheduled doses.' };
      return { value: { total: Math.min(100, total), parts: parts, drag: drag, action: actions[drag.key] || '' }, coverage: measured.length / parts.length, explanation: 'Uses the existing Life OS weighted scoring rules. Missing domains retain their documented neutral baseline and reduce coverage.' };
    },
  });

  add({
    id: 'energy.current', displayName: 'Current energy', eventTypes: ['recovery.energy.checkin'], eventDomains: ['energy'], timeWindow: 'current local day',
    outputSchema: { type: 'object', required: ['available', 'value'] },
    compute: function (ctx) {
      var event = latest(byDate(eventsOf(ctx, ['recovery.energy.checkin']), ctx.date));
      return { value: event ? { available: true, value: payloadNumber(event, 'value'), observed_at: event.occurred_at, context: event.payload.context || null, note: event.payload.note || null } : { available: false, value: null, observed_at: null, context: null, note: null }, sourceEventIds: event ? [event.id] : [], coverage: event ? 1 : 0 };
    },
  });
  add({
    id: 'energy.patterns', displayName: 'Energy patterns', eventTypes: ['recovery.energy.checkin'], eventDomains: ['energy'], timeWindow: '30 local days',
    outputSchema: { type: 'object', required: ['sample_size', 'samples', 'calibration'] },
    compute: function (ctx) {
      var events = inDates(eventsOf(ctx, ['recovery.energy.checkin']), lastDates(ctx.date, 30)).slice().sort(function (a, b) { return String(a.occurred_at).localeCompare(String(b.occurred_at)); });
      var samples = events.map(function (event) { return { id: event.id, date: event.local_date, hour: localHour(event), value: payloadNumber(event, 'value'), observed_at: event.occurred_at, context: event.payload.context || null }; });
      var buckets = {};
      samples.forEach(function (sample) { var bucket = Math.floor(sample.hour / 3) * 3; buckets[bucket] = buckets[bucket] || []; buckets[bucket].push(sample.value); });
      var hourly = Object.keys(buckets).map(function (hour) { return { hour: Number(hour), samples: buckets[hour].length, average: round(sum(buckets[hour]) / buckets[hour].length, 2) }; }).sort(function (a, b) { return a.hour - b.hour; });
      var errors = [];
      samples.forEach(function (sample, index) { if (index < 3) return; var prior = samples.slice(Math.max(0, index - 7), index); var predicted = sum(prior.map(function (item) { return item.value; })) / prior.length; errors.push(Math.abs(predicted - sample.value)); });
      var paired = errors.length;
      return { value: { sample_size: samples.length, logged_days: unique(samples.map(function (sample) { return sample.date; })).length, samples: samples, daily: samples, hourly: hourly, calibration: { status: paired >= 5 ? 'evaluated' : 'insufficient-paired-observations', paired_samples: paired, mean_absolute_error: paired ? round(sum(errors) / paired, 2) : null } }, sourceEventIds: ids(events), coverage: Math.min(1, samples.length / 14) };
    },
  });
  add({
    id: 'energy.forecast_24h', displayName: '24-hour energy outlook', eventTypes: ['recovery.energy.checkin'], eventDomains: ['energy'],
    projectionDeps: ['energy.current', 'energy.patterns', 'readiness.daily', 'nutrition.daily', 'hydration.daily', 'training.load'], truthClass: 'directional-estimate', calculationType: 'statistical', timeWindow: 'next 24 hours',
    outputSchema: { type: 'object', required: ['status', 'score_1_to_5', 'contributors', 'curve'] },
    compute: function (ctx) {
      var current = valueOf(ctx, 'energy.current'); var patterns = valueOf(ctx, 'energy.patterns'); var readiness = valueOf(ctx, 'readiness.daily'); var nutrition = valueOf(ctx, 'nutrition.daily'); var hydration = valueOf(ctx, 'hydration.daily'); var training = valueOf(ctx, 'training.load');
      var sample = patterns.sample_size || 0; var enough = sample >= 3; var allValues = (patterns.samples || []).map(function (item) { return item.value; });
      var base = current.available ? current.value : enough ? sum(allValues) / allValues.length : null;
      var contributors = [];
      function adjust(key, label, direction, amount, evidence, truthClass) { if (base != null) base += amount; contributors.push({ key: key, label: label, direction: direction, adjustment: amount, evidence: evidence, truth_class: truthClass || 'contextual-feature' }); }
      if (readiness.score < 55) adjust('readiness', 'Readiness', 'down', -0.5, readiness.score, 'deterministic-score'); else if (readiness.score >= 75) adjust('readiness', 'Readiness', 'up', 0.3, readiness.score, 'deterministic-score');
      if (nutrition.entries && nutrition.calories < nutrition.targets.calories * 0.5) adjust('nutrition', 'Logged meal coverage', 'down', -0.2, nutrition.calories, 'measured');
      if (hydration.explicit_beverage_ml && hydration.target_progress < 0.5) adjust('hydration', 'Explicit hydration', 'down', -0.2, hydration.explicit_beverage_ml, 'measured'); else if (hydration.target_progress >= 0.8) adjust('hydration', 'Explicit hydration', 'up', 0.1, hydration.explicit_beverage_ml, 'measured');
      if (training.completed_today) adjust('training', 'Training completed today', readiness.score < 60 ? 'down' : 'up', readiness.score < 60 ? -0.2 : 0.1, training.volume_kg_7d || training.cardio_minutes_7d, 'measured');
      var score = base == null ? null : round(Math.max(1, Math.min(5, base)), 1);
      var hourlyMap = {}; (patterns.hourly || []).forEach(function (row) { hourlyMap[row.hour] = row; });
      var curve = [];
      if (enough) {
        var band = sample >= 14 ? 0.45 : sample >= 7 ? 0.7 : 1;
        [0, 3, 6, 9, 12, 15, 18, 21].forEach(function (hour) {
          var personal = hourlyMap[hour]; var circadian = hour < 6 ? -0.7 : hour < 9 ? -0.2 : hour < 12 ? 0.25 : hour < 15 ? 0.1 : hour < 18 ? -0.15 : hour < 21 ? -0.35 : -0.55;
          var point = personal && personal.samples >= 2 ? personal.average : score + circadian;
          point = Math.max(1, Math.min(5, point));
          curve.push({ hour: hour, score: round(point, 1), lower: round(Math.max(1, point - band), 1), upper: round(Math.min(5, point + band), 1), personal_samples: personal ? personal.samples : 0 });
        });
      }
      contributors.sort(function (a, b) { return Math.abs(b.adjustment) - Math.abs(a.adjustment); });
      var confidenceScore = enough ? Math.min(0.78, sample / 20 * 0.65 + (patterns.calibration.paired_samples >= 5 ? 0.13 : 0)) : 0;
      return { value: { status: !enough ? 'insufficient-data' : sample >= 14 ? 'directional' : 'early-directional', score_1_to_5: score, contributors: contributors, top_positive: contributors.find(function (item) { return item.direction === 'up'; }) || null, top_negative: contributors.find(function (item) { return item.direction === 'down'; }) || null, measured_energy_available: current.available, curve: curve, model_version: 'personal-energy-directional-v2', calibration: patterns.calibration, missing_checkins: Math.max(0, 3 - sample) }, coverage: Math.min(1, sample / 14), confidence: { level: sample >= 14 && patterns.calibration.paired_samples >= 5 ? 'medium' : enough ? 'low' : 'insufficient', score: round(confidenceScore, 2), coverage: Math.min(1, sample / 14), sample_size: sample, calibration_state: patterns.calibration.status }, limitations: ['This is a directional planning estimate, not a diagnosis or medical prediction.', 'No forecast is shown until at least three personal energy check-ins exist.', 'Meal, hydration, readiness, and training affect only documented forecast features.'] };
    },
  });

  add({ id: 'today.summary', displayName: 'Today summary', eventTypes: [], eventDomains: ['nutrition', 'hydration', 'sleep', 'training', 'body', 'finance', 'productivity', 'supplements', 'energy'], projectionDeps: ['life_score.daily', 'readiness.daily', 'data_quality.current', 'nutrition.daily', 'hydration.daily', 'body.current', 'training.load', 'finance.overview', 'productivity.day_plan', 'supplements.adherence', 'energy.forecast_24h'], timeWindow: 'current local day', outputSchema: { type: 'object', required: ['date', 'life_score', 'readiness', 'data_quality'] }, compute: function (ctx) { return { value: { date: ctx.date, life_score: valueOf(ctx, 'life_score.daily'), readiness: valueOf(ctx, 'readiness.daily'), data_quality: valueOf(ctx, 'data_quality.current'), nutrition: valueOf(ctx, 'nutrition.daily'), hydration: valueOf(ctx, 'hydration.daily'), body: valueOf(ctx, 'body.current'), training: valueOf(ctx, 'training.load'), finance: valueOf(ctx, 'finance.overview'), day_plan: valueOf(ctx, 'productivity.day_plan'), supplements: valueOf(ctx, 'supplements.adherence'), energy: valueOf(ctx, 'energy.forecast_24h') }, explanation: 'Composes versioned projections. It does not recalculate domain facts independently.' }; } });

  add({
    id: 'communications.inbox', displayName: 'Inbox summary', eventTypes: ['integration.status.changed'], eventDomains: ['communications'], outputSchema: { type: 'object', required: ['connected', 'unread'] },
    compute: function (ctx) {
      var event = latest(eventsOf(ctx, ['integration.status.changed']).filter(function (item) { return item.payload.integration === 'mail'; }), ctx.date);
      var legacy = legacyValue(ctx, 'mail:summary:v1', {}) || {};
      var connected = event ? !!(event.payload.connected || event.payload.status === 'connected' || event.payload.status === 'current') : legacy.total_inbox != null;
      var unread = event ? Number(event.payload.unread || 0) : Number(legacy.total_inbox || 0);
      return { value: { connected: connected, unread: unread, total_inbox: unread, needs_reply: legacy.needs_reply || [], bills: legacy.bills || [], opportunities: legacy.opportunities || [], orders_active: Number(legacy.orders_active || 0), newsletters_promo: Number(legacy.newsletters_promo || 0), status: connected ? (event && event.payload.status || 'connected') : 'disconnected', last_sync: event && (event.payload.last_sync || event.occurred_at) || legacy.generated_at || null }, sourceEventIds: event ? [event.id] : ids([legacyEvent(ctx, 'mail:summary:v1')].filter(Boolean)), coverage: connected ? 1 : 0 };
    },
  });
  add({ id: 'communications.followups', displayName: 'Communication follow-ups', eventTypes: ['integration.status.changed'], eventDomains: ['communications'], projectionDeps: ['communications.inbox'], outputSchema: { type: 'object', required: ['items'] }, compute: function (ctx) { var inbox = valueOf(ctx, 'communications.inbox'); var replies = inbox.needs_reply || []; var items = replies.slice(0, 5).map(function (item, index) { item = typeof item === 'string' ? { subject: item } : item || {}; return { id: 'mail-reply:' + index, title: item.subject || item.label || 'Reply to message', domain: 'communications', count: 1, truth_class: 'provider-summary' }; }); if (!items.length && inbox.connected && inbox.unread) items.push({ id: 'mail-unread', title: 'Review unread mail', domain: 'communications', count: inbox.unread, truth_class: 'provider-summary' }); return { value: { items: items } }; } });

  add({ id: 'coach.signals', displayName: 'Coach signals', eventTypes: [], eventDomains: ['nutrition', 'hydration', 'sleep', 'training', 'labs', 'finance', 'energy'], projectionDeps: ['today.summary', 'labs.attention', 'hydration.daily', 'readiness.daily', 'energy.forecast_24h'], outputSchema: { type: 'object', required: ['signals'] }, compute: function (ctx) { var today = valueOf(ctx, 'today.summary'); var signals = []; if (today.hydration.explicit_beverage_ml > 0 && today.hydration.target_progress < 0.5) signals.push({ id: 'hydration-low:' + ctx.date, signal_type: 'attention', domain: 'hydration', title: 'Hydration is behind target', detail: 'Explicit beverage intake is below half of the current target.', truth_class: 'measured', severity: 'medium', observed_at: ctx.date, source_event_ids: ctx.envelope('hydration.daily').provenance.source_event_ids, explanation: 'Explicit beverage intake is below half of the current target.', limitations: ['Estimated food water is shown separately.'] }); if (today.readiness.score < 55) signals.push({ id: 'readiness-low:' + ctx.date, signal_type: 'attention', domain: 'recovery', title: 'Readiness is low', detail: today.readiness.advice, truth_class: 'deterministic-score', severity: 'medium', observed_at: ctx.date, source_event_ids: ctx.envelope('readiness.daily').provenance.source_event_ids, explanation: today.readiness.advice, limitations: ['Readiness depends on logging coverage.'] }); var energy = valueOf(ctx, 'energy.forecast_24h'); if (energy.status !== 'insufficient-data' && energy.score_1_to_5 < 2.5) signals.push({ id: 'energy-low:' + ctx.date, signal_type: 'attention', domain: 'energy', title: 'Energy outlook is low', detail: energy.top_negative ? energy.top_negative.label + ' is the strongest current negative contributor.' : 'The personal directional model is below 2.5 out of 5.', truth_class: 'directional-estimate', severity: 'medium', observed_at: ctx.date, source_event_ids: ctx.envelope('energy.forecast_24h').provenance.source_event_ids, explanation: energy.top_negative ? energy.top_negative.label + ' is the strongest current negative contributor.' : 'The personal directional model is below 2.5 out of 5.', limitations: ['This outlook is not a diagnosis.', 'Check confidence and source coverage before acting.'] }); return { value: { signals: signals }, sourceEventIds: unique([].concat.apply([], signals.map(function (signal) { return signal.source_event_ids; }))) }; } });
  add({
    id: 'coach.briefing', displayName: 'Coach briefing', eventTypes: [], eventDomains: ['nutrition', 'hydration', 'sleep', 'training', 'labs', 'finance', 'productivity'], projectionDeps: ['today.summary', 'coach.signals'], outputSchema: { type: 'object', required: ['date', 'focus', 'signals', 'lines'] },
    compute: function (ctx) {
      var today = valueOf(ctx, 'today.summary'); var signals = valueOf(ctx, 'coach.signals').signals || []; var lines = [];
      var readiness = today.readiness || {}; lines.push({ area: 'Readiness', text: readiness.score == null ? 'Not enough measured recovery data for a score.' : Math.round(readiness.score) + '/100. ' + (readiness.advice || ''), truth_class: readiness.score == null ? 'missing-data' : 'deterministic-score', source_projection: 'readiness.daily' });
      var nutrition = today.nutrition || {}; lines.push({ area: 'Nutrition', text: nutrition.entries ? Math.round(nutrition.calories || 0) + ' kcal and ' + Math.round(nutrition.protein_g || 0) + ' g protein logged.' : 'No meals logged today.', truth_class: nutrition.entries ? 'measured' : 'missing-data', source_projection: 'nutrition.daily' });
      var hydration = today.hydration || {}; lines.push({ area: 'Hydration', text: hydration.explicit_beverage_ml ? Math.round(hydration.explicit_beverage_ml) + ' ml explicit drinks logged toward ' + Math.round(hydration.target_ml || 0) + ' ml.' : 'No explicit drinks logged today.', truth_class: hydration.explicit_beverage_ml ? 'measured' : 'missing-data', source_projection: 'hydration.daily' });
      var training = today.training || {}; lines.push({ area: 'Training', text: training.sessions ? training.sessions + ' session' + (training.sessions === 1 ? '' : 's') + ' in the current load window.' : 'No training session is present in the current window.', truth_class: training.sessions ? 'measured' : 'missing-data', source_projection: 'training.load' });
      var finance = today.finance && today.finance.cashflow || {}; var hasFinanceFacts = Number(finance.transaction_count || 0) > 0 || Number(finance.income_minor || 0) !== 0 || Number(finance.expenses_minor || 0) !== 0; lines.push({ area: 'Money', text: !hasFinanceFacts ? 'No current-month cash-flow facts available.' : 'Current-month net cash flow is ' + Math.round(finance.net_minor / 100) + ' ' + (finance.currency || 'EUR') + '.', truth_class: hasFinanceFacts ? (finance.truth_class || 'measured') : 'missing-data', source_projection: 'finance.cashflow' });
      return { value: { date: ctx.date, focus: today.life_score && today.life_score.action || null, readiness: readiness, signals: signals, lines: lines, limitations: ['This briefing summarizes projections and missingness. It does not create new facts or diagnoses.'] }, sourceEventIds: unique([].concat.apply([], ['today.summary', 'coach.signals'].map(function (id) { var envelope = ctx.envelope(id); return envelope && envelope.provenance && envelope.provenance.source_event_ids || []; }))) };
    },
  });
  add({ id: 'coach.followups', displayName: 'Coach follow-ups', eventTypes: [], eventDomains: ['communications', 'productivity', 'labs'], projectionDeps: ['coach.signals', 'communications.followups', 'labs.attention'], outputSchema: { type: 'object', required: ['items'] }, compute: function (ctx) { var signals = valueOf(ctx, 'coach.signals').signals || []; var comms = valueOf(ctx, 'communications.followups').items || []; var labs = valueOf(ctx, 'labs.attention').items || []; var rows = signals.map(function (signal) { return { id: signal.id, title: signal.title, detail: signal.detail || signal.explanation, domain: signal.domain, truth_class: signal.truth_class }; }).concat(comms).concat(labs.map(function (item, index) { return { id: 'lab:' + (item.key || index), title: 'Review ' + (item.name || item.marker || 'lab marker'), detail: item.status || 'Outside the configured reference range', domain: 'labs', truth_class: 'measured' }; })); var seen = {}; rows = rows.filter(function (row) { if (seen[row.id]) return false; seen[row.id] = true; return true; }); return { value: { items: rows } }; } });
  add({ id: 'coach.opportunities', displayName: 'Coach opportunities', eventTypes: [], eventDomains: ['system'], outputSchema: { type: 'object', required: ['available', 'shown'] }, compute: function (ctx) { var radar = legacyValue(ctx, 'radar:summary:v1', null); radar = radar && typeof radar === 'object' ? radar : null; return { value: radar ? { available: true, total_found: Number(radar.total_found || 0), shown: radar.shown || [], generated_at: radar.generated_at || null } : { available: false, total_found: null, shown: [], generated_at: null }, sourceEventIds: ids([legacyEvent(ctx, 'radar:summary:v1')].filter(Boolean)), coverage: radar ? 1 : 0 }; } });
  add({ id: 'coach.reviews', displayName: 'Coach reviews', eventTypes: [], eventDomains: ['system'], outputSchema: { type: 'object', required: ['weeks', 'plans'] }, compute: function (ctx) { var ritual = legacyValue(ctx, 'review:ritual:v1', {}) || {}; var plans = legacyValue(ctx, 'coach:plans:v1', []) || []; var weeks = Object.keys(ritual).sort().reverse().map(function (date) { return { date: date, answers: ritual[date] }; }); return { value: { weeks: weeks, plans: Array.isArray(plans) ? plans : [], latest: weeks[0] || null }, sourceEventIds: ids(['review:ritual:v1', 'coach:plans:v1'].map(function (key) { return legacyEvent(ctx, key); }).filter(Boolean)), coverage: weeks.length || plans.length ? 1 : 0 }; } });
  add({ id: 'coach.context', displayName: 'Coach answer context', eventTypes: [], eventDomains: ['nutrition', 'hydration', 'sleep', 'training', 'labs', 'finance', 'productivity', 'communications', 'system'], projectionDeps: ['today.summary', 'coach.briefing', 'coach.signals', 'coach.followups', 'communications.inbox', 'coach.opportunities', 'coach.reviews', 'data_quality.current'], outputSchema: { type: 'object', required: ['date', 'available', 'limitations'] }, compute: function (ctx) { var idsToExpose = ['today.summary', 'coach.briefing', 'coach.signals', 'coach.followups', 'communications.inbox', 'coach.opportunities', 'coach.reviews', 'data_quality.current']; var available = {}; idsToExpose.forEach(function (id) { var envelope = ctx.envelope(id); available[id] = { value: envelope.value, provenance: envelope.provenance, confidence: envelope.confidence, limitations: envelope.limitations || [] }; }); return { value: { date: ctx.date, available: available, limitations: ['Answers must distinguish measured facts, deterministic calculations, directional estimates, and missing data.', 'Health and financial answers require their relevant limitations.', 'No answer may infer excluded social or mental-health state.'] }, sourceEventIds: unique([].concat.apply([], idsToExpose.map(function (id) { return ctx.envelope(id).provenance.source_event_ids || []; }))) }; } });

  add({ id: 'sleep.consistency', displayName: 'Sleep consistency', eventTypes: ['sleep.night.logged', 'sleep.night.synced'], eventDomains: ['sleep'], timeWindow: '14 local nights', outputSchema: { type: 'object', required: ['logged_nights', 'average_minutes', 'consistency_pct'] }, compute: function (ctx) { var facts = inDates(sleepFacts(ctx), lastDates(ctx.date, 14)); var durations = facts.map(function (event) { return payloadNumber(event, 'duration_minutes'); }).filter(Boolean); var average = durations.length ? sum(durations) / durations.length : null; var deviation = average == null ? null : sum(durations.map(function (value) { return Math.abs(value - average); })) / durations.length; return { value: { logged_nights: facts.length, average_minutes: round(average, 0), consistency_pct: deviation == null ? null : round(Math.max(0, 100 - deviation / 1.2), 0) }, sourceEventIds: ids(facts).map(sourceId), coverage: coverageFromDays(facts.length, 14) }; } });
  add({ id: 'wearables.current', displayName: 'Current wearable metrics', eventTypes: ['wearables.sample.synced'], eventDomains: ['wearables'], outputSchema: { type: 'object', required: ['connected', 'metrics'] }, compute: function (ctx) { var event = latest(eventsOf(ctx, ['wearables.sample.synced']), ctx.date); var legacy = legacyEvent(ctx, 'wearable:today:v1'); var metrics = event ? event.payload : legacy && legacy.payload.parsed_value || {}; return { value: { connected: !!event || !!legacy, metrics: metrics, observed_at: event ? event.occurred_at : legacy ? legacy.occurred_at : null }, sourceEventIds: ids([event, legacy].filter(Boolean)), coverage: event || legacy ? 1 : 0 }; } });
  add({ id: 'activity.daily', displayName: 'Daily activity', eventTypes: ['wearables.sample.synced'], eventDomains: ['wearables'], projectionDeps: ['wearables.current'], timeWindow: 'local day', outputSchema: { type: 'object', required: ['date', 'steps', 'active_minutes'] }, compute: function (ctx) { var metrics = valueOf(ctx, 'wearables.current').metrics || {}; return { value: { date: ctx.date, steps: metrics.steps == null ? null : Number(metrics.steps), active_minutes: metrics.active_minutes == null ? metrics.active_seconds == null ? null : round(metrics.active_seconds / 60, 0) : Number(metrics.active_minutes) } }; } });
  add({ id: 'mood.trends', displayName: 'Mood trends', eventTypes: ['recovery.mood.checkin'], eventDomains: ['mood'], timeWindow: '30 local days', outputSchema: { type: 'object', required: ['samples', 'average'] }, compute: function (ctx) { var events = inDates(eventsOf(ctx, ['recovery.mood.checkin']), lastDates(ctx.date, 30)); var values = events.map(function (event) { return payloadNumber(event, 'value'); }); return { value: { samples: events.length, average: events.length ? round(sum(values) / values.length, 1) : null, series: events.map(function (event) { return { date: event.local_date, value: payloadNumber(event, 'value') }; }) }, sourceEventIds: ids(events), coverage: Math.min(1, events.length / 14) }; } });
  add({ id: 'stress.trends', displayName: 'Stress trends', eventTypes: ['recovery.symptom.checkin'], eventDomains: ['mood'], timeWindow: '30 local days', outputSchema: { type: 'object', required: ['samples', 'average_severity'] }, compute: function (ctx) { var events = inDates(eventsOf(ctx, ['recovery.symptom.checkin']), lastDates(ctx.date, 30)).filter(function (event) { return /stress|anxiety/i.test(event.payload.symptom || ''); }); var values = events.map(function (event) { return payloadNumber(event, 'severity'); }); return { value: { samples: events.length, average_severity: events.length ? round(sum(values) / values.length, 1) : null }, sourceEventIds: ids(events), coverage: Math.min(1, events.length / 14) }; } });
  add({ id: 'symptoms.associations', displayName: 'Symptom associations', eventTypes: ['recovery.symptom.checkin'], eventDomains: ['mood'], truthClass: 'observed-association', calculationType: 'statistical', timeWindow: '90 local days', outputSchema: { type: 'object', required: ['status', 'associations'] }, compute: function (ctx) { var events = inDates(eventsOf(ctx, ['recovery.symptom.checkin']), lastDates(ctx.date, 90)); return { value: { status: events.length >= 30 ? 'eligible-for-registered-analysis' : 'insufficient-sample', associations: [] }, sourceEventIds: ids(events), coverage: Math.min(1, events.length / 30), confidence: { level: 'low', score: 0, coverage: Math.min(1, events.length / 30), sample_size: events.length, calibration_state: 'no-analysis-registered' }, limitations: ['No causal or associative claim is emitted without a registered, evaluated analysis.'] }; } });
  add({ id: 'photos.body', displayName: 'Body photo assets', eventTypes: ['photo.asset.added', 'photo.asset.deleted', 'body.photo.added'], eventDomains: ['photos', 'body'], outputSchema: { type: 'object', required: ['assets', 'latest_date'] }, compute: function (ctx) { var assets = bodyPhotoFacts(ctx); return { value: { assets: assets.map(function (event) { return { id: event.id, date: event.local_date, metadata: event.payload }; }), latest_date: assets.length ? latest(assets, ctx.date).local_date : null }, sourceEventIds: ids(assets).map(sourceId), coverage: assets.length ? 1 : 0 }; } });
  add({ id: 'photos.skin', displayName: 'Skin photo assets', eventTypes: ['photo.asset.added', 'photo.asset.deleted', 'skin.photo.added'], eventDomains: ['photos', 'skin'], outputSchema: { type: 'object', required: ['assets', 'latest_date'] }, compute: function (ctx) { var assets = eventsOf(ctx, ['photo.asset.added', 'skin.photo.added']).filter(function (event) { return event.type === 'skin.photo.added' || event.payload.context === 'skin' || event.payload.kind === 'skin'; }); return { value: { assets: assets.map(function (event) { return { id: event.id, date: event.local_date, metadata: event.payload }; }), latest_date: assets.length ? latest(assets, ctx.date).local_date : null }, sourceEventIds: ids(assets), coverage: assets.length ? 1 : 0 }; } });
  ['travel', 'library', 'contacts'].forEach(function (kind) { add({ id: 'lifestyle.' + kind, displayName: 'Lifestyle ' + kind, eventTypes: ['lifestyle.item.changed'], eventDomains: ['lifestyle'], outputSchema: { type: 'object', required: ['items'] }, compute: function (ctx) { var map = {}; eventsOf(ctx, ['lifestyle.item.changed']).filter(function (event) { return event.payload.kind === kind || event.payload.category === kind; }).forEach(function (event) { var key = event.payload.item_id || event.source_ref || event.id; map[key] = event.payload.change || event.payload; }); return { value: { items: Object.keys(map).map(function (key) { return Object.assign({ id: key }, map[key]); }) }, sourceEventIds: ids(eventsOf(ctx, ['lifestyle.item.changed'])), coverage: Object.keys(map).length ? 1 : 0 }; } }); });
  add({ id: 'system.data_graph', displayName: 'Canonical data graph', eventTypes: ['system.audit.recorded'], eventDomains: ['system'], outputSchema: { type: 'object', required: ['domains', 'events'] }, compute: function (ctx) { var domains = {}; ctx.allEvents.forEach(function (event) { domains[event.domain] = (domains[event.domain] || 0) + 1; }); return { value: { domains: domains, events: ctx.allEvents.length }, sourceEventIds: ids(ctx.allEvents), coverage: ctx.allEvents.length ? 1 : 0 }; } });
  add({ id: 'system.sync_status', displayName: 'Sync status', eventTypes: ['system.audit.recorded'], eventDomains: ['system'], outputSchema: { type: 'object', required: ['pending', 'failed', 'synced'] }, compute: function (ctx) { var counts = { pending: 0, failed: 0, synced: 0 }; ctx.allEvents.forEach(function (event) { if (Object.prototype.hasOwnProperty.call(counts, event.sync_state)) counts[event.sync_state] += 1; }); return { value: counts, sourceEventIds: ids(ctx.allEvents), coverage: 1 }; } });
  add({ id: 'system.migrations', displayName: 'Migration status', eventTypes: ['system.audit.recorded'], eventDomains: ['system'], outputSchema: { type: 'object', required: ['legacy_envelopes', 'latest_audit'] }, compute: function (ctx) { var imported = ctx.allEvents.filter(function (event) { return /\.legacy\.imported$/.test(event.type); }); var audit = latest(eventsOf(ctx, ['system.audit.recorded']), ctx.date); return { value: { legacy_envelopes: imported.length, latest_audit: audit ? audit.payload : null }, sourceEventIds: ids(imported.concat([audit].filter(Boolean))), coverage: audit ? 1 : 0 }; } });

  function createRegistry() { return ProjectionEngine.createRegistry(DEFINITIONS); }

  return Object.freeze({ definitions: DEFINITIONS.slice(), createRegistry: createRegistry });
});
