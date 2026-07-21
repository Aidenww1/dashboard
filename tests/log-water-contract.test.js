const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../ui/log.html'), 'utf8');
const start = source.indexOf('var waterSub');
const end = source.indexOf('var skinSub', start);
const water = source.slice(start, end);

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) pass++;
  else {
    fail++;
    console.error('FAIL: ' + message);
  }
}

ok(start > -1 && end > start, 'Water renderer is present');
ok(/var SUBS = \[\['overview', 'Overview'\], \['target', 'Target'\], \['history', 'History'\], \['settings', 'Settings'\]\]/.test(water), 'Water exposes the locked four subtabs');
ok(/po_water_v1/.test(water), 'Water uses the canonical store');
ok(/weightUnit === 'lb' \? weightRaw \/ 2\.20462 : weightRaw/.test(water), 'target calculation handles pound profiles');
ok(/weightKg \* 35/.test(water) && /actHrs \/ 7 \* 500/.test(water), 'target calculation preserves canonical weight and activity factors');
ok(/Math\.max\(0, caffMg - 200\) \* 1\.5/.test(water), 'target calculation preserves canonical caffeine adjustment');
ok(/data-add-ml="250"/.test(water) && /data-add-ml="500"/.test(water) && /data-add-ml="1000"/.test(water), 'Overview exposes quick-add amounts');
ok(/data-undo-ml/.test(water) && /waterUndo/.test(water), 'quick-add supports Undo');
ok(/No history yet/.test(water) && /No water logged yet/.test(water), 'Water has honest empty states');
ok(/id="wtr-settings-form"/.test(water) && /Water settings saved/.test(water), 'profile and display settings are editable in-panel');
ok(/function convertLogUnits/.test(water) && /state\.logs\[d\].*fromMl \/ toMl/.test(water), 'unit changes preserve logged milliliters');
ok(/data-water-export/.test(water) && /new Blob/.test(water), 'Water JSON export is integrated');
ok(/data-water-import/.test(water) && /Import Water backup\?/.test(water), 'Water JSON import is integrated and confirm-gated');
ok(/title: 'Reset all Water data\?'/.test(water) && /LifeOSCompatibilityStore\.remove\('po_water_v1'\)/.test(water), 'Water reset is explicit, confirm-gated, and uses the compatibility adapter');
ok(/file\.size > 2 \* 1024 \* 1024/.test(water), 'Water import has a file-size guard');
ok(/var wviews = \{ overview: overviewView, target: targetView, history: historyView, settings: settingsView \}/.test(water), 'all Water tabs map to real views');
ok(/api\.logHydration/.test(water) && /api\.saveHydrationSettings/.test(water), 'Water writes intake and target settings through the canonical runtime');
ok(/api\.replaceHydrationFromLegacy/.test(water) && /api\.clearHydration/.test(water), 'Water import and reset update canonical history after confirmation');
ok(/data-energy-value/.test(water) && /api\.checkInEnergy/.test(water), 'Water Overview exposes measured energy check-ins');
ok(/No forecast is shown until/.test(water) && /confidence/.test(water), 'energy UI is confidence-gated instead of decorative scoring');

console.log('log-water-contract.test.js: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
