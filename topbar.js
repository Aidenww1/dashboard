(function () {
  'use strict';

  // -------- CSS --------
  const css = `
/* -- Claude Chat Bar -- */
.claudebar-pill {
  position: fixed;
  bottom: calc(62px + max(14px, env(safe-area-inset-bottom)));
  left: 50%; transform: translateX(-50%);
  z-index: 190;
  display: flex; align-items: center; gap: 7px;
  padding: 9px 18px;
  background: rgba(52,211,153,0.10);
  border: 1px solid rgba(52,211,153,0.22);
  border-radius: 22px;
  color: #34D399; font-size: 13px; font-weight: 600;
  cursor: pointer; white-space: nowrap;
  backdrop-filter: blur(8px);
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s, transform 0.1s;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.claudebar-pill:hover { background: rgba(52,211,153,0.18); }
.claudebar-pill:active { transform: translateX(-50%) scale(0.95); }
.claudebar-pill svg { flex-shrink: 0; }
.claudebar-overlay {
  position: fixed; inset: 0; z-index: 290;
  background: rgba(0,0,0,0.55);
  opacity: 0; pointer-events: none;
  transition: opacity 0.25s;
}
.claudebar-overlay.open { opacity: 1; pointer-events: all; }
.claudebar-sheet {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 300;
  height: 72vh; max-height: 680px;
  background: #141416;
  border-top: 1px solid rgba(255,255,255,0.1);
  border-radius: 20px 20px 0 0;
  display: flex; flex-direction: column;
  transform: translateY(100%);
  transition: transform 0.3s cubic-bezier(0.32,0.72,0,1);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.claudebar-sheet.open { transform: translateY(0); }
.claudebar-handle {
  width: 36px; height: 4px; border-radius: 2px;
  background: rgba(255,255,255,0.14);
  margin: 10px auto 0; flex-shrink: 0;
}
.claudebar-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}
.claudebar-head-left { display: flex; flex-direction: column; gap: 1px; }
.claudebar-head-title { font-size: 15px; font-weight: 700; color: #E8E6E0; }
.claudebar-head-sub { font-size: 11px; color: #76746E; }
.claudebar-close {
  width: 28px; height: 28px; border-radius: 50%;
  background: rgba(255,255,255,0.07); border: none;
  color: #76746E; font-size: 17px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.claudebar-msgs {
  flex: 1; overflow-y: auto; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 8px;
  scrollbar-width: none;
}
.claudebar-msgs::-webkit-scrollbar { display: none; }
.claudebar-msg {
  max-width: 88%; padding: 9px 13px;
  border-radius: 16px; font-size: 14px; line-height: 1.5;
  word-break: break-word; white-space: pre-wrap;
}
.claudebar-msg.user {
  align-self: flex-end;
  background: rgba(52,211,153,0.14); color: #E8E6E0;
  border-bottom-right-radius: 4px;
}
.claudebar-msg.assistant {
  align-self: flex-start;
  background: rgba(255,255,255,0.07); color: #E8E6E0;
  border-bottom-left-radius: 4px;
}
.claudebar-msg.thinking {
  align-self: flex-start;
  background: rgba(255,255,255,0.04); color: #76746E; font-style: italic;
}
.claudebar-footer {
  display: flex; gap: 8px; padding: 10px 14px;
  padding-bottom: max(14px, env(safe-area-inset-bottom));
  border-top: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0; align-items: flex-end;
}
.claudebar-input {
  flex: 1; background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.10); border-radius: 14px;
  padding: 10px 14px; color: #E8E6E0; font-size: 15px;
  font-family: inherit; outline: none; resize: none;
  max-height: 120px; min-height: 42px; line-height: 1.4;
}
.claudebar-input::placeholder { color: #76746E; }
.claudebar-input:focus { border-color: rgba(52,211,153,0.35); }
.claudebar-send {
  width: 42px; height: 42px; border-radius: 13px;
  background: #34D399; color: #0A0A0B; border: none;
  font-size: 20px; cursor: pointer; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  transition: opacity 0.15s; font-family: inherit;
}
.claudebar-send:disabled { opacity: 0.35; cursor: default; }

.topbar {
  position: sticky; top: 0; z-index: 40;
  display: flex; gap: 8px;
  padding: max(10px, env(safe-area-inset-top)) 16px 10px;
  background: #0A0A0B;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.topbar-pill {
  flex: 1 1 0; min-width: 0;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 12px;
  background: #141416;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  text-decoration: none;
  color: #F7F8F8;
  -webkit-tap-highlight-color: transparent;
  transition: border-color 0.15s;
}
.topbar-pill:hover { border-color: rgba(255, 255, 255, 0.15); }
.topbar-pill-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #6ee7b7; flex-shrink: 0;
}
.topbar-pill.warn .topbar-pill-dot { background: #fbbf24; }
.topbar-pill.miss .topbar-pill-dot {
  background: #ff8a8a;
  animation: topbar-miss-pulse 1.6s ease-in-out infinite;
}
@keyframes topbar-miss-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
  50%      { box-shadow: 0 0 0 5px rgba(239, 68, 68, 0); }
}
.topbar-pill-label {
  font-size: 10px; font-weight: 700;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
}
.topbar-pill-count {
  margin-left: auto;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 12px; font-weight: 700;
  color: #FAFAFA;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.topbar-water-wrap {
  flex: 1 1 0; min-width: 0;
  display: flex;
}
.topbar-water-pill {
  flex: 1; min-width: 0;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 12px;
  background: #141416;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-right: none;
  border-radius: 8px 0 0 8px;
  text-decoration: none;
  color: #F7F8F8;
  -webkit-tap-highlight-color: transparent;
  transition: border-color 0.15s;
}
.topbar-water-pill:hover { border-color: rgba(255, 255, 255, 0.15); }
.topbar-water-pill .topbar-pill-dot { background: #7DD3FC; }
.topbar-water-add {
  flex: 0 0 auto;
  width: 38px;
  border: 1px solid rgba(52, 211, 153, 0.28);
  background: rgba(52, 211, 153, 0.12);
  color: #34D399;
  font-family: inherit; font-size: 17px; font-weight: 600;
  cursor: pointer;
  border-radius: 0 8px 8px 0;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s, transform 0.10s;
}
.topbar-water-add:hover { background: rgba(52, 211, 153, 0.20); }
.topbar-water-add:active { transform: scale(0.94); }
.topbar-water-add.flash { background: rgba(52, 211, 153, 0.45); }

@media (max-width: 480px) {
  .topbar { padding-left: 10px; padding-right: 10px; gap: 4px; }
  .topbar-pill, .topbar-water-pill { padding: 7px 9px; gap: 5px; }
  .topbar-pill-label { font-size: 9px; letter-spacing: 0.10em; }
  .topbar-pill-count { font-size: 11px; }
  .topbar-water-add { width: 32px; font-size: 16px; }
}
@media (max-width: 380px) {
  .topbar-pill-label { display: none; }
}

html, body {
  -webkit-text-size-adjust: 100%;
}
@media (max-width: 768px) {
  html { touch-action: pan-y; }
  ::-webkit-scrollbar { width: 0; height: 0; display: none; }
  html, body { scrollbar-width: none; -ms-overflow-style: none; }
}

@media (min-width: 900px) {
  .claudebar-pill { bottom: 28px; }
}
.modal-bg, .modal, .po-modal-bg, .po-modal, .wt-overlay, .wt-viewer {
  overscroll-behavior: contain;
}
body.topbar-modal-open {
  overflow: hidden;
  touch-action: none;
}
@media (max-width: 480px) {
  .modal-bg, .po-modal-bg {
    padding: 0 !important;
    align-items: stretch !important;
    justify-content: stretch !important;
  }
  .modal, .po-modal {
    width: 100% !important;
    max-width: 100% !important;
    max-height: 100vh !important;
    height: 100vh !important;
    border-radius: 0 !important;
    padding-top: max(20px, env(safe-area-inset-top)) !important;
    padding-bottom: max(28px, env(safe-area-inset-bottom)) !important;
    overflow-y: auto !important;
    overscroll-behavior: contain;
  }
}
`;

  // -------- HTML --------
  const html = `
<header class="topbar" id="topbar" role="navigation" aria-label="Quick stats">
  <div class="topbar-pill" id="topbarTokens" style="cursor:default">
    <span class="topbar-pill-dot" id="topbarTokensDot" style="background:#7DD3FC"></span>
    <span class="topbar-pill-label">TOKENS</span>
    <span class="topbar-pill-count" id="topbarTokensCount">0</span>
  </div>
  <div class="topbar-water-wrap">
    <a href="water.html" class="topbar-water-pill" id="topbarWater">
      <span class="topbar-pill-dot"></span>
      <span class="topbar-pill-label">WATER</span>
      <span class="topbar-pill-count" id="topbarWaterCount">-/-</span>
    </a>
    <button class="topbar-water-add" id="topbarWaterAdd" aria-label="Log one drink" type="button">+</button>
  </div>
</header>
`;

  function injectStyleAndHTML() {
    if (document.getElementById('topbar')) return;
    const style = document.createElement('style');
    style.id = 'topbar-style';
    style.textContent = css;
    document.head.appendChild(style);

    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    document.body.insertBefore(wrap.firstChild, document.body.firstChild);
  }

  function activeDateKey() {
    const now = new Date();
    const d = new Date(now);
    if (now.getHours() < 6) d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function calendarDateKey() {
    const d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  // -- Token tracking ----------------------------------------------------------

  const _TOK_KEY = 'ai:tokens:v1';

  function _todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function _loadTok() {
    try { return JSON.parse(localStorage.getItem(_TOK_KEY)) || {}; } catch { return {}; }
  }

  function _saveTok(t) {
    try { localStorage.setItem(_TOK_KEY, JSON.stringify(t)); } catch {}
  }

  function fmtTokens(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n || 0);
  }

  function getTodayTokens() {
    const t = _loadTok();
    if (t.date !== _todayStr()) return { input: 0, output: 0, total: 0, calls: 0 };
    return { input: t.input || 0, output: t.output || 0, total: (t.input || 0) + (t.output || 0), calls: t.calls || 0 };
  }

  window._trackAiTokens = function(inputTokens, outputTokens) {
    const today = _todayStr();
    const t = _loadTok();
    if (t.date !== today) { t.date = today; t.input = 0; t.output = 0; t.calls = 0; }
    t.input  = (t.input  || 0) + (inputTokens  || 0);
    t.output = (t.output || 0) + (outputTokens || 0);
    t.calls  = (t.calls  || 0) + 1;
    _saveTok(t);
    renderTokens();
  };

  function renderTokens() {
    const countEl = document.getElementById('topbarTokensCount');
    const dotEl   = document.getElementById('topbarTokensDot');
    if (!countEl) return;
    const tok = getTodayTokens();
    countEl.textContent = fmtTokens(tok.total);
    const title = 'in ' + fmtTokens(tok.input) + '  out ' + fmtTokens(tok.output) + '  ' + tok.calls + ' calls today';
    document.getElementById('topbarTokens').title = title;
    if (dotEl) {
      dotEl.style.background = tok.total > 100000 ? '#FF6B6B' : tok.total > 20000 ? '#FBBF24' : '#7DD3FC';
    }
  }

  // -- Water progress ----------------------------------------------------------

  function getWaterProgress() {
    let state = null;
    try { state = JSON.parse(localStorage.getItem('po_water_v1')); } catch (e) {}
    if (!state) return { done: 0, total: 0 };
    const todayKey = calendarDateKey();
    const done = (state.logs || {})[todayKey] || 0;
    const p = state.profile || { weightKg: 75 };
    const wKg = state.weightUnit === 'lb' ? (p.weightKg || 0) / 2.20462 : (p.weightKg || 0);
    const base = wKg * 35;
    const exercise = (p.activityHrsPerWeek || 0) / 7 * 500;
    const caffeine = Math.max(0, (state.caffeineMgPerDay || 0) - 200) * 1.5;
    const subs = (state.substances || []).reduce((s, x) => {
      const dose = (x && x.dose != null ? x.dose : (x && x.defaultDose)) || 0;
      return s + Math.max(0, dose * ((x && x.mlPerUnit) || 0));
    }, 0);
    let adjust = 0;
    if (p.sex === 'm') adjust += 200;
    if ((p.age || 0) >= 50) adjust += 100;
    const totalMl = base + exercise + caffeine + subs + adjust;
    let unitVol;
    if (state.unit === 'glass') unitVol = state.glassMl || 250;
    else if (state.unit === 'oz') unitVol = 30;
    else if (state.unit === 'ml') unitVol = 1;
    else unitVol = state.bottleMl || 500;
    const total = Math.max(1, Math.ceil(totalMl / unitVol));
    return { done, total };
  }

  function classifyStatus(done, total) {
    if (total === 0) return 'idle';
    if (done >= total) return 'good';
    if (done >= total * 0.5) return 'warn';
    const h = new Date().getHours();
    if (h >= 18 && done < total * 0.5) return 'miss';
    return 'warn';
  }

  function setPillStatus(pillEl, status) {
    pillEl.classList.remove('good', 'warn', 'miss');
    if (status === 'warn' || status === 'miss') pillEl.classList.add(status);
  }

  function render() {
    const waterEl = document.getElementById('topbarWater');
    if (!waterEl) return;

    const w = getWaterProgress();
    document.getElementById('topbarWaterCount').textContent =
      w.total ? w.done + '/' + w.total : '0/0';
    setPillStatus(waterEl, classifyStatus(w.done, w.total));
    renderTokens();
  }

  function defaultWaterState() {
    return {
      unit: 'bottle', bottleMl: 500, glassMl: 250, weightUnit: 'kg',
      profile: { weightKg: 75, age: 25, sex: 'm', activityHrsPerWeek: 5 },
      caffeineMgPerDay: 200, substances: [], logs: {}
    };
  }

  function addWater() {
    let state = null;
    try { state = JSON.parse(localStorage.getItem('po_water_v1')); } catch (e) {}
    if (!state || typeof state !== 'object') state = defaultWaterState();
    state.logs = state.logs || {};
    const k = calendarDateKey();
    state.logs[k] = (state.logs[k] || 0) + 1;
    try { localStorage.setItem('po_water_v1', JSON.stringify(state)); } catch (e) {}
    render();

    const btn = document.getElementById('topbarWaterAdd');
    if (btn) {
      btn.classList.add('flash');
      setTimeout(() => btn.classList.remove('flash'), 220);
    }

  }

  function blockGesture(e) { e.preventDefault(); }
  function lockGestures() {
    document.addEventListener('gesturestart', blockGesture, { passive: false });
    document.addEventListener('gesturechange', blockGesture, { passive: false });
    document.addEventListener('gestureend', blockGesture, { passive: false });
    let lastTouch = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTouch <= 300) e.preventDefault();
      lastTouch = now;
    }, { passive: false });
  }

  function startModalLock() {
    const MODAL_SELECTORS = [
      '.modal-bg', '.po-modal-bg', '.wt-overlay', '.wt-viewer', '.wt-cam'
    ];
    function anyOpen() {
      for (const sel of MODAL_SELECTORS) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          if (el.classList.contains('show') || el.classList.contains('is-open')) {
            return true;
          }
        }
      }
      return false;
    }
    function sync() {
      document.body.classList.toggle('topbar-modal-open', anyOpen());
    }
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      attributes: true, attributeFilter: ['class'], subtree: true
    });
    sync();
  }

  function injectChatBar() {
    if (document.getElementById('claudebarSheet')) return;
    const pill = document.createElement('button');
    pill.id = 'claudebarPill';
    pill.className = 'claudebar-pill';
    pill.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>Ask Claude';

    const overlay = document.createElement('div');
    overlay.id = 'claudebarOverlay';
    overlay.className = 'claudebar-overlay';

    const sheet = document.createElement('div');
    sheet.id = 'claudebarSheet';
    sheet.className = 'claudebar-sheet';
    sheet.innerHTML = `
      <div class="claudebar-handle"></div>
      <div class="claudebar-head">
        <div class="claudebar-head-left">
          <div class="claudebar-head-title">Claude</div>
          <div class="claudebar-head-sub">Ask about your health, finances, habits...</div>
        </div>
        <button class="claudebar-close" id="claudebarClose">&#x2715;</button>
      </div>
      <div class="claudebar-msgs" id="claudebarMsgs">
        <div class="claudebar-msg assistant">Hi! I have access to your dashboard data. Ask me anything about your health, nutrition, workouts, sleep, finances, or habits.</div>
      </div>
      <div class="claudebar-footer">
        <textarea class="claudebar-input" id="claudebarInput" placeholder="Ask anything..." rows="1"></textarea>
        <button class="claudebar-send" id="claudebarSend">&#x2191;</button>
      </div>`;

    document.body.appendChild(pill);
    document.body.appendChild(overlay);
    document.body.appendChild(sheet);

    let history = [];
    let busy = false;

    function openChat() {
      sheet.classList.add('open');
      overlay.classList.add('open');
      document.body.classList.add('topbar-modal-open');
      setTimeout(() => document.getElementById('claudebarInput').focus(), 300);
    }
    function closeChat() {
      sheet.classList.remove('open');
      overlay.classList.remove('open');
      document.body.classList.remove('topbar-modal-open');
    }

    pill.addEventListener('click', openChat);
    overlay.addEventListener('click', closeChat);
    document.getElementById('claudebarClose').addEventListener('click', closeChat);

    function addMsg(role, text) {
      const el = document.createElement('div');
      el.className = 'claudebar-msg ' + role;
      el.textContent = text;
      const msgs = document.getElementById('claudebarMsgs');
      msgs.appendChild(el);
      msgs.scrollTop = msgs.scrollHeight;
      return el;
    }

    function pageName() {
      return (window.location.pathname.split('/').pop() || 'index.html').replace('.html', '');
    }

    // Cached life context - refreshed at most once per 5 min per page session
    let _lifeCtxCache = null;
    let _lifeCtxFetchedAt = 0;
    async function getLifeContext() {
      const now = Date.now();
      if (_lifeCtxCache && now - _lifeCtxFetchedAt < 300000) return _lifeCtxCache;
      try {
        const r = await fetch('/api/life-context', { signal: AbortSignal.timeout(5000) });
        if (r.ok) {
          const d = await r.json();
          _lifeCtxCache = d;
          _lifeCtxFetchedAt = now;
          return d;
        }
      } catch {}
      return null;
    }

    function buildContext(lc) {
      const page = pageName();
      const date = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      const lines = ['User is on the ' + page + ' page. Today: ' + date + '.'];

      if (lc && !lc.error) {
        if (lc.body?.latest_weight_kg) lines.push('Weight: ' + lc.body.latest_weight_kg + 'kg' + (lc.body.weight_trend ? ' (' + lc.body.weight_trend + ')' : '') + '.');
        if (lc.sleep?.last_night_hrs) lines.push('Last sleep: ' + lc.sleep.last_night_hrs + 'h (7d avg: ' + (lc.sleep.avg_7d_hrs || '?') + 'h).');
        if (lc.nutrition_today) {
          const n = lc.nutrition_today;
          lines.push('Nutrition today: ' + n.calories + ' kcal, ' + n.protein_g + 'g protein, ' + n.carbs_g + 'g carbs, ' + n.fat_g + 'g fat.');
        }
        if (lc.mood_recent_7d?.length) {
          const avg = (lc.mood_recent_7d.reduce((a, b) => a + b, 0) / lc.mood_recent_7d.length).toFixed(1);
          lines.push('Mood (recent, 1-5): avg ' + avg + ', last 7 entries: ' + lc.mood_recent_7d.join(', ') + '.');
        }
        if (lc.bloodwork?.date) lines.push('Last bloodwork: ' + lc.bloodwork.date + '.');
        if (lc.insights_recent?.length) {
          const urgent = lc.insights_recent.filter(i => i.severity === 'alert' || i.severity === 'warning').slice(0, 2);
          if (urgent.length) lines.push('Active alerts: ' + urgent.map(i => i.text).join(' | '));
        }
      }

      return lines.join(' ');
    }

    async function send() {
      const inp = document.getElementById('claudebarInput');
      const btn = document.getElementById('claudebarSend');
      const text = inp.value.trim();
      if (!text || busy) return;
      inp.value = ''; inp.style.height = 'auto';
      busy = true; btn.disabled = true;
      addMsg('user', text);
      history.push({ role: 'user', content: text });
      const thinking = addMsg('thinking', 'Thinking...');
      try {
        const lc = await getLifeContext();
        const r = await fetch('/api/health-ai/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'chat', messages: history.slice(-12), context: buildContext(lc) }),
          signal: AbortSignal.timeout(30000),
        });
        thinking.remove();
        if (!r.ok) { addMsg('assistant', 'Something went wrong. Try again.'); history.pop(); return; }
        const data = await r.json();
        const reply = data.reply || data.summary || 'No response received.';
        if (data.usage && window._trackAiTokens) {
          window._trackAiTokens(data.usage.input_tokens || 0, data.usage.output_tokens || 0);
        }
        addMsg('assistant', reply);
        history.push({ role: 'assistant', content: reply });
      } catch (e) {
        thinking.remove();
        addMsg('assistant', e.name === 'TimeoutError' ? 'Request timed out. Try again.' : 'Error: ' + e.message);
        history.pop();
      } finally {
        busy = false; btn.disabled = false;
      }
    }

    document.getElementById('claudebarSend').addEventListener('click', send);
    document.getElementById('claudebarInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    document.getElementById('claudebarInput').addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
  }

  function boot() {
    injectStyleAndHTML();
    injectChatBar();
    const btn = document.getElementById('topbarWaterAdd');
    if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); addWater(); });
    render();
    lockGestures();
    startModalLock();

    window.addEventListener('storage', render);
    window.addEventListener('focus', render);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

    setInterval(render, 30 * 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
