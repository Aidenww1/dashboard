const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tokens = read('ui/tokens.css');
const css = read('ui/components.css');
const ui = read('ui/ui.js');
const gallery = read('ui/components.html');
const shell = read('ui/shell.js');

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) { pass++; return; }
  fail++;
  console.error('FAIL: ' + message);
}

ok(/--r-card:\s*8px/.test(tokens), 'cards use the compact 8px radius token');
ok(/--touch-min:\s*44px/.test(tokens), 'touch target token is at least 44px');
ok(/--chart-1:/.test(tokens) && /--chart-grid:/.test(tokens), 'shared chart palette is defined');
ok(/--metric-card-h:/.test(tokens) && /--table-row-h:/.test(tokens), 'stable metric and table dimensions are tokenized');
ok(!/letter-spacing:\s*-/.test(tokens + css), 'shared typography does not use negative letter spacing');

ok(/\.domain-tabs\s*\{[^}]*repeat\(6,/s.test(css), 'domain navigation has six stable desktop tracks');
ok(/@media \(max-width: 640px\)[\s\S]*\.domain-tabs\s*\{[^}]*repeat\(3,/s.test(css), 'domain navigation wraps to a stable 3 by 2 phone grid');
ok(/@media \(max-width: 900px\)[\s\S]*\.grid\s*\{[^}]*repeat\(6,/s.test(css), 'tablet grid restores six responsive tracks after production overrides');
ok(/\.subnav\s*\{[^}]*flex-wrap:\s*wrap/s.test(css), 'section tabs wrap instead of requiring document scrolling');
ok(/@media \(max-width: 640px\)[\s\S]*\.subnav\s*\{[^}]*repeat\(3,/s.test(css), 'phone section navigation uses stable three-column rows');
ok(/\.data-table\[data-responsive="stack"\][\s\S]*content:\s*attr\(data-label\)/s.test(css), 'responsive tables expose phone labels');
ok(/\.chart-table\s*\{[^}]*clip:/s.test(css), 'charts retain a screen-reader data table');
ok(/prefers-reduced-motion:\s*reduce/.test(css + tokens), 'reduced motion is supported');
ok(/:focus-visible/.test(css), 'keyboard focus is visibly styled');
ok(/body\.overlay-open\s*\{[^}]*overflow:\s*hidden/s.test(css), 'open overlays lock background scrolling');

['empty', 'loading', 'error', 'stale', 'success', 'offline', 'disconnected', 'conflict'].forEach((state) => {
  const present = state === 'empty' || state === 'loading'
    ? new RegExp('>' + state[0].toUpperCase() + state.slice(1) + '<').test(gallery) || new RegExp('class="' + state).test(gallery)
    : new RegExp('data-state="' + state + '"').test(gallery);
  ok(present, 'component reference includes the ' + state + ' state');
});

ok((gallery.match(/role="tab"/g) || []).length >= 9, 'component reference demonstrates segmented and domain tabs');
ok((gallery.match(/class="tab-icon"/g) || []).length === 6, 'component reference demonstrates all six domain icons');
ok(/data-responsive="stack"/.test(gallery), 'component reference demonstrates responsive table behavior');
ok(/UI\.chart\('#galleryChart'/.test(gallery), 'component reference renders the shared chart implementation');
ok(/id="openSheet"/.test(gallery) && /id="openDialog"/.test(gallery) && /id="openConfirm"/.test(gallery), 'component reference exposes all overlay types');

ok(/aria-labelledby/.test(ui) && /role', 'alertdialog'/.test(ui), 'dialogs and confirmations have explicit accessible names');
ok(/overlayRootState/.test(ui) && /last\.focus\(\)/.test(ui), 'overlays restore page accessibility and trigger focus');
ok(/e\.key === 'ArrowDown'/.test(ui) && /e\.key === 'Home'/.test(ui) && /e\.key === 'End'/.test(ui), 'menus support expected keyboard navigation');
ok(/b\.textContent = String\(it\.label/.test(ui), 'menu labels are inserted as text, not HTML');
ok(/svg\.setAttribute\('role', 'img'\)/.test(ui) && /class="chart-table"|el\('table', 'chart-table'\)/.test(ui), 'shared charts provide visual and tabular equivalents');
ok(/aria-current="page"/.test(shell), 'shared shell marks the active destination');
ok(!/â€|â€”|â€¦/.test(shell), 'shared shell contains no corrupted user-facing glyphs');

console.log('shared-ui-system.test.js: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
