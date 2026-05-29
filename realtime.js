// Supabase Realtime subscription helper for the events table.
// Include AFTER supabase-js CDN script. Exposes window.subscribeToEvents / unsubscribeEvents / getSupabase.
(function () {
  'use strict';

  const SUPABASE_URL = 'https://nwdyuiimfqhlqscnbqmq.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_KFOU1sDCxRp8c1M3kSytHg_nuQWzfPT';

  let _client = null;
  const _channels = {};

  function client() {
    if (!_client) {
      if (!window.supabase) throw new Error('supabase-js not loaded before realtime.js');
      _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        realtime: { params: { eventsPerSecond: 10 } },
      });
    }
    return _client;
  }

  // Subscribe to the events table.
  // callback(payload) is called on INSERT/UPDATE/DELETE.
  // opts.event: '*'|'INSERT'|'UPDATE'|'DELETE' — default '*'
  // opts.filter: Supabase filter string, e.g. 'type=eq.workout.set'
  // opts.name: channel name for targeted unsubscription — default 'events-default'
  function subscribeToEvents(callback, opts) {
    opts = opts || {};
    const name = opts.name || 'events-default';
    if (_channels[name]) { _channels[name].unsubscribe(); delete _channels[name]; }

    const cfg = { event: opts.event || '*', schema: 'public', table: 'events' };
    if (opts.filter) cfg.filter = opts.filter;

    const ch = client()
      .channel(name)
      .on('postgres_changes', cfg, callback)
      .subscribe();

    _channels[name] = ch;
    return ch;
  }

  function unsubscribeEvents(name) {
    name = name || 'events-default';
    if (_channels[name]) { _channels[name].unsubscribe(); delete _channels[name]; }
  }

  // Shared Supabase client — use for direct queries where needed.
  function getSupabase() { return client(); }

  window.subscribeToEvents = subscribeToEvents;
  window.unsubscribeEvents = unsubscribeEvents;
  window.getSupabase = getSupabase;
})();
