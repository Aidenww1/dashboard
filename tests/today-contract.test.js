const fs = require('fs');
const path = require('path');

const todaySource = fs.readFileSync(path.join(__dirname, '../ui/today.js'), 'utf8');
const todayHtml = fs.readFileSync(path.join(__dirname, '../ui/today.html'), 'utf8');
const logSource = fs.readFileSync(path.join(__dirname, '../ui/log.html'), 'utf8');
const componentSource = fs.readFileSync(path.join(__dirname, '../ui/components.css'), 'utf8');

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) {
    pass++;
    return;
  }
  fail++;
  console.error('FAIL: ' + message);
}

[
  'Life Score',
  'Readiness',
  'Body trend',
  'Priority',
  'Schedule / Day plan',
  'Nutrition',
  'Recovery',
  'Supplements due',
  'Money snapshot',
  'Inbox / important',
  'Body composition',
  'Health / recovery details',
  'Attention queue',
].forEach(function (title) {
  ok(todaySource.includes(title), 'Today includes ' + title);
});

ok(/src="today\.js"/.test(todayHtml), 'Today loads its dedicated renderer');
ok(!/application\/x-lifeos-legacy/.test(todayHtml), 'legacy Today renderer is removed');
ok(/aria-live="polite"/.test(todayHtml), 'Today announces async card updates');
ok(/data-state="error"/.test(todaySource), 'Today has an error state');
ok(/data-state="stale"/.test(todaySource), 'Today has a stale state');
ok(/skeleton/.test(todaySource), 'Today has a loading state');
ok(/Targets not configured/.test(todaySource), 'Today has an honest nutrition setup state');
ok(!/Gym|Client Work|Evening Routine|Weekly check-in|Grocery list/.test(todaySource), 'Today has no fictional schedule or attention entries');
ok(!/body\s+\*\s*\{[^}]*!important/s.test(componentSource), 'shared CSS has no global letter-spacing override');
ok(/log\.html\?q=/.test(todaySource), 'Today forwards Quick Log text');
ok(/inferSegment/.test(todaySource), 'Today selects a Quick Log category');
ok(/URLSearchParams\(location\.search\)\.get\('q'\)/.test(logSource), 'Log consumes the forwarded Quick Log query');
ok(/startWithQuery/.test(logSource), 'Log starts the selected query flow');

const values = Object.create(null);
global.window = global;
global.localStorage = {
  getItem: function (key) {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
  },
  setItem: function (key, value) {
    values[key] = String(value);
  },
  removeItem: function (key) {
    delete values[key];
  },
};

const contexts = {
  today: { life_score: 75, readiness: { score: 80 } },
  nutrition: { last7d: [{ kcal: 1196, protein: 76 }] },
  productivity: { goals_today: [], tasks_open: [] },
  finance: {},
  recovery: {},
  health: {},
  wearable: {},
  mail: {},
};
global.LifeOS = {
  context: function (name) { return contexts[name] || {}; },
  todayStr: function () { return '2026-07-16'; },
  quality: function () { return { score: 50, stale: [] }; },
};

localStorage.setItem('po_coach_weights', JSON.stringify([
  { dateKey: '2026-07-10', weight: 82 },
  { dateKey: '2026-07-16', weight: 80 },
]));
localStorage.setItem('health:body:v1', JSON.stringify([
  { date: '2026-07-10', bf: 20 },
  { date: '2026-07-16', bf: 19 },
]));

require('../ui/data.js');
const body = global.LifeOS.data.bodyComposition();
ok(body.weight_kg === 80 && body.body_fat_pct === 19, 'body composition uses canonical latest measurements');
ok(body.lean_mass_kg === 64.8, 'lean body mass is calculated from actual weight and body fat');
ok(body.body_fat_delta_pct === -1, 'body fat delta compares actual entries');
ok(global.LifeOS.data.nutritionToday().configured === false, 'nutrition is unconfigured without persisted targets');
ok(/refreshCanonicalNutrition/.test(todaySource) && /nutritionDaily/.test(todaySource), 'Today nutrition reads the shared canonical projection');
ok(/canonicalPhaseF/.test(todaySource) && /api\.phaseF/.test(todaySource), 'Today consumes the shared Water and Energy projections');
ok(/data-energy-checkin/.test(todaySource) && /api\.checkInEnergy/.test(todaySource), 'Today supports measured energy check-ins');
ok(/canonicalHydration\.explicit_beverage_ml/.test(todaySource), 'Today hydration details use the canonical explicit beverage total');
ok(/canonical-runtime\.js/.test(todayHtml), 'Today installs the canonical browser runtime');

contexts.health = { bloodwork_latest: { date: '2026-07-16', markers: { ldl: 142, vitaminD: 22 } } };
const labAttention = global.LifeOS.data.attention();
ok(labAttention.some(function (item) { return item.title === 'Bloodwork' && /LDL high/.test(item.detail) && /Vitamin D low/.test(item.detail); }), 'Today attention includes out-of-range lab markers');
ok(/data\.js\?v=phase-e/.test(todayHtml), 'Today cache-busts the shared Phase E adapter');

localStorage.setItem('nt:targets', JSON.stringify({ calories: 2600, protein: 200 }));
const nutrition = global.LifeOS.data.nutritionToday();
ok(nutrition.configured === true && nutrition.calorie_target === 2600 && nutrition.protein_target === 200, 'nutrition uses persisted targets');

console.log('today-contract.test.js: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
