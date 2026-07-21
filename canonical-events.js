/* ============================================================
   Canonical Life OS event schema and normalization.

   No storage or network access occurs here. Every repository and migration
   path uses this module so validation, dates, units, provenance, ownership,
   supersession, and tombstones have one contract.
   ============================================================ */
(function (root, factory) {
  'use strict';
  var registry = root && root.LifeOSDataRegistry;
  if (!registry && typeof require === 'function') registry = require('./data-registry.js');
  var api = factory(registry);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LifeOSCanonicalEvents = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Registry) {
  'use strict';

  var SCHEMA_VERSION = 1;
  var SYNC_STATES = ['local', 'pending', 'synced', 'error', 'tombstone'];

  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function isString(value) { return typeof value === 'string' && value.trim().length > 0; }
  function isNumber(value) { return typeof value === 'number' && isFinite(value); }
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function iso(value) {
    var d = value instanceof Date ? value : new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  function timezoneOrDefault(value) {
    if (isString(value)) {
      try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date()); return value; } catch (_) {}
    }
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (_) { return 'UTC'; }
  }

  function localDateFor(instant, timezone) {
    var d = new Date(instant);
    if (isNaN(d.getTime())) return null;
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(d);
      var out = {};
      parts.forEach(function (part) { if (part.type !== 'literal') out[part.type] = part.value; });
      return out.year + '-' + out.month + '-' + out.day;
    } catch (_) {
      return d.toISOString().slice(0, 10);
    }
  }

  function randomId() {
    try { if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID(); } catch (_) {}
    var seed = Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    return 'evt_' + seed;
  }

  function hash(text) {
    text = String(text == null ? '' : text);
    var h1 = 2166136261;
    var h2 = 2246822519;
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      h1 ^= c; h1 = Math.imul(h1, 16777619);
      h2 ^= c; h2 = Math.imul(h2, 3266489917);
    }
    return ('00000000' + (h1 >>> 0).toString(16)).slice(-8) + ('00000000' + (h2 >>> 0).toString(16)).slice(-8);
  }

  function stableId(sourceRef, userId, type) {
    return 'evt_' + hash([userId, type, sourceRef].join('|'));
  }

  function required(payload, fields, errors) {
    fields.forEach(function (field) {
      if (payload[field] == null || payload[field] === '') errors.push('payload.' + field + ' is required');
    });
  }

  function numeric(payload, fields, errors, options) {
    options = options || {};
    fields.forEach(function (field) {
      if (payload[field] == null) return;
      if (!isNumber(payload[field])) errors.push('payload.' + field + ' must be a finite number');
      else if (options.min != null && payload[field] < options.min) errors.push('payload.' + field + ' must be >= ' + options.min);
      else if (options.max != null && payload[field] > options.max) errors.push('payload.' + field + ' must be <= ' + options.max);
    });
  }

  var PAYLOAD_RULES = {
    'nutrition.meal.logged': function (p, e) { required(p, ['name'], e); numeric(p, ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sodium_mg'], e, { min: 0 }); },
    'nutrition.meal.edited': function (p, e) { required(p, ['name'], e); numeric(p, ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sodium_mg'], e, { min: 0 }); },
    'nutrition.target.changed': function (p, e) { numeric(p, ['calories', 'protein_g', 'carbs_g', 'fat_g'], e, { min: 0 }); },
    'hydration.intake.logged': function (p, e) { required(p, ['amount_ml'], e); numeric(p, ['amount_ml'], e, { min: 1 }); },
    'hydration.intake.edited': function (p, e) { required(p, ['amount_ml'], e); numeric(p, ['amount_ml'], e, { min: 1 }); },
    'hydration.target.changed': function (p, e) { required(p, ['target_ml'], e); numeric(p, ['target_ml'], e, { min: 1 }); },
    'sleep.night.logged': function (p, e) { required(p, ['duration_minutes'], e); numeric(p, ['duration_minutes'], e, { min: 0, max: 1440 }); },
    'sleep.night.synced': function (p, e) { required(p, ['duration_minutes', 'provider'], e); numeric(p, ['duration_minutes'], e, { min: 0, max: 1440 }); },
    'training.session.started': function (p, e) { required(p, ['session_id'], e); },
    'training.set.logged': function (p, e) { required(p, ['session_id', 'exercise'], e); numeric(p, ['load_kg', 'reps', 'rpe'], e, { min: 0 }); },
    'training.cardio.logged': function (p, e) { required(p, ['activity'], e); numeric(p, ['duration_seconds', 'distance_km', 'avg_hr_bpm'], e, { min: 0 }); },
    'training.session.completed': function (p, e) { required(p, ['session_id'], e); numeric(p, ['duration_seconds'], e, { min: 0 }); },
    'body.weight.logged': function (p, e) { required(p, ['weight_kg'], e); numeric(p, ['weight_kg'], e, { min: 1 }); },
    'body.composition.logged': function (p, e) { numeric(p, ['body_fat_pct', 'lean_mass_kg'], e, { min: 0 }); },
    'body.measurement.logged': function (p, e) { required(p, ['measurements_cm'], e); if (p.measurements_cm != null && !isObject(p.measurements_cm)) e.push('payload.measurements_cm must be an object'); },
    'recovery.energy.checkin': function (p, e) { required(p, ['value'], e); numeric(p, ['value'], e, { min: 1, max: 5 }); },
    'recovery.mood.checkin': function (p, e) { required(p, ['value'], e); numeric(p, ['value'], e, { min: 1, max: 5 }); },
    'recovery.symptom.checkin': function (p, e) { required(p, ['symptom', 'severity'], e); numeric(p, ['severity'], e, { min: 0, max: 10 }); },
    'supplement.dose.logged': function (p, e) { required(p, ['compound'], e); numeric(p, ['amount'], e, { min: 0 }); },
    'supplement.compound.changed': function (p, e) { required(p, ['compound_id', 'name'], e); },
    'supplement.inventory.changed': function (p, e) { required(p, ['item_id'], e); numeric(p, ['remaining', 'reorder_at'], e, { min: 0 }); },
    'supplement.note.logged': function (p, e) { required(p, ['note_id', 'text'], e); },
    'skin.checkin.logged': function (p, e) { numeric(p, ['breakouts', 'redness', 'dryness', 'irritation', 'sensitivity'], e, { min: 0, max: 10 }); },
    'skin.product.changed': function (p, e) { required(p, ['product_id', 'name'], e); },
    'skin.routine.logged': function (p, e) { required(p, ['product_id', 'completed'], e); },
    'skin.photo.added': function (p, e) { required(p, ['photo_id'], e); },
    'skin.breakout.logged': function (p, e) { required(p, ['breakout_id'], e); },
    'skin.treatment.logged': function (p, e) { required(p, ['treatment_id', 'treatment_type'], e); },
    'skin.ingredient.changed': function (p, e) { required(p, ['ingredient_id', 'name'], e); },
    'skin.goal.changed': function (p, e) { required(p, ['goal_id', 'text'], e); },
    'labs.panel.logged': function (p, e) { required(p, ['markers'], e); if (p.markers != null && !Array.isArray(p.markers) && !isObject(p.markers)) e.push('payload.markers must be an array or object'); },
    'labs.panel.imported': function (p, e) { required(p, ['markers', 'provider'], e); },
    'labs.marker.corrected': function (p, e) { required(p, ['marker', 'value'], e); },
    'labs.outlook.recorded': function (p, e) { required(p, ['snapshot_id', 'model_id', 'model_version', 'baseline_panel_id', 'baseline_date', 'directions'], e); if (p.directions != null && !Array.isArray(p.directions)) e.push('payload.directions must be an array'); },
    'finance.transaction.logged': function (p, e) { required(p, ['amount_minor', 'currency'], e); numeric(p, ['amount_minor'], e); },
    'finance.transaction.imported': function (p, e) { required(p, ['amount_minor', 'currency', 'provider_record_id'], e); numeric(p, ['amount_minor'], e); },
    'task.changed': function (p, e) { required(p, ['task_id', 'change'], e); },
    'goal.changed': function (p, e) { required(p, ['goal_id', 'change'], e); },
    'calendar.event.changed': function (p, e) { required(p, ['event_id', 'change'], e); },
  };

  function validate(event) {
    var errors = [];
    if (!isObject(event)) return { ok: false, errors: ['event must be an object'] };
    var registryEntry = Registry && Registry.findByEvent ? Registry.findByEvent(event.type) : null;
    if (!isString(event.id)) errors.push('id is required');
    if (!isString(event.user_id)) errors.push('user_id is required');
    if (!isString(event.type)) errors.push('type is required');
    if (!registryEntry) errors.push('type is not registered: ' + String(event.type));
    if (!isString(event.domain)) errors.push('domain is required');
    if (registryEntry && registryEntry.domain !== event.domain) errors.push('domain does not own event type ' + event.type);
    if (!iso(event.occurred_at)) errors.push('occurred_at must be ISO-8601');
    if (!iso(event.recorded_at)) errors.push('recorded_at must be ISO-8601');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(event.local_date || '')) errors.push('local_date must be YYYY-MM-DD');
    if (!isString(event.timezone)) errors.push('timezone is required');
    else if (timezoneOrDefault(event.timezone) !== event.timezone) errors.push('timezone must be a valid IANA timezone');
    if (!isString(event.source)) errors.push('source is required');
    if (event.source_ref != null && !isString(event.source_ref)) errors.push('source_ref must be null or a non-empty string');
    if (event.schema_version !== SCHEMA_VERSION) errors.push('schema_version must be ' + SCHEMA_VERSION);
    if (!isObject(event.payload)) errors.push('payload must be an object');
    if (!isObject(event.units)) errors.push('units must be an object');
    if (!isNumber(event.confidence) || event.confidence < 0 || event.confidence > 1) errors.push('confidence must be between 0 and 1');
    if (!isObject(event.provenance)) errors.push('provenance must be an object');
    if (event.supersedes_id != null && !isString(event.supersedes_id)) errors.push('supersedes_id must be null or a non-empty string');
    if (event.deleted_at != null && !iso(event.deleted_at)) errors.push('deleted_at must be null or ISO-8601');
    if (!isString(event.device_id)) errors.push('device_id is required');
    if (SYNC_STATES.indexOf(event.sync_state) < 0) errors.push('sync_state is invalid');
    if (event.deleted_at) {
      if (!event.supersedes_id) errors.push('a tombstone must reference supersedes_id');
      if (!event.payload || event.payload.target_event_id !== event.supersedes_id) errors.push('a tombstone payload must name target_event_id');
    } else if (isObject(event.payload)) {
      if (/\.legacy\.imported$/.test(event.type)) {
        required(event.payload, ['legacy_key', 'raw_value', 'checksum'], errors);
      } else if (PAYLOAD_RULES[event.type]) {
        PAYLOAD_RULES[event.type](event.payload, errors);
      }
    }
    return { ok: errors.length === 0, errors: errors };
  }

  function normalize(input, context) {
    input = input || {};
    context = context || {};
    var registryEntry = Registry && Registry.findByEvent ? Registry.findByEvent(input.type) : null;
    var occurred = iso(input.occurred_at || context.occurredAt || new Date());
    var recorded = iso(input.recorded_at || context.recordedAt || new Date());
    var timezone = timezoneOrDefault(input.timezone || context.timezone);
    var userId = input.user_id || context.userId || null;
    var sourceRef = input.source_ref == null ? null : String(input.source_ref);
    var event = {
      id: input.id || (sourceRef && userId && input.type ? stableId(sourceRef, userId, input.type) : randomId()),
      user_id: userId,
      type: input.type,
      domain: input.domain || (registryEntry && registryEntry.domain) || null,
      occurred_at: occurred,
      recorded_at: recorded,
      local_date: input.local_date || localDateFor(occurred, timezone),
      timezone: timezone,
      source: input.source || context.source || 'manual',
      source_ref: sourceRef,
      schema_version: input.schema_version == null ? SCHEMA_VERSION : input.schema_version,
      payload: clone(input.payload || {}),
      units: clone(input.units || {}),
      confidence: input.confidence == null ? 1 : Number(input.confidence),
      provenance: clone(input.provenance || {}),
      supersedes_id: input.supersedes_id || null,
      deleted_at: input.deleted_at ? iso(input.deleted_at) : null,
      device_id: input.device_id || context.deviceId || null,
      sync_state: input.sync_state || 'pending',
    };
    if (event.deleted_at) event.sync_state = 'tombstone';
    return event;
  }

  function create(input, context) {
    var event = normalize(input, context);
    var result = validate(event);
    if (!result.ok) {
      var error = new Error('Invalid canonical event: ' + result.errors.join('; '));
      error.code = 'EVENT_VALIDATION_FAILED';
      error.details = result.errors;
      throw error;
    }
    return Object.freeze(event);
  }

  function tombstone(target, reason, context) {
    if (!target || !target.id) throw new Error('A target event is required');
    var at = (context && context.recordedAt) || new Date();
    return create({
      type: target.type,
      domain: target.domain,
      occurred_at: at,
      recorded_at: at,
      source: (context && context.source) || 'user-delete',
      source_ref: 'tombstone:' + target.id,
      payload: { target_event_id: target.id, reason: reason || 'user-request' },
      units: {},
      confidence: 1,
      provenance: { action: 'delete', target_event_id: target.id },
      supersedes_id: target.id,
      deleted_at: at,
    }, context);
  }

  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    syncStates: SYNC_STATES.slice(),
    normalize: normalize,
    validate: validate,
    create: create,
    tombstone: tombstone,
    stableId: stableId,
    hash: hash,
    localDateFor: localDateFor,
  });
});
