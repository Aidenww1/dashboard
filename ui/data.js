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
    try { window.LifeOSCompatibilityStore.set('lifeos:hist:' + key, hist); } catch (e) {}
    return hist.map(function (p) { return p.v; });
  }
  function seriesOf(key) { return ls('lifeos:hist:' + key, []).map(function (p) { return p.v; }); }

  function numberOrNull(value) {
    var n = Number(value);
    return value == null || value === '' || !isFinite(n) ? null : n;
  }

  function nutritionToday() {
    var nutrition = ctx('nutrition');
    var today = nutrition.last7d && nutrition.last7d[0] || {};
    var direct = ls('nt:targets', null);
    var tdee = ls('nt:tdee', null);
    var settings = ls('settings:v1', {}) || {};
    var calories = numberOrNull(direct && direct.calories);
    var protein = numberOrNull(direct && direct.protein);
    if (calories == null) calories = numberOrNull(tdee && tdee.calories);
    if (protein == null) protein = numberOrNull(tdee && tdee.protein);
    if (calories == null) calories = numberOrNull(settings.goalCalories);
    if (protein == null) protein = numberOrNull(settings.goalProtein);
    return {
      entries: numberOrNull(today.entries) || 0,
      calories: numberOrNull(today.kcal) || 0,
      protein: numberOrNull(today.protein) || 0,
      calorie_target: calories,
      protein_target: protein,
      configured: calories != null && protein != null,
    };
  }

  function bodyComposition() {
    var weights = (ls('po_coach_weights', []) || []).filter(function (e) {
      return e && e.dateKey && numberOrNull(e.weight) > 0;
    }).sort(function (a, b) { return String(a.dateKey).localeCompare(String(b.dateKey)); });
    var bodyFat = (ls('health:body:v1', []) || []).filter(function (e) {
      return e && e.date && numberOrNull(e.bf) > 0;
    }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });

    function valueAtOrBefore(date) {
      var found = null;
      weights.forEach(function (entry) {
        if (String(entry.dateKey) <= String(date)) found = numberOrNull(entry.weight);
      });
      return found;
    }
    function lean(weight, bf) {
      return weight == null || bf == null ? null : +(weight * (1 - bf / 100)).toFixed(2);
    }
    function delta(values) {
      if (values.length < 2) return null;
      return +(values[values.length - 1] - values[values.length - 2]).toFixed(2);
    }

    var weightValues = weights.map(function (e) { return numberOrNull(e.weight); });
    var bfValues = bodyFat.map(function (e) { return numberOrNull(e.bf); });
    var leanValues = bodyFat.map(function (e) {
      return lean(valueAtOrBefore(e.date), numberOrNull(e.bf));
    }).filter(function (v) { return v != null; });
    var currentWeight = weightValues.length ? weightValues[weightValues.length - 1] : null;
    var currentBf = bfValues.length ? bfValues[bfValues.length - 1] : null;
    return {
      weight_kg: currentWeight,
      body_fat_pct: currentBf,
      lean_mass_kg: lean(currentWeight, currentBf),
      weight_delta_kg: delta(weightValues),
      body_fat_delta_pct: delta(bfValues),
      lean_mass_delta_kg: delta(leanValues),
      weight_series: weightValues.slice(-12),
      body_fat_series: bfValues.slice(-12),
      lean_mass_series: leanValues.slice(-12),
      last_updated: bodyFat.length ? bodyFat[bodyFat.length - 1].date : (weights.length ? weights[weights.length - 1].dateKey : null),
    };
  }

  function settings() {
    var s = ls('settings:v1', {}) || {};
    return {
      sleep_goal_hours: numberOrNull(s.goalSleep),
      calorie_target: numberOrNull(s.goalCalories),
      protein_target: numberOrNull(s.goalProtein),
    };
  }
  // weight series from the SAME canonical store the engine's latestWeight()/
  // weightTrend7d() use (po_coach_weights, {dateKey, weight}), so the Body-trend
  // metric and its sparkline never disagree.
  function weightSeries() {
    return (ls('po_coach_weights', []) || [])
      .filter(function (e) { return e && e.dateKey && e.weight > 0; })
      .sort(function (a, b) { return String(a.dateKey).localeCompare(String(b.dateKey)); })
      .map(function (e) { return +e.weight; }).slice(-12);
  }

  function bloodworkAttention(latest) {
    if (!latest) return [];
    var ranges = {
      hematocrit:[36,52,'Hematocrit'], hemoglobin:[11.5,17.5,'Hemoglobin'], testosterone:[250,1100,'Testosterone'], estradiol:[10,200,'Estradiol'],
      lh:[1.5,9.3,'LH'], fsh:[1.5,12.4,'FSH'], totalCholesterol:[0,200,'Total Cholesterol'], ldl:[0,100,'LDL'], hdl:[40,999,'HDL'],
      triglycerides:[0,150,'Triglycerides'], vitaminD:[30,100,'Vitamin D'], ferritin:[12,300,'Ferritin'], tsh:[0.5,4.5,'TSH'],
      freeT3:[2.3,4.2,'Free T3'], freeT4:[0.9,1.7,'Free T4'],
    };
    var normalized = Array.isArray(latest.normalized) ? latest.normalized : Object.keys(latest.markers || {}).map(function (key) {
      var range = ranges[key] || [];
      var value = numberOrNull(latest.markers[key]);
      var status = value == null ? 'unknown' : range[0] != null && value < range[0] ? 'low' : range[1] != null && value > range[1] ? 'high' : 'ok';
      return { key:key, name:range[2] || key, value:value, status:status };
    });
    return normalized.filter(function (marker) {
      return marker && (marker.out_of_range || marker.status === 'low' || marker.status === 'high' || marker.status === 'watch');
    }).map(function (marker) {
      return { name:marker.name || marker.key || 'Marker', status:marker.status === 'low' ? 'low' : marker.status === 'high' ? 'high' : 'needs review' };
    });
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
    nutritionToday: guard(nutritionToday),
    weightSeries: guard(weightSeries),
    bodyComposition: guard(bodyComposition),
    recovery: guard(function () { return ctx('recovery'); }),
    productivity: guard(function () { return ctx('productivity'); }),
    money: guard(function () { return ctx('finance'); }),
    health: guard(function () { return ctx('health'); }),
    wearable: guard(function () { return ctx('wearable'); }),
    mail: guard(function () { return ctx('mail'); }),
    settings: guard(settings),
    quality: guard(function () { return (L.quality && L.quality()) || {}; }),

    // attention queue ranked from REAL signals only (no filler).
    attention: guard(function () {
      var out = [];
      var q = (L.quality && L.quality()) || {};
      var h = ctx('health');
      var labAttention = bloodworkAttention(h.bloodwork_latest);
      if (labAttention.length) {
        var labDetail = labAttention.slice(0, 2).map(function (marker) { return marker.name + ' ' + marker.status; }).join(' · ');
        if (labAttention.length > 2) labDetail += ' · +' + (labAttention.length - 2) + ' more';
        out.push({ rank: 1, title: 'Bloodwork', sub: labDetail, detail: labDetail, status: 'Review', href: 'log.html#body' });
      } else if (h.bloodwork_age_days != null && h.bloodwork_age_days > 90) {
        out.push({ rank: 1, title: 'Bloodwork', sub: h.bloodwork_age_days + ' days since last test', detail: h.bloodwork_age_days + ' days since last test', status: 'Due', href: 'log.html#body' });
      }
      // deload signal
      try { var d = L.deloadSignal && L.deloadSignal(); if (d && d.due) out.push({ rank: 2, title: 'Deload week', sub: d.reason || 'Training is running hot', href: 'log.html#training' }); } catch (e) {}
      // missing/stale data (top 3)
      (q.stale || []).slice(0, 3).forEach(function (c) {
        var key = String(c.key || c.label || '').toLowerCase();
        var href = /finance/.test(key) ? 'money.html' : /skin/.test(key) ? 'log.html#skin' : /blood|measure|weight|sleep|photo/.test(key) ? 'log.html#body' : 'log.html';
        out.push({ rank: 3, title: c.label, sub: c.daysAgo != null ? c.daysAgo + 'd old' : 'No data yet', href: href });
      });
      return out.sort(function (a, b) { return a.rank - b.rank; });
    }),
  };
})();
