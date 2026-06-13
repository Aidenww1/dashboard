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

  /* ---------- ask-anything chat (Phase 11) ----------
     ?question starts a thread; further Enters continue it with history.
     Context is smart-sliced: keyword routing picks the LifeOS slices the
     question actually needs instead of dumping everything. "/new" resets. */

  var CHAT_KEY = 'coach:chat:v1'; // {threads:[{id,title,at,messages:[{role,content}]}]} cap 5 threads x 30 msgs
  var chatMode = false;
  var activeThread = null;

  var SLICE_RULES = [
    [/afford|cost|money|spend|spent|sav(e|ing)|tax|btw|mortgage|huis|house|sub(scription)?|invoice|income|net worth/i, ['finance', 'opportunities']],
    [/sleep|recover|tired|fatigue|readiness|deload|rest day/i, ['recovery', 'training']],
    [/train|gym|workout|lift|squat|bench|deadlift|volume|pr\b/i, ['training']],
    [/eat|meal|protein|calorie|macro|food|diet|hungry/i, ['nutrition']],
    [/mail|email|inbox|reply|order|deliver|package|track/i, ['mail']],
    [/opportunit|missing out|radar/i, ['opportunities']],
    [/skin|acne|breakout|spf|sunscreen/i, ['skin']],
    [/photo|physique|body|muscle|lean|fat/i, ['body_progress']],
    [/plan|today|schedule|focus|deep work|task|goal/i, ['productivity']],
    [/data|track|log|quality|stale/i, ['missing_data']],
  ];

  function pickSlices(q) {
    var names = ['today'];
    SLICE_RULES.forEach(function (rule) {
      if (rule[0].test(q)) rule[1].forEach(function (s) { if (names.indexOf(s) < 0) names.push(s); });
    });
    return names.slice(0, 4);
  }

  function buildContext(q) {
    var parts = {};
    pickSlices(q).forEach(function (s) {
      try { parts[s] = window.LifeOS.context(s); } catch (_) {}
    });
    var ops = '';
    if (window.LifeOS && LifeOS.actionCatalog) {
      var cat = LifeOS.actionCatalog.map(function (a) { return a.name + '(' + a.args + ')'; }).join('; ');
      ops = ' You are also an OPERATOR, not only a coach: you can perform actions. When the user asks you to DO something (log, plan, remind, mark, set, open a page), append at the very END of your reply one fenced block exactly like ```json\n{"actions":[{"name":"log_weight","args":{"kg":82.4}}]}\n``` listing the actions. The app shows the user a confirmation and runs them — so NEVER claim you already did it; say you have prepared it for confirmation. Use ONLY these action names and arg shapes: ' + cat + '. If the user only wants information, do NOT include the block.';
    }
    return 'You are the user\'s direct personal operator inside their Life OS. Answer from the data below; be specific with numbers; if the data does not contain the answer, say what is missing and which page logs it.' + ops + ' Life context slices: ' + JSON.stringify(parts);
  }

  // Pull a {"actions":[...]} proposal out of a reply; return clean text + actions.
  function parseActions(reply) {
    reply = String(reply || '');
    var jsonStr = null, matchStr = null;
    var fence = reply.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence && /"actions"/.test(fence[1])) { jsonStr = fence[1]; matchStr = fence[0]; }
    if (!jsonStr) {
      var bare = reply.match(/\{[\s\S]*?"actions"[\s\S]*?\}\s*\}?/);
      if (bare) { jsonStr = bare[0]; matchStr = bare[0]; }
    }
    if (!jsonStr) return { text: reply, actions: null };
    try {
      var obj = JSON.parse(jsonStr);
      if (obj && Array.isArray(obj.actions) && obj.actions.length) {
        var clean = reply.replace(matchStr, '').trim();
        return { text: clean || 'Prepared the actions below — confirm to run.', actions: obj.actions };
      }
    } catch (_) {}
    return { text: reply, actions: null };
  }

  function renderActionConfirm(actions) {
    els();
    var wrap = document.createElement('div');
    var html = '<div class="lo-cmd-section">Proposed actions — confirm to run</div>';
    html += actions.map(function (a) {
      var label = (window.LifeOS && LifeOS.actionPreview) ? LifeOS.actionPreview(a) : a.name;
      return '<div class="lo-cmd-confirm"><span>' + esc(label) + '</span></div>';
    }).join('');
    html += '<button class="lo-cmd-save" id="loActRun">Run ' + actions.length + ' action' + (actions.length > 1 ? 's' : '') + '</button>';
    html += '<button class="lo-cmd-save" id="loActCancel" style="background:rgba(255,255,255,0.08);color:#B4B4B8">Cancel</button>';
    wrap.innerHTML = html;
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
    document.getElementById('loActRun').addEventListener('click', function () {
      if (!window.LifeOS || !LifeOS.runAction) return;
      var msgs = actions.map(function (a) { var r = LifeOS.runAction(a); return (r.ok ? '✓ ' : '✕ ') + r.message; });
      wrap.innerHTML = '<div class="lo-cmd-msg">' + msgs.map(function (s) {
        return '<div class="' + (s.charAt(0) === '✓' ? 'lo-cmd-ok' : 'lo-cmd-err') + '">' + esc(s) + '</div>';
      }).join('') + '</div>';
    });
    document.getElementById('loActCancel').addEventListener('click', function () { wrap.remove(); });
  }

  function loadThreads() { var s; try { s = JSON.parse(localStorage.getItem(CHAT_KEY)); } catch (_) {} return (s && s.threads) || []; }
  function saveThread(t) {
    var threads = loadThreads().filter(function (x) { return x.id !== t.id; });
    t.messages = t.messages.slice(-30);
    threads.push(t);
    try { localStorage.setItem(CHAT_KEY, JSON.stringify({ threads: threads.slice(-5) })); } catch (_) {}
  }

  function renderChat(pending) {
    els();
    if (!activeThread) return;
    var html = '<div class="lo-cmd-section">Chat · /new = new thread · Esc = close</div>';
    html += activeThread.messages.map(function (m) {
      var user = m.role === 'user';
      return '<div class="lo-cmd-msg" style="' + (user ? 'color:#F7F8F8;font-weight:600' : '') + '">' + (user ? '› ' : '') + esc(m.content) + '</div>';
    }).join('');
    if (pending) html += '<div class="lo-cmd-msg">Thinking…</div>';
    body.innerHTML = html;
    body.scrollTop = body.scrollHeight;
  }

  /* ---------- universal router (Phase 13) ----------
     Common asks resolve deterministically (instant, no tokens) and either
     answer inline or navigate to the right page. Anything unmatched falls
     through to the AI coach. */
  function lsGet(k, fb) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (_) { return fb; } }

  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  function parseDateKey(q) {
    var iso = q.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[0];
    var m = q.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i)
         || q.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})/i);
    if (!m) return null;
    var mon, day;
    if (/^\d/.test(m[1])) { day = +m[1]; mon = MONTHS.indexOf(m[2].toLowerCase().slice(0, 3)); }
    else { mon = MONTHS.indexOf(m[1].toLowerCase().slice(0, 3)); day = +m[2]; }
    if (mon < 0 || !day) return null;
    var now = new Date(), yr = now.getFullYear();
    var d = new Date(yr, mon, day);
    if (d > now) d = new Date(yr - 1, mon, day); // a date in the future means last year
    return d.getFullYear() + '-' + String(mon + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  var ROUTES = [
    // weight on a specific date — deterministic lookup
    [/(weigh|weight).*(on|at)\b|what.*weigh/i, function (q) {
      var dk = parseDateKey(q);
      if (!dk) return null;
      var logs = lsGet('po_coach_weights', []) || [];
      var hit = logs.find(function (e) { return e.dateKey === dk; });
      return { answer: hit ? 'On ' + dk + ' you weighed ' + hit.weight + ' kg.' : 'No weight logged for ' + dk + '. Body page logs it.' };
    }],
    // orders / deliveries
    [/did.*(order|package|parcel).*(arriv|deliver|come)|my orders|check orders|track.*(order|package)/i, function () {
      var s = lsGet('mail:summary:v1', null);
      if (!s) return { navigate: '/mail.html?qa=orders', note: 'Opening orders (Gmail not synced yet)…' };
      var msg = (s.orders_active || 0) + ' active order(s)';
      if (s.delivery_issues) msg += ', ' + s.delivery_issues + ' with a delivery issue';
      return { answer: msg + '. Tap to open the order tracker.', navigate: '/mail.html?qa=orders', delay: 1800 };
    }],
    // clean inbox / clear newsletters
    [/clear.*(newsletter|promo)|clean.*(inbox|mail)|unsubscribe|inbox cleanup/i, function () {
      return { navigate: '/mail.html?qa=cleanup', note: 'Opening the inbox cleanup plan…' };
    }],
    // plan my day
    [/plan (my|the|todays?|today)/i, function () {
      return { navigate: '/calendar.html?qa=plan', note: 'Opening your day planner…' };
    }],
    // what needs attention / priorities
    [/needs? attention|what.*important|my priorities|what should i (do|focus)/i, function () {
      if (!window.LifeOS || !LifeOS.briefing) return null;
      var b = LifeOS.briefing();
      var pick = b.lines.filter(function (l) { return /Money|Orders|Email|Opportunity|Coach|Supplements|Log next/.test(l.label); });
      if (!pick.length) pick = b.lines.slice(0, 4);
      return { answer: 'What needs attention:\n' + pick.map(function (l) { return '• ' + l.label + ': ' + l.value; }).join('\n') };
    }],
    // what should I track next / missing data
    [/what.*track next|missing data|what.*should i log/i, function () {
      if (!window.LifeOS || !LifeOS.quality) return null;
      var q = LifeOS.quality();
      if (!q.stale || !q.stale.length) return { answer: 'Data quality ' + q.score + '%. Nothing stale right now.' };
      return { answer: 'Most stale: ' + q.stale.slice(0, 3).map(function (s) { return s.label + (s.daysAgo != null ? ' (' + s.daysAgo + 'd)' : ' (never)'); }).join(', ') + '. Reminders page can schedule check-ins.', navigate: '/reminders.html', delay: 2600 };
    }],
    // add reminders for missing data
    [/add reminder|reminders for missing|schedule check/i, function () {
      return { navigate: '/reminders.html', note: 'Opening reminders + suggested check-ins…' };
    }],
  ];

  function route(q) {
    for (var i = 0; i < ROUTES.length; i++) {
      if (ROUTES[i][0].test(q)) {
        try { var r = ROUTES[i][1](q); if (r) return r; } catch (_) {}
      }
    }
    return null;
  }

  function ask(question) {
    els();
    if (!window.LifeOS) { body.innerHTML = '<div class="lo-cmd-msg lo-cmd-err">Core not loaded.</div>'; return; }
    // deterministic router first — instant, no tokens
    var r = route(question);
    if (r) {
      if (!activeThread) activeThread = { id: Date.now().toString(36), title: question.slice(0, 60), at: new Date().toISOString(), messages: [] };
      chatMode = true;
      activeThread.messages.push({ role: 'user', content: question });
      if (r.answer) {
        activeThread.messages.push({ role: 'assistant', content: r.answer });
        activeThread.at = new Date().toISOString();
        saveThread(activeThread);
        renderChat(false);
        if (r.navigate) setTimeout(function () { location.href = r.navigate; }, r.delay || 1600);
      } else if (r.navigate) {
        activeThread.messages.push({ role: 'assistant', content: r.note || 'Opening…' });
        renderChat(false);
        setTimeout(function () { location.href = r.navigate; }, r.delay || 900);
      }
      return;
    }
    if (!window.LifeOS.ai) { body.innerHTML = '<div class="lo-cmd-msg lo-cmd-err">AI service not loaded.</div>'; return; }
    if (!activeThread) {
      activeThread = { id: Date.now().toString(36), title: question.slice(0, 60), at: new Date().toISOString(), messages: [] };
    }
    chatMode = true;
    activeThread.messages.push({ role: 'user', content: question });
    renderChat(true);
    window.LifeOS.ai.chat({
      messages: activeThread.messages.slice(-10).map(function (m) { return { role: m.role, content: m.content }; }),
      context: buildContext(activeThread.messages.map(function (m) { return m.content; }).join(' ')),
      timeoutMs: 45000,
    }).then(function (d) {
      var parsed = parseActions(d.reply || '(no reply)');
      activeThread.messages.push({ role: 'assistant', content: parsed.text });
      activeThread.at = new Date().toISOString();
      saveThread(activeThread);
      renderChat(false);
      if (parsed.actions) renderActionConfirm(parsed.actions);
    }).catch(function (e) {
      activeThread.messages.pop(); // don't persist the unanswered turn
      renderChat(false);
      body.innerHTML += '<div class="lo-cmd-msg lo-cmd-err">' + esc(e.message) + '</div>';
    });
  }

  function resetChat() { chatMode = false; activeThread = null; }

  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'loCmdInput') {
      if (chatMode) return; // no live search while chatting
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderSearch, 150);
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.target && e.target.id === 'loCmdInput' && e.key === 'Enter') {
      var v = e.target.value.trim();
      if (!v) return;
      e.target.value = '';
      if (v === '/new') { resetChat(); body.innerHTML = '<div class="lo-cmd-msg">New thread. Ask away.</div>'; return; }
      if (v.startsWith('?')) { ask(v.slice(1).trim()); return; }
      if (chatMode) { ask(v); return; }
      e.target.value = v;
      parseAndConfirm(v);
    }
  });
  // leaving the panel ends chat mode so the bar reopens in log/search mode
  var _open = open;
  open = function () { resetChat(); _open(); };
  fab.removeEventListener('click', _open);
  fab.addEventListener('click', open);

  /* ---------- external hooks (Phase 13 quick actions) ---------- */
  window.__opParseActions = parseActions; // test hook
  window.LifeOSCmd = {
    open: function () { open(); },
    prefill: function (text) { els(); if (input) { input.value = text || ''; renderSearch(); input.focus(); } },
    ask: function (q) {
      open();
      els();
      if (!q) { try { var pf = sessionStorage.getItem('cmd:prefill'); if (pf) { sessionStorage.removeItem('cmd:prefill'); q = pf.replace(/^\?\s*/, ''); } } catch (_) {} }
      if (q) { ask(q); }
      else if (input) { input.value = '? '; input.focus(); }
    },
  };
})();
