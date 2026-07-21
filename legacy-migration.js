/* ============================================================
   Explicit legacy migration and compatibility readers.

   Nothing runs automatically. Call preview(), inspect the counts/checksum,
   then call apply(preview). Every imported legacy value retains its exact raw
   bytes and stable source reference. Verification failure compensates with
   tombstones and restores the pre-apply legacy snapshot.
   ============================================================ */
(function (root, factory) {
  'use strict';
  var registry = root && root.LifeOSDataRegistry;
  var events = root && root.LifeOSCanonicalEvents;
  if (!registry && typeof require === 'function') registry = require('./data-registry.js');
  if (!events && typeof require === 'function') events = require('./canonical-events.js');
  var api = factory(registry, events, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LifeOSLegacyMigration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Registry, Events, root) {
  'use strict';

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

  function storageKeys(storage) {
    var keys = [];
    if (!storage) return keys;
    if (typeof storage.length === 'number' && typeof storage.key === 'function') {
      for (var i = 0; i < storage.length; i++) {
        var key = storage.key(i);
        if (key != null && keys.indexOf(key) < 0) keys.push(String(key));
      }
    } else {
      Object.keys(storage).forEach(function (key) {
        if (typeof storage[key] !== 'function') keys.push(key);
      });
    }
    return keys.sort();
  }

  function snapshot(storage) {
    var values = {};
    storageKeys(storage).forEach(function (key) {
      var raw = storage.getItem(key);
      if (raw != null) values[key] = String(raw);
    });
    return values;
  }

  function snapshotChecksum(values) {
    return Events.hash(Object.keys(values || {}).sort().map(function (key) { return key + '\u0000' + values[key]; }).join('\u0001'));
  }

  function parseRaw(raw, format) {
    if (format === 'raw') return raw;
    try { return JSON.parse(raw); } catch (_) { return raw; }
  }

  function restoreSnapshotAtomic(storage, target) {
    var before = snapshot(storage);
    function write(values) {
      storageKeys(storage).forEach(function (key) { storage.removeItem(key); });
      Object.keys(values).sort().forEach(function (key) { storage.setItem(key, values[key]); });
    }
    try {
      write(target || {});
      if (snapshotChecksum(snapshot(storage)) !== snapshotChecksum(target || {})) throw new Error('snapshot verification failed');
      return { ok: true, count: Object.keys(target || {}).length };
    } catch (error) {
      try { write(before); } catch (_) {}
      var wrapped = new Error('Legacy snapshot restore failed: ' + error.message);
      wrapped.code = 'LEGACY_RESTORE_FAILED';
      throw wrapped;
    }
  }

  function create(options) {
    options = options || {};
    var repository = options.repository;
    var storage = options.storage || (root && root.localStorage);
    if (!repository || typeof repository.appendBatch !== 'function') throw new Error('A canonical repository is required');
    if (!storage || typeof storage.getItem !== 'function') throw new Error('A localStorage-compatible source is required');
    var context = {
      userId: repository.context.userId,
      deviceId: repository.context.deviceId,
      timezone: repository.context.timezone,
      source: 'legacy-migration',
    };

    function preview(previewOptions) {
      previewOptions = previewOptions || {};
      var allowed = previewOptions.domains || null;
      var at = new Date(previewOptions.at || Date.now()).toISOString();
      var fullSnapshot = snapshot(storage);
      var entries = [];
      var skipped = [];
      var unregisteredKeys = [];
      var counts = {};
      var bytes = {};

      Object.keys(fullSnapshot).sort().forEach(function (key) {
        var resolved = Registry.resolveLegacyKey(key, 'localStorage');
        if (!resolved) { unregisteredKeys.push(key); return; }
        if (allowed && allowed.indexOf(resolved.domain) < 0) return;
        if (resolved.source.migrate === false) {
          skipped.push({ key: key, domain: resolved.domain, reason: 'excluded-by-retention-rule' });
          return;
        }
        var raw = fullSnapshot[key];
        var checksum = Events.hash(raw);
        var sourceRef = 'legacy:v' + resolved.entry.migrationVersion + ':' + resolved.domain + ':' + key + ':' + checksum;
        var event = Events.create({
          type: resolved.domain + '.legacy.imported',
          occurred_at: at,
          recorded_at: at,
          source: 'legacy-migration',
          source_ref: sourceRef,
          payload: {
            legacy_key: key,
            raw_value: raw,
            parsed_value: parseRaw(raw, resolved.source.format),
            format: resolved.source.format,
            checksum: checksum,
            byte_length: raw.length,
          },
          units: {},
          confidence: 1,
          provenance: {
            provider: 'legacy-localStorage',
            original_key: key,
            original_owner: resolved.source.owner,
            migration_version: resolved.entry.migrationVersion,
            imported_at: at,
          },
        }, context);
        entries.push(event);
        counts[resolved.domain] = (counts[resolved.domain] || 0) + 1;
        bytes[resolved.domain] = (bytes[resolved.domain] || 0) + raw.length;
      });

      var checksum = snapshotChecksum(fullSnapshot);
      return Object.freeze({
        id: 'migration_v' + Registry.version + '_' + Events.hash(context.userId + '|' + checksum),
        registry_version: Registry.version,
        created_at: at,
        snapshot: Object.freeze(clone(fullSnapshot)),
        snapshot_checksum: checksum,
        events: Object.freeze(entries.slice()),
        event_ids: Object.freeze(entries.map(function (event) { return event.id; })),
        counts: Object.freeze(clone(counts)),
        bytes: Object.freeze(clone(bytes)),
        skipped: Object.freeze(clone(skipped)),
        unregistered_keys: Object.freeze(unregisteredKeys.slice()),
        dry_run: true,
      });
    }

    function verify(id) {
      return repository.getMeta('migration:' + id).then(function (record) {
        if (!record) return { ok: false, errors: ['migration metadata not found'], id: id };
        return Promise.all((record.event_ids || []).map(function (eventId) { return repository.get(eventId); })).then(function (found) {
          var errors = [];
          var events = found.filter(Boolean);
          if (events.length !== record.event_ids.length) errors.push('event count mismatch');
          var seenRefs = {};
          events.forEach(function (event) {
            if (event.source !== 'legacy-migration') errors.push('unexpected source for ' + event.id);
            if (!event.source_ref || seenRefs[event.source_ref]) errors.push('duplicate or missing source_ref for ' + event.id);
            seenRefs[event.source_ref] = true;
            var payload = event.payload || {};
            if (Events.hash(payload.raw_value || '') !== payload.checksum) errors.push('raw checksum mismatch for ' + event.id);
            if (record.key_checksums && record.key_checksums[payload.legacy_key] !== payload.checksum) errors.push('snapshot checksum mismatch for ' + payload.legacy_key);
          });
          Object.keys(record.key_checksums || {}).forEach(function (key) {
            if (!events.some(function (event) { return event.payload && event.payload.legacy_key === key; })) errors.push('missing migrated key ' + key);
          });
          return {
            ok: errors.length === 0,
            errors: errors,
            id: id,
            expected_events: record.event_ids.length,
            actual_events: events.length,
            snapshot_checksum: record.snapshot_checksum,
          };
        });
      });
    }

    function rollback(id, rollbackOptions) {
      rollbackOptions = rollbackOptions || {};
      return repository.getMeta('migration:' + id).then(function (record) {
        if (!record) throw new Error('Migration not found: ' + id);
        if (record.status === 'rolled_back') return { ok: true, id: id, already_rolled_back: true };
        return Promise.all((record.event_ids || []).map(function (eventId) { return repository.get(eventId); })).then(function (found) {
          var targets = found.filter(function (event) { return event && !event.deleted_at; });
          var beforeRestore = snapshot(storage);
          if (rollbackOptions.restoreLegacy !== false) restoreSnapshotAtomic(storage, record.snapshot || {});
          var tombstones = targets.map(function (target) {
            return Events.tombstone(target, 'rollback:' + id, {
              userId: context.userId, deviceId: context.deviceId, timezone: context.timezone, source: 'migration-rollback',
            });
          });
          var updated = clone(record);
          updated.status = 'rolled_back'; updated.rolled_back_at = new Date().toISOString();
          updated.rollback_event_ids = tombstones.map(function (event) { return event.id; });
          return repository.appendBatch(tombstones, { meta: [{ key: 'migration:' + id, value: updated, updated_at: updated.rolled_back_at }] })
            .then(function () { return { ok: true, id: id, tombstones: tombstones.length, restored_keys: Object.keys(record.snapshot || {}).length }; })
            .catch(function (error) {
              if (rollbackOptions.restoreLegacy !== false) {
                try { restoreSnapshotAtomic(storage, beforeRestore); } catch (_) {}
              }
              throw error;
            });
        });
      });
    }

    function apply(plan) {
      if (!plan || !plan.id || !Array.isArray(plan.events)) return Promise.reject(new Error('A migration preview is required'));
      if (plan.registry_version !== Registry.version) return Promise.reject(new Error('Registry version changed; create a new preview'));
      var currentChecksum = snapshotChecksum(snapshot(storage));
      if (currentChecksum !== plan.snapshot_checksum) {
        var drift = new Error('Legacy data changed after preview; create a new preview');
        drift.code = 'MIGRATION_SOURCE_DRIFT';
        return Promise.reject(drift);
      }
      return repository.getMeta('migration:' + plan.id).then(function (existing) {
        if (existing && existing.status === 'applied') return verify(plan.id);
        var keyChecksums = {};
        plan.events.forEach(function (event) { keyChecksums[event.payload.legacy_key] = event.payload.checksum; });
        var record = {
          id: plan.id,
          status: 'applied',
          registry_version: plan.registry_version,
          applied_at: new Date().toISOString(),
          snapshot: clone(plan.snapshot),
          snapshot_checksum: plan.snapshot_checksum,
          event_ids: plan.events.map(function (event) { return event.id; }),
          source_refs: plan.events.map(function (event) { return event.source_ref; }),
          key_checksums: keyChecksums,
          counts: clone(plan.counts),
          bytes: clone(plan.bytes),
        };
        return repository.appendBatch(plan.events, { meta: [{ key: 'migration:' + plan.id, value: record, updated_at: record.applied_at }] })
          .then(function () { return verify(plan.id); })
          .then(function (result) {
            if (result.ok) return result;
            return rollback(plan.id, { restoreLegacy: true }).then(function () {
              var error = new Error('Migration verification failed: ' + result.errors.join('; '));
              error.code = 'MIGRATION_VERIFICATION_FAILED';
              error.verification = result;
              throw error;
            });
          });
      });
    }

    function legacyValues(domain) {
      var entry = Registry.get(domain);
      if (!entry) throw new Error('Unknown domain: ' + domain);
      var values = {};
      storageKeys(storage).forEach(function (key) {
        var resolved = Registry.resolveLegacyKey(key, 'localStorage');
        if (!resolved || resolved.domain !== domain || resolved.source.migrate === false) return;
        var raw = storage.getItem(key);
        values[key] = parseRaw(raw, resolved.source.format);
      });
      return values;
    }

    function read(domain) {
      return repository.query({ domain: domain }).then(function (canonical) {
        return { domain: domain, canonical: canonical, legacy: legacyValues(domain), migration: 'compatibility-read' };
      });
    }

    return Object.freeze({
      preview: preview,
      apply: apply,
      verify: verify,
      rollback: rollback,
      read: read,
      legacyValues: legacyValues,
      snapshot: function () { return snapshot(storage); },
    });
  }

  return Object.freeze({
    create: create,
    snapshot: snapshot,
    checksum: snapshotChecksum,
    restoreSnapshotAtomic: restoreSnapshotAtomic,
  });
});
