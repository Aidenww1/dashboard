// Unit tests for auth.js (Phase 10 staged auth) — the offline-testable logic:
// session caching, sync token(), required() flag, login success/failure, logout.
// The real RLS/login round-trip is owner-gated (live Supabase), but this pins the
// client-side contract cloudsync depends on: token() must be null pre-login (so we
// fall back to the publishable key) and the access_token once signed in.

// --- shims (before requiring auth.js) ---
const store = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; },
};
global.document = { readyState: 'complete', getElementById: function () { return null; }, body: null, addEventListener: function () {} };

// Mock supabase client. currentSession is what getSession resolves to; signIn
// flips it. onAuthStateChange callback captured so we can simulate token refresh.
let currentSession = null;
let stateCb = null;
const goodSession = { access_token: 'jwt-OWNER', user: { email: 'owner@example.com' } };
global.window = global;
global.window.supabase = {
  createClient: function () {
    return {
      auth: {
        getSession: function () { return Promise.resolve({ data: { session: currentSession } }); },
        onAuthStateChange: function (cb) { stateCb = cb; return { data: { subscription: {} } }; },
        signInWithPassword: function (c) {
          if (c.password === 'correct') { currentSession = goodSession; return Promise.resolve({ data: { session: goodSession }, error: null }); }
          return Promise.resolve({ data: { session: null }, error: { message: 'Invalid login credentials' } });
        },
        signOut: function () { currentSession = null; return Promise.resolve({ error: null }); },
      },
    };
  },
};

require('../auth.js');
const Auth = global.window.LifeOSAuth;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; return; } fail++; console.error('FAIL: ' + msg); }
const tick = () => new Promise(function (r) { setTimeout(r, 0); });

(async function main() {
  ok(typeof Auth === 'object', 'window.LifeOSAuth exposed');
  ok(typeof Auth.token === 'function', 'token() exists');

  await tick(); // let init()/getSession resolve

  // 1. No session -> token null (cloudsync falls back to publishable key).
  ok(Auth.token() === null, 'token() is null with no session');
  ok(Auth.session() === null, 'session() is null with no session');
  ok(Auth.required() === false, 'required() defaults false (inert)');

  // 2. required flag toggles via storage.
  Auth.setRequired(true);
  ok(Auth.required() === true, 'setRequired(true) enables enforcement');
  Auth.setRequired(false);
  ok(Auth.required() === false, 'setRequired(false) disables enforcement');

  // 3. Wrong password -> error surfaced, still no token.
  let r = await Auth.login('owner@example.com', 'wrong');
  ok(r.error && /Invalid/.test(r.error.message), 'bad login returns error');
  ok(Auth.token() === null, 'token() still null after failed login');

  // 4. Correct password -> session cached, token is the access_token.
  r = await Auth.login('owner@example.com', 'correct');
  ok(!r.error, 'good login has no error');
  ok(Auth.token() === 'jwt-OWNER', 'token() returns the access_token after login');
  ok(Auth.user() && Auth.user().email === 'owner@example.com', 'user() returns the signed-in user');

  // 5. onAuthStateChange (token refresh) updates the cached session.
  if (stateCb) { stateCb('TOKEN_REFRESHED', { access_token: 'jwt-REFRESHED', user: goodSession.user }); }
  ok(Auth.token() === 'jwt-REFRESHED', 'token() reflects a refreshed session');

  // 6. logout clears the session.
  await Auth.logout();
  ok(Auth.token() === null, 'token() null after logout');

  console.log('auth.test.js: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
})();
