const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../ui/more.html'), 'utf8');

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) pass++;
  else {
    fail++;
    console.error('FAIL: ' + message);
  }
}

for (const tab of ["['settings','Settings']","['integrations','Integrations']","['notifications','Notifications']","['data','Data']","['life','Life']","['about','About']"]) {
  ok(source.includes(tab), `More tab contract is missing ${tab}`);
}
ok(/settings:v1/.test(source) && /nt:tdee/.test(source), 'Settings shares canonical settings and nutrition target stores');
ok(/mail:summary:v1/.test(source) && /gcal:events/.test(source) && /ing:tx/.test(source), 'Integrations use real connection signals');
ok(/reminders:v1/.test(source) && /briefing:enabled:v1/.test(source), 'Notifications use the established reminder stores');
ok(/Object\.keys\(localStorage\)|localStorage\.length/.test(source), 'Data summarizes actual local storage');
ok(/data-export/.test(source) && /lifeos-export-/.test(source) && /exportSnapshot/.test(source), 'Data supports a complete versioned JSON export');
ok(/Clear ALL device data\?/.test(source) && /UI\.confirm/.test(source) && /clearDeviceData/.test(source), 'Destructive device reset is confirm-gated and clears canonical storage');
ok(/systemStatus/.test(source) && /pending_sync/.test(source), 'More reports canonical event and sync queue status');
ok(/configured connection means/.test(source) && /does not prove the provider is reachable/.test(source), 'Integration lifecycle labels do not claim live reachability');
ok(/cross-device continuity depends on the configured sync service/i.test(source), 'About explains the device-cache and cross-device boundary');
ok(!/Mood and journal|People.*accountability and social notes/.test(source), 'Excluded mental-health and social tracking are not presented as objective telemetry');
ok(/role="tablist"/.test(source) && /role="tabpanel"/.test(source), 'More exposes accessible tab roles');
ok(/ArrowRight/.test(source) && /ArrowLeft/.test(source), 'More tabs support keyboard navigation');
ok(/\.mr-tabs\{flex-wrap:wrap/.test(source), 'More tabs wrap on narrow screens');
ok(/No matches in this section/.test(source), 'Section search has an honest empty state');
ok(/This section could not load/.test(source), 'More has an isolated render error state');
ok(!/Explore templates|Roadmap|Contact Support|Profile and subscription/.test(source), 'Commercial and support-directory filler is removed');
ok(!/glowlab\.html/.test(source), 'More no longer misroutes Lifestyle to GlowLab');

console.log('more-contract.test.js: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
