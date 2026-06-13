/* ============================================================
   pwa.js — Phase 13 phone-replacement glue. Loaded on every page
   (directly or via the tabbar injection chain).
     - registers the service worker
     - captures the install prompt (window.installPWA)
     - LifeOSNotify(): action-button notifications via the SW
     - ?qa= home-screen quick actions
     - ?na= notification-action deep links + SW message routing
     - once-a-day morning briefing notification (guarded)
   ============================================================ */
(function () {
  'use strict';
  if (window.__pwaLoaded) return;
  window.__pwaLoaded = true;
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('/sw.js').catch(function () {});

  /* ---------- install prompt ---------- */
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    try { window.dispatchEvent(new CustomEvent('lifeos:installable')); } catch (_) {}
  });
  window.installPWA = function () {
    if (!deferredPrompt) return Promise.resolve(false);
    deferredPrompt.prompt();
    return deferredPrompt.userChoice.then(function (c) {
      deferredPrompt = null;
      return c && c.outcome === 'accepted';
    });
  };
  window.canInstallPWA = function () { return !!deferredPrompt; };

  /* ---------- notifications ---------- */
  window.requestNotifPermission = function () {
    if (!('Notification' in window)) return Promise.resolve('unsupported');
    if (Notification.permission === 'granted') return Promise.resolve('granted');
    return Notification.requestPermission();
  };

  // Show a notification with action buttons. The SW builds the buttons +
  // click routing from `kind`, so we just hand it the payload.
  window.LifeOSNotify = function (opts) {
    opts = opts || {};
    if (!('Notification' in window)) return Promise.resolve(false);
    var go = function () {
      if (Notification.permission !== 'granted') return false;
      return navigator.serviceWorker.ready.then(function (reg) {
        if (reg.active) { reg.active.postMessage({ type: 'show-notif', payload: opts }); return true; }
        return reg.showNotification(opts.title || 'Life OS', { body: opts.body || '', icon: '/favicon.ico', tag: opts.kind || 'lifeos', data: opts }).then(function () { return true; });
      });
    };
    if (Notification.permission === 'granted') return Promise.resolve(go());
    return Notification.requestPermission().then(function () { return go(); });
  };

  /* ---------- web push (server-sent, works when app is closed) ---------- */
  function urlB64ToUint8Array(base64) {
    var padding = '='.repeat((4 - base64.length % 4) % 4);
    var b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(b64);
    var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }
  // Subscribe this device to server push. Returns 'ok' | 'denied' | 'unconfigured' | 'unsupported' | 'error'.
  window.enablePush = function () {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return Promise.resolve('unsupported');
    return window.requestNotifPermission().then(function (perm) {
      if (perm !== 'granted') return 'denied';
      return fetch('/api/push-subscribe').then(function (r) { return r.json(); }).then(function (cfg) {
        if (!cfg || !cfg.publicKey) return 'unconfigured'; // VAPID keys not set in env yet
        return navigator.serviceWorker.ready.then(function (reg) {
          return reg.pushManager.getSubscription().then(function (existing) {
            if (existing) return existing;
            return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(cfg.publicKey) });
          });
        }).then(function (sub) {
          return fetch('/api/push-subscribe', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription: sub.toJSON() }),
          }).then(function (r) { return r.ok ? 'ok' : 'error'; });
        });
      });
    }).catch(function () { return 'error'; });
  };
  window.disablePush = function () {
    if (!('serviceWorker' in navigator)) return Promise.resolve(false);
    return navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription().then(function (sub) {
        if (!sub) return false;
        var endpoint = sub.endpoint;
        return sub.unsubscribe().then(function () {
          return fetch('/api/push-subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: endpoint }) }).then(function () { return true; });
        });
      });
    }).catch(function () { return false; });
  };

  // Legacy helper kept for existing callers.
  window.scheduleLocalNotif = function (title, body, delayMs) {
    if (Notification.permission !== 'granted') return;
    setTimeout(function () { window.LifeOSNotify({ title: title, body: body }); }, delayMs);
  };

  /* ---------- query-param actions ---------- */
  function stripParam(name) {
    try {
      var u = new URL(location.href);
      if (!u.searchParams.has(name)) return;
      u.searchParams.delete(name);
      u.searchParams.delete('id');
      history.replaceState(null, '', u.pathname + (u.search ? u.search : '') + u.hash);
    } catch (_) {}
  }

  // Wait for the command bar (command.js) to be ready, then act.
  function withCmd(fn, tries) {
    tries = tries == null ? 30 : tries;
    if (window.LifeOSCmd) return fn(window.LifeOSCmd);
    if (tries <= 0) return;
    setTimeout(function () { withCmd(fn, tries - 1); }, 120);
  }

  function handleQuickAction() {
    var qa;
    try { qa = new URL(location.href).searchParams.get('qa'); } catch (_) { return; }
    if (!qa) return;
    try { window.dispatchEvent(new CustomEvent('lifeos:qa', { detail: { action: qa } })); } catch (_) {}
    switch (qa) {
      case 'log-weight': withCmd(function (c) { c.open(); c.prefill('weight '); }); break;
      case 'log-meal':   withCmd(function (c) { c.open(); c.prefill(''); }); break;
      case 'ask':        withCmd(function (c) { c.ask(); }); break;
      case 'focus': {
        var b = document.getElementById('fcBtn');
        if (b) setTimeout(function () { b.click(); b.scrollIntoView({ block: 'center' }); }, 300);
        break;
      }
      case 'briefing': {
        var card = document.getElementById('briefingCard');
        if (card) setTimeout(function () { card.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 300);
        break;
      }
      // page-specific (orders/cleanup/photo/analyze) handled by qaScrollTo below
    }
    qaScrollTo(qa);
    stripParam('qa');
  }

  // For page-specific quick actions, scroll to + highlight the relevant section
  // (auto-opening the camera is blocked post-navigation: no user activation).
  var QA_SCROLL = {
    mail: { orders: '#sections', cleanup: '#cleanCard' },
    body: { photo: '#ppCamInput', analyze: '#ppCamInput' },
    skin: { photo: '#logPhoto' },
  };
  function qaScrollTo(qa) {
    var map = QA_SCROLL[pageKey()];
    if (!map || !map[qa]) return;
    var tries = 25;
    (function go() {
      var el = document.querySelector(map[qa]);
      if (!el) { if (--tries > 0) return setTimeout(go, 150); return; }
      var target = el.closest('.card, .section, section, label') || el;
      try { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {}
      try {
        var prev = target.style.boxShadow;
        target.style.transition = 'box-shadow .3s';
        target.style.boxShadow = '0 0 0 2px var(--accent, #E07658)';
        setTimeout(function () { target.style.boxShadow = prev; }, 1600);
      } catch (_) {}
    })();
  }

  function handleNotifAction() {
    var na, id;
    try { var sp = new URL(location.href).searchParams; na = sp.get('na'); id = sp.get('id'); } catch (_) { return; }
    if (!na) return;
    try { window.dispatchEvent(new CustomEvent('lifeos:na', { detail: { action: na, id: id } })); } catch (_) {}
    // central best-effort: mark a supplement taken from a notification button
    if (na === 'supp-taken' && window.LifeOS && LifeOS.log && id) {
      try { LifeOS.log({ type: 'supplement', name: id }); } catch (_) {}
    }
    stripParam('na');
  }

  // SW tells an already-open window to run a deep-link action.
  navigator.serviceWorker.addEventListener('message', function (e) {
    var m = e.data || {};
    if (m.type === 'notif-action' && m.url) {
      // same page? run the handlers; otherwise navigate.
      var here = location.pathname + location.search;
      if (m.url.split('?')[0] === location.pathname) {
        try {
          var u = new URL(m.url, location.origin);
          if (u.searchParams.get('na')) { history.replaceState(null, '', m.url); handleNotifAction(); }
          if (u.searchParams.get('qa')) { history.replaceState(null, '', m.url); handleQuickAction(); }
        } catch (_) {}
      } else {
        location.href = m.url;
      }
    }
  });

  /* ---------- shared-photo intake (backlog 1) ----------
     share.html stashed a photo in the share cache + recorded share:handoff:v1
     {dest,...} then sent the user here. Stage that file into this page's
     existing file input and fire 'change', so the page's own
     Analyze -> Report -> Log flow runs untouched. */
  function shareToast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#141416;border:1px solid rgba(107,227,164,.4);color:#6BE3A4;padding:10px 18px;border-radius:24px;font-size:13px;font-weight:700;z-index:9999;box-shadow:0 8px 30px rgba(0,0,0,.5)';
    document.body.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 300); }, 2600);
  }

  // current page -> { dest, input id, auto-analyzes on change?, what to say }
  var SHARE_MAP = {
    'nutrition': { dest: 'meal',       input: 'aiGalInput',    auto: true,  toast: 'Shared photo loading — estimating macros…' },
    'body':      { dest: 'progress',   input: 'ppGalInput',    auto: true,  toast: 'Shared photo loaded — analyzing…' },
    'skin':      { dest: 'skin',       input: 'logPhoto',      auto: false, toast: 'Shared photo loaded — tap Analyze/Log to continue.' },
    'finance':   { dest: 'receipt',    input: 'bizReceiptFile', auto: false, toast: 'Receipt loaded — tap Scan to read it.' },
    'health':    { dest: 'bloodwork',  input: 'labImageUpload', auto: false, toast: 'Lab image loaded — tap Analyze to read it.' },
  };

  window.LifeOSShare = {
    pending: function () { try { return JSON.parse(localStorage.getItem('share:handoff:v1')); } catch (_) { return null; } },
    clear: function () {
      try { localStorage.removeItem('share:handoff:v1'); } catch (_) {}
      if ('caches' in window) caches.open('share-target-v1').then(function (c) { c.delete('/__share/meta'); c.delete('/__share/file'); }).catch(function () {});
    },
    file: function () {
      if (!('caches' in window)) return Promise.resolve(null);
      return caches.open('share-target-v1').then(function (c) {
        return c.match('/__share/meta').then(function (mr) {
          if (!mr) return null;
          return mr.json().then(function (m) {
            return c.match('/__share/file').then(function (fr) {
              if (!fr) return null;
              return fr.blob().then(function (b) { return new File([b], m.fileName || 'shared.jpg', { type: m.fileType || b.type || 'image/jpeg' }); });
            });
          });
        });
      }).catch(function () { return null; });
    },
  };

  function pageKey() {
    var p = location.pathname.replace(/\/$/, '').replace(/\.html$/, '');
    return p.split('/').pop() || 'index';
  }

  function maybeShareIntake() {
    var cfg = SHARE_MAP[pageKey()];
    if (!cfg) return;
    var h = LifeOSShare.pending();
    if (!h || h.dest !== cfg.dest || !h.hasFile) return;
    // only consume a fresh handoff (arrived via share.html), then clear it
    var sharedParam = false;
    try { sharedParam = new URL(location.href).searchParams.get('shared') === '1'; } catch (_) {}
    if (!sharedParam && (Date.now() - (h.at || 0) > 120000)) return;
    LifeOSShare.file().then(function (f) {
      if (!f) { LifeOSShare.clear(); return; }
      var input = document.getElementById(cfg.input);
      if (!input) { return; } // page not ready / element renamed — leave handoff for a retry
      try {
        var dt = new DataTransfer();
        dt.items.add(f);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {
        // Safari/iOS forbids setting input.files — fall back to a hint
        shareToast('Shared photo ready — pick it from the file button (iOS limitation).');
        return;
      }
      try { (document.getElementById(cfg.input).closest('.card,.section,section') || input).scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {}
      shareToast(cfg.toast);
      LifeOSShare.clear();
      try { stripParam('shared'); } catch (_) {}
    });
  }

  /* ---------- daily morning briefing ---------- */
  // Fires once per day, on the first open after the configured wake time.
  // No server cron: honest "first open of the morning" delivery.
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function maybeBriefing() {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      if (localStorage.getItem('briefing:enabled:v1') !== '1') return;        // opt-in
      if (localStorage.getItem('briefing:last:v1') === todayKey()) return;     // once/day
      var wake = localStorage.getItem('briefing:waketime:v1') || '07:00';
      var parts = wake.split(':'); var wakeMin = (+parts[0]) * 60 + (+parts[1] || 0);
      var now = new Date(); if (now.getHours() * 60 + now.getMinutes() < wakeMin) return; // not yet morning
      if (!window.LifeOS || !LifeOS.briefing) return;
      var b = LifeOS.briefing();
      window.LifeOSNotify({ kind: 'briefing', title: 'Morning briefing', body: b.push, url: '/index.html?qa=briefing', requireInteraction: true });
      localStorage.setItem('briefing:last:v1', todayKey());
    } catch (_) {}
  }
  window.__maybeBriefing = maybeBriefing; // test hook

  window.__shareIntake = maybeShareIntake; // test hook

  function init() {
    handleQuickAction();
    handleNotifAction();
    // run after the page's own scripts have bound their file-input handlers
    if (document.readyState === 'complete') setTimeout(maybeShareIntake, 400);
    else window.addEventListener('load', function () { setTimeout(maybeShareIntake, 400); });
    setTimeout(maybeBriefing, 6000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
