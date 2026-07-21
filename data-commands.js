/* ============================================================
   Canonical Life OS command layer.

   execute, undo, and redo are confirmation-ready write primitives. A command
   and its event/outbox records commit together. Undo appends tombstones; redo
   appends new events. History is never invisibly rewritten.
   ============================================================ */
(function (root, factory) {
  'use strict';
  var registry = root && root.LifeOSDataRegistry;
  var events = root && root.LifeOSCanonicalEvents;
  if (!registry && typeof require === 'function') registry = require('./data-registry.js');
  if (!events && typeof require === 'function') events = require('./canonical-events.js');
  var api = factory(registry, events, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LifeOSDataCommands = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Registry, Events, root) {
  'use strict';

  var COMMAND_TO_EVENT = Object.freeze({
    'profile.settings.change': 'profile.settings.changed',
    'nutrition.meal.log': 'nutrition.meal.logged',
    'nutrition.meal.edit': 'nutrition.meal.edited',
    'nutrition.target.change': 'nutrition.target.changed',
    'hydration.intake.log': 'hydration.intake.logged',
    'hydration.intake.edit': 'hydration.intake.edited',
    'hydration.target.change': 'hydration.target.changed',
    'sleep.night.log': 'sleep.night.logged',
    'sleep.night.sync': 'sleep.night.synced',
    'wearables.sample.sync': 'wearables.sample.synced',
    'training.session.start': 'training.session.started',
    'training.set.log': 'training.set.logged',
    'training.cardio.log': 'training.cardio.logged',
    'training.session.complete': 'training.session.completed',
    'body.weight.log': 'body.weight.logged',
    'body.composition.log': 'body.composition.logged',
    'body.measurement.log': 'body.measurement.logged',
    'body.photo.add': 'body.photo.added',
    'recovery.energy.checkin': 'recovery.energy.checkin',
    'recovery.mood.checkin': 'recovery.mood.checkin',
    'recovery.symptom.checkin': 'recovery.symptom.checkin',
    'labs.panel.log': 'labs.panel.logged',
    'labs.panel.import': 'labs.panel.imported',
    'labs.marker.correct': 'labs.marker.corrected',
    'labs.outlook.record': 'labs.outlook.recorded',
    'supplement.dose.log': 'supplement.dose.logged',
    'supplement.compound.change': 'supplement.compound.changed',
    'supplement.inventory.change': 'supplement.inventory.changed',
    'supplement.note.log': 'supplement.note.logged',
    'skin.checkin.log': 'skin.checkin.logged',
    'skin.routine.log': 'skin.routine.logged',
    'skin.product.change': 'skin.product.changed',
    'skin.photo.add': 'skin.photo.added',
    'skin.breakout.log': 'skin.breakout.logged',
    'skin.treatment.log': 'skin.treatment.logged',
    'skin.ingredient.change': 'skin.ingredient.changed',
    'skin.goal.change': 'skin.goal.changed',
    'finance.transaction.log': 'finance.transaction.logged',
    'finance.transaction.import': 'finance.transaction.imported',
    'finance.account.change': 'finance.account.changed',
    'task.change': 'task.changed',
    'goal.change': 'goal.changed',
    'calendar.event.change': 'calendar.event.changed',
    'habit.change': 'habit.changed',
    'integration.status.change': 'integration.status.changed',
    'photo.asset.add': 'photo.asset.added',
    'photo.asset.delete': 'photo.asset.deleted',
    'lifestyle.item.change': 'lifestyle.item.changed',
    'system.audit.record': 'system.audit.recorded',
  });

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function nowIso() { return new Date().toISOString(); }
  function commandId() { return 'cmd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

  function normalizePayload(type, payload) {
    payload = clone(payload || {});
    if (type === 'nutrition.meal.log' || type === 'nutrition.meal.edit') {
      if (payload.protein_g == null && payload.protein != null) payload.protein_g = Number(payload.protein);
      if (payload.carbs_g == null && payload.carbs != null) payload.carbs_g = Number(payload.carbs);
      if (payload.fat_g == null && payload.fat != null) payload.fat_g = Number(payload.fat);
      if (payload.fiber_g == null && payload.fiber != null) payload.fiber_g = Number(payload.fiber);
      delete payload.protein; delete payload.carbs; delete payload.fat; delete payload.fiber;
    }
    if (type === 'hydration.intake.log' || type === 'hydration.intake.edit') {
      if (payload.amount_ml == null && payload.amount != null) payload.amount_ml = Number(payload.amount);
    }
    if (type === 'hydration.target.change' && payload.target_ml == null && payload.target != null) payload.target_ml = Number(payload.target);
    if (type === 'sleep.night.log' || type === 'sleep.night.sync') {
      if (payload.duration_minutes == null && payload.minutes != null) payload.duration_minutes = Number(payload.minutes);
      if (payload.duration_minutes == null && payload.hours != null) payload.duration_minutes = Math.round(Number(payload.hours) * 60);
    }
    if (type === 'body.weight.log' && payload.weight_kg == null && payload.kg != null) payload.weight_kg = Number(payload.kg);
    if ((type === 'recovery.energy.checkin' || type === 'recovery.mood.checkin') && payload.value == null && payload.rating != null) payload.value = Number(payload.rating);
    if ((type === 'finance.transaction.log' || type === 'finance.transaction.import') && payload.amount_minor == null && payload.amount != null) {
      payload.amount_minor = Math.round(Number(payload.amount) * 100);
    }
    return payload;
  }

  function assertCoverage() {
    var missing = [];
    Registry.list().forEach(function (entry) {
      entry.commandTypes.forEach(function (type) { if (!COMMAND_TO_EVENT[type]) missing.push(type); });
    });
    return missing;
  }

  function create(options) {
    options = options || {};
    var repository = options.repository;
    if (!repository || typeof repository.commitCommand !== 'function') throw new Error('A canonical repository is required');
    var missing = assertCoverage();
    if (missing.length) throw new Error('Command mappings missing: ' + missing.join(', '));

    function build(command, idOverride) {
      if (!command || !command.type) throw new Error('command.type is required');
      var registryEntry = Registry.findByCommand(command.type);
      if (!registryEntry) throw new Error('Unregistered command type: ' + command.type);
      var eventType = COMMAND_TO_EVENT[command.type];
      var id = idOverride || command.id || commandId();
      var occurredAt = command.occurred_at || command.occurredAt || nowIso();
      var payload = normalizePayload(command.type, command.payload);
      var sourceRef = 'command:' + id + ':0';
      var eventId = Events.stableId(sourceRef, repository.context.userId, eventType);
      var eventInput = {
        id: eventId,
        type: eventType,
        occurred_at: occurredAt,
        local_date: command.local_date,
        timezone: command.timezone,
        source: command.source || 'command',
        source_ref: sourceRef,
        payload: payload,
        units: clone(command.units || {}),
        confidence: command.confidence == null ? 1 : command.confidence,
        provenance: Object.assign({}, clone(command.provenance || {}), { command_id: id, command_type: command.type }),
        supersedes_id: command.targetEventId || command.supersedes_id || null,
      };
      var record = {
        id: id,
        user_id: repository.context.userId,
        device_id: repository.context.deviceId,
        type: command.type,
        status: 'completed',
        created_at: command.created_at || nowIso(),
        completed_at: nowIso(),
        input: {
          type: command.type,
          payload: clone(command.payload || {}),
          units: clone(command.units || {}),
          occurred_at: occurredAt,
          local_date: command.local_date || null,
          timezone: command.timezone || null,
          source: command.source || 'command',
          confidence: command.confidence == null ? 1 : command.confidence,
          provenance: clone(command.provenance || {}),
          targetEventId: command.targetEventId || command.supersedes_id || null,
        },
        event_ids: [eventId],
        inverse: { kind: 'tombstone-events' },
        undo_of: command.undo_of || null,
        redo_of: command.redo_of || null,
        undone_by: null,
        redone_by: null,
      };
      return { id: id, entry: registryEntry, record: record, eventInputs: [eventInput] };
    }

    function hydrateResult(record) {
      return Promise.all((record.event_ids || []).map(function (id) { return repository.get(id); })).then(function (events) {
        return { command: clone(record), events: events.filter(Boolean), projections: (Registry.findByCommand(record.type) || {}).projectionIds || [] };
      });
    }

    function execute(command) {
      var built = build(command);
      return repository.getCommand(built.id).then(function (existing) {
        if (existing) return hydrateResult(existing);
        return repository.commitCommand(built.record, built.eventInputs, [], built.entry.projectionIds).then(function (result) {
          return { command: clone(built.record), events: result.events, projections: built.entry.projectionIds.slice() };
        });
      });
    }

    function undo(id, reason) {
      return repository.getCommand(id).then(function (original) {
        if (!original) throw new Error('Command not found: ' + id);
        if (original.status === 'undone' && original.undone_by) return repository.getCommand(original.undone_by).then(hydrateResult);
        if (original.status !== 'completed') throw new Error('Command cannot be undone from status ' + original.status);
        return Promise.all((original.event_ids || []).map(function (eventId) { return repository.get(eventId); })).then(function (targets) {
          targets = targets.filter(Boolean);
          if (!targets.length) throw new Error('Command has no persisted events');
          var undoId = 'cmd_undo_' + Events.hash(original.id);
          var tombstones = targets.map(function (target) {
            return Events.tombstone(target, reason || 'undo-command', {
              userId: repository.context.userId,
              deviceId: repository.context.deviceId,
              timezone: repository.context.timezone,
              source: 'command-undo',
            });
          });
          var undoRecord = {
            id: undoId, user_id: repository.context.userId, device_id: repository.context.deviceId,
            type: original.type, status: 'completed', created_at: nowIso(), completed_at: nowIso(),
            input: clone(original.input), event_ids: tombstones.map(function (event) { return event.id; }), inverse: { kind: 'redo-command', command_id: original.id },
            undo_of: original.id, redo_of: null, undone_by: null, redone_by: null,
          };
          var updatedOriginal = clone(original); updatedOriginal.status = 'undone'; updatedOriginal.undone_by = undoId; updatedOriginal.undone_at = nowIso();
          var projections = (Registry.findByCommand(original.type) || {}).projectionIds || [];
          return repository.commitCommand(undoRecord, tombstones, [updatedOriginal], projections).then(function (result) {
            return { command: clone(undoRecord), events: result.events, projections: projections.slice() };
          });
        });
      });
    }

    function redo(id) {
      return repository.getCommand(id).then(function (original) {
        if (!original) throw new Error('Command not found: ' + id);
        if (original.redone_by) return repository.getCommand(original.redone_by).then(hydrateResult);
        if (original.status !== 'undone') throw new Error('Command can only be redone after undo');
        var redoId = 'cmd_redo_' + Events.hash(original.id + '|' + original.undone_by);
        var command = Object.assign({}, clone(original.input), { id: redoId, redo_of: original.id, source: 'command-redo' });
        var built = build(command, redoId);
        built.record.redo_of = original.id;
        var updatedOriginal = clone(original); updatedOriginal.redone_by = redoId; updatedOriginal.redone_at = nowIso();
        return repository.commitCommand(built.record, built.eventInputs, [updatedOriginal], built.entry.projectionIds).then(function (result) {
          return { command: clone(built.record), events: result.events, projections: built.entry.projectionIds.slice() };
        });
      });
    }

    return Object.freeze({ execute: execute, undo: undo, redo: redo, get: repository.getCommand, history: repository.listCommands });
  }

  function install(options) {
    var commands = create(options);
    if (root) {
      root.LifeOS = root.LifeOS || {};
      root.LifeOS.commands = commands;
    }
    return commands;
  }

  return Object.freeze({ commandToEvent: COMMAND_TO_EVENT, assertCoverage: assertCoverage, create: create, install: install });
});
