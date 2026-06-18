/* ============================================================
   LifeOSAuth — Phase 10 single-user authentication (STAGED).

   Inert by default: with no session and the `auth:required:v1` flag OFF,
   token() returns null and nothing is gated, so the app behaves exactly as
   today (clients fall back to the publishable key). It only takes effect once
   the owner logs in (token() then returns the session JWT) and/or the required
   flag is turned on during the coordinated RLS cutover (docs/PHASE10-AUTH-RLS.md).

   API (window.LifeOSAuth):
     .ready(cb)        run cb once the initial session check resolves
     .session()        current session object or null
     .token()          access_token (sync, cached) or null  <- used by cloudsync
     .user()           user object or null
     .login(email,pw)  -> Promise<{error}>
     .logout()         -> Promise
     .required()       is auth enforced? (flag auth:required:v1)
     .setRequired(b)   toggle enforcement (owner cutover step 6)
     .onChange(cb)     subscribe to session changes
   ============================================================ */
(function () {
  'use strict';
  if (window.LifeOSAuth) return;

  var SUPA_URL = 'https://nwdyuiimfqhlqscnbqmq.supabase.co';
  var SUPA_KEY = 'sb_publishable_KFOU1sDCxRp8c1M3kSytHg_nuQWzfPT';
  var REQUIRED_KEY = 'auth:required:v1';

  var session = null;      // cached for sync token()
  var ready = false;
  var readyCbs = [];
  var changeCbs = [];

  function client() {
    if (!window.supabase) return null;          // CDN not loaded yet
    if (!window.__cloudClient) window.__cloudClient = window.supabase.createClient(SUPA_URL, SUPA_KEY);
    return window.__cloudClient;
  }

  function required() {
    try { return localStorage.getItem(REQUIRED_KEY) === '1'; } catch (e) { return false; }
  }

  function emitChange() { changeCbs.forEach(function (cb) { try { cb(session); } catch (e) {} }); }

  function setSession(s) {
    session = s || null;
    if (required()) renderGate();   // show/hide login overlay as needed
    emitChange();
  }

  var api = {
    ready: function (cb) { if (ready) cb(); else readyCbs.push(cb); },
    session: function () { return session; },
    token: function () { return session && session.access_token ? session.access_token : null; },
    user: function () { return session && session.user ? session.user : null; },
    required: required,
    setRequired: function (b) { try { localStorage.setItem(REQUIRED_KEY, b ? '1' : '0'); } catch (e) {} if (b) renderGate(); },
    onChange: function (cb) { changeCbs.push(cb); return function () { changeCbs = changeCbs.filter(function (c) { return c !== cb; }); }; },
    login: function (email, password) {
      var c = client();
      if (!c) return Promise.resolve({ error: { message: 'Auth unavailable (supabase-js not loaded)' } });
      return c.auth.signInWithPassword({ email: email, password: password })
        .then(function (r) { if (r.data && r.data.session) setSession(r.data.session); return { error: r.error }; });
    },
    logout: function () {
      var c = client();
      if (!c) return Promise.resolve();
      return c.auth.signOut().then(function () { setSession(null); });
    },
  };

  // ---- initial session resolve ----
  var initTries = 0;
  function init() {
    var c = client();
    if (!c) {
      // supabase CDN may still be loading; retry briefly before giving up.
      if (initTries++ < 20) { setTimeout(init, 150); return; }
      ready = true; readyCbs.forEach(function (cb) { cb(); }); readyCbs = []; return;
    }
    c.auth.getSession().then(function (r) {
      session = (r.data && r.data.session) || null;
      ready = true;
      readyCbs.forEach(function (cb) { try { cb(); } catch (e) {} }); readyCbs = [];
      if (required()) renderGate();
      emitChange();
    });
    c.auth.onAuthStateChange(function (_evt, s) { setSession(s); });
  }

  // ---- login overlay (only shown when required && no session) ----
  function renderGate() {
    var existing = document.getElementById('__authGate');
    if (session) { if (existing) existing.remove(); return; }
    if (existing || !document.body) return;
    var ov = document.createElement('div');
    ov.id = '__authGate';
    ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#0A0A0B;display:flex;align-items:center;justify-content:center;padding:24px;font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif';
    ov.innerHTML =
      '<form id="__authForm" style="width:100%;max-width:340px;display:flex;flex-direction:column;gap:12px">'
      + '<div style="font-size:22px;font-weight:700;color:#FAFAFA;margin-bottom:4px">Sign in</div>'
      + '<input id="__authEmail" type="email" autocomplete="username" placeholder="Email" aria-label="Email" required style="min-height:44px;padding:0 14px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#FAFAFA;font-size:16px">'
      + '<input id="__authPw" type="password" autocomplete="current-password" placeholder="Password" aria-label="Password" required style="min-height:44px;padding:0 14px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#FAFAFA;font-size:16px">'
      + '<button type="submit" style="min-height:44px;border:none;border-radius:10px;background:#0A84FF;color:#fff;font-size:16px;font-weight:600;cursor:pointer">Sign in</button>'
      + '<div id="__authErr" role="alert" style="color:#FF6B6B;font-size:13px;min-height:18px"></div>'
      + '</form>';
    document.body.appendChild(ov);
    ov.querySelector('#__authForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var err = ov.querySelector('#__authErr'); err.textContent = '';
      api.login(ov.querySelector('#__authEmail').value, ov.querySelector('#__authPw').value)
        .then(function (r) { if (r.error) err.textContent = r.error.message || 'Sign-in failed'; });
    });
    ov.querySelector('#__authEmail').focus();
  }

  window.LifeOSAuth = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
