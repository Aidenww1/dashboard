/* ============================================================
   LifeOS command bar — one input for logging, search and asking.
   Open: Ctrl/Cmd+K on desktop, floating button on mobile.

   - type text            -> instant local search (LifeOS.search)
   - press Enter          -> Haiku parses it into typed log entries,
                             user confirms with one tap (LifeOS.log)
   - start with "?"       -> ask Claude with the today context slice
   No AI call ever fires per keystroke; parse runs only on Enter.
   ============================================================ */
(function () {
  'use strict';
  if (window.__lifeosCmdLoaded) return;
  window.__lifeosCmdLoaded = true;

  var css = [
    '#loCmdFab{position:fixed;right:16px;bottom:84px;z-index:9990;width:48px;height:48px;border-radius:50%;',
    'background:var(--accent,#34D399);color:#0A0A0B;border:none;font-size:22px;font-weight:600;cursor:pointer;',
    'box-shadow:0 4px 16px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center}',
    '@media(min-width:1024px){#loCmdFab{display:none}}',
    '#loCmdOverlay{position:fixed;inset:0;z-index:9991;background:rgba(0,0,0,0.6);display:none;align-items:flex-start;justify-content:center;padding:10vh 16px 16px}',
    '#loCmdOverlay.open{display:flex}',
    '#loCmdPanel{width:100%;max-width:560px;background:#141416;border:1px solid rgba(255,255,255,0.12);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;max-height:70vh}',
    '#loCmdInput{width:100%;box-sizing:border-box;background:#0F0F11;border:none;border-bottom:1px solid rgba(255,255,255,0.08);color:#F7F8F8;',
    'font-size:16px;padding:14px 16px;outline:none;font-family:inherit}',
    '#loCmdHint{padding:8px 16px;font-size:11px;color:#6E6E76;display:flex;gap:14px;flex-wrap:wrap}',
    '#loCmdBody{overflow-y:auto;padding:4px 8px 10px}',
    '.lo-cmd-row{display:flex;align-items:center;gap:10px;padding:10px 10px;border-radius:8px;cursor:pointer;font-size:13px;color:#F7F8F8}',
    '.lo-cmd-row:hover{background:#1A1A1D}',
    '.lo-cmd-type{font-size:10px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#6E6E76;min-width:74px}',
    '.lo-cmd-detail{margin-left:auto;color:#6E6E76;font-size:12px;white-space:nowrap}',
    '.lo-cmd-section{padding:10px 10px 4px;font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#6E6E76}',
    '.lo-cmd-confirm{margin:6px 8px;padding:10px 12px;background:#0F0F11;border:1px solid rgba(52,211,153,0.28);border-radius:8px;display:flex;align-items:center;gap:10px;font-size:13px;color:#F7F8F8}',
    '.lo-cmd-confirm .x{margin-left:auto;background:none;border:none;color:#6E6E76;cursor:pointer;font-size:14px;padding:2px 6px}',
    '.lo-cmd-save{margin:8px;padding:11px;background:var(--accent,#34D399);color:#0A0A0B;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}',
    '.lo-cmd-msg{padding:12px 16px;font-size:13px;color:#B4B4B8;line-height:1.55;white-space:pre-wrap}',
    '.lo-cmd-ok{color:#34D399}',
    '.lo-cmd-err{color:#FF6B6B}',
  ].join('');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var fab = document.createElement('button');
  fab.id = 'loCmdFab';
  fab.setAttribute('aria-label', 'Quick log');
  fab.textContent = '+';

  var overlay = document.createElement('div');
  overlay.id = 'loCmdOverlay';
  overlay.innerHTML =
    '<div id="loCmdPanel">' +
    '<input id="loCmdInput" type="text" placeholder="Log, search, or ?ask  —  e.g. 82.4kg slept 7h mood 8" autocomplete="off">' +
    '<div id="loCmdHint"><span>Enter = log with AI</span><span>? = ask Claude</span><span>Esc = close</span></div>' +
    '<div id="loCmdBody"></div>' +
    '</div>';

  function mount() {
    document.body.appendChild(fab);
    document.body.appendChild(overlay);
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  var input, body;
  function els() {
    input = input || document.getElementById('loCmdInput');
    body = body || document.getElementById('loCmdBody');
  }

  function open() {
    els();
    overlay.classList.add('open');
    input.value = '';
    body.innerHTML = '';
    setTimeout(function () { input.focus(); }, 30);
  }
  function close() { overlay.classList.remove('open'); }

  fab.addEventListener('click', open);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); overlay.classList.contains('open') ? close() : open(); }
    if (e.key === 'Escape' && overlay.classList.contains('open')) close();
  });

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  /* ---------- local search (deterministic, debounced) ---------- */
  var searchTimer = null;
  function renderSearch() {
    els();
    var q = input.value.trim();
    if (q.startsWith('?')) { body.innerHTML = '<div class="lo-cmd-msg">Press Enter to ask Claude.</div>'; return; }
    if (q.length < 2 || !window.LifeOS || !window.LifeOS.search) { body.innerHTML = ''; return; }
    var results = window.LifeOS.search(q);
    var html = '';
    if (results.length) {
      html += '<div class="lo-cmd-section">Matches</div>';
      html += results.map(function (r) {
        return '<div class="lo-cmd-row" data-href="' + esc(r.href) + '">' +
          '<span class="lo-cmd-type">' + esc(r.type) + '</span>' +
          '<span>' + esc(r.label) + '</span>' +
          '<span class="lo-cmd-detail">' + esc(r.detail) + (r.date ? ' · ' + esc(r.date) : '') + '</span></div>';
      }).join('');
    } else {
      html += '<div class="lo-cmd-msg">No matches. Press Enter to log this with AI.</div>';
    }
    body.innerHTML = html;
    body.querySelectorAll('.lo-cmd-row[data-href]').forEach(function (row) {
      row.addEventListener('click', function () { location.href = row.dataset.href; });
    });
  }

  /* ---------- AI parse -> confirm -> save ---------- */
  var PARSE_CTX =
    'You convert one short free-text life log into strict JSON. Reply with ONLY a JSON array, no prose. ' +
    'Each element is one entry: ' +
    '{"type":"weight","kg":82.4} | {"type":"sleep","hours":7.5} | {"type":"mood","mood":4} (scale 1-5; halve 1-10 inputs) | ' +
    '{"type":"meal","name":"3 eggs and oats","calories":450,"protein":28,"carbs":40,"fat":18} (estimate macros) | ' +
    '{"type":"water","count":1} | {"type":"supplement","name":"creatine"} | ' +
    '{"type":"task","title":"...","due":"YYYY-MM-DD or null"} | {"type":"goal","text":"..."} | {"type":"note","text":"..."} ' +
    'Split compound input into multiple entries. If nothing parseable, return [].';

  function parseAndConfirm(text) {
    els();
    if (!window.LifeOS || !window.LifeOS.ai) { body.innerHTML = '<div class="lo-cmd-msg lo-cmd-err">AI service not loaded.</div>'; return; }
    body.innerHTML = '<div class="lo-cmd-msg">Parsing…</div>';
    window.LifeOS.ai.chat({ prompt: text, context: PARSE_CTX, timeoutMs: 20000 })
      .then(function (d) {
        var m = String(d.reply || '').match(/\[[\s\S]*\]/);
        var entries = [];
        try { entries = m ? JSON.parse(m[0]) : []; } catch (_) {}
        entries = entries.filter(function (e) { return e && e.type; });
        if (!entries.length) { body.innerHTML = '<div class="lo-cmd-msg lo-cmd-err">Could not parse that. Try e.g. "82.4kg slept 7h mood 8".</div>'; return; }
        renderConfirm(entries);
      })
      .catch(function (e) { body.innerHTML = '<div class="lo-cmd-msg lo-cmd-err">' + esc(e.message) + '</div>'; });
  }

  function summarize(e) {
    switch (e.type) {
      case 'weight': return 'Weight ' + e.kg + ' kg';
      case 'sleep': return 'Sleep ' + (e.hours != null ? e.hours + 'h' : Math.round(e.minutes) + 'm');
      case 'mood': return 'Mood ' + e.mood + '/5';
      case 'meal': return 'Meal: ' + e.name + ' (' + (e.calories || 0) + ' kcal, ' + (e.protein || 0) + 'g P, est.)';
      case 'water': return 'Water +' + (e.count || 1);
      case 'supplement': return 'Supplement: ' + e.name;
      case 'task': return 'Task: ' + e.title + (e.due ? ' (due ' + e.due + ')' : '');
      case 'goal': return 'Goal: ' + e.text;
      case 'note': return 'Note: ' + String(e.text).slice(0, 50);
      default: return e.type;
    }
  }

  function renderConfirm(entries) {
    els();
    var html = '<div class="lo-cmd-section">Confirm</div>';
    html += entries.map(function (e, i) {
      return '<div class="lo-cmd-confirm" data-i="' + i + '"><span>' + esc(summarize(e)) + '</span>' +
        '<button class="x" data-rm="' + i + '" aria-label="Remove">✕</button></div>';
    }).join('');
    html += '<button class="lo-cmd-save" id="loCmdSaveAll">Save ' + (entries.length > 1 ? 'all (' + entries.length + ')' : '') + '</button>';
    body.innerHTML = html;
    var live = entries.slice();
    body.querySelectorAll('[data-rm]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        live[+btn.dataset.rm] = null;
        btn.parentElement.style.display = 'none';
      });
    });
    document.getElementById('loCmdSaveAll').addEventListener('click', function () {
      var msgs = live.filter(Boolean).map(function (e) {
        var r = window.LifeOS.log(e);
        return (r.ok ? '✓ ' : '✕ ') + r.message;
      });
      body.innerHTML = '<div class="lo-cmd-msg">' + msgs.map(function (s) {
        return '<div class="' + (s.startsWith('✓') ? 'lo-cmd-ok' : 'lo-cmd-err') + '">' + esc(s) + '</div>';
      }).join('') + '</div>';
      input.value = '';
      setTimeout(close, 1400);
    });
  }

  /* ---------- ask mode ---------- */
  function ask(question) {
    els();
    if (!window.LifeOS || !window.LifeOS.ai) { body.innerHTML = '<div class="lo-cmd-msg lo-cmd-err">AI service not loaded.</div>'; return; }
    body.innerHTML = '<div class="lo-cmd-msg">Thinking…</div>';
    var ctx = '';
    try { ctx = 'User life context (today slice): ' + JSON.stringify(window.LifeOS.context('today')); } catch (_) {}
    window.LifeOS.ai.chat({ prompt: question, context: ctx, timeoutMs: 30000 })
      .then(function (d) { body.innerHTML = '<div class="lo-cmd-msg">' + esc(d.reply) + '</div>'; })
      .catch(function (e) { body.innerHTML = '<div class="lo-cmd-msg lo-cmd-err">' + esc(e.message) + '</div>'; });
  }

  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'loCmdInput') {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderSearch, 150);
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.target && e.target.id === 'loCmdInput' && e.key === 'Enter') {
      var v = e.target.value.trim();
      if (!v) return;
      if (v.startsWith('?')) ask(v.slice(1).trim());
      else parseAndConfirm(v);
    }
  });
})();
