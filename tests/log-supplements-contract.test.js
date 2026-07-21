const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../ui/log.html'), 'utf8');
const start = source.indexOf("var suppSub = 'overview'");
const end = source.indexOf("var bodySub = 'overview'", start);
const supps = source.slice(start, end);

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) pass++;
  else {
    fail++;
    console.error('FAIL: ' + message);
  }
}

ok(start > -1 && end > start, 'Supplements renderer is present');
ok(/var SUBS = \[\['overview', 'Overview'\], \['schedule', 'Schedule'\], \['compounds', 'Compounds'\], \['monitoring', 'Monitoring'\], \['inventory', 'Inventory'\], \['notes', 'Notes'\]\]/.test(supps), 'Supplements exposes the locked six subtabs');
ok(/var VIEWS = \{ overview: overviewView, schedule: scheduleView, compounds: compoundsView, monitoring: monitoringView, inventory: inventoryView, notes: notesView \}/.test(supps), 'all Supplements tabs map to real views');
ok(/stack:items/.test(supps) && /stack:taken:/.test(supps), 'stack and adherence use canonical stores');
ok(/phaseGValue\('supplements\.schedule'\)/.test(supps) && /phaseGValue\('supplements\.adherence'\)/.test(supps), 'schedule and adherence read canonical projections');
ok(/phaseGValue\('supplements\.inventory'\)/.test(supps) && /phaseGValue\('supplements\.notes'\)/.test(supps), 'inventory and notes read canonical projections');
ok(/phaseGValue\('supplements\.monitoring'\)/.test(supps) && /phaseGValue\('labs\.trends'\)/.test(supps), 'monitoring reads shared canonical lab projections');
ok(/stack:low/.test(supps) && /function suppStockSheet/.test(supps), 'inventory uses the canonical low-stock store');
ok(/blood:logs/.test(supps) && /data-open-body-labs/.test(supps), 'Monitoring shares canonical Body Labs data');
ok(/supps:notes:v1/.test(supps), 'Notes use the established store');
ok(/function suppItemSheet/.test(supps) && /id="si-name"/.test(supps) && /id="si-window"/.test(supps), 'compound add/edit is integrated');
ok(/api\.saveSupplementCompound/.test(supps) && /api\.setSupplementDose/.test(supps), 'compound and adherence mutations use canonical commands');
ok(/api\.saveSupplementInventory/.test(supps) && /api\.saveSupplementNote/.test(supps), 'inventory and notes use canonical commands');
ok(/id="si-time"/.test(supps) && /id="si-frequency"/.test(supps) && /id="si-route"/.test(supps), 'compound schedule metadata is editable');
ok(/id="ss-stock"/.test(supps) && /id="ss-reorder"/.test(supps) && /id="ss-expiry"/.test(supps), 'inventory fields are editable');
ok(/Delete this compound\?/.test(supps) && /Delete compound/.test(supps), 'compound deletion is confirm-gated');
ok(/Compound deleted'.*action: 'Undo'/.test(supps), 'compound deletion supports Undo');
ok(/Delete this note\?/.test(supps) && /Note deleted'.*action: 'Undo'/.test(supps), 'note deletion is confirm-gated and undoable');
ok(/L\.log\(\{ type: 'supplement', name: q \}\)/.test(supps), 'Quick Log still marks a canonical stack item taken');
ok(/protocolGroups/.test(supps) && /morning: 8, lunch: 12, anytime: 15, evening: 20/.test(supps), 'dose windows remain distinct');
ok(/Add your compounds once/.test(supps) && /No monitoring data yet/.test(supps) && /No inventory yet/.test(supps), 'Supplements has honest in-dashboard empty states');
ok(!/href="\.\.\/reminders\.html"/.test(supps), 'integrated Supplements workflows do not depend on the legacy reminder store');

console.log('log-supplements-contract.test.js: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
