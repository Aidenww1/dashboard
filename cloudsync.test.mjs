// Run: node cloudsync.test.mjs
// Tests the real merge from cloudsync.js (data-safety path) by loading it with
// a fake window. ponytail: no framework, asserts only — the merge is the thing
// that loses your data if it's wrong.
import { readFileSync } from 'fs';

const win = {};
new Function('window', readFileSync(new URL('./cloudsync.js', import.meta.url), 'utf8'))(win);
const merge = win.__cloudMerge, normalize = win.__cloudNormalize;

let pass = 0, fail = 0;
const eq = (name, a, b) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) pass++; else { fail++; console.log('FAIL', name, '\n  got ', A, '\n  want', B); }
};
const K = ['x', 'y'];

// Core data-loss case: A edited x newer, B edited y newer → both survive.
let r = merge(K, { x: 'lX', y: 'oY' }, { x: 200, y: 100 }, normalize({ __v: 2, vals: { x: 'oX', y: 'nY' }, ts: { x: 150, y: 300 } }));
eq('vals', r.vals, { x: 'lX', y: 'nY' });
eq('pulled', r.pulled, { y: JSON.stringify('nY') });
eq('push', r.pushNeeded, true);

// Remote-only key pulled; local-newer key kept.
r = merge(K, { x: 'L' }, { x: 50 }, normalize({ __v: 2, vals: { x: 'L2', y: 'R' }, ts: { x: 10, y: 99 } }));
eq('pullY', r.pulled.y, JSON.stringify('R'));
eq('keepX', r.vals.x, 'L');

// Local-only key kept + pushed.
r = merge(K, { x: 'L', y: 'Lo' }, { x: 5, y: 7 }, normalize({ __v: 2, vals: { x: 'L' }, ts: { x: 5 } }));
eq('keepY', r.vals.y, 'Lo');

// Legacy remote (no ts): local wins, push upgrades; remote-only key still pulled.
r = merge(K, { x: 'Ln' }, { x: 1000 }, normalize({ x: 'lx', y: 'ly' }));
eq('legacyKeepX', r.vals.x, 'Ln');
eq('legacyPullY', r.pulled.y, JSON.stringify('ly'));

// Identical → no churn.
r = merge(K, { x: 's', y: 's' }, { x: 1, y: 1 }, normalize({ __v: 2, vals: { x: 's', y: 's' }, ts: { x: 1, y: 1 } }));
eq('noPush', r.pushNeeded, false);
eq('noPull', Object.keys(r.pulled).length, 0);

// Empty remote → push all local.
r = merge(K, { x: 'a' }, { x: 1 }, normalize(null));
eq('emptyPush', r.pushNeeded, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
