/* ============================================================
   Life OS — shared UI behaviors (Phase 0, isolated).
   Overlays with focus management, toggles, steppers, segmented,
   toast + undo. One namespace: window.UI. No dependencies.
   ============================================================ */
(function () {
  'use strict';
  var FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';

  function trap(container, e) {
    if (e.key !== 'Tab') return;
    var f = container.querySelectorAll(FOCUSABLE);
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // overlay: builds backdrop + panel, returns close(). Restores focus.
  function overlay(panel, opts) {
    opts = opts || {};
    var last = document.activeElement;
    var backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    var closed = false;
    function close() {
      if (closed) return; closed = true;
      backdrop.classList.remove('open'); panel.classList.remove('open');
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { backdrop.remove(); panel.remove(); }, 240);
      if (last && last.focus) last.focus();
      opts.onClose && opts.onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); else trap(panel, e); }
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(function () { backdrop.classList.add('open'); panel.classList.add('open'); });
    var f = panel.querySelector(FOCUSABLE); if (f) f.focus();
    return close;
  }

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  var UI = {
    sheet: function (opts) {
      opts = opts || {};
      var s = el('div', 'sheet');
      s.setAttribute('role', 'dialog'); s.setAttribute('aria-modal', 'true');
      s.setAttribute('aria-label', opts.title || 'Sheet');
      s.innerHTML = '<div class="sheet-grab"></div>'
        + '<div class="t-h2" style="margin-bottom:var(--s3)">' + (opts.title || 'Log meal') + '</div>'
        + (opts.body || '<div class="field"><span class="label">Meal name</span><input class="input" placeholder="e.g. Salmon bowl"></div>'
          + '<div class="field" style="margin-top:var(--s3)"><span class="label">Calories</span><input class="input num" type="number" placeholder="520"></div>')
        + '<button class="btn btn-primary btn-block" style="margin-top:var(--s4)">Save</button>';
      var close = overlay(s);
      s.querySelector('.btn-primary').addEventListener('click', close);
      return close;
    },
    dialog: function (opts) {
      opts = opts || {};
      var d = el('div', 'dialog');
      d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', opts.title || 'Dialog');
      d.innerHTML = '<div class="t-h2">' + (opts.title || 'Edit target') + '</div>'
        + '<div class="t-2" style="margin:var(--s2) 0 var(--s4)">' + (opts.body || 'Set your daily calorie target.') + '</div>'
        + '<div class="field"><input class="input num" type="number" value="2600"></div>'
        + '<div class="demo-row" style="justify-content:flex-end;margin-top:var(--s4)"><button class="btn btn-ghost" data-x>Cancel</button><button class="btn btn-primary" data-x>Save</button></div>';
      var close = overlay(d);
      d.querySelectorAll('[data-x]').forEach(function (b) { b.addEventListener('click', close); });
      return close;
    },
    confirm: function (opts) {
      opts = opts || {};
      var d = el('div', 'dialog');
      d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', opts.title || 'Confirm');
      d.innerHTML = '<div class="t-h2">' + (opts.title || 'Delete this entry?') + '</div>'
        + '<div class="t-2" style="margin:var(--s2) 0 var(--s4)">' + (opts.body || 'This cannot be undone.') + '</div>'
        + '<div class="demo-row" style="justify-content:flex-end"><button class="btn btn-ghost" data-x>' + (opts.cancelLabel || 'Cancel') + '</button><button class="btn btn-danger" data-confirm>' + (opts.confirmLabel || 'Delete') + '</button></div>';
      var close = overlay(d);
      d.querySelector('[data-x]').addEventListener('click', close);
      d.querySelector('[data-confirm]').addEventListener('click', function () { close(); if (opts.onConfirm) opts.onConfirm(); });
      return close;
    },
    toast: function (msg, opts) {
      opts = opts || {};
      var host = document.querySelector('.toast-host');
      if (!host) { host = el('div', 'toast-host'); document.body.appendChild(host); }
      var t = el('div', 'toast', '<span>' + msg + '</span>');
      var dismiss = function () { t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 240); };
      if (opts.action) {
        var b = el('button', null, opts.action);
        b.addEventListener('click', function () { opts.onAction && opts.onAction(); dismiss(); });
        t.appendChild(b);
      }
      host.appendChild(t);
      setTimeout(dismiss, opts.duration || 4000);
      return dismiss;
    },
    undo: function () {
      var undone = false;
      UI.toast('Deleted', { action: 'Undo', onAction: function () { undone = true; }, duration: 5000 });
      setTimeout(function () { if (!undone) { /* commit delete */ } }, 5200);
    },

    // action menu anchored to a trigger element. items: [{label, danger, onClick}] or 'hr'.
    menu: function (anchor, items) {
      var m = el('div', 'menu');
      m.setAttribute('role', 'menu');
      items.forEach(function (it) {
        if (it === 'hr') { m.appendChild(document.createElement('hr')); return; }
        var b = el('button', it.danger ? 'danger' : null, it.label);
        b.setAttribute('role', 'menuitem');
        b.addEventListener('click', function () { close(); it.onClick && it.onClick(); });
        m.appendChild(b);
      });
      document.body.appendChild(m);
      var r = anchor.getBoundingClientRect();
      m.style.left = Math.min(r.left, window.innerWidth - m.offsetWidth - 8) + 'px';
      m.style.top = (r.bottom + 6 + window.scrollY) + 'px';
      var closed = false;
      function close() {
        if (closed) return; closed = true;
        m.classList.remove('open');
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('click', onOut, true);
        setTimeout(function () { m.remove(); }, 160);
        if (anchor.focus) anchor.focus();
      }
      function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
      function onOut(e) { if (!m.contains(e.target) && e.target !== anchor) close(); }
      requestAnimationFrame(function () {
        m.classList.add('open');
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('click', onOut, true);
        var f = m.querySelector('button'); if (f) f.focus();
      });
      return close;
    },

    // wire declarative controls (idempotent)
    bind: function (root) {
      root = root || document;
      root.querySelectorAll('[data-toggle]').forEach(function (t) {
        if (t.__b) return; t.__b = 1;
        t.addEventListener('click', function () {
          var on = t.getAttribute('aria-checked') === 'true';
          t.setAttribute('aria-checked', on ? 'false' : 'true');
        });
      });
      root.querySelectorAll('.stepper').forEach(function (s) {
        if (s.__b) return; s.__b = 1;
        var val = s.querySelector('.val');
        s.querySelectorAll('[data-step]').forEach(function (b) {
          b.addEventListener('click', function () {
            val.textContent = (parseInt(val.textContent, 10) || 0) + parseInt(b.dataset.step, 10) * 50;
          });
        });
      });
      root.querySelectorAll('.segmented[role="tablist"]').forEach(function (g) {
        if (g.__b) return; g.__b = 1;
        var tabs = [].slice.call(g.querySelectorAll('[role="tab"]'));
        tabs.forEach(function (tab, i) {
          tab.addEventListener('click', function () {
            tabs.forEach(function (x) { x.setAttribute('aria-selected', 'false'); });
            tab.setAttribute('aria-selected', 'true');
          });
          tab.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowRight' && tabs[i + 1]) tabs[i + 1].focus();
            if (e.key === 'ArrowLeft' && tabs[i - 1]) tabs[i - 1].focus();
          });
        });
      });
    },
  };

  window.UI = UI;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { UI.bind(); });
  else UI.bind();
})();
