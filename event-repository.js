/* ============================================================
   Transactional canonical event repository.

   Browser persistence uses one IndexedDB transaction for canonical events,
   command history, outbox records, and migration metadata. Tests use the
   same repository over an in-memory adapter with atomic rollback semantics.
   ============================================================ */
(function (root, factory) {
  'use strict';
  var events = root && root.LifeOSCanonicalEvents;
  if (!events && typeof require === 'function') events = require('./canonical-events.js');
  var api = factory(events, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LifeOSEventRepository = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Events, root) {
  'use strict';

  var STORES = ['events', 'outbox', 'commands', 'meta'];

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function nowIso() { return new Date().toISOString(); }
  function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

  function MemoryAdapter(seed) {
    seed = seed || {};
    this.state = {};
    for (var i = 0; i < STORES.length; i++) {
      var name = STORES[i];
      this.state[name] = {};
      (seed[name] || []).forEach(function (record) { this.state[name][record.id || record.key] = clone(record); }, this);
    }
    this.nextError = null;
  }

  MemoryAdapter.prototype.failNextWrite = function (error) { this.nextError = error || new Error('injected write failure'); };
  MemoryAdapter.prototype.writeBatch = function (batch) {
    if (this.nextError) { var e = this.nextError; this.nextError = null; return Promise.reject(e); }
    var next = clone(this.state);
    try {
      (batch.events || []).forEach(function (record) { next.events[record.id] = clone(record); });
      (batch.outbox || []).forEach(function (record) { next.outbox[record.id] = clone(record); });
      (batch.commands || []).forEach(function (record) { next.commands[record.id] = clone(record); });
      (batch.meta || []).forEach(function (record) { next.meta[record.key] = clone(record); });
      (batch.removeOutbox || []).forEach(function (id) { delete next.outbox[id]; });
      this.state = next;
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  };
  MemoryAdapter.prototype.get = function (store, key) { return Promise.resolve(clone(this.state[store] && this.state[store][key])); };
  MemoryAdapter.prototype.all = function (store) {
    var values = Object.keys(this.state[store] || {}).map(function (key) { return clone(this.state[store][key]); }, this);
    return Promise.resolve(values);
  };
  MemoryAdapter.prototype.clear = function () {
    STORES.forEach(function (name) { this.state[name] = {}; }, this);
    return Promise.resolve();
  };
  MemoryAdapter.prototype.replaceAll = function (seed) {
    var next = {};
    STORES.forEach(function (name) {
      next[name] = {};
      (seed[name] || []).forEach(function (record) { next[name][record.id || record.key] = clone(record); });
    });
    this.state = next;
    return Promise.resolve();
  };

  function IndexedDBAdapter(options) {
    options = options || {};
    this.name = options.name || 'lifeos-canonical';
    this.version = options.version || 1;
    this.indexedDB = options.indexedDB || (root && root.indexedDB);
    this.dbPromise = null;
  }

  IndexedDBAdapter.prototype.open = function () {
    var self = this;
    if (self.dbPromise) return self.dbPromise;
    self.dbPromise = new Promise(function (resolve, reject) {
      if (!self.indexedDB) { reject(new Error('IndexedDB is unavailable')); return; }
      var request = self.indexedDB.open(self.name, self.version);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains('events')) {
          var events = db.createObjectStore('events', { keyPath: 'id' });
          events.createIndex('user_id', 'user_id', { unique: false });
          events.createIndex('domain', 'domain', { unique: false });
          events.createIndex('type', 'type', { unique: false });
          events.createIndex('source_ref', 'source_ref', { unique: false });
          events.createIndex('recorded_at', 'recorded_at', { unique: false });
        }
        if (!db.objectStoreNames.contains('outbox')) {
          var outbox = db.createObjectStore('outbox', { keyPath: 'id' });
          outbox.createIndex('status', 'status', { unique: false });
          outbox.createIndex('user_id', 'user_id', { unique: false });
        }
        if (!db.objectStoreNames.contains('commands')) db.createObjectStore('commands', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { self.dbPromise = null; reject(request.error || new Error('IndexedDB open failed')); };
      request.onblocked = function () { self.dbPromise = null; reject(new Error('IndexedDB upgrade blocked')); };
    });
    return self.dbPromise;
  };

  IndexedDBAdapter.prototype.writeBatch = function (batch) {
    return this.open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORES, 'readwrite');
        (batch.events || []).forEach(function (record) { tx.objectStore('events').put(clone(record)); });
        (batch.outbox || []).forEach(function (record) { tx.objectStore('outbox').put(clone(record)); });
        (batch.commands || []).forEach(function (record) { tx.objectStore('commands').put(clone(record)); });
        (batch.meta || []).forEach(function (record) { tx.objectStore('meta').put(clone(record)); });
        (batch.removeOutbox || []).forEach(function (id) { tx.objectStore('outbox').delete(id); });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error('IndexedDB transaction failed')); };
        tx.onabort = function () { reject(tx.error || new Error('IndexedDB transaction aborted')); };
      });
    });
  };

  IndexedDBAdapter.prototype.get = function (store, key) {
    return this.open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var request = db.transaction(store, 'readonly').objectStore(store).get(key);
        request.onsuccess = function () { resolve(clone(request.result)); };
        request.onerror = function () { reject(request.error || new Error('IndexedDB read failed')); };
      });
    });
  };

  IndexedDBAdapter.prototype.all = function (store) {
    return this.open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var objectStore = db.transaction(store, 'readonly').objectStore(store);
        if (typeof objectStore.getAll === 'function') {
          var request = objectStore.getAll();
          request.onsuccess = function () { resolve(clone(request.result || [])); };
          request.onerror = function () { reject(request.error || new Error('IndexedDB read failed')); };
          return;
        }
        var values = [];
        var cursor = objectStore.openCursor();
        cursor.onsuccess = function () {
          var item = cursor.result;
          if (!item) { resolve(clone(values)); return; }
          values.push(item.value); item.continue();
        };
        cursor.onerror = function () { reject(cursor.error || new Error('IndexedDB cursor failed')); };
      });
    });
  };

  IndexedDBAdapter.prototype.clear = function () {
    return this.open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORES, 'readwrite');
        STORES.forEach(function (store) { tx.objectStore(store).clear(); });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error('IndexedDB clear failed')); };
      });
    });
  };
  IndexedDBAdapter.prototype.replaceAll = function (seed) {
    return this.open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORES, 'readwrite');
        STORES.forEach(function (store) {
          var objectStore = tx.objectStore(store);
          objectStore.clear();
          (seed[store] || []).forEach(function (record) { objectStore.put(clone(record)); });
        });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error || new Error('IndexedDB restore failed')); };
        tx.onabort = function () { reject(tx.error || new Error('IndexedDB restore aborted')); };
      });
    });
  };

  function sameIdentity(a, b) {
    return a.id === b.id || (!!a.source_ref && a.user_id === b.user_id && a.type === b.type && a.source_ref === b.source_ref);
  }

  function sameFact(a, b) {
    return a.user_id === b.user_id && a.type === b.type && a.domain === b.domain && a.occurred_at === b.occurred_at &&
      a.source_ref === b.source_ref && JSON.stringify(a.payload) === JSON.stringify(b.payload) && JSON.stringify(a.units) === JSON.stringify(b.units) &&
      a.supersedes_id === b.supersedes_id && a.deleted_at === b.deleted_at;
  }

  function createRepository(options) {
    options = options || {};
    if (!Events || typeof Events.create !== 'function') throw new Error('LifeOSCanonicalEvents is required');
    if (!options.userId) throw new Error('userId is required for an owner-scoped repository');
    if (!options.deviceId) throw new Error('deviceId is required for an owner-scoped repository');
    var adapter = options.adapter || new IndexedDBAdapter(options.indexedDBOptions);
    var context = {
      userId: options.userId,
      deviceId: options.deviceId,
      timezone: options.timezone,
      source: options.source,
    };
    var subscribers = [];

    function notify(change) {
      subscribers.slice().forEach(function (fn) { try { fn(clone(change)); } catch (_) {} });
      try {
        if (root && typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function') {
          root.dispatchEvent(new root.CustomEvent('lifeos:canonical-changed', { detail: clone(change) }));
        }
      } catch (_) {}
    }

    function outboxFor(event) {
      return {
        id: event.id,
        event_id: event.id,
        user_id: event.user_id,
        operation: event.deleted_at ? 'tombstone' : 'upsert',
        status: 'pending',
        attempts: 0,
        queued_at: nowIso(),
        next_attempt_at: null,
        last_error: null,
      };
    }

    function prepare(inputs, existing) {
      var created = [];
      var duplicates = [];
      (inputs || []).forEach(function (input) {
        var event = Events.create(input, context);
        var found = existing.concat(created).find(function (candidate) { return sameIdentity(candidate, event); });
        if (found) {
          if (!sameFact(found, event)) {
            var conflict = new Error('Idempotency conflict for ' + (event.source_ref || event.id));
            conflict.code = 'IDEMPOTENCY_CONFLICT';
            conflict.existing = clone(found);
            conflict.incoming = clone(event);
            throw conflict;
          }
          duplicates.push(found);
        } else {
          created.push(event);
        }
      });
      return { created: created, duplicates: duplicates };
    }

    function commit(inputs, extra) {
      extra = extra || {};
      return adapter.all('events').then(function (existing) {
        var prepared = prepare(inputs, existing);
        var batch = {
          events: prepared.created,
          outbox: prepared.created.map(outboxFor),
          commands: extra.commands || [],
          meta: extra.meta || [],
          removeOutbox: extra.removeOutbox || [],
        };
        if (!prepared.created.length && !batch.commands.length && !batch.meta.length && !batch.removeOutbox.length) {
          return { events: prepared.duplicates, created: [], duplicates: prepared.duplicates };
        }
        return adapter.writeBatch(batch).then(function () {
          var change = {
            eventIds: prepared.created.map(function (event) { return event.id; }),
            domains: prepared.created.map(function (event) { return event.domain; }).filter(function (domain, index, all) { return all.indexOf(domain) === index; }),
            projectionIds: extra.projectionIds || [],
            commandIds: (batch.commands || []).map(function (record) { return record.id; }),
          };
          notify(change);
          return { events: prepared.created.concat(prepared.duplicates), created: prepared.created, duplicates: prepared.duplicates };
        });
      });
    }

    function append(input) { return commit([input]).then(function (result) { return result.events[0]; }); }
    function appendBatch(inputs, extra) { return commit(inputs, extra); }

    function get(id) { return adapter.get('events', id); }

    function rawQuery(filters) {
      filters = filters || {};
      return adapter.all('events').then(function (events) {
        return events.filter(function (event) {
          if (!filters.allUsers && event.user_id !== context.userId) return false;
          if (filters.domain && event.domain !== filters.domain) return false;
          if (filters.type && event.type !== filters.type) return false;
          if (filters.source && event.source !== filters.source) return false;
          if (filters.sourceRef && event.source_ref !== filters.sourceRef) return false;
          if (filters.localDate && event.local_date !== filters.localDate) return false;
          return true;
        }).sort(function (a, b) { return a.occurred_at < b.occurred_at ? -1 : a.occurred_at > b.occurred_at ? 1 : a.recorded_at < b.recorded_at ? -1 : 1; });
      });
    }

    function query(filters) {
      filters = filters || {};
      return rawQuery(filters).then(function (events) {
        if (filters.includeDeleted && filters.includeSuperseded) return events;
        var tombstoned = {};
        events.forEach(function (event) { if (event.deleted_at && event.supersedes_id) tombstoned[event.supersedes_id] = true; });
        var active = events.filter(function (event) { return !event.deleted_at && !tombstoned[event.id]; });
        if (filters.includeSuperseded) return filters.includeDeleted ? events : active;
        var superseded = {};
        active.forEach(function (event) { if (event.supersedes_id) superseded[event.supersedes_id] = true; });
        var effective = active.filter(function (event) { return !superseded[event.id]; });
        if (filters.includeDeleted) return effective.concat(events.filter(function (event) { return !!event.deleted_at; }));
        return effective;
      });
    }

    function replace(targetId, replacement) {
      return get(targetId).then(function (target) {
        if (!target || target.user_id !== context.userId) throw new Error('Event not found: ' + targetId);
        replacement = Object.assign({}, replacement, {
          type: replacement.type || target.type,
          domain: replacement.domain || target.domain,
          supersedes_id: target.id,
          source_ref: replacement.source_ref || 'replacement:' + target.id + ':' + Events.hash(JSON.stringify(replacement.payload || {})),
        });
        return append(replacement);
      });
    }

    function tombstone(targetId, reason, extra) {
      return get(targetId).then(function (target) {
        if (!target || target.user_id !== context.userId) throw new Error('Event not found: ' + targetId);
        return append(Events.tombstone(target, reason, Object.assign({}, context, extra || {})));
      });
    }

    function pendingOutbox() {
      return adapter.all('outbox').then(function (records) {
        return records.filter(function (record) { return record.user_id === context.userId && (record.status === 'pending' || record.status === 'error'); })
          .sort(function (a, b) { return a.queued_at < b.queued_at ? -1 : 1; });
      });
    }

    function acknowledge(eventId, remoteRef) {
      return Promise.all([adapter.get('events', eventId), adapter.get('outbox', eventId)]).then(function (records) {
        var event = records[0], outbox = records[1];
        if (!event || event.user_id !== context.userId) throw new Error('Event not found: ' + eventId);
        event.sync_state = event.deleted_at ? 'tombstone' : 'synced';
        if (outbox) { outbox.status = 'synced'; outbox.acknowledged_at = nowIso(); outbox.remote_ref = remoteRef || null; }
        return adapter.writeBatch({ events: [event], outbox: outbox ? [outbox] : [] }).then(function () { return clone(event); });
      });
    }

    function failOutbox(eventId, error, retryAt) {
      return adapter.get('outbox', eventId).then(function (record) {
        if (!record) throw new Error('Outbox record not found: ' + eventId);
        record.status = 'error'; record.attempts = (record.attempts || 0) + 1;
        record.last_error = String(error && error.message ? error.message : error || 'sync failed');
        record.next_attempt_at = retryAt ? new Date(retryAt).toISOString() : null;
        return adapter.writeBatch({ outbox: [record] }).then(function () { return clone(record); });
      });
    }

    function ingestRemote(incoming) {
      incoming = Array.isArray(incoming) ? incoming : [];
      return Promise.all([adapter.all('events'), adapter.get('meta', 'sync:conflicts')]).then(function (records) {
        var existing = records[0] || [];
        var priorConflicts = records[1] && Array.isArray(records[1].value) ? records[1].value : [];
        var created = [], duplicates = [], conflicts = [], removeOutbox = [], acknowledged = [];
        incoming.forEach(function (raw) {
          var event = clone(raw || {});
          if (event.user_id !== context.userId) {
            conflicts.push({ code: 'OWNER_MISMATCH', event_id: event.id || null, expected_user_id: context.userId, incoming_user_id: event.user_id || null, detected_at: nowIso() });
            return;
          }
          event.sync_state = event.deleted_at ? 'tombstone' : 'synced';
          var validation = Events.validate(event);
          if (!validation.ok) {
            conflicts.push({ code: 'INVALID_REMOTE_EVENT', event_id: event.id || null, errors: validation.errors, detected_at: nowIso() });
            return;
          }
          var found = existing.concat(created).find(function (candidate) { return sameIdentity(candidate, event); });
          if (found) {
            if (!sameFact(found, event)) {
              conflicts.push({ code: 'REMOTE_IDEMPOTENCY_CONFLICT', event_id: event.id, source_ref: event.source_ref || null, existing_event_id: found.id, detected_at: nowIso() });
              return;
            }
            duplicates.push(found);
            if (found.id === event.id) {
              var acknowledgedEvent = Object.assign({}, found, { sync_state: found.deleted_at ? 'tombstone' : 'synced' });
              acknowledged.push(acknowledgedEvent); removeOutbox.push(found.id);
            }
            return;
          }
          created.push(event);
        });
        var conflictLog = priorConflicts.concat(conflicts).slice(-100);
        var batch = {
          events: created.concat(acknowledged),
          removeOutbox: removeOutbox,
          meta: conflicts.length ? [{ key: 'sync:conflicts', value: conflictLog, updated_at: nowIso() }] : [],
        };
        if (!batch.events.length && !batch.removeOutbox.length && !batch.meta.length) return { created: created, duplicates: duplicates, conflicts: conflicts, acknowledged: acknowledged };
        return adapter.writeBatch(batch).then(function () {
          if (created.length || acknowledged.length) notify({
            eventIds: created.concat(acknowledged).map(function (event) { return event.id; }),
            domains: created.concat(acknowledged).map(function (event) { return event.domain; }).filter(function (domain, index, all) { return all.indexOf(domain) === index; }),
            projectionIds: [], commandIds: [], remote: true,
          });
          return { created: created, duplicates: duplicates, conflicts: conflicts, acknowledged: acknowledged };
        });
      });
    }

    function restoreSnapshot(snapshot) {
      snapshot = snapshot || {};
      var events = Array.isArray(snapshot.canonical_events) ? clone(snapshot.canonical_events) : [];
      var outbox = Array.isArray(snapshot.pending_outbox) ? clone(snapshot.pending_outbox) : [];
      var errors = [];
      events.forEach(function (event, index) {
        if (event.user_id !== context.userId) errors.push('canonical_events[' + index + '] owner mismatch');
        var validation = Events.validate(event);
        if (!validation.ok) errors.push('canonical_events[' + index + '] ' + validation.errors.join(', '));
      });
      outbox.forEach(function (record, index) { if (record.user_id !== context.userId) errors.push('pending_outbox[' + index + '] owner mismatch'); });
      if (errors.length) { var invalid = new Error('Invalid canonical snapshot: ' + errors.join('; ')); invalid.code = 'INVALID_SNAPSHOT'; throw invalid; }
      return Promise.all([adapter.all('commands'), adapter.all('meta')]).then(function (preserved) {
        return adapter.replaceAll({ events: events, outbox: outbox, commands: preserved[0], meta: preserved[1] }).then(function () {
          notify({ eventIds: events.map(function (event) { return event.id; }), domains: events.map(function (event) { return event.domain; }).filter(function (domain, index, all) { return all.indexOf(domain) === index; }), projectionIds: [], commandIds: [], restore: true });
          return { restored_events: events.length, restored_outbox: outbox.length };
        });
      });
    }

    function claimLocalOwner(sourceUserId) {
      if (!/^local-owner:/.test(String(sourceUserId || ''))) return Promise.reject(new Error('Only a local placeholder owner can be claimed'));
      if (sourceUserId === context.userId) return Promise.resolve({ claimed: 0 });
      return Promise.all([adapter.all('events'), adapter.all('outbox'), adapter.all('commands')]).then(function (stores) {
        var foreign = stores[0].filter(function (event) { return event.user_id !== sourceUserId && event.user_id !== context.userId; });
        if (foreign.length) return Promise.reject(new Error('Owner claim blocked because another owner already has canonical events on this device'));
        var events = stores[0].filter(function (event) { return event.user_id === sourceUserId; }).map(function (event) { event.user_id = context.userId; event.sync_state = event.deleted_at ? 'tombstone' : 'pending'; return event; });
        var existingOutbox = {};
        stores[1].forEach(function (record) { existingOutbox[record.event_id] = record; });
        var outbox = events.map(function (event) {
          var record = existingOutbox[event.id] || outboxFor(event);
          record.user_id = context.userId; record.status = 'pending'; record.next_attempt_at = null;
          return record;
        });
        var commands = stores[2].map(function (command) { if (command.user_id === sourceUserId) command.user_id = context.userId; return command; });
        return adapter.writeBatch({ events: events, outbox: outbox, commands: commands }).then(function () {
          if (events.length) notify({ eventIds: events.map(function (event) { return event.id; }), domains: events.map(function (event) { return event.domain; }).filter(function (domain, index, all) { return all.indexOf(domain) === index; }), projectionIds: [], commandIds: [], ownerClaim: true });
          return { claimed: events.length, from_user_id: sourceUserId, to_user_id: context.userId };
        });
      });
    }

    function getCommand(id) { return adapter.get('commands', id); }
    function listCommands() {
      return adapter.all('commands').then(function (records) {
        return records.filter(function (record) { return record.user_id === context.userId; })
          .sort(function (a, b) { return a.created_at < b.created_at ? -1 : 1; });
      });
    }
    function getMeta(key) { return adapter.get('meta', key).then(function (record) { return record ? clone(record.value) : null; }); }
    function setMeta(key, value) { return adapter.writeBatch({ meta: [{ key: key, value: clone(value), updated_at: nowIso() }] }); }

    function commitCommand(commandRecord, eventInputs, updates, projectionIds) {
      var records = (updates || []).concat([commandRecord]);
      return commit(eventInputs, { commands: records, projectionIds: projectionIds || [] });
    }

    function subscribe(fn) {
      if (typeof fn !== 'function') throw new Error('subscriber must be a function');
      subscribers.push(fn);
      return function () { subscribers = subscribers.filter(function (candidate) { return candidate !== fn; }); };
    }

    return Object.freeze({
      context: clone(context),
      adapter: adapter,
      append: append,
      appendBatch: appendBatch,
      commitCommand: commitCommand,
      get: get,
      query: query,
      rawQuery: rawQuery,
      replace: replace,
      tombstone: tombstone,
      pendingOutbox: pendingOutbox,
      acknowledge: acknowledge,
      failOutbox: failOutbox,
      ingestRemote: ingestRemote,
      restoreSnapshot: restoreSnapshot,
      claimLocalOwner: claimLocalOwner,
      getCommand: getCommand,
      listCommands: listCommands,
      getMeta: getMeta,
      setMeta: setMeta,
      subscribe: subscribe,
    });
  }

  function install(options) {
    var repository = createRepository(options);
    if (root) {
      root.LifeOS = root.LifeOS || {};
      root.LifeOS.data = repository;
    }
    return repository;
  }

  return Object.freeze({
    MemoryAdapter: MemoryAdapter,
    IndexedDBAdapter: IndexedDBAdapter,
    create: createRepository,
    install: install,
  });
});
