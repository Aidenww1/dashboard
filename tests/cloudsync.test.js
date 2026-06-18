// Regression tests for the per-key timestamp merge in cloudsync.js — the
// data-reconciliation path that decides which device's value wins on sync.
// cloudsync.js is a browser IIFE; it exposes the pure merge via window.__cloudMerge
// and only touches the network/DOM inside start() (never called here). We give it
// the minimum shims to load, then assert the merge resolves each case correctly.
// A regression here = silent multi-device data loss, so these are pinned on purpose.

// --- minimal browser shims (must exist before requiring cloudsync) ---
const store = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; },
  length: 0, key: function () { return null; },
};
global.navigator = { onLine: false };
global.fetch = function () { return new Promise(function () {}); };
global.document = { addEventListener: function () {}, hidden: false, activeElement: null };
global.window = global;
global.window.addEventListener = function () {};

require('../cloudsync.js'); // attaches window.__cloudMerge

const merge = global.window.__cloudMerge;
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; return; } fail++; console.error('FAIL: ' + msg); }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ' (got ' + JSON.stringify(a) + ')'); }

ok(typeof merge === 'function', 'window.__cloudMerge is exposed');

// 1. Both present, remote newer -> pull remote, mark for local apply.
let r = merge(['k'], { k: { v: 1 } }, { k: 100 }, { vals: { k: { v: 2 } }, ts: { k: 200 } });
eq(r.vals.k, { v: 2 }, 'remote-newer: remote value wins');
eq(r.ts.k, 200, 'remote-newer: remote ts wins');
ok(r.pulled.k === JSON.stringify({ v: 2 }), 'remote-newer: queued for local apply');
ok(r.pushNeeded === false, 'remote-newer: no push needed');

// 2. Both present, local newer + different value -> keep local, push.
r = merge(['k'], { k: { v: 9 } }, { k: 300 }, { vals: { k: { v: 2 } }, ts: { k: 200 } });
eq(r.vals.k, { v: 9 }, 'local-newer: local value kept');
eq(r.ts.k, 300, 'local-newer: local ts kept');
ok(!r.pulled.k, 'local-newer: nothing pulled');
ok(r.pushNeeded === true, 'local-newer: push needed');

// 3. Both present, equal value + equal truthy ts -> stable, no push, no pull.
r = merge(['k'], { k: { v: 5 } }, { k: 500 }, { vals: { k: { v: 5 } }, ts: { k: 500 } });
ok(!r.pulled.k, 'equal+stable: nothing pulled');
ok(r.pushNeeded === false, 'equal+stable: no push (no sync storm trigger)');

// 4. Equal value but remote ts is missing/0 -> push to stamp a ts (legacy upgrade).
r = merge(['k'], { k: { v: 5 } }, { k: 500 }, { vals: { k: { v: 5 } }, ts: {} });
ok(r.pushNeeded === true, 'equal-but-remote-ts-missing: push to stamp ts');

// 5. Only remote has the key -> pull it.
r = merge(['k'], {}, {}, { vals: { k: { v: 7 } }, ts: { k: 50 } });
eq(r.vals.k, { v: 7 }, 'remote-only: pulled into merged');
ok(r.pulled.k === JSON.stringify({ v: 7 }), 'remote-only: queued for local apply');

// 6. Only local has the key -> keep + push.
r = merge(['k'], { k: { v: 3 } }, { k: 10 }, { vals: {}, ts: {} });
eq(r.vals.k, { v: 3 }, 'local-only: kept');
ok(r.pushNeeded === true, 'local-only: push needed');
ok(!r.pulled.k, 'local-only: nothing pulled');

// 7. Multiple keys mix in one pass (independent resolution).
r = merge(['a', 'b'],
  { a: 1, b: 2 }, { a: 100, b: 100 },
  { vals: { a: 9, b: 2 }, ts: { a: 200, b: 50 } });
eq(r.vals.a, 9, 'multi: key a pulls (remote newer)');
eq(r.vals.b, 2, 'multi: key b keeps local (local newer)');
ok(r.pushNeeded === true, 'multi: push needed for b');

console.log('cloudsync.test.js: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
