// Cross-module data bus.
// Included on every page via <script src="bus.js" defer> before topbar.js.
// Exposes window.Bus with pure-read functions — no side effects, no storage writes.
(function () {
  'use strict';

  function lsGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }

  function dateKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // Date key used by nutrition / gym (rolls back to yesterday before 6 AM)
  function appDateKey() {
    const d = new Date();
    if (d.getHours() < 6) d.setDate(d.getDate() - 1);
    return dateKey(d);
  }

  // Yesterday's (or today's) sleep entry — what you slept last night
  function getSleepRecovery() {
    try {
      const logs = lsGet('sleep:logs') || [];
      const yest = new Date(); yest.setDate(yest.getDate() - 1);
      const entry = logs.find(e => e.date === dateKey(yest)) || logs.find(e => e.date === dateKey(new Date())) || null;
      if (!entry) return null;
      const dh = Math.floor(entry.duration / 60), dm = entry.duration % 60;
      const dur = dm ? dh + 'h ' + dm + 'm' : dh + 'h';
      const scoreStr = entry.score != null ? ' · Score ' + entry.score : '';
      const useScore = entry.score != null;
      const good = useScore ? entry.score >= 80  : entry.duration >= 450;
      const bad  = useScore ? entry.score < 60   : entry.duration < 360;
      let color, advice;
      if (good)     { color = 'green';  advice = 'Well rested — push hard today'; }
      else if (bad) { color = 'red';    advice = 'Poor sleep — prioritise recovery'; }
      else          { color = 'orange'; advice = 'Light sleep — manage volume today'; }
      return { color, advice, dur, scoreStr, entry };
    } catch { return null; }
  }

  // Today's workout burn from gym module
  function getWorkoutBurn(dk) {
    dk = dk || appDateKey();
    try {
      const done = lsGet('po_coach_workout_done') || {};
      if (!done[dk]) return null;
      const gymState = lsGet('po_coach_v1') || {};
      let sets = 0;
      Object.values(gymState.logs || {}).forEach(exLogs => {
        if (Array.isArray(exLogs)) exLogs.forEach(l => { if ((l.date || '').slice(0, 10) === dk) sets++; });
      });
      return { sets, kcal: Math.round(sets * 6 + 80) };
    } catch { return null; }
  }

  // Extra hydration needed based on today's food logs
  function getNutritionHydrationHint(dk) {
    dk = dk || appDateKey();
    try {
      const logs = (lsGet('nt:logs') || []).filter(l => l.dateKey === dk);
      if (!logs.length) return null;
      const calories = logs.reduce((s, l) => s + (l.calories || 0), 0);
      const protein  = logs.reduce((s, l) => s + parseFloat(l.protein || 0), 0);
      const sodium   = logs.reduce((s, l) => s + (l.sodium || (l.micros && l.micros.sodium) || 0), 0);
      const extraMl  = Math.max(0, Math.round((calories - 1500) / 500) * 100);
      const reasons  = [];
      if (extraMl > 0)      reasons.push(Math.round(calories) + ' kcal logged');
      if (protein  > 60)    reasons.push(Math.round(protein) + 'g protein');
      if (sodium   > 2300)  reasons.push(Math.round(sodium) + 'mg sodium');
      return { calories, protein, sodium, extraMl, reasons };
    } catch { return null; }
  }

  // Caffeine-containing foods logged today (by name keyword)
  const CAFFEINE_KW = ['coffee', 'espresso', 'latte', 'cappuccino', 'americano', 'macchiato', 'mocha', 'cold brew', 'energy drink', 'red bull', 'monster', 'green tea', 'black tea', 'matcha', 'pre-workout', 'preworkout', 'pre workout'];

  function getFoodCaffeineItems(dk) {
    dk = dk || appDateKey();
    try {
      return (lsGet('nt:logs') || [])
        .filter(l => l.dateKey === dk && CAFFEINE_KW.some(k => (l.name || '').toLowerCase().includes(k)))
        .map(l => {
          const d = new Date(l.loggedAt || l.id || Date.now());
          return { name: l.name, time: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') };
        });
    } catch { return []; }
  }

  window.Bus = { getSleepRecovery, getWorkoutBurn, getNutritionHydrationHint, getFoodCaffeineItems };
})();
