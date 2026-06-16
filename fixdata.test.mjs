// Run: node fixdata.test.mjs
// Loads the real fixdata.js (the destructive scan/apply path) with a fake
// in-memory store and asserts it finds impossible values and fixes them.
import { readFileSync } from 'fs';

const g = {};
new Function('globalThis', readFileSync(new URL('./fixdata.js', import.meta.url), 'utf8'))(g);
const F = g.FixData;

let pass = 0, fail = 0;
const eq = (name, a, b) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) pass++; else { fail++; console.log('FAIL', name, '\n  got ', A, '\n  want', B); }
};

// Fake store seeded with one good + one impossible value per kind.
const store = {
  'po_coach_weights': [{ dateKey: '2026-06-01', weight: 82 }, { dateKey: '2026-06-02', weight: 9000 }],
  'body:logs': [{ date: '2026-06-01', waist: 80, arms: 4000 }],
  'po_coach_v1': { exercises: [{ id: 'bench', name: 'Bench' }],
    logs: { bench: [{ weight: 80, reps: 8, date: '2026-06-01' }, { weight: 350000, reps: 5, date: '2026-06-02' }] } },
};
const load = (k) => (k in store ? JSON.parse(JSON.stringify(store[k])) : null);
const save = (k, v) => { store[k] = v; };

let issues = F.scan(load);
eq('count', issues.length, 3); // bad bw, bad arm, bad lift weight
eq('kinds', issues.map(i => i.kind).sort(), ['bw', 'lift', 'meas']);

// Fix the bodyweight typo → value corrected, entry kept.
F.apply(load, save, issues.find(i => i.kind === 'bw'), 83);
eq('bwFixed', store['po_coach_weights'][1].weight, 83);

// Delete the impossible lift → entry gone, good set remains.
F.apply(load, save, issues.find(i => i.kind === 'lift'), undefined);
eq('liftDeleted', store['po_coach_v1'].logs.bench.length, 1);
eq('liftKeptGood', store['po_coach_v1'].logs.bench[0].weight, 80);

// Clear the bad measurement field → nulled, entry + other fields kept.
F.apply(load, save, issues.find(i => i.kind === 'meas'), undefined);
eq('measCleared', store['body:logs'][0].arms, null);
eq('measKept', store['body:logs'][0].waist, 80);

// Re-scan: everything clean now.
eq('rescanClean', F.scan(load).length, 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
