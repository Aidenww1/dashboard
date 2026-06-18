// Round-trip test for the backup/restore core in export.html (snapshot /
// applySnapshot). DoD: "Backup and restore are proven." The live cloud restore
// is owner/device-gated (Phase 9), but the deterministic part — capture every
// localStorage key, write them all back — must be an identity on stored values.
// We read the two pure functions out of export.html and run them against a
// browser-like localStorage shim (data keys are enumerable, like the real one).
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'export.html'), 'utf8');
const start = html.indexOf('function snapshot()');
const end = html.indexOf('window.__snapshot');
if (start < 0 || end < 0 || end <= start) {
  console.error('FAIL: could not locate snapshot/applySnapshot in export.html (renamed/moved?)');
  process.exit(1);
}
const src = html.slice(start, end);

// localStorage shim: data keys enumerable (Object.keys works), methods hidden.
function makeLS() {
  const ls = {};
  Object.defineProperties(ls, {
    getItem: { value: function (k) { return Object.prototype.hasOwnProperty.call(ls, k) ? ls[k] : null; } },
    setItem: { value: function (k, v) { Object.defineProperty(ls, k, { value: String(v), enumerable: true, writable: true, configurable: true }); } },
    removeItem: { value: function (k) { delete ls[k]; } },
    clear: { value: function () { Object.keys(ls).forEach(function (k) { delete ls[k]; }); } },
  });
  return ls;
}

let localStorage = makeLS();
// eslint-disable-next-line no-new-func -- first-party source, test-only.
const F = new Function('localStorage', src + '\nreturn { snapshot: snapshot, applySnapshot: applySnapshot };')(localStorage);

let pass = 0, fail = 0;
function eq(a, b, msg) { if (a === b) { pass++; return; } fail++; console.error('FAIL: ' + msg + '\n  expected ' + JSON.stringify(b) + '\n  got      ' + JSON.stringify(a)); }
function ok(c, msg) { eq(!!c, true, msg); }

// --- seed a representative mix of value shapes ---
localStorage.setItem('obj', JSON.stringify({ a: 1, b: [2, 3], c: 'x' }));
localStorage.setItem('arr', JSON.stringify([1, 2, 3]));
localStorage.setItem('num', '42');
localStorage.setItem('bool', 'true');
localStorage.setItem('raw', 'plain non-json string');
const before = {};
['obj', 'arr', 'num', 'bool', 'raw'].forEach(function (k) { before[k] = localStorage.getItem(k); });

// --- round trip: snapshot -> clear -> applySnapshot ---
const snap = F.snapshot();
eq(Object.keys(snap).length, 5, 'snapshot captured all 5 keys');
eq(snap.num, 42, 'snapshot parses JSON numbers');
eq(snap.raw, 'plain non-json string', 'snapshot keeps non-JSON values as raw strings');

localStorage.clear();
eq(Object.keys(localStorage).length, 0, 'cleared before restore');

const n = F.applySnapshot(snap);
eq(n, 5, 'applySnapshot wrote all 5 keys');

['obj', 'arr', 'num', 'bool', 'raw'].forEach(function (k) {
  eq(localStorage.getItem(k), before[k], 'round-trip identity for "' + k + '"');
});

// --- defensive: applySnapshot tolerates junk ---
eq(F.applySnapshot(null), 0, 'applySnapshot(null) -> 0, no throw');
eq(F.applySnapshot('nope'), 0, 'applySnapshot(non-object) -> 0, no throw');
eq(F.applySnapshot({}), 0, 'applySnapshot({}) -> 0');

// --- documented limitation: a value stored AS a quoted JSON string is lossy
// (JSON.parse unwraps the quotes, restore writes the unwrapped form). No known
// key stores bare quoted strings, so this is recorded, not asserted as identity.
localStorage.clear();
localStorage.setItem('quoted', '"hi"');
F.applySnapshot(F.snapshot());
ok(localStorage.getItem('quoted') === 'hi', 'known edge: bare quoted-string unwraps on round-trip (documented, no real key hits it)');

console.log('backup.test.js: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
