// Regression tests for the deterministic life-score / readiness engine in
// lifeos-core.js. lifeos-core is a browser IIFE that reads localStorage and
// attaches to window; we give it the minimum browser shims so it runs under
// node with no DOM and no dependencies, then pin its output on a known state.
process.env.TZ = 'Europe/Amsterdam';

// --- minimal browser shims (must exist before requiring lifeos-core) ---
const store = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; },
  clear: function () { for (const k in store) delete store[k]; },
};
global.CustomEvent = function (type, init) { this.type = type; this.detail = init && init.detail; };
global.navigator = { onLine: false };       // keeps cloud/activity/wearable pulls from firing fetch
global.fetch = function () { return new Promise(function () {}); }; // never resolves; never called offline
global.window = global;
global.window.addEventListener = function () {};
global.window.dispatchEvent = function () { return true; };

require('../dates.js');                       // so lifeos-core.daysAgo can delegate
require('../lifeos-core.js');                 // attaches window.LifeOS

const LifeOS = global.window.LifeOS;
let pass = 0, fail = 0;
function eq(actual, expected, msg) {
  if (actual === expected) { pass++; return; }
  fail++;
  console.error('FAIL: ' + msg + '\n  expected ' + JSON.stringify(expected) + '\n  got      ' + JSON.stringify(actual));
}
function ok(cond, msg) { eq(!!cond, true, msg); }

// --- empty-state baseline: every metric falls through to its "No data" branch,
// so the score is fully deterministic and time-independent. These numbers pin
// the current scoring weights; changing a weight must update this test on purpose.
const s = LifeOS.score();
eq(s.total, 47, 'life score baseline (empty state) === 47');
eq(s.parts.length, 8, 'life score has 8 parts');
ok(s.parts.every(function (p) { return p.pts >= 0 && p.pts <= p.max; }), 'every part within [0,max]');
ok(typeof s.action === 'string', 'score has an action string');

const r = LifeOS.readiness();
eq(r.score, 53, 'readiness baseline (empty state) === 53');
eq(r.label, 'Low', 'readiness baseline label === Low');
eq(r.parts.length, 5, 'readiness has 5 parts');
ok(r.parts.every(function (p) { return p.pts >= 0 && p.pts <= p.max; }), 'every readiness part within [0,max]');

// --- a seeded state shifts the score deterministically (sanity that inputs matter).
// 8h sleep last night should lift both sleep components to full.
store['sleep:logs'] = JSON.stringify([{ date: LifeOS.todayStr(), duration: 480, score: 85 }]);
const s2 = LifeOS.score();
const r2 = LifeOS.readiness();
ok(s2.total > s.total, 'logging a good night raises life score');
ok(r2.score > r.score, 'logging a good night raises readiness');
const sleepPart = r2.parts.find(function (p) { return p.key === 'sleep'; });
eq(sleepPart.pts, 40, 'readiness sleep part full (40) for 8h + score 85');

console.log('lifeos.test.js: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
