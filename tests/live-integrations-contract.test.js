const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const mail = read('mail.html');
const calendar = read('calendar.html');
const money = read('ui/money.html');
const log = read('ui/log.html');
const body = read('body.html');
const skin = read('skin.html');
const health = read('health.html');
const backup = read('export.html');
const pwa = read('pwa.js');
const push = read('api/push-subscribe.js');
const gcal = read('api/gcal-nlp.js');
const nutrition = read('api/nutrition-ai.js');
const visual = read('api/visual-ai.js');
const lab = read('api/events/add.js');
const manifest = JSON.parse(read('manifest.json'));

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) { pass += 1; return; }
  fail += 1;
  console.error('FAIL: ' + message);
}

ok(/gmail:token:v1/.test(mail), 'Gmail stores an OAuth access token, not credentials');
ok(/gmail\.modify/.test(mail), 'Gmail requests the bounded modify scope');
ok(/confirm\('Move to Gmail trash/.test(mail), 'Gmail trash requires confirmation');
ok(/confirm\('Archive /.test(mail), 'bulk Gmail archive requires confirmation');

ok(/gcal:token/.test(calendar), 'Calendar stores its OAuth token locally');
ok(/confirmCard/.test(calendar) && /cfAdd/.test(calendar), 'parsed Calendar events require preview and confirmation');
ok(/GOOGLE_CLIENT_ID/.test(gcal) && /clientId/.test(gcal), 'Calendar exposes only the public OAuth client id');

ok(/ANTHROPIC_API_KEY not configured/.test(nutrition), 'nutrition AI fails closed when unconfigured');
ok(/if \(!image && !description\)/.test(nutrition), 'nutrition AI validates explicit user input');
ok(/ANTHROPIC_API_KEY not configured/.test(visual), 'visual AI fails closed when unconfigured');
ok(/nothing here persists data/.test(visual), 'visual endpoint does not persist analysis');
ok(/ppAnalyzeBtn/.test(body) && /ppSaveOnlyBtn/.test(body), 'body photos separate Analyze from Save');
ok(/Saved with this skin check when you hit Save/.test(skin), 'skin analysis persists only with explicit Save');
ok(/mode === 'lab_ocr'/.test(lab) && /image_base64 required/.test(lab), 'lab OCR has an explicit validated mode');
ok(/bloodSave/.test(health) && /labSaveBtn/.test(health), 'lab analysis and lab persistence remain explicit actions');

ok(/publicKey: process\.env\.VAPID_PUBLIC_KEY \|\| null/.test(push), 'push reports an honest unconfigured state');
ok(/PUSH_REQUIRE_AUTH/.test(push) && /status\(401\)/.test(push), 'push supports the staged session gate');
ok(/if \(!cfg \|\| !cfg\.publicKey\) return 'unconfigured'/.test(pwa), 'client handles unconfigured push without pretending success');

ok(/Import bank CSV/.test(money) || /Import/.test(money), 'Money exposes the implemented import path');
ok(!/plaid|tink|yodlee|enablebanking/i.test(money), 'Money does not pretend a bank provider adapter exists');

ok(/overwrite your current data with the backup/.test(backup), 'restore requires confirmation');
ok(/Delete ALL dashboard data permanently/.test(backup), 'destructive data reset requires confirmation');
ok(/share_target/.test(JSON.stringify(manifest)) && manifest.share_target.method === 'POST', 'manifest share target is configured');
ok(/SHARE_MAP/.test(pwa) && /share:handoff:v1/.test(pwa), 'shared media has a destination handoff contract');
ok(/serviceWorker\.register\('\/sw\.js'\)/.test(pwa), 'installed app registers its service worker');
ok(manifest.display === 'standalone' && manifest.start_url === '/ui/today.html', 'installed PWA opens the redesigned shell');
ok(/fetch\('\/api\/nutrition-ai'/.test(log), 'redesigned Food uses the production nutrition AI endpoint');

console.log('live-integrations-contract.test.js: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
