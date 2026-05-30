// events-bridge.js — mirrors incoming Supabase Realtime events to localStorage
// and dispatches window 'lifeos:event' so open module pages can re-render.
// Requires supabase-js CDN + realtime.js loaded before this script.
(function () {
  'use strict';

  function tryGet(k) {
    try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; }
  }
  function trySet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  }

  // Returns true if localStorage was actually updated (i.e. new data, not duplicate).
  var HANDLERS = {
    'sleep.night': function (d) {
      var logs = tryGet('sleep:manual:v1') || [];
      if (logs.some(function (e) { return e.date === d.date; })) return false;
      logs.push(d);
      trySet('sleep:manual:v1', logs);
      return true;
    },
    'mood.rating': function (d) {
      var logs = tryGet('mood:logs:v1') || [];
      if (logs.some(function (e) { return e.date === d.date; })) return false;
      logs.push(d);
      trySet('mood:logs:v1', logs);
      return true;
    },
    'nutrition.meal': function (d) {
      var logs = tryGet('nt:logs') || [];
      if (logs.some(function (e) { return e.dateKey === d.dateKey && e.name === d.name; })) return false;
      logs.push(d);
      trySet('nt:logs', logs);
      return true;
    },
    'body.weight': function (d) {
      var logs = tryGet('po_coach_weights') || [];
      if (logs.some(function (e) { return e.dateKey === d.date; })) return false;
      logs.push({ dateKey: d.date, weight: d.kg });
      trySet('po_coach_weights', logs);
      return true;
    },
    'body.measurement': function (d) {
      var logs = tryGet('body:logs') || [];
      if (logs.some(function (e) { return e.date === d.date; })) return false;
      logs.push(d);
      trySet('body:logs', logs);
      return true;
    },
    'body.bodyfat': function (d) {
      var logs = tryGet('health:body:v1') || [];
      if (logs.some(function (e) { return e.date === d.date; })) return false;
      logs.push({ date: d.date, bf: d.bf_pct, waist: d.waist_cm, hips: null, neck: null });
      trySet('health:body:v1', logs);
      return true;
    },
    'supplements.taken': function (d) {
      var taken = tryGet('supps:taken') || [];
      if (taken.some(function (t) { return t.name === d.name && t.date === d.date; })) return false;
      taken.push({ suppId: d.name, name: d.name, dose: d.dose || '', date: d.date, ts: Date.now() });
      trySet('supps:taken', taken);
      return true;
    },
    'bloodwork.panel': function (d) {
      if (!d.markers) return false;
      var logs = tryGet('blood:logs') || [];
      if (logs.some(function (e) { return e.date === d.date; })) return false;
      logs.push({ id: Date.now(), date: d.date, markers: d.markers });
      logs.sort(function (a, b) { return a.date > b.date ? 1 : -1; });
      trySet('blood:logs', logs);
      return true;
    },
    'finance.expense': function (d) {
      var orders = tryGet('incoming_orders') || [];
      if (orders.some(function (o) { return o.name === d.name && o.date === d.date; })) return false;
      orders.push({
        id: 'rt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
        name: d.name, amount: d.amount_chf || d.amount,
        entered_amount: d.amount, entered_currency: d.currency || 'EUR',
        category: d.category || '', fromCat: 'bank', fromAccount: null,
        date: d.date || null, ts: Date.now(),
        deductedAt: null, pctAtDeduction: null, deductedFrom: null,
      });
      trySet('incoming_orders', orders);
      return true;
    },
  };

  function handleInsert(payload) {
    var ev = payload.new;
    if (!ev || !ev.type) return;
    var handler = HANDLERS[ev.type];
    var updated = handler ? handler(ev.data || {}) : false;
    try {
      window.dispatchEvent(new CustomEvent('lifeos:event', {
        detail: { type: ev.type, data: ev.data || {}, domains: ev.domains || [], updated: updated },
      }));
    } catch (_) {}
  }

  function trySubscribe() {
    if (typeof window.subscribeToEvents === 'function') {
      window.subscribeToEvents(handleInsert, { event: 'INSERT', name: 'bridge-all' });
    } else {
      // realtime.js not ready yet — retry
      setTimeout(trySubscribe, 300);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trySubscribe);
  } else {
    trySubscribe();
  }
})();
