// dates.js -- single source of truth for local-day keys.
//
// Day keys must use LOCAL wall-clock components, never UTC. `toISOString()`
// is UTC, so it rolls the date over at the wrong hour for any non-UTC user:
// a log made at 01:00 in CET (UTC+1) lands on the previous day, and streaks
// break across DST and travel. Every "what day is this" computation in the
// app goes through here.
//
// Dual export: `window.Dates` in the browser, `module.exports` under node
// (so the regression tests can run with no DOM and no dependencies).
(function (factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.Dates = api;
})(function () {
  'use strict';

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  // Local YYYY-MM-DD for a Date (default: now).
  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // Nutrition "app day": the day rolls over at 6am local, not midnight,
  // so a 2am snack counts toward the day that just ended.
  function ntDayKey(d) {
    d = d ? new Date(d.getTime()) : new Date();
    if (d.getHours() < 6) d.setDate(d.getDate() - 1);
    return dayKey(d);
  }

  // Whole days from key `a` to key `b` (b - a). Anchored at local noon so a
  // DST transition (a 23h or 25h day) can never round to the wrong count.
  function daysBetween(a, b) {
    var da = new Date(String(a).slice(0, 10).replace(/\//g, '-') + 'T12:00:00');
    var db = new Date(String(b).slice(0, 10).replace(/\//g, '-') + 'T12:00:00');
    if (isNaN(da) || isNaN(db)) return null;
    return Math.round((db - da) / 86400000);
  }

  // Shift a YYYY-MM-DD key by n days (DST-safe via daysBetween's anchor).
  function addDays(key, n) {
    var d = new Date(String(key).slice(0, 10).replace(/\//g, '-') + 'T12:00:00');
    if (isNaN(d)) return null;
    d.setDate(d.getDate() + n);
    return dayKey(d);
  }

  // Whole days since a key (today - key). 0 = today, 1 = yesterday.
  // Uses daysBetween so it is correct at every hour, unlike a raw
  // (Date.now() - anchor) / 86400000 which goes negative before noon.
  function daysAgo(key) {
    if (!key) return null;
    return daysBetween(key, dayKey());
  }

  return {
    dayKey: dayKey,
    ntDayKey: ntDayKey,
    daysBetween: daysBetween,
    addDays: addDays,
    daysAgo: daysAgo,
  };
});
