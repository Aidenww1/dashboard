/* ============================================================
   LifeOS.ai — single client-side service for all Claude calls.
   Every page-level AI call goes through here so that:
   - results are cached (localStorage, TTL per kind) and never
     re-fetched on re-render / tab switch / remount
   - token usage is tracked centrally (topbar counter)
   - errors are handled in one place (no silent failures)
   - model routing is a parameter, never hardcoded in pages
   The server endpoint (/api/health-ai/agent) holds the API key,
   does Haiku/Sonnet routing, and applies Anthropic prompt caching.
   ============================================================ */
(function () {
  'use strict';

  var CACHE_KEY = 'ai:cache:v1';

  // Suggested TTLs (ms)
  var TTL = {
    daily: 60 * 60 * 1000,        // daily insights: 1 hour
    weekly: 24 * 60 * 60 * 1000,  // weekly review: 24 hours
    bloodwork: 7 * 24 * 60 * 60 * 1000, // bloodwork prediction: 7 days
  };

  function loadCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (_) { return {}; }
  }
  function saveCache(c) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (_) {}
  }
  function cacheGet(key) {
    if (!key) return null;
    var c = loadCache();
    var e = c[key];
    if (!e) return null;
    if (e.exp && Date.now() > e.exp) { delete c[key]; saveCache(c); return null; }
    return e.data;
  }
  function cacheSet(key, data, ttlMs) {
    if (!key) return;
    var c = loadCache();
    // prune expired entries while we're here
    var now = Date.now();
    Object.keys(c).forEach(function (k) { if (c[k].exp && now > c[k].exp) delete c[k]; });
    c[key] = { exp: ttlMs ? now + ttlMs : 0, data: data };
    saveCache(c);
  }

  function track(usage) {
    if (usage && window._trackAiTokens) {
      window._trackAiTokens(usage.input_tokens || 0, usage.output_tokens || 0);
    }
  }

  function post(body, timeoutMs) {
    return fetch('/api/health-ai/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs || 30000),
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('AI service error: ' + (t || r.status)); });
      return r.json();
    }).then(function (d) {
      track(d.usage);
      return d;
    });
  }

  /**
   * Chat-style call (quick Q&A, briefings, parsing). Uses the fast model
   * server-side. opts:
   *   prompt   - user message string (or pass messages: [...])
   *   context  - lean context string for the system prompt (only what
   *              this module needs - never full history dumps)
   *   cacheKey - stable id, e.g. 'briefing_' + date. If a valid cached
   *              entry exists the API is never hit.
   *   ttlMs    - cache lifetime; use LifeOS.ai.TTL presets
   * Resolves { reply, usage, cached }.
   */
  function chat(opts) {
    var hit = cacheGet(opts.cacheKey);
    if (hit) return Promise.resolve({ reply: hit, cached: true });
    var messages = opts.messages || [{ role: 'user', content: opts.prompt }];
    return post({ mode: 'chat', messages: messages, context: opts.context || '' }, opts.timeoutMs)
      .then(function (d) {
        var reply = d.reply || d.summary || '';
        if (reply && opts.cacheKey) cacheSet(opts.cacheKey, reply, opts.ttlMs || TTL.daily);
        return { reply: reply, usage: d.usage, cached: false };
      });
  }

  /**
   * Agent-style call (fire an event the server agent processes with tools).
   * opts:
   *   event      - event name, e.g. 'weekly_review', 'meal_logged'
   *   data       - lean payload (truncate history arrays to <= 14 entries)
   *   complexity - 'low' (Haiku) | 'high' (Sonnet). Server also force-routes
   *                known heavy events to the smart model.
   *   cacheKey / ttlMs - same semantics as chat()
   * Resolves the full server response ({ summary, actions, usage, ... }).
   */
  function agent(opts) {
    var hit = cacheGet(opts.cacheKey);
    if (hit) return Promise.resolve(Object.assign({ cached: true }, hit));
    var body = { event: opts.event, data: opts.data || {} };
    if (opts.complexity === 'high') body.model = 'smart';
    return post(body, opts.timeoutMs || 60000).then(function (d) {
      if (opts.cacheKey) cacheSet(opts.cacheKey, { summary: d.summary, actions: d.actions }, opts.ttlMs || TTL.daily);
      return d;
    });
  }

  /** Trim a history array to its most recent n entries (default 14). */
  function recent(arr, n) {
    if (!Array.isArray(arr)) return [];
    return arr.slice(-(n || 14));
  }

  /** Debounce for input-triggered AI calls. Minimum 800ms enforced. */
  function debounce(fn, ms) {
    var wait = Math.max(800, ms || 800);
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  window.LifeOS = window.LifeOS || {};
  window.LifeOS.ai = {
    chat: chat,
    agent: agent,
    recent: recent,
    debounce: debounce,
    cacheGet: cacheGet,
    cacheSet: cacheSet,
    TTL: TTL,
  };
})();
