const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sync = read('canonical-sync.js');
const repository = read('event-repository.js');
const runtime = read('ui/canonical-runtime.js');
const more = read('ui/more.html');
const migration = read('migrations/phase-a-canonical-events.sql');
const primaryWriteFiles = ['ui/today.html', 'ui/log.html', 'ui/coach.html', 'ui/money.html', 'ui/more.html', 'ui/data.js'];

let pass = 0, fail = 0;
function ok(value, message) { if (value) pass += 1; else { fail += 1; console.error('FAIL: ' + message); } }

ok(/blocked-authentication-required/.test(sync) && /blocked-owner-mismatch/.test(sync), 'sync fails closed for auth and owner mismatch');
ok(/repository\.ingestRemote/.test(sync), 'remote facts enter through the canonical repository');
ok(/retryAt/.test(sync) && /Math\.pow\(2/.test(sync), 'sync retries use bounded exponential backoff');
ok(/REMOTE_IDEMPOTENCY_CONFLICT/.test(repository) && /sync:conflicts/.test(repository), 'conflicts are retained instead of overwritten');
ok(/replaceAll/.test(repository) && /restoreSnapshot/.test(repository), 'repository supports transactional canonical restore');
ok(/lifeos:canonical-sync-enabled:v1/.test(runtime), 'cross-device sync requires explicit owner enablement');
ok(/lifeos:auth-session/.test(runtime), 'exports and restores filter authentication sessions');
ok(/data-sync-toggle/.test(more) && /data-sync-now/.test(more), 'More exposes sync controls');
ok(/data-restore-file/.test(more) && /10\*1024\*1024/.test(more), 'More exposes a bounded restore input');
ok(/enable row level security/.test(migration) && /auth\.uid\(\) = user_id/.test(migration), 'staged cloud table is owner-scoped by RLS');
ok(/STAGED, NOT APPLIED/.test(migration), 'database migration remains explicitly staged');
ok(primaryWriteFiles.every(file => !/localStorage\.(?:setItem|removeItem|clear)\s*\(/.test(read(file))), 'primary pages do not write legacy storage directly');
ok(/LifeOSCompatibilityStore/.test(read('ui/compatibility-store.js')), 'remaining compatibility writes are centralized');

console.log('phase-j-contract.test.js: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
