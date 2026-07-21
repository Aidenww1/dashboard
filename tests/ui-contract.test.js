const fs = require('fs');
const path = require('path');

global.window = global;
global.document = { readyState: 'loading', addEventListener: function () {} };
require('../ui/ui.js');

const UI = global.UI;
const shellSource = fs.readFileSync(path.join(__dirname, '../ui/shell.js'), 'utf8');
const componentSource = fs.readFileSync(path.join(__dirname, '../ui/components.css'), 'utf8');
const gallerySource = fs.readFileSync(path.join(__dirname, '../ui/components.html'), 'utf8');

let pass = 0, fail = 0;
function ok(condition, message) {
  if (condition) { pass++; return; }
  fail++; console.error('FAIL: ' + message);
}

ok(UI && typeof UI.undo === 'function', 'UI.undo is exposed');
ok(typeof UI.sheet === 'function' && typeof UI.dialog === 'function', 'overlay contracts are exposed');
ok(!/\bKees\b/.test(shellSource), 'shell has no hardcoded owner name');
ok(!/up 6 from yesterday/i.test(shellSource), 'shell has no hardcoded score delta');
ok(/Tracking starts today/.test(shellSource), 'shell has an honest first-history state');
ok(/\.subnav\s*\{/.test(componentSource), 'shared sub-navigation primitive exists');
ok(/\.chart-frame\s*\{/.test(componentSource), 'shared chart framing primitive exists');
ok(/\.compact-row\s*\{/.test(componentSource), 'shared compact row primitive exists');
ok(/data-state="error"/.test(gallerySource) && /data-state="stale"/.test(gallerySource), 'gallery covers error and stale states');
ok(/id="openSheet"/.test(gallerySource) && /id="openConfirm"/.test(gallerySource), 'gallery covers overlays');

let toastOptions = null;
UI.toast = function (_message, options) { toastOptions = options; return function () {}; };
const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;
global.setTimeout = function () { return 1; };
global.clearTimeout = function () {};

let undoCalls = 0, commitCalls = 0;
const transaction = UI.undo({ onUndo: function () { undoCalls++; }, onCommit: function () { commitCalls++; } });
ok(toastOptions && toastOptions.action === 'Undo', 'Undo action is only offered with a rollback callback');
ok(transaction.undo() === true && undoCalls === 1, 'Undo executes rollback once');
ok(transaction.commit() === false && commitCalls === 0, 'committing after Undo is rejected');

const committed = UI.undo({ onUndo: function () { undoCalls++; }, onCommit: function () { commitCalls++; } });
ok(committed.commit() === true && commitCalls === 1, 'commit executes once');
ok(committed.undo() === false && undoCalls === 1, 'Undo after commit is rejected');

UI.undo({ onCommit: function () {} });
ok(toastOptions.action === null, 'Undo is not advertised without rollback capability');

global.setTimeout = originalSetTimeout;
global.clearTimeout = originalClearTimeout;

console.log('ui-contract.test.js: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
