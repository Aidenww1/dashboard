const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const data = read('ui/data.js');
const log = read('ui/log.html');
const coach = read('ui/coach.html');
const shell = read('ui/shell.js');
const css = read('ui/components.css');
const sw = read('sw.js');
const pwa = read('pwa.js');
const manifest = JSON.parse(read('manifest.json'));

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) { pass += 1; return; }
  fail += 1;
  console.error('FAIL: ' + message);
}

ok(/try\s*\{\s*var v = JSON\.parse\(localStorage\.getItem\(k\)\)/.test(data), 'shared data reads tolerate corrupt JSON');
ok(/catch \(e\) \{\s*p\.innerHTML =/.test(log), 'Log isolates a failed domain renderer');
ok(/This Coach view could not load/.test(coach), 'Coach isolates a failed view renderer');
ok(/hashchange/.test(log), 'Log responds to fragment navigation changes');
ok(/ArrowRight/.test(log) && /ArrowRight/.test(coach), 'primary Log and Coach tabs support arrow keys');
ok(/setAttribute\('tabindex', on \? '0' : '-1'\)/.test(log), 'Log tabs maintain roving tabindex');

ok(/prefers-reduced-motion:\s*reduce/.test(css), 'reduced-motion media query exists');
ok(/animation-duration:\s*0\.01ms\s*!important/.test(css), 'reduced motion disables shared animation');
ok(/transition-duration:\s*0\.01ms\s*!important/.test(css), 'reduced motion disables shared transitions');

ok(/manifest\.href = '\/manifest\.json'/.test(shell), 'redesigned pages expose the root manifest');
ok(/script\.src = '\/pwa\.js'/.test(shell), 'redesigned pages load PWA registration');
ok(/serviceWorker\.register\('\/sw\.js'\)/.test(pwa), 'PWA registration targets the root service worker');
ok(/^const CACHE = 'dashboard-v\d+';/m.test(sw), 'service worker uses an explicit versioned cache');
ok(/keys\.filter\(k => k !== CACHE/.test(sw), 'activation removes obsolete app caches');
ok(/fetch\(e\.request, \{ cache: 'reload' \}\)/.test(sw), 'HTML uses network-first deployment freshness');

ok(manifest.start_url === '/ui/today.html', 'installed app starts on the redesigned Today page');
ok(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length > 0, 'manifest exposes app shortcuts');
ok(manifest.shortcuts.every((item) => item.url.startsWith('/ui/')), 'manifest shortcuts stay inside the locked IA');
ok(manifest.shortcuts.every((item) => !/claude/i.test(item.name + item.description)), 'manifest has no provider-branded UX');
ok(manifest.icons.some((icon) => icon.src === '/ui/assets/life-os-icon.svg'), 'manifest uses the install icon asset');
ok(manifest.share_target && manifest.share_target.method === 'POST', 'share target remains configured');

const precacheMatch = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
const precachePaths = precacheMatch ? [...precacheMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1]) : [];
ok(precachePaths.length > 10, 'service worker precache list is present');
for (const url of precachePaths) {
  const relative = url === '/' ? 'index.html' : url.replace(/^\//, '');
  ok(fs.existsSync(path.join(root, relative)), 'precache asset exists: ' + url);
}

console.log('reliability-contract.test.js: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
