/* ============================================================
   Life OS — shared UI behaviors (Phase 0, isolated).
   Overlays with focus management, toggles, steppers, segmented,
   toast + undo. One namespace: window.UI. No dependencies.
   ============================================================ */
(function () {
  'use strict';
  var FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';
  var overlayCount = 0;
  var overlayRootState = null;
  var overlaySequence = 0;
  var chartSequence = 0;

  function focusable(container) {
    return [].slice.call(container.querySelectorAll(FOCUSABLE)).filter(function (node) {
      return !node.hidden && node.getAttribute('aria-hidden') !== 'true' && node.getClientRects().length > 0;
    });
  }

  function trap(container, e) {
    if (e.key !== 'Tab') return;
    var f = focusable(container);
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // overlay: builds backdrop + panel, returns close(). Restores focus.
  function overlay(panel, opts) {
    opts = opts || {};
    var last = document.activeElement;
    var app = document.querySelector('.app');
    if (!overlayCount) overlayRootState = app ? app.getAttribute('aria-hidden') : null;
    var backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    overlayCount += 1;
    document.body.classList.add('overlay-open');
    if (app) app.setAttribute('aria-hidden', 'true');
    var closed = false;
    function close() {
      if (closed) return; closed = true;
      backdrop.classList.remove('open'); panel.classList.remove('open');
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { backdrop.remove(); panel.remove(); }, 240);
      overlayCount = Math.max(0, overlayCount - 1);
      if (!overlayCount) {
        document.body.classList.remove('overlay-open');
        if (app) {
          if (overlayRootState == null) app.removeAttribute('aria-hidden');
          else app.setAttribute('aria-hidden', overlayRootState);
        }
        overlayRootState = null;
      }
      if (last && last.focus) last.focus();
      opts.onClose && opts.onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); else trap(panel, e); }
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(function () {
      backdrop.classList.add('open'); panel.classList.add('open');
      var initial = opts.initialFocus ? panel.querySelector(opts.initialFocus) : panel.querySelector('[autofocus], ' + FOCUSABLE);
      if (initial && initial.focus) initial.focus();
      else { panel.setAttribute('tabindex', '-1'); panel.focus(); }
    });
    return close;
  }

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var UI = {
    sheet: function (opts) {
      opts = opts || {};
      var s = el('div', 'sheet');
      var titleId = 'ui-sheet-title-' + (++overlaySequence);
      s.setAttribute('role', 'dialog'); s.setAttribute('aria-modal', 'true');
      s.setAttribute('aria-labelledby', titleId);
      s.innerHTML = '<div class="sheet-grab"></div>'
        + '<div class="dialog-head"><div class="t-h2" id="' + titleId + '">' + esc(opts.title || 'Details') + '</div><button class="dialog-close" data-close aria-label="Close sheet">&times;</button></div>'
        + (opts.body || '<div class="empty"><span class="empty-title">No content provided</span></div>')
        + '<button class="btn btn-primary btn-block" data-primary style="margin-top:var(--s4)">' + esc(opts.primaryLabel || 'Close') + '</button>';
      var close = overlay(s, { onClose: opts.onClose, initialFocus: opts.initialFocus });
      s.querySelector('[data-close]').addEventListener('click', close);
      s.querySelector('[data-primary]').addEventListener('click', function () {
        if (!opts.onSubmit || opts.onSubmit(s) !== false) close();
      });
      return close;
    },
    dialog: function (opts) {
      opts = opts || {};
      var d = el('div', 'dialog');
      var titleId = 'ui-dialog-title-' + (++overlaySequence);
      d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', titleId);
      d.innerHTML = '<div class="dialog-head"><div class="t-h2" id="' + titleId + '">' + esc(opts.title || 'Details') + '</div><button class="dialog-close" data-close aria-label="Close dialog">&times;</button></div>'
        + '<div class="dialog-body">' + (opts.body || 'Review the information below.') + '</div>'
        + '<div class="dialog-actions"><button class="btn btn-ghost" data-x>' + esc(opts.cancelLabel || 'Cancel') + '</button><button class="btn btn-primary" data-confirm>' + esc(opts.confirmLabel || 'Save') + '</button></div>';
      var close = overlay(d, { onClose: opts.onClose, initialFocus: opts.initialFocus });
      d.querySelector('[data-x]').addEventListener('click', close);
      d.querySelector('[data-close]').addEventListener('click', close);
      d.querySelector('[data-confirm]').addEventListener('click', function () {
        if (!opts.onConfirm || opts.onConfirm(d) !== false) close();
      });
      return close;
    },
    confirm: function (opts) {
      opts = opts || {};
      var d = el('div', 'dialog');
      var titleId = 'ui-confirm-title-' + (++overlaySequence);
      d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', titleId); d.setAttribute('aria-label', opts.title || 'Delete this entry?');
      d.innerHTML = '<div class="dialog-head"><div class="t-h2" id="' + titleId + '">' + esc(opts.title || 'Delete this entry?') + '</div><button class="dialog-close" data-close aria-label="Close confirmation">&times;</button></div>'
        + '<div class="dialog-body">' + esc(opts.body || 'This action requires confirmation.') + '</div>'
        + '<div class="dialog-actions"><button class="btn btn-ghost" data-x>' + esc(opts.cancelLabel || 'Cancel') + '</button><button class="btn btn-danger" data-confirm>' + esc(opts.confirmLabel || 'Delete') + '</button></div>';
      var close = overlay(d);
      d.querySelector('[data-x]').addEventListener('click', close);
      d.querySelector('[data-close]').addEventListener('click', close);
      d.querySelector('[data-confirm]').addEventListener('click', function () { close(); if (opts.onConfirm) opts.onConfirm(); });
      return close;
    },
    toast: function (msg, opts) {
      opts = opts || {};
      var host = document.querySelector('.toast-host');
      if (!host) { host = el('div', 'toast-host'); document.body.appendChild(host); }
      var t = el('div', 'toast');
      t.setAttribute('role', opts.type === 'error' ? 'alert' : 'status');
      t.setAttribute('aria-live', opts.type === 'error' ? 'assertive' : 'polite');
      var label = el('span'); label.textContent = String(msg == null ? '' : msg); t.appendChild(label);
      var dismissed = false;
      var dismiss = function () { if (dismissed) return; dismissed = true; t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 240); };
      if (opts.action) {
        var b = el('button'); b.textContent = opts.action;
        b.addEventListener('click', function () { opts.onAction && opts.onAction(); dismiss(); });
        t.appendChild(b);
      }
      host.appendChild(t);
      setTimeout(dismiss, opts.duration || 4000);
      return dismiss;
    },
    undo: function (opts) {
      opts = opts || {};
      var settled = false, duration = opts.duration || 5000;
      function settle(kind) {
        if (settled) return false;
        settled = true;
        if (kind === 'undo' && opts.onUndo) opts.onUndo();
        if (kind === 'commit' && opts.onCommit) opts.onCommit();
        return true;
      }
      UI.toast(opts.message || 'Deleted', { action: opts.onUndo ? (opts.actionLabel || 'Undo') : null, onAction: function () { settle('undo'); }, duration: duration });
      var timer = setTimeout(function () { settle('commit'); }, duration + 200);
      return {
        undo: function () { clearTimeout(timer); return settle('undo'); },
        commit: function () { clearTimeout(timer); return settle('commit'); },
      };

    },
    // action menu anchored to a trigger element. items: [{label, danger, onClick}] or 'hr'.
    menu: function (anchor, items) {
      var m = el('div', 'menu');
      m.setAttribute('role', 'menu');
      items.forEach(function (it) {
        if (it === 'hr') { m.appendChild(document.createElement('hr')); return; }
        var b = el('button', it.danger ? 'danger' : null);
        b.textContent = String(it.label == null ? '' : it.label);
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
      function onKey(e) {
        var buttons = [].slice.call(m.querySelectorAll('[role="menuitem"]'));
        var index = buttons.indexOf(document.activeElement);
        var next = null;
        if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
        if (e.key === 'ArrowDown') next = buttons[(index + 1 + buttons.length) % buttons.length];
        if (e.key === 'ArrowUp') next = buttons[(index - 1 + buttons.length) % buttons.length];
        if (e.key === 'Home') next = buttons[0];
        if (e.key === 'End') next = buttons[buttons.length - 1];
        if (next) { e.preventDefault(); next.focus(); }
      }
      function onOut(e) { if (!m.contains(e.target) && e.target !== anchor) close(); }
      requestAnimationFrame(function () {
        m.classList.add('open');
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('click', onOut, true);
        var f = m.querySelector('button'); if (f) f.focus();
      });
      return close;
    },

    chart: function (container, opts) {
      opts = opts || {};
      if (typeof container === 'string') container = document.querySelector(container);
      if (!container) throw new Error('UI.chart requires a container');
      var data = Array.isArray(opts.data) ? opts.data.filter(function (point) { return point && isFinite(Number(point.value)); }) : [];
      container.innerHTML = '';
      container.classList.add('chart-frame');
      if (!data.length) {
        var empty = el('div', 'empty');
        empty.innerHTML = '<span class="empty-title">No chart data</span><span>Log data to build this trend.</span>';
        container.appendChild(empty);
        return { points: 0 };
      }

      chartSequence += 1;
      var titleId = 'ui-chart-title-' + chartSequence;
      var summaryId = 'ui-chart-summary-' + chartSequence;
      var width = 640, height = 180, padX = 18, padY = 18;
      var values = data.map(function (point) { return Number(point.value); });
      var min = opts.min == null ? Math.min.apply(Math, values) : Number(opts.min);
      var max = opts.max == null ? Math.max.apply(Math, values) : Number(opts.max);
      if (max === min) { max += 1; min -= 1; }
      var ns = 'http://www.w3.org/2000/svg';
      var svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-labelledby', titleId + ' ' + summaryId);
      var title = document.createElementNS(ns, 'title'); title.id = titleId; title.textContent = opts.title || 'Trend chart'; svg.appendChild(title);
      [0.25, 0.5, 0.75].forEach(function (ratio) {
        var line = document.createElementNS(ns, 'line'); var y = padY + (height - padY * 2) * ratio;
        line.setAttribute('x1', padX); line.setAttribute('x2', width - padX); line.setAttribute('y1', y); line.setAttribute('y2', y); line.setAttribute('stroke', 'var(--chart-grid)');
        svg.appendChild(line);
      });
      function xAt(index) { return data.length === 1 ? width / 2 : padX + index / (data.length - 1) * (width - padX * 2); }
      function yAt(value) { return height - padY - (value - min) / (max - min) * (height - padY * 2); }
      var color = opts.color || 'var(--chart-1)';
      if (opts.type === 'bar') {
        var slot = (width - padX * 2) / data.length;
        data.forEach(function (point, index) {
          var rect = document.createElementNS(ns, 'rect'); var y = yAt(Number(point.value));
          rect.setAttribute('x', padX + index * slot + slot * 0.18); rect.setAttribute('y', y); rect.setAttribute('width', slot * 0.64); rect.setAttribute('height', Math.max(1, height - padY - y)); rect.setAttribute('rx', '3'); rect.setAttribute('fill', color);
          var pointTitle = document.createElementNS(ns, 'title'); pointTitle.textContent = String(point.label || index + 1) + ': ' + point.value; rect.appendChild(pointTitle); svg.appendChild(rect);
        });
      } else {
        var path = document.createElementNS(ns, 'polyline');
        path.setAttribute('points', data.map(function (point, index) { return xAt(index) + ',' + yAt(Number(point.value)); }).join(' '));
        path.setAttribute('fill', 'none'); path.setAttribute('stroke', color); path.setAttribute('stroke-width', '3'); path.setAttribute('vector-effect', 'non-scaling-stroke');
        svg.appendChild(path);
        data.forEach(function (point, index) {
          var circle = document.createElementNS(ns, 'circle'); circle.setAttribute('cx', xAt(index)); circle.setAttribute('cy', yAt(Number(point.value))); circle.setAttribute('r', '3'); circle.setAttribute('fill', color);
          var pointTitle = document.createElementNS(ns, 'title'); pointTitle.textContent = String(point.label || index + 1) + ': ' + point.value; circle.appendChild(pointTitle); svg.appendChild(circle);
        });
      }
      container.appendChild(svg);

      var summary = el('p', 'chart-summary'); summary.id = summaryId;
      summary.textContent = opts.summary || (String(opts.title || 'Trend') + ' ranges from ' + min + ' to ' + max + ' across ' + data.length + ' observations.');
      container.appendChild(summary);
      var table = el('table', 'chart-table');
      var caption = document.createElement('caption'); caption.textContent = (opts.title || 'Trend') + ' data'; table.appendChild(caption);
      var body = document.createElement('tbody');
      data.forEach(function (point, index) { var row = document.createElement('tr'); var label = document.createElement('th'); var value = document.createElement('td'); label.scope = 'row'; label.textContent = String(point.label || index + 1); value.textContent = String(point.value); row.appendChild(label); row.appendChild(value); body.appendChild(row); });
      table.appendChild(body); container.appendChild(table);
      return { points: data.length, min: min, max: max };
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
      root.querySelectorAll('.segmented[role="tablist"], .domain-tabs[role="tablist"]').forEach(function (g) {
        if (g.__b) return; g.__b = 1;
        var tabs = [].slice.call(g.querySelectorAll('[role="tab"]'));
        function activate(tab, focus) {
          tabs.forEach(function (x) { x.setAttribute('aria-selected', 'false'); x.setAttribute('tabindex', '-1'); });
          tab.setAttribute('aria-selected', 'true'); tab.setAttribute('tabindex', '0');
          if (focus) tab.focus();
          g.dispatchEvent(new CustomEvent('ui:tabchange', { bubbles: true, detail: { tab: tab } }));
        }
        tabs.forEach(function (tab, i) {
          tab.setAttribute('tabindex', tab.getAttribute('aria-selected') === 'true' ? '0' : '-1');
          tab.addEventListener('click', function () { activate(tab, false); });
          tab.addEventListener('keydown', function (e) {
            var next = null;
            if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
            if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
            if (e.key === 'Home') next = tabs[0];
            if (e.key === 'End') next = tabs[tabs.length - 1];
            if (!next) return;
            e.preventDefault(); activate(next, true);
          });
        });
      });
    },
  };

  window.UI = UI;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { UI.bind(); });
  else UI.bind();
})();
