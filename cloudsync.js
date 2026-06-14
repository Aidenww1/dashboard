/* ============================================================
   LifeOSSync — per-key, timestamp-merged cloud sync.

   The old per-page sync bundled a page's keys into one app_state
   row and OVERWROTE the whole row on every change, and OVERWROTE
   local on every load. With PC + laptop + phone all writing, that
   is last-write-wins at the bundle level -> silent data loss
   (device A's edit to key X clobbers device B's newer edit to key Y).

   This replaces it with last-write-wins PER KEY by timestamp:
   - Each device stamps `sync:meta:<app>` with Date.now() whenever it
     writes a synced key.
   - The remote row stores { __v:2, vals:{k:v}, ts:{k:ms} }.
   - On every sync: GET remote, merge per key (newer ts wins, keys
     present on only one side are kept, never deleted), write the
     remote-newer keys into localStorage, then PUT the merged result.
   Legacy rows (no __v) are read as ts-unknown and upgraded on first push.

   Not a full CRDT: two truly-concurrent PUTs can still lose an
   update for one round, but each device re-pushes its own keys so it
   self-heals. Single-user / few-devices -> good enough, and a massive
   improvement over whole-bundle clobber.

   API: LifeOSSync.register(appKey, keys, { onApply?, reload? })
   Pure (test) hooks: window.__cloudMerge, window.__cloudNormalize
   ============================================================ */
(function () {
  'use strict';
  if (window.LifeOSSync) return;

  var SUPA_URL = 'https://nwdyuiimfqhlqscnbqmq.supabase.co';
  var SUPA_KEY = 'sb_publishable_KFOU1sDCxRp8c1M3kSytHg_nuQWzfPT';

  function jparse(v) { try { return JSON.parse(v); } catch (e) { return undefined; } }

  // remote row.data -> { vals, ts, legacy }
  function normalize(data) {
    if (data && data.__v === 2 && data.vals) return { vals: data.vals || {}, ts: data.ts || {}, legacy: false };
    return { vals: data || {}, ts: {}, legacy: true }; // old shape: {key:value}, no timestamps
  }

  // Pure per-key merge. Returns merged vals+ts, the keys to pull into
  // local (as JSON strings), and whether a push is needed.
  function merge(keys, localVals, localMeta, remote) {
    var rv = remote.vals || {}, rt = remote.ts || {};
    var outVals = {}, outTs = {}, pulled = {}, pushNeeded = false;
    keys.forEach(function (k) {
      var hasL = Object.prototype.hasOwnProperty.call(localVals, k);
      var hasR = Object.prototype.hasOwnProperty.call(rv, k);
      var lts = localMeta[k] || 0, rts = rt[k] || 0;
      if (hasL && hasR) {
        if (rts > lts) { outVals[k] = rv[k]; outTs[k] = rts; pulled[k] = JSON.stringify(rv[k]); }
        else {
          outVals[k] = localVals[k]; outTs[k] = lts;
          if (JSON.stringify(localVals[k]) !== JSON.stringify(rv[k]) || rts < lts || !rts) pushNeeded = true;
        }
      } else if (hasR) {
        outVals[k] = rv[k]; outTs[k] = rts; pulled[k] = JSON.stringify(rv[k]);
      } else if (hasL) {
        outVals[k] = localVals[k]; outTs[k] = lts; pushNeeded = true;
      }
    });
    return { vals: outVals, ts: outTs, pulled: pulled, pushNeeded: pushNeeded };
  }

  window.__cloudMerge = merge;        // test hook
  window.__cloudNormalize = normalize; // test hook

  function register(appKey, keys, opts) {
    opts = opts || {};
    var META = 'sync:meta:' + appKey;
    var _set = localStorage.setItem.bind(localStorage);
    var pushTimer = null, syncing = false;

    function localMeta() { return jparse(localStorage.getItem(META)) || {}; }
    function setLocalMeta(m) { try { _set(META, JSON.stringify(m)); } catch (e) {} }
    function localVals() {
      var o = {};
      keys.forEach(function (k) { var v = localStorage.getItem(k); if (v != null) { var p = jparse(v); if (p !== undefined) o[k] = p; } });
      return o;
    }

    // Stamp + schedule on any local write to a synced key.
    localStorage.setItem = function (k, v) {
      _set(k, v);
      if (keys.indexOf(k) !== -1) { var m = localMeta(); m[k] = Date.now(); setLocalMeta(m); schedule(); }
    };

    function schedule() { clearTimeout(pushTimer); pushTimer = setTimeout(syncOnce, 500); }

    function applyPulled(pulled) {
      var changed = false;
      Object.keys(pulled).forEach(function (k) {
        if (localStorage.getItem(k) !== pulled[k]) { try { _set(k, pulled[k]); changed = true; } catch (e) {} }
      });
      return changed;
    }

    function put(vals, ts) {
      try {
        fetch(SUPA_URL + '/rest/v1/app_state?on_conflict=key', {
          method: 'POST',
          headers: {
            apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY,
            'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify({ key: appKey, data: { __v: 2, vals: vals, ts: ts }, updated_at: new Date().toISOString() }),
          keepalive: true,
        }).catch(function () {});
      } catch (e) {}
    }

    function syncOnce() {
      if (syncing || !navigator.onLine) return;
      syncing = true;
      fetch(SUPA_URL + '/rest/v1/app_state?select=data&key=eq.' + encodeURIComponent(appKey) + '&limit=1',
        { headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY } })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (rows) {
          var hadRow = !!(rows[0] && rows[0].data);
          var remote = normalize(rows[0] && rows[0].data);
          var res = merge(keys, localVals(), localMeta(), remote);

          var changed = applyPulled(res.pulled);
          var m = localMeta();
          Object.keys(res.ts).forEach(function (k) { if ((res.ts[k] || 0) > (m[k] || 0)) m[k] = res.ts[k]; });
          setLocalMeta(m);

          if (changed) {
            if (opts.reload && !sessionStorage.getItem('_sync_r_' + appKey)) {
              sessionStorage.setItem('_sync_r_' + appKey, '1');
              window.location.reload();
              return;
            }
            if (opts.onApply) { try { opts.onApply(); } catch (e) {} }
          } else {
            sessionStorage.removeItem('_sync_r_' + appKey);
          }

          // Push if we hold newer keys, the remote was legacy/missing, or empty.
          var needPush = res.pushNeeded || remote.legacy || !hadRow;
          if (needPush && Object.keys(res.vals).length) put(res.vals, res.ts);
        })
        .then(function () { syncing = false; }, function () { syncing = false; });
    }

    // Best-effort flush on hide: push local state directly (keepalive). The
    // other device merges by timestamp on its next sync.
    function flush() { clearTimeout(pushTimer); var lv = localVals(); if (Object.keys(lv).length) put(lv, localMeta()); }
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });

    syncOnce(); // initial pull + merge + push
  }

  window.LifeOSSync = { register: register };
})();
