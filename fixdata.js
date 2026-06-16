// Pure scan/apply for the "Fix my data" page. No DOM, no storage — callers
// inject load(key)->parsed and save(key,val). Lives in its own file so the
// destructive apply path has a node self-check (fixdata.test.mjs).
(function (root) {
  'use strict';

  var MEAS_FIELDS = ['waist', 'chest', 'shoulders', 'arms', 'quads', 'hips', 'calves', 'neck'];
  function num(v) { return typeof v === 'number' && isFinite(v); }
  // ponytail: loose bounds — only clearly-impossible values, so a real heavy
  // leg press never trips. Tighten if real typos slip through.
  function badBw(v)     { return num(v) && (v < 10 || v > 500); }
  function badMeas(v)   { return num(v) && (v < 2  || v > 300); }
  function badWeight(v) { return num(v) && (v < 0  || v > 2000); }
  function badReps(v)   { return num(v) && (v < 0  || v > 200); }

  function scan(load) {
    var out = [];

    var bw = load('po_coach_weights'); // [{dateKey, weight}]
    if (Array.isArray(bw)) bw.forEach(function (e, i) {
      if (e && badBw(e.weight)) out.push({ key: 'po_coach_weights', kind: 'bw', idx: i,
        label: 'Bodyweight', when: e.dateKey, value: e.weight });
    });

    var meas = load('body:logs'); // [{date, waist, chest, ...}] cm
    if (Array.isArray(meas)) meas.forEach(function (e, i) {
      if (!e) return;
      MEAS_FIELDS.forEach(function (f) {
        if (badMeas(e[f])) out.push({ key: 'body:logs', kind: 'meas', idx: i, field: f,
          label: 'Measurement · ' + f, when: e.date, value: e[f] });
      });
    });

    var st = load('po_coach_v1'); // {logs: {exId: [{weight, reps, ...}]}, exercises:[{id,name}]}
    if (st && st.logs && typeof st.logs === 'object') {
      var names = {};
      (Array.isArray(st.exercises) ? st.exercises : []).forEach(function (x) { if (x && x.id) names[x.id] = x.name || x.id; });
      Object.keys(st.logs).forEach(function (exId) {
        var arr = st.logs[exId];
        if (!Array.isArray(arr)) return;
        arr.forEach(function (l, i) {
          if (!l) return;
          var nm = names[exId] || exId;
          if (badWeight(l.weight)) out.push({ key: 'po_coach_v1', kind: 'lift', exId: exId, idx: i, field: 'weight',
            label: 'Lift · ' + nm + ' · weight', when: l.date, value: l.weight });
          if (badReps(l.reps)) out.push({ key: 'po_coach_v1', kind: 'lift', exId: exId, idx: i, field: 'reps',
            label: 'Lift · ' + nm + ' · reps', when: l.date, value: l.reps });
        });
      });
    }
    return out;
  }

  // newVal === undefined → delete (splice entry, or null the field for measurements).
  function apply(load, save, iss, newVal) {
    var r = load(iss.key);
    if (iss.kind === 'bw') {
      if (!Array.isArray(r) || !r[iss.idx]) return;
      if (newVal === undefined) r.splice(iss.idx, 1); else r[iss.idx].weight = newVal;
    } else if (iss.kind === 'meas') {
      if (!Array.isArray(r) || !r[iss.idx]) return;
      r[iss.idx][iss.field] = (newVal === undefined) ? null : newVal;
    } else if (iss.kind === 'lift') {
      if (!r || !r.logs || !Array.isArray(r.logs[iss.exId])) return;
      var a = r.logs[iss.exId];
      if (newVal === undefined) a.splice(iss.idx, 1); else if (a[iss.idx]) a[iss.idx][iss.field] = newVal;
    } else return;
    save(iss.key, r);
  }

  root.FixData = { scan: scan, apply: apply };
})(typeof window !== 'undefined' ? window : globalThis);
