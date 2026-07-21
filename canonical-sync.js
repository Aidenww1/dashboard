/* ============================================================
   Authenticated canonical event synchronization.

   Sync is opt-in, owner-scoped, immutable, and transport-agnostic. Local
   events remain in the outbox until the remote ledger acknowledges them.
   ============================================================ */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LifeOSCanonicalSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function retryAt(attempts, now) {
    var delay = Math.min(3600000, 1000 * Math.pow(2, Math.min(10, attempts || 0)));
    return new Date(now + delay).toISOString();
  }
  function sessionFrom(auth) {
    var session = auth && typeof auth.session === 'function' ? auth.session() : null;
    return session && session.access_token && session.user && session.user.id ? session : null;
  }
  function create(options) {
    options = options || {};
    var repository = options.repository;
    var transport = options.transport;
    var auth = options.auth;
    var clock = options.clock || function () { return Date.now(); };
    var online = options.online || function () { return !root || !root.navigator || root.navigator.onLine !== false; };
    if (!repository || typeof repository.ingestRemote !== 'function') throw new Error('repository with remote ingestion is required');
    if (!transport || typeof transport.pull !== 'function' || typeof transport.push !== 'function') throw new Error('sync transport is required');
    var running = null;

    function status() {
      var session = sessionFrom(auth);
      return Promise.all([repository.pendingOutbox(), repository.getMeta('sync:cursor'), repository.getMeta('sync:conflicts')]).then(function (values) {
        return {
          authenticated: !!session,
          owner_match: !!session && session.user.id === repository.context.userId,
          online: online(),
          pending: values[0].length,
          cursor: values[1] || null,
          conflicts: Array.isArray(values[2]) ? values[2].length : 0,
        };
      });
    }
    function run() {
      if (running) return running;
      running = Promise.resolve().then(function () {
        var session = sessionFrom(auth);
        if (!session) return { status: 'blocked-authentication-required', pulled: 0, pushed: 0, conflicts: [] };
        if (session.user.id !== repository.context.userId) return { status: 'blocked-owner-mismatch', pulled: 0, pushed: 0, conflicts: [] };
        if (!online()) return { status: 'offline', pulled: 0, pushed: 0, conflicts: [] };
        return repository.getMeta('sync:cursor').then(function (cursor) {
          return transport.pull({ cursor: cursor || null, session: session }).then(function (remote) {
            remote = remote || { events: [], cursor: cursor || null };
            return repository.ingestRemote(remote.events || []).then(function (ingested) {
              if (remote.cursor != null) return repository.setMeta('sync:cursor', remote.cursor).then(function () { return ingested; });
              return ingested;
            }).then(function (ingested) {
              return repository.pendingOutbox().then(function (pending) {
                var due = pending.filter(function (item) { return !item.next_attempt_at || new Date(item.next_attempt_at).getTime() <= clock(); });
                var pushed = 0, failures = [];
                return due.reduce(function (chain, item) {
                  return chain.then(function () {
                    return repository.get(item.event_id).then(function (event) {
                      if (!event) return;
                      return transport.push({ event: event, session: session }).then(function (result) {
                        pushed += 1;
                        return repository.acknowledge(event.id, result && (result.remote_ref || result.id));
                      }).catch(function (error) {
                        failures.push({ event_id: item.event_id, message: String(error && error.message || error) });
                        return repository.failOutbox(item.event_id, error, retryAt((item.attempts || 0) + 1, clock()));
                      });
                    });
                  });
                }, Promise.resolve()).then(function () {
                  return { status: failures.length ? 'partial' : ingested.conflicts.length ? 'conflict' : 'current', pulled: ingested.created.length, acknowledged_from_pull: ingested.acknowledged.length, pushed: pushed, conflicts: ingested.conflicts, failures: failures };
                });
              });
            });
          });
        });
      }).finally(function () { running = null; });
      return running;
    }
    return Object.freeze({ sync: run, status: status });
  }

  function createSupabaseTransport(options) {
    options = options || {};
    var baseUrl = String(options.url || '').replace(/\/$/, '');
    var key = options.key;
    var fetchFn = options.fetch || (root && root.fetch && root.fetch.bind(root));
    if (!baseUrl || !key || !fetchFn) throw new Error('Supabase URL, publishable key, and fetch are required');
    function headers(session, extra) { return Object.assign({ apikey: key, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' }, extra || {}); }
    function pull(request) {
      var query = '?select=*&order=received_at.asc&limit=500';
      if (request.cursor) query += '&received_at=gt.' + encodeURIComponent(request.cursor);
      return fetchFn(baseUrl + '/rest/v1/canonical_events' + query, { headers: headers(request.session) }).then(function (response) {
        if (!response.ok) throw new Error('Canonical pull failed with HTTP ' + response.status);
        return response.json();
      }).then(function (rows) {
        rows = Array.isArray(rows) ? rows : [];
        var cursor = rows.length ? rows[rows.length - 1].received_at || request.cursor : request.cursor;
        return { events: rows.map(function (row) { var event = clone(row); delete event.received_at; return event; }), cursor: cursor || null };
      });
    }
    function push(request) {
      return fetchFn(baseUrl + '/rest/v1/canonical_events', { method: 'POST', headers: headers(request.session, { Prefer: 'return=representation' }), body: JSON.stringify(request.event) }).then(function (response) {
        if (response.ok) return response.json().then(function (rows) { return { id: rows[0] && rows[0].id || request.event.id, remote_ref: request.event.id }; });
        if (response.status !== 409) throw new Error('Canonical push failed with HTTP ' + response.status);
        return fetchFn(baseUrl + '/rest/v1/canonical_events?select=*&id=eq.' + encodeURIComponent(request.event.id) + '&limit=1', { headers: headers(request.session) }).then(function (lookup) {
          if (!lookup.ok) throw new Error('Canonical conflict lookup failed with HTTP ' + lookup.status);
          return lookup.json();
        }).then(function (rows) {
          if (!rows[0]) { var conflict = new Error('Remote idempotency conflict'); conflict.code = 'REMOTE_IDEMPOTENCY_CONFLICT'; throw conflict; }
          return { id: request.event.id, remote_ref: request.event.id, duplicate: true };
        });
      });
    }
    return Object.freeze({ pull: pull, push: push });
  }

  return Object.freeze({ create: create, createSupabaseTransport: createSupabaseTransport, retryAt: retryAt });
});
