/* ============================================================
   ds.js — behaviour for the design system (APPLE_PLAN Phase 0).
   Styles live in design.css; this is only interaction:
   sheets, segmented control, swipe rows, steppers, toast+undo,
   large-title collapse. Vanilla, no deps. Exposes window.DS.

   Auto-wires anything declarative on DOMContentLoaded:
     [data-ds-nav]        -> large-title collapse on scroll
     .ds-segmented        -> tab behaviour + sliding thumb
     .ds-stepper          -> - / + with min/max/step
     .ds-swipe            -> drag to reveal trailing/leading actions
   Imperative API for the rest (sheets, toasts).
   ============================================================ */
(function () {
  'use strict';
  if (window.DS) return;

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Toast + Undo --------------------------------------------------------
  function toastHost() {
    var h = document.querySelector('.ds-toast-host');
    if (!h) { h = document.createElement('div'); h.className = 'ds-toast-host'; document.body.appendChild(h); }
    return h;
  }
  // DS.toast(message, { action, onAction, duration }) -> dismiss()
  function toast(message, opts) {
    opts = opts || {};
    var el = document.createElement('div');
    el.className = 'ds-toast';
    el.setAttribute('role', 'status');
    var msg = document.createElement('span'); msg.className = 'msg'; msg.textContent = message;
    el.appendChild(msg);
    var timer;
    function dismiss() {
      if (!el.parentNode) return;
      clearTimeout(timer); el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 200);
    }
    if (opts.action) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = opts.action;
      b.addEventListener('click', function () { try { opts.onAction && opts.onAction(); } finally { dismiss(); } });
      el.appendChild(b);
    }
    toastHost().appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    timer = setTimeout(dismiss, opts.duration || (opts.action ? 5000 : 2800));
    return dismiss;
  }
  // Convenience: delete-with-undo. onCommit runs only if not undone.
  function deleteWithUndo(message, onCommit, onUndo) {
    var undone = false;
    var dismiss = toast(message, {
      action: 'Undo',
      onAction: function () { undone = true; onUndo && onUndo(); },
      duration: 5000,
    });
    setTimeout(function () { if (!undone) onCommit && onCommit(); }, 5200);
    return dismiss;
  }

  // ---- Focus trap (shared by sheets) --------------------------------------
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  function trap(container, e) {
    if (e.key !== 'Tab') return;
    var f = container.querySelectorAll(FOCUSABLE);
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // ---- Sheets --------------------------------------------------------------
  // DS.sheet(content, { title, variant, onClose }) -> { el, close }
  // content: HTMLElement | html string. variant: 'form'|'action'|'full'.
  function sheet(content, opts) {
    opts = opts || {};
    var backdrop = document.createElement('div'); backdrop.className = 'ds-sheet-backdrop';
    var el = document.createElement('div');
    el.className = 'ds-sheet' + (opts.variant === 'full' ? ' ds-sheet--full' : '');
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    var grab = document.createElement('div'); grab.className = 'ds-sheet-grab'; el.appendChild(grab);
    if (opts.title) {
      var t = document.createElement('div'); t.className = 'ds-sheet-title'; t.textContent = opts.title;
      el.setAttribute('aria-label', opts.title); el.appendChild(t);
    }
    var body = document.createElement('div');
    if (typeof content === 'string') body.innerHTML = content; else body.appendChild(content);
    el.appendChild(body);
    document.body.appendChild(backdrop); document.body.appendChild(el);

    var lastFocus = document.activeElement;
    var closed = false;
    function close() {
      if (closed) return; closed = true;
      backdrop.classList.remove('open'); el.classList.remove('open');
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { backdrop.remove(); el.remove(); }, 280);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
      opts.onClose && opts.onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); else trap(el, e); }
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', onKey);

    // swipe-to-dismiss via the grab handle / drag down on the sheet
    var startY = null, dy = 0;
    function down(e) { startY = (e.touches ? e.touches[0].clientY : e.clientY); el.classList.add('dragging'); }
    function move(e) {
      if (startY == null) return;
      dy = Math.max(0, (e.touches ? e.touches[0].clientY : e.clientY) - startY);
      el.style.transform = 'translateY(' + dy + 'px)';
    }
    function up() {
      if (startY == null) return;
      el.classList.remove('dragging'); el.style.transform = '';
      if (dy > 100) close();
      startY = null; dy = 0;
    }
    grab.addEventListener('touchstart', down, { passive: true });
    grab.addEventListener('touchmove', move, { passive: true });
    grab.addEventListener('touchend', up);
    grab.addEventListener('mousedown', function (e) {
      down(e);
      function mm(ev) { move(ev); } function mu() { up(); document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); }
      document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu);
    });

    requestAnimationFrame(function () { backdrop.classList.add('open'); el.classList.add('open'); });
    var f = el.querySelector(FOCUSABLE); if (f) f.focus();
    return { el: el, body: body, close: close };
  }
  // DS.actionSheet([{ label, role, onTap }], { title }) — Apple choice sheet.
  function actionSheet(choices, opts) {
    opts = opts || {};
    var wrap = document.createElement('div'); wrap.className = 'ds-actionsheet';
    var ref;
    (choices || []).forEach(function (c) {
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'btn-block ' + (c.role === 'destructive' ? 'btn-destructive' : c.role === 'primary' ? 'btn-filled' : 'btn-tinted');
      b.textContent = c.label;
      b.addEventListener('click', function () { ref.close(); c.onTap && c.onTap(); });
      wrap.appendChild(b);
    });
    var cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn-plain btn-block'; cancel.textContent = 'Cancel';
    cancel.addEventListener('click', function () { ref.close(); });
    wrap.appendChild(cancel);
    ref = sheet(wrap, { title: opts.title, variant: 'action' });
    return ref;
  }

  // ---- Segmented control ---------------------------------------------------
  // <div class="ds-segmented"><button>A</button>...</div>
  // DS.segmented(el, onChange) or auto-wired. value via data-value or text.
  function segmented(el, onChange) {
    var btns = [].slice.call(el.querySelectorAll('button'));
    if (!btns.length) return;
    var thumb = el.querySelector('.thumb');
    if (!thumb) { thumb = document.createElement('span'); thumb.className = 'thumb'; el.appendChild(thumb); }
    function place(b) {
      thumb.style.width = b.offsetWidth + 'px';
      thumb.style.transform = 'translateX(' + (b.offsetLeft - el.clientLeft - parseFloat(getComputedStyle(el).paddingLeft || 0)) + 'px)';
    }
    function select(b, fire) {
      btns.forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
      place(b);
      if (fire) (onChange || el._onChange || function () {})(b.dataset.value || b.textContent.trim(), b);
    }
    el.setAttribute('role', 'tablist');
    btns.forEach(function (b) {
      b.setAttribute('role', 'tab');
      if (!b.hasAttribute('aria-selected')) b.setAttribute('aria-selected', 'false');
      b.addEventListener('click', function () { select(b, true); });
      b.addEventListener('keydown', function (e) {
        var i = btns.indexOf(b);
        if (e.key === 'ArrowRight' && btns[i + 1]) { btns[i + 1].focus(); select(btns[i + 1], true); }
        if (e.key === 'ArrowLeft' && btns[i - 1]) { btns[i - 1].focus(); select(btns[i - 1], true); }
      });
    });
    var cur = el.querySelector('[aria-selected="true"]') || btns[0];
    // Place synchronously now (layout is usually ready post-DOMContentLoaded),
    // then re-place once the Google-Fonts swap changes button widths and on
    // resize. Not rAF-gated so it works even when the page never paints.
    function replace() { var a = el.querySelector('[aria-selected="true"]'); if (a) place(a); }
    select(cur, false);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(replace);
    window.addEventListener('resize', replace);
    el._select = function (val) { var b = btns.filter(function (x) { return (x.dataset.value || x.textContent.trim()) === val; })[0]; if (b) select(b, true); };
    if (onChange) el._onChange = onChange;
    return el;
  }

  // ---- Stepper -------------------------------------------------------------
  // <div class="ds-stepper" data-min data-max data-step><button>-</button><span class="val">0</span><button>+</button></div>
  function stepper(el, onChange) {
    var minus = el.querySelector('button:first-of-type');
    var plus = el.querySelector('button:last-of-type');
    var val = el.querySelector('.val');
    var min = el.dataset.min !== undefined ? +el.dataset.min : -Infinity;
    var max = el.dataset.max !== undefined ? +el.dataset.max : Infinity;
    var step = +el.dataset.step || 1;
    function get() { return +val.textContent || 0; }
    function set(n, fire) {
      n = Math.min(max, Math.max(min, n));
      val.textContent = n;
      minus.disabled = n <= min; plus.disabled = n >= max;
      if (fire) (onChange || el._onChange || function () {})(n);
    }
    minus.addEventListener('click', function () { set(get() - step, true); });
    plus.addEventListener('click', function () { set(get() + step, true); });
    set(get(), false);
    el._set = function (n) { set(n, false); };
    el._get = get;
    if (onChange) el._onChange = onChange;
    return el;
  }

  // ---- Swipe row actions ---------------------------------------------------
  // <div class="ds-swipe"><div class="ds-swipe-actions"><button class="ds-swipe-action delete">Delete</button></div>
  //   <div class="ds-swipe-content"> ...row... </div></div>
  function swipe(el) {
    var content = el.querySelector('.ds-swipe-content');
    var trailing = el.querySelector('.ds-swipe-actions:not(.leading)');
    if (!content) return;
    var width = trailing ? trailing.offsetWidth : 0;
    var startX = null, dx = 0, open = false;
    function reset() { content.style.transform = open ? 'translateX(-' + width + 'px)' : ''; }
    function down(x) { startX = x; el.classList.add('dragging'); }
    function move(x) {
      if (startX == null) return;
      dx = x - startX + (open ? -width : 0);
      dx = Math.min(0, Math.max(-width - 20, dx));
      content.style.transform = 'translateX(' + dx + 'px)';
    }
    function end() {
      if (startX == null) return;
      el.classList.remove('dragging');
      open = dx < -width / 2; reset();
      startX = null; dx = 0;
    }
    content.addEventListener('touchstart', function (e) { down(e.touches[0].clientX); }, { passive: true });
    content.addEventListener('touchmove', function (e) { move(e.touches[0].clientX); }, { passive: true });
    content.addEventListener('touchend', end);
    content.addEventListener('mousedown', function (e) {
      down(e.clientX);
      function mm(ev) { move(ev.clientX); } function mu() { end(); document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); }
      document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu);
    });
    // tapping an action closes the row after its handler
    el.querySelectorAll('.ds-swipe-action').forEach(function (a) {
      a.addEventListener('click', function () { open = false; reset(); });
    });
    return el;
  }

  // ---- Large-title collapse ------------------------------------------------
  // Add [data-ds-nav] to a .ds-nav; the page scrolls (window or a [data-ds-scroll]).
  function largeTitle(nav) {
    var scroller = document.querySelector('[data-ds-scroll]') || window;
    var threshold = 12;
    function onScroll() {
      var y = scroller === window ? window.scrollY : scroller.scrollTop;
      nav.classList.toggle('ds-nav--collapsed', y > threshold);
    }
    scroller.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return nav;
  }

  // ---- Auto-wire declarative components ------------------------------------
  function autoWire(root) {
    root = root || document;
    root.querySelectorAll('[data-ds-nav]').forEach(largeTitle);
    root.querySelectorAll('.ds-segmented').forEach(function (e) { if (!e._select) segmented(e); });
    root.querySelectorAll('.ds-stepper').forEach(function (e) { if (!e._get) stepper(e); });
    root.querySelectorAll('.ds-swipe').forEach(function (e) { if (!e._wired) { swipe(e); e._wired = 1; } });
  }

  window.DS = {
    toast: toast, deleteWithUndo: deleteWithUndo,
    sheet: sheet, actionSheet: actionSheet,
    segmented: segmented, stepper: stepper, swipe: swipe,
    largeTitle: largeTitle, autoWire: autoWire, reduceMotion: reduce,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { autoWire(); });
  else autoWire();
})();
