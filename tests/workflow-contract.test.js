const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const uiDir = path.join(root, 'ui');
const files = fs.readdirSync(uiDir).filter((name) => name.endsWith('.html'));
const broken = [];

for (const name of files) {
  const file = path.join(uiDir, name);
  const source = fs.readFileSync(file, 'utf8');
  const hrefs = [...source.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
  for (const href of hrefs) {
    if (!href || href.startsWith('#') || /^(?:https?:|mailto:|tel:|data:|blob:|javascript:)/i.test(href)) continue;
    const clean = decodeURIComponent(href.split('#')[0].split('?')[0]);
    if (!clean) continue;
    const target = clean.startsWith('/') ? path.join(root, clean.replace(/^\/+/, '')) : path.resolve(path.dirname(file), clean);
    if (!fs.existsSync(target)) broken.push(`${path.relative(root, file)} -> ${href}`);
  }
}

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) pass++;
  else {
    fail++;
    console.error('FAIL: ' + message);
  }
}

ok(broken.length === 0, `broken local links:\n${broken.join('\n')}`);

const uiSource = fs.readFileSync(path.join(uiDir, 'ui.js'), 'utf8');
ok(/role', 'dialog'/.test(uiSource) && /aria-modal/.test(uiSource), 'shared overlays expose modal semantics');
ok(/role', 'alertdialog'/.test(uiSource), 'destructive confirmations expose alertdialog semantics');
ok(/if \(e\.key === 'Escape'\) close\(\)/.test(uiSource), 'shared overlays close with Escape');
ok(/last\.focus\(\)/.test(uiSource), 'shared overlays restore focus');
ok(/function trap\(/.test(uiSource), 'shared overlays trap keyboard focus');
ok(/opts\.onUndo/.test(uiSource) && /settle\('undo'\)/.test(uiSource), 'Undo is backed by a rollback callback');

const exportSource = fs.readFileSync(path.join(root, 'export.html'), 'utf8');
ok(/function snapshot\(\)/.test(exportSource) && /function applySnapshot\(snap\)/.test(exportSource), 'backup and restore use tested snapshot helpers');
ok(/id="importFile"/.test(exportSource) && /accept="\.json"/.test(exportSource), 'restore accepts an explicit JSON file');
ok(/confirm\(/.test(exportSource) || /UI\.confirm/.test(exportSource), 'destructive data reset requires confirmation');

const remindersSource = fs.readFileSync(path.join(root, 'reminders.html'), 'utf8');
ok(/Notification\.requestPermission/.test(remindersSource), 'notifications require explicit browser permission');
ok(/reminders:v1/.test(remindersSource) && /briefing:enabled:v1/.test(remindersSource), 'notification settings persist in canonical stores');

console.log('workflow-contract.test.js: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
