const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) { pass++; return; }
  fail++;
  console.error('FAIL: ' + message);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const clientFiles = fs.readdirSync(root)
  .filter(name => /\.(?:html|js)$/.test(name) && !name.startsWith('.tmp-'))
  .map(name => path.join(root, name))
  .concat(walk(path.join(root, 'ui')).filter(file => /\.(?:html|js)$/.test(file)));
const leakedClientServiceKey = clientFiles.filter(file => /SUPABASE_SERVICE_KEY|service_role/i.test(fs.readFileSync(file, 'utf8')));
ok(clientFiles.length > 20, 'client service-key scan covers the browser application');
ok(leakedClientServiceKey.length === 0, 'service-role credentials are not referenced by browser code');

const ingestAuth = read('api/_ingest-auth.js');
const sleepIngest = read('api/sleep-ingest.js');
ok(/failOpenWhenUnset = !!/.test(ingestAuth) && /diff \|=/.test(ingestAuth), 'shared ingest auth defaults closed and compares tokens in constant time');
ok(/checkIngestToken\(req, 'SLEEP_INGEST_TOKEN'\)/.test(sleepIngest), 'sleep ingest fails closed behind its dedicated token');

const migration = read('migrations/phase10-rls.sql');
ok(!/^\\set\s/m.test(migration), 'RLS migration is compatible with the Supabase SQL editor');
ok(/owner_uid uuid := '00000000-0000-0000-0000-000000000000'/.test(migration), 'RLS migration exposes one explicit owner UUID placeholder');
ok(/raise exception 'Replace owner_uid/.test(migration), 'RLS migration aborts while the owner UUID sentinel remains');
ok(/auth\.uid\(\) = user_id/.test(migration) && /enable row level security/.test(migration), 'RLS policies scope rows to the authenticated owner');
ok(/disable row level security/.test(migration), 'RLS migration includes a documented rollback');

const backup = read('export.html');
ok(/function isValidSnapshot\(snap\)/.test(backup) && /Object\.prototype\.toString\.call\(snap\)/.test(backup), 'restore rejects non-object backup roots');
ok(/file\.size > 10 \* 1024 \* 1024/.test(backup), 'restore bounds local backup file size');
ok(/Restore rolled back/.test(backup) && /localStorage\.removeItem/.test(backup), 'restore reports failure and rolls partial writes back');
ok(/__downloadCurrentState\(\);[\s\S]{0,180}__applySnapshot\(data\)/.test(backup), 'local restore downloads the pre-restore state before writing');

const bridge = read('samsung-health-bridge/app/src/main/java/com/dashboard/healthbridge/HealthServer.kt');
const manifest = read('samsung-health-bridge/app/src/main/AndroidManifest.xml');
ok(/InetAddress\.getLoopbackAddress\(\)/.test(bridge), 'Android health bridge only listens on device loopback');
ok(/android:allowBackup="false"/.test(manifest), 'Android OS backup is disabled for the health bridge');

console.log(`security-contract.test.js: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
