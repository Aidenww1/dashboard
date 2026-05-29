// Client-side addEvent() helper. Include on any page that writes to the events table.
// Usage: await addEvent('workout.set', ['training'], { exercise: 'bench', kg: 80, reps: 8 })
(function () {
  'use strict';

  async function addEvent(type, domains, data, opts) {
    const o = opts || {};
    const body = JSON.stringify({
      type,
      domains: Array.isArray(domains) ? domains : [domains].filter(Boolean),
      data: data || {},
      source: o.source || 'manual',
      note: o.note || null,
      ts: o.ts || new Date().toISOString(),
    });
    const r = await fetch('/api/events/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: 'network error' }));
      throw new Error(err.error || 'addEvent failed');
    }
    return r.json();
  }

  window.addEvent = addEvent;
})();
