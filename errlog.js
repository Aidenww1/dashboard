/* ============================================================
   LifeOSErrors — lightweight client error monitoring.
   Failures were silent: a broken AI call, sync, or render left
   no trace. This captures uncaught errors + unhandled promise
   rejections + failed resource loads into a 50-entry ring buffer
   in localStorage, surfaces a tap-to-view toast once per session,
   and exposes window.LifeOSErrors for inspection.

   No external service (no Sentry); purely local + visible.
   API: LifeOSErrors.all() / .clear() / .count() / .show()
   ============================================================ */
(function () {
  'use strict';
  if (window.__errlogLoaded) return;
  window.__errlogLoaded = true;

  var KEY = 'errors:log:v1', MAX = 50;

  function read() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function write(a) { try { localStorage.setItem(KEY, JSON.stringify(a.slice(-MAX))); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  function record(e) {
    var log = read();
    var last = log[log.length - 1];
    // collapse a burst of the same error (e.g. a render loop) into one entry
    if (last && last.msg === e.msg && last.src === e.src && (Date.now() - last.t) < 3000) {
      last.n = (last.n || 1) + 1; last.t = e.t; write(log); return;
    }
    log.push(e); write(log);
    try { console.warn('[LifeOSErrors]', e.msg, e.src || ''); } catch (_) {}
    flagSurface();
  }

  window.addEventListener('error', function (ev) {
    // Resource load failure (img/script/css) — ev.target is the element.
    if (ev.target && ev.target !== window && (ev.target.src || ev.target.href)) {
      record({ t: Date.now(), kind: 'resource', msg: 'Failed to load ' + (ev.target.src || ev.target.href), src: location.pathname });
      return;
    }
    record({
      t: Date.now(), kind: 'error', msg: String(ev.message || 'error'),
      src: (ev.filename || location.pathname) + (ev.lineno ? ':' + ev.lineno : ''),
      stack: ev.error && ev.error.stack ? String(ev.error.stack).slice(0, 600) : null,
    });
  }, true); // capture phase so resource errors are seen

  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev.reason;
    record({
      t: Date.now(), kind: 'promise',
      msg: r && r.message ? String(r.message) : String(r),
      src: location.pathname,
      stack: r && r.stack ? String(r.stack).slice(0, 600) : null,
    });
  });

  // ---- visible surface ----
  var shownToast = false;
  function flagSurface() {
    if (shownToast || !document.body) return;
    shownToast = true;
    try {
      var t = document.createElement('div');
      t.id = '__errToast';
      t.textContent = 'Something errored — tap for details';
      t.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#2a1416;border:1px solid rgba(248,113,113,.5);color:#F87171;padding:9px 16px;border-radius:20px;font-size:12px;font-weight:600;z-index:10001;cursor:pointer;box-shadow:0 8px 30px rgba(0,0,0,.5);font-family:-apple-system,BlinkMacSystemFont,sans-serif';
      t.onclick = function () { t.remove(); showOverlay(); };
      document.body.appendChild(t);
      setTimeout(function () {
        if (t.parentNode) { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 300); }
      }, 6000);
    } catch (e) {}
  }

  function showOverlay() {
    var log = read().slice().reverse();
    var ov = document.createElement('div');
    ov.id = '__errOverlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:10002;overflow:auto;padding:20px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#E8E6E0';
    var html = '<div style="max-width:680px;margin:0 auto">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'
      + '<strong style="font-size:16px">Error log (' + log.length + ')</strong>'
      + '<button id="__errClose" style="background:#333;color:#fff;border:none;padding:6px 14px;border-radius:8px;cursor:pointer;font:inherit">Close</button></div>';
    if (!log.length) html += '<p style="color:#888">No errors logged.</p>';
    log.forEach(function (e) {
      html += '<div style="background:#1a1a1c;border:1px solid #333;border-radius:8px;padding:10px;margin-bottom:8px;font-size:12px">'
        + '<div style="color:#F87171;font-weight:600">' + esc(e.msg) + (e.n > 1 ? ' (x' + e.n + ')' : '') + '</div>'
        + '<div style="color:#888;margin-top:3px">' + esc(e.kind || '') + ' · ' + esc(e.src || '') + ' · ' + new Date(e.t).toLocaleString() + '</div>'
        + (e.stack ? '<pre style="white-space:pre-wrap;color:#aaa;margin-top:6px;font-size:11px;font-family:monospace">' + esc(e.stack) + '</pre>' : '')
        + '</div>';
    });
    html += '<button id="__errClear" style="background:#3a2020;color:#F87171;border:1px solid #555;padding:8px 16px;border-radius:8px;cursor:pointer;margin-top:8px;font:inherit">Clear log</button></div>';
    ov.innerHTML = html;
    document.body.appendChild(ov);
    ov.querySelector('#__errClose').onclick = function () { ov.remove(); };
    ov.querySelector('#__errClear').onclick = function () { try { localStorage.removeItem(KEY); } catch (e) {} ov.remove(); };
  }

  window.LifeOSErrors = {
    all: read,
    clear: function () { try { localStorage.removeItem(KEY); } catch (e) {} },
    count: function () { return read().length; },
    show: showOverlay,
  };
})();
