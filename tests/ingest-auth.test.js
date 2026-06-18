// Tests for api/_ingest-auth.js checkIngestToken — the ingest-endpoint guard
// (Phase 10: endpoint protection / unauthenticated rejection). Pins the two
// fail modes (closed by default, open-when-unset only when explicitly opted in),
// the constant-time match, and that token can arrive via header/body/query.
const fs = require('fs');
const path = require('path');

let src = fs.readFileSync(path.join(__dirname, '..', 'api', '_ingest-auth.js'), 'utf8');
src = src.replace(/export\s+function/, 'function'); // ESM -> plain fn for new Function
// eslint-disable-next-line no-new-func -- first-party source, test-only.
const checkIngestToken = new Function(src + '\nreturn checkIngestToken;')();

let pass = 0, fail = 0;
function ok(c, msg) { if (c) { pass++; return; } fail++; console.error('FAIL: ' + msg); }
const req = (o) => Object.assign({ headers: {}, body: {}, query: {} }, o);

const ENV = 'TEST_INGEST_TOKEN';
delete process.env[ENV];

// 1. Unset + default -> fail CLOSED (503).
let r = checkIngestToken(req({}), ENV);
ok(r.ok === false && r.status === 503, 'unset + default -> 503 (fail closed)');

// 2. Unset + failOpenWhenUnset -> allowed but flagged unprotected.
r = checkIngestToken(req({}), ENV, { failOpenWhenUnset: true });
ok(r.ok === true && r.unprotected === true, 'unset + opt-in -> open + flagged');

// --- now configure the token ---
process.env[ENV] = 'super-secret-token-123';

// 3. No token provided -> 401.
ok(checkIngestToken(req({}), ENV).status === 401, 'set + no token -> 401');

// 4. Wrong token, different length -> 401.
ok(checkIngestToken(req({ body: { token: 'short' } }), ENV).status === 401, 'wrong (len mismatch) -> 401');

// 5. Wrong token, same length -> 401.
const sameLen = 'x'.repeat('super-secret-token-123'.length);
ok(checkIngestToken(req({ body: { token: sameLen } }), ENV).status === 401, 'wrong (same len) -> 401');

// 6. Correct token via body / header / query -> ok.
ok(checkIngestToken(req({ body: { token: 'super-secret-token-123' } }), ENV).ok === true, 'correct via body -> ok');
ok(checkIngestToken(req({ headers: { 'x-ingest-token': 'super-secret-token-123' } }), ENV).ok === true, 'correct via header -> ok');
ok(checkIngestToken(req({ query: { token: 'super-secret-token-123' } }), ENV).ok === true, 'correct via query -> ok');

// 7. failOpenWhenUnset is ignored once the token IS set (still enforced).
ok(checkIngestToken(req({}), ENV, { failOpenWhenUnset: true }).status === 401, 'set + opt-in + no token -> still 401');

delete process.env[ENV];
console.log('ingest-auth.test.js: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
