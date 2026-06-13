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
      // page-specific (orders/cleanup/photo/analyze): the target page listens
      // for the lifeos:qa event; landing on the page is the baseline.
    }
    stripParam('qa');
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

  function init() {
    handleQuickAction();
    handleNotifAction();
    setTimeout(maybeBriefing, 6000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
