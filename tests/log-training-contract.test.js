const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../ui/log.html'), 'utf8');
const start = source.indexOf('var trainSub');
const end = source.indexOf('var waterSub', start);
const training = source.slice(start, end);

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) pass++;
  else {
    fail++;
    console.error('FAIL: ' + message);
  }
}

ok(start > -1 && end > start, 'Training renderer is present');
ok(/var SUBS = \[\['overview', 'Overview'\], \['cardio', 'Cardio'\], \['progress', 'Progress'\], \['history', 'History'\]\]/.test(training), 'Training exposes the locked four subtabs');
ok(!/var SUBS = [^;]*\['strength', 'Strength'\]/.test(training), 'Training does not expose a duplicate Strength subtab');
ok(/function sessionView/.test(training) && /data-log-set/.test(training), 'in-panel workout sessions remain available');
ok(/weight: ex\.bw \? 0 : w, reps: reps, rpe: rpe/.test(training), 'set logging preserves weight, reps, and RPE');
ok(/po_coach_v1/.test(training) && /po_coach_workout_done/.test(training), 'strength uses the canonical stores');
ok(/gym:prs:v1/.test(training) && /New PR/.test(training), 'PR detection remains connected');
ok(/data-view-program/.test(training) && /function programView/.test(training), 'exercise and framework management remain reachable from Overview');
ok(/trainCardEdit/.test(training) && /data-edit-cardio/.test(training), 'cardio sessions support editing');
ok(/arr = arr\.map\(function \(c\).*trainCardEdit/.test(training), 'cardio editing updates instead of duplicating');
ok(/title: 'Delete this set\?'/.test(training), 'set deletion is confirm-gated');
ok(/title: 'Delete this cardio session\?'/.test(training), 'cardio deletion is confirm-gated');
ok(/title: 'Delete ' \+ ex\.name/.test(training) && /title: 'Delete this template\?'/.test(training), 'exercise and template deletion are confirm-gated');
ok(/function progressView/.test(training) && /function historyView/.test(training), 'Progress and History remain implemented');
ok(/Add exercises to build your framework/.test(training) && /No sets logged this week/.test(training) && /No cardio logged yet/.test(training), 'Training has honest in-dashboard empty states');
ok(!/[^\u0000-\u007f]/.test(source), 'Log page contains no malformed non-ASCII punctuation');

console.log('log-training-contract.test.js: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
