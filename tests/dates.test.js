// Regression tests for dates.js -- the local-day-key boundary.
// No framework: throw on failure, print a summary, exit non-zero if anything broke.
// Run a DST-observing zone so the spring-forward / fall-back days are real;
// the assertions are written to hold in ANY zone regardless (the noon anchor
// is what makes them zone-independent), so this is belt-and-suspenders.
process.env.TZ = 'Europe/Amsterdam';

const D = require('../dates.js');

let pass = 0, fail = 0;
function eq(actual, expected, msg) {
  if (actual === expected) { pass++; return; }
  fail++;
  console.error('FAIL: ' + msg + '\n  expected ' + JSON.stringify(expected) + '\n  got      ' + JSON.stringify(actual));
}

// dayKey: local wall-clock components, never UTC.
eq(D.dayKey(new Date(2026, 5, 17, 15, 30)), '2026-06-17', 'dayKey afternoon');
eq(D.dayKey(new Date(2026, 0, 5, 0, 0)), '2026-01-05', 'dayKey midnight start-of-year');
eq(D.dayKey(new Date(2026, 11, 31, 23, 59)), '2026-12-31', 'dayKey late evening NYE (UTC would roll to next day)');

// ntDayKey: nutrition day rolls over at 6am local.
eq(D.ntDayKey(new Date(2026, 5, 17, 5, 59)), '2026-06-16', 'ntDayKey 05:59 -> previous day');
eq(D.ntDayKey(new Date(2026, 5, 17, 6, 0)), '2026-06-17', 'ntDayKey 06:00 -> same day');
eq(D.ntDayKey(new Date(2026, 5, 17, 1, 0)), '2026-06-16', 'ntDayKey 01:00 -> previous day');

// addDays across DST boundaries (Amsterdam: 23h day 2026-03-29, 25h day 2026-10-25).
eq(D.addDays('2026-03-29', 1), '2026-03-30', 'addDays +1 over spring-forward');
eq(D.addDays('2026-03-29', -1), '2026-03-28', 'addDays -1 into spring-forward');
eq(D.addDays('2026-10-25', 1), '2026-10-26', 'addDays +1 over fall-back');
eq(D.addDays('2026-12-31', 1), '2027-01-01', 'addDays year wrap');
eq(D.addDays('2026-02-28', 1), '2026-03-01', 'addDays month wrap (2026 not leap)');
eq(D.addDays('2024-02-28', 1), '2024-02-29', 'addDays leap day');

// daysBetween: exact integer across DST and normal ranges.
eq(D.daysBetween('2026-03-28', '2026-03-30'), 2, 'daysBetween across spring-forward');
eq(D.daysBetween('2026-10-24', '2026-10-26'), 2, 'daysBetween across fall-back');
eq(D.daysBetween('2026-06-17', '2026-06-17'), 0, 'daysBetween same day');
eq(D.daysBetween('2026-06-20', '2026-06-17'), -3, 'daysBetween negative');

// daysAgo: today is always 0 at every hour (the noon anchor fixes the old
// before-noon -1 bug); yesterday is 1.
eq(D.daysAgo(D.dayKey()), 0, 'daysAgo(today) === 0 regardless of current hour');
eq(D.daysAgo(D.addDays(D.dayKey(), -1)), 1, 'daysAgo(yesterday) === 1');
eq(D.daysAgo(D.addDays(D.dayKey(), -7)), 7, 'daysAgo(7 days ago) === 7');

// Bad input is null, not a crash or "NaN" key.
eq(D.addDays('not-a-date', 1), null, 'addDays bad input -> null');
eq(D.daysBetween('x', '2026-01-01'), null, 'daysBetween bad input -> null');
eq(D.daysAgo(''), null, 'daysAgo empty -> null');

// Slash-form keys (some stores use YYYY/MM/DD) are accepted.
eq(D.daysBetween('2026/06/15', '2026-06-17'), 2, 'daysBetween tolerates slash keys');

console.log('dates.test.js: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
