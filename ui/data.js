/* ============================================================
   Life OS — UI data adapter (rewrite Phase 2).
   Thin facade over the EXISTING, tested engine (lifeos-core.js:
   LifeOS.context/score/readiness/quality). No calculation is
   duplicated here — this only shapes data for the UI and guards
   every call so one failing source can't blank the dashboard.
   Load order: dates.js -> lifeos-core.js -> bus.js -> data.js.
   ============================================================ */
(function () {
  'use strict';
  var L = window.LifeOS = window.LifeOS || {};

  function guard(fn) { return function () { try { return fn.apply(null, arguments); } catch (e) { return { error: (e && e.message) || 'error' }; } }; }
  function ctx(s) { try { return (L.context && L.context(s)) || {}; } catch (e) { return {}; } }
  function ls(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }

  // ---- daily history snapshot so trends become real over time ----
  // Capped ring per metric, one point/day. Reads existing values; the only
  // write Today performs. Safe + idempotent (overwrites today's point).
  function snapshot(key, value) {
    if (value == null || typeof value !== 'number' || isNaN(value)) return seriesOf(key);
    var today = (L.todayStr && L.todayStr()) || new Date().toISOString().slice(0, 10);
    var hist = ls('lifeos:hist:' + key, []);
    var last = hist[hist.length - 1];
    if (last && last.d === today) last.v = value;
    else hist.push({ d: today, v: value });
    if (hist.length > 30) hist = hist.slice(-30);
    try { localStorage.setItem('lifeos:hist:' + key, JSON.stringify(hist)); } catch (e) {}
    return hist.map(function (p) { return p.v; });
  }
  function seriesOf(key) { return ls('lifeos:hist:' + key, []).map(function (p) { return p.v; }); }

  // weight series from the SAME canonical store the engine's latestWeight()/
  // weightTrend7d() use (po_coach_weights, {dateKey, weight}), so the Body-trend
  // metric and its sparkline never disagree.
  function weightSeries() {
    return (ls('po_coach_weights', []) || [])
      .filter(function (e) { return e && e.dateKey && e.weight > 0; })
      .sort(function (a, b) { return String(a.dateKey).localeCompare(String(b.dateKey)); })
      .map(function (e) { return +e.weight; }).slice(-12);
  }

  L.data = {
    today: guard(function () {
      var t = ctx('today');
      // record daily history for real sparklines
      t._scoreSeries = snapshot('score', t.life_score);
      t._readySeries = snapshot('readiness', t.readiness && t.readiness.score);
      return t;
    }),
    nutritionTrend: guard(function () { return (ctx('nutrition').last7d) || []; }),
    weightSeries: guard(weightSeries),
    recovery: guard(function () { return ctx('recovery'); }),
    money: guard(function () { return ctx('finance'); }),
    health: guard(function () { return ctx('health'); }),
    mail: guard(function () { return ctx('mail'); }),
    quality: guard(function () { return (L.quality && L.quality()) || {}; }),

    // attention queue ranked from REAL signals only (no filler).
    attention: guard(function () {
      var out = [];
      var q = (L.quality && L.quality()) || {};
      var h = ctx('health');
      // bloodwork overdue
      if (h.bloodwork_age_days != null && h.bloodwork_age_days > 90) out.push({ rank: 1, title: 'Bloodwork', sub: h.bloodwork_age_days + ' days since last test' });
      // deload signal
      try { var d = L.deloadSignal && L.deloadSignal(); if (d && d.due) out.push({ rank: 2, title: 'Deload week', sub: d.reason || 'Training is running hot' }); } catch (e) {}
      // missing/stale data (top 3)
      (q.stale || []).slice(0, 3).forEach(function (c) {
        out.push({ rank: 3, title: c.label, sub: c.daysAgo != null ? c.daysAgo + 'd old' : 'No data yet' });
      });
      return out.sort(function (a, b) { return a.rank - b.rank; });
    }),
  };
})();
