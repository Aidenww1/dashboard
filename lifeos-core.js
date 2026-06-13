/* ============================================================
   LifeOS core — deterministic life-context layer.
   Single source of truth for everything Claude (and the UI)
   knows about the user's day. No AI calls in this file: all
   scoring, freshness and aggregation is plain code.

   window.LifeOS.context(slice)  -> lean object for one module
   window.LifeOS.score()         -> life score 0-100 + breakdown
   window.LifeOS.quality()       -> data quality 0-100 + stale list
   window.LifeOS.log(entry)      -> typed write into existing stores
   window.LifeOS.search(q)       -> matches across all log stores
   ============================================================ */
(function () {
  'use strict';

  function get(key, fb) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; } catch (_) { return fb; }
  }
  function set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
  }
  function todayStr(offsetDays) {
    var d = new Date();
    if (offsetDays) d.setDate(d.getDate() + offsetDays);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // Nutrition uses a 6am rollover day key (matches nutrition.html getAppDateKey)
  function ntDateKey() {
    var d = new Date();
    if (d.getHours() < 6) d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function daysAgo(dateStr) {
    if (!dateStr) return null;
    var norm = String(dateStr).slice(0, 10).replace(/\//g, '-');
    var d = new Date(norm + 'T12:00:00');
    if (isNaN(d)) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }
  function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function lastDates(n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(todayStr(-i));
    return out;
  }

  /* ---------- raw readers ---------- */

  function weightLogs() {
    return (get('po_coach_weights', []) || []).filter(function (e) { return e && e.dateKey && e.weight > 0; })
      .sort(function (a, b) { return String(a.dateKey).localeCompare(String(b.dateKey)); });
  }
  function sleepLogs() { return get('sleep:logs', []) || []; }
  function moodLogs() { return get('mind:mood:v1', []) || []; }
  function ntLogs() { return get('nt:logs', []) || []; }
  function ntTargets() {
    var t = get('nt:targets', {}) || {};
    return { calories: t.calories || 2000, protein: t.protein || 150 };
  }
  function workoutDone() {
    var d = get('po_coach_workout_done', {});
    return (d && typeof d === 'object' && !Array.isArray(d)) ? d : {};
  }
  function habitsDef() { return get('habits:v1', []) || []; }
  function habitLogs() { return get('habits:logs:v1', {}) || {}; }
  function stackItems() { return get('stack:items', []) || []; }
  function stackTaken(date) { return get('stack:taken:' + date, {}) || {}; }
  function waterState() { return get('po_water_v1', {}) || {}; }
  function bloodLogs() { return get('blood:logs', []) || []; }
  function bodyLogs() { return get('body:logs', []) || []; }
  function bfLogs() { return get('health:body:v1', []) || []; }
  function tasksAll() { return get('tasks:v1', []) || []; }
  function goalsFor(date) { return get('goals:' + date, []) || []; }
  function finIncome() { return get('fin:income', []) || []; }
  function finSubs() { return get('fin:subs', []) || []; }
  function finBudgets() { return get('fin:budgets', {}) || {}; }
  function finAccounts() { return get('fin:accounts:v1', []) || []; }

  /* ---------- derived numbers ---------- */

  function latestWeight() {
    var w = weightLogs();
    return w.length ? w[w.length - 1] : null;
  }
  function weightTrend7d() {
    var w = weightLogs().slice(-10);
    if (w.length < 4) return null;
    var recent = w.slice(-3).reduce(function (s, e) { return s + e.weight; }, 0) / 3;
    var older = w.slice(0, 3).reduce(function (s, e) { return s + e.weight; }, 0) / 3;
    return +(recent - older).toFixed(1);
  }
  function sleepFor(date) {
    return sleepLogs().find(function (e) { return e && e.date === date; }) || null;
  }
  function sleepDebt7d(targetHrs) {
    var tgt = (targetHrs || 8) * 60, debt = 0, counted = 0;
    lastDates(7).forEach(function (ds) {
      var e = sleepFor(ds);
      if (e && e.duration) { debt += Math.max(0, tgt - e.duration); counted++; }
    });
    return counted ? Math.round(debt / 60 * 10) / 10 : null;
  }
  function ntTotalsFor(dateKey) {
    var logs = ntLogs().filter(function (l) { return l && String(l.dateKey).replace(/\//g, '-') === dateKey; });
    var t = { calories: 0, protein: 0, carbs: 0, fat: 0, entries: logs.length };
    logs.forEach(function (l) {
      t.calories += l.calories || 0; t.protein += l.protein || 0;
      t.carbs += l.carbs || 0; t.fat += l.fat || 0;
    });
    t.calories = Math.round(t.calories); t.protein = Math.round(t.protein);
    t.carbs = Math.round(t.carbs); t.fat = Math.round(t.fat);
    return t;
  }
  function proteinConsistency7d() {
    var tgt = ntTargets().protein, hit = 0, logged = 0;
    lastDates(7).forEach(function (ds) {
      var t = ntTotalsFor(ds);
      if (t.entries) { logged++; if (t.protein >= tgt * 0.9) hit++; }
    });
    return logged ? Math.round(hit / logged * 100) : null;
  }
  function workouts7d() {
    var done = workoutDone(), n = 0;
    lastDates(7).forEach(function (ds) { if (done[ds]) n++; });
    return n;
  }
  function habitsToday() {
    var defs = habitsDef(), logs = habitLogs()[todayStr()] || [];
    return { total: defs.length, done: logs.length };
  }
  function suppsToday() {
    var items = stackItems(), taken = stackTaken(todayStr());
    var done = items.filter(function (i) { return taken[i.id]; }).length;
    return { total: items.length, taken: done, due: items.filter(function (i) { return !taken[i.id]; }).map(function (i) { return i.name; }) };
  }
  function waterToday() {
    var ws = waterState();
    var count = (ws.logs || {})[todayStr()] || 0;
    var wKg = (ws.profile || {}).weightKg || 75;
    var bMl = ws.bottleMl || 500;
    return { count: count, target: Math.max(1, Math.ceil(wKg * 35 / bMl)) };
  }
  function focusMinToday() {
    var s = 0;
    (get('focus:logs:v1', []) || []).forEach(function (l) { if (l && l.date === todayStr()) s += l.sec || 0; });
    return Math.round(s / 60);
  }
  function financeSnapshot() {
    var thisMonth = todayStr().slice(0, 7);
    var income = finIncome();
    var monthIncome = income.filter(function (e) { return String(e.date || '').slice(0, 7) === thisMonth; })
      .reduce(function (s, e) { return s + (parseFloat(e.amount) || 0); }, 0);
    if (!monthIncome && income.length) {
      var recent = income.slice(-3);
      monthIncome = recent.reduce(function (s, e) { return s + (parseFloat(e.amount) || 0); }, 0) / recent.length;
    }
    var subsCost = finSubs().filter(function (s) { return s.active !== false; }).reduce(function (s, sub) {
      var amt = parseFloat(sub.cost || sub.amount || 0);
      var freq = sub.frequency || sub.freq || 'monthly';
      if (freq === 'yearly' || freq === 'annual') return s + amt / 12;
      if (freq === 'weekly') return s + amt * 4.33;
      return s + amt;
    }, 0);
    var budget = Object.values(finBudgets()).reduce(function (s, v) { return s + (parseFloat(v) || 0); }, 0);
    var accounts = finAccounts();
    var assets = accounts.filter(function (a) { return ['credit', 'loan'].indexOf(a.type) < 0; }).reduce(function (s, a) { return s + (a.balance || 0); }, 0);
    var liabs = accounts.filter(function (a) { return ['credit', 'loan'].indexOf(a.type) >= 0; }).reduce(function (s, a) { return s + (a.balance || 0); }, 0);
    var expenses = subsCost + budget;
    // Actual savings rate for the last full month, from imported bank transactions
    var lastMonthRate = null;
    var bizProfitYtd = null;
    try {
      var now = new Date();
      var prevYm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      var ymKey = prevYm.getFullYear() + '-' + String(prevYm.getMonth() + 1).padStart(2, '0');
      var inn = 0, out = 0, seen = false;
      (get('ing:tx', []) || []).forEach(function (t) {
        if (String(t.date || '').slice(0, 7) !== ymKey) return;
        seen = true;
        var a = parseFloat(t.amount) || 0;
        if (a > 0) inn += a; else out += Math.abs(a);
      });
      if (seen && inn > 0) lastMonthRate = Math.round((inn - out) / inn * 100);
      var yr = String(now.getFullYear());
      var rev = 0, exp = 0, hasBiz = false;
      (get('gl:revenue', []) || []).forEach(function (r) { if (String(r.date || '').slice(0, 4) === yr) { rev += parseFloat(r.amount) || 0; hasBiz = true; } });
      (get('gl:expenses', []) || []).forEach(function (e) { if (String(e.date || '').slice(0, 4) === yr) { exp += parseFloat(e.amount) || 0; hasBiz = true; } });
      if (hasBiz) bizProfitYtd = Math.round(rev - exp);
    } catch (e) {}
    return {
      monthly_income: Math.round(monthIncome),
      monthly_expenses_est: Math.round(expenses),
      subscriptions_monthly: Math.round(subsCost),
      savings_rate_pct: monthIncome ? Math.round((monthIncome - expenses) / monthIncome * 100) : null,
      savings_rate_last_month_actual_pct: lastMonthRate,
      business_profit_ytd: bizProfitYtd,
      net_worth: Math.round(assets - liabs),
      accounts: accounts.length,
    };
  }

  /* ---------- life score (deterministic) ---------- */

  function score() {
    var parts = [], total = 0;
    function add(key, label, pts, max, detail) {
      pts = Math.max(0, Math.min(max, Math.round(pts)));
      parts.push({ key: key, label: label, pts: pts, max: max, detail: detail });
      total += pts;
    }

    // Sleep (20)
    var sl = sleepFor(todayStr()) || sleepFor(todayStr(-1));
    if (sl && sl.duration) {
      var h = sl.duration / 60;
      var p = h < 4 ? 2 : h < 5 ? 6 : h < 6 ? 10 : h < 7 ? 15 : h <= 8.5 ? 20 : 17;
      add('sleep', 'Sleep', p, 20, Math.floor(h) + 'h ' + (sl.duration % 60) + 'm');
    } else add('sleep', 'Sleep', 10, 20, 'No data');

    // Nutrition (15)
    var nt = ntTotalsFor(ntDateKey()), tgt = ntTargets();
    if (nt.entries) {
      var r = nt.calories / tgt.calories;
      var np = r < 0.4 ? 3 : r < 0.6 ? 7 : r < 0.8 ? 10 : r <= 1.2 ? 15 : 10;
      if (nt.protein >= tgt.protein * 0.85) np = Math.min(15, np + 2);
      add('nutrition', 'Nutrition', np, 15, nt.calories + ' kcal · ' + nt.protein + 'g P');
    } else add('nutrition', 'Nutrition', 7, 15, 'No data');

    // Training (15): today/yesterday + weekly frequency
    var done = workoutDone(), wk = workouts7d();
    var tToday = !!done[todayStr()], tYest = !!done[todayStr(-1)];
    var tp = 6;
    if (tToday && !tYest) tp = 12; else if (tToday) tp = 10; else if (tYest) tp = 9;
    tp += wk >= 3 ? 3 : wk === 2 ? 2 : wk === 1 ? 1 : 0;
    add('training', 'Training', tp, 15, wk + ' sessions / 7d' + (tToday ? ' · today done' : ''));

    // Habits (10)
    var hb = habitsToday();
    if (hb.total) add('habits', 'Habits', hb.done / hb.total * 10, 10, hb.done + '/' + hb.total + ' done');
    else add('habits', 'Habits', 5, 10, 'No habits set');

    // Productivity (15): today's goals + tasks done today + deep work
    var goals = goalsFor(todayStr());
    var goalsDone = goals.filter(function (g) { return g && g.done; }).length;
    var tasksDoneToday = tasksAll().filter(function (t) {
      return t && t.done && String(t.completedAt || t.createdAt || '').slice(0, 10) === todayStr();
    }).length;
    var fmins = focusMinToday();
    var fpts = fmins >= 90 ? 3 : fmins >= 45 ? 2 : fmins > 0 ? 1 : 0;
    var fdetail = fmins ? ' · ' + fmins + 'm focus' : '';
    if (goals.length) {
      var pp = Math.min(15, goalsDone / goals.length * 9 + Math.min(3, tasksDoneToday) + fpts);
      add('productivity', 'Productivity', pp, 15, goalsDone + '/' + goals.length + ' goals' + (tasksDoneToday ? ' · ' + tasksDoneToday + ' tasks' : '') + fdetail);
    } else add('productivity', 'Productivity', 6 + fpts, 15, (fmins ? fmins + 'm focus, no goals set' : 'No goals today'));

    // Finance (15): savings rate
    var fin = financeSnapshot();
    if (fin.savings_rate_pct != null) {
      var sr = fin.savings_rate_pct;
      var fp = sr >= 40 ? 15 : sr >= 30 ? 13 : sr >= 20 ? 11 : sr >= 10 ? 8 : sr >= 0 ? 5 : 2;
      add('finance', 'Finance', fp, 15, sr + '% savings rate');
    } else add('finance', 'Finance', 8, 15, 'No income data');

    // Hydration (5)
    var w = waterToday();
    if (w.count > 0) add('hydration', 'Hydration', Math.min(5, w.count / w.target * 5), 5, w.count + '/' + w.target + ' bottles');
    else add('hydration', 'Hydration', 2, 5, 'No data');

    // Supplements (5)
    var sp = suppsToday();
    if (sp.total) add('supplements', 'Supplements', sp.taken / sp.total * 5, 5, sp.taken + '/' + sp.total + ' taken');
    else add('supplements', 'Supplements', 3, 5, 'No stack');

    // biggest drag = lowest fill ratio among data-backed parts
    var drag = null;
    parts.forEach(function (p) {
      if (p.detail === 'No data' || p.detail === 'No habits set' || p.detail === 'No goals today' || p.detail === 'No income data' || p.detail === 'No stack') return;
      if (!drag || p.pts / p.max < drag.pts / drag.max) drag = p;
    });
    if (!drag) drag = parts[0];

    var ACTIONS = {
      sleep: 'Get to bed earlier tonight.',
      nutrition: 'Log your meals and close the protein gap.',
      training: 'Get a session in today or schedule the next one.',
      habits: 'Knock out one habit right now.',
      productivity: 'Pick one goal and finish it.',
      finance: 'Review this month’s spending.',
      hydration: 'Drink a bottle of water now.',
      supplements: 'Take your remaining supplements.',
    };

    var result = { total: Math.min(100, total), parts: parts, drag: drag, action: ACTIONS[drag.key] || '' };

    // daily snapshot history (kept 180 days)
    try {
      var hist = get('lifescore:history:v1', {}) || {};
      hist[todayStr()] = result.total;
      var keys = Object.keys(hist).sort();
      while (keys.length > 180) delete hist[keys.shift()];
      set('lifescore:history:v1', hist);
    } catch (_) {}

    return result;
  }

  /* ---------- readiness (deterministic) ---------- */

  function readiness() {
    var parts = [], total = 0;
    function add(key, label, pts, max, detail) {
      pts = Math.max(0, Math.min(max, Math.round(pts)));
      parts.push({ key: key, label: label, pts: pts, max: max, detail: detail });
      total += pts;
    }

    // Sleep last night (40)
    var sl = sleepFor(todayStr()) || sleepFor(todayStr(-1));
    if (sl && sl.duration) {
      var h = sl.duration / 60;
      var p = h < 4 ? 8 : h < 5 ? 16 : h < 6 ? 24 : h < 7 ? 32 : h <= 8.5 ? 40 : 34;
      if (sl.score != null) p = Math.max(0, Math.min(40, p + Math.round((sl.score - 70) / 30 * 5)));
      add('sleep', 'Last night', p, 40, Math.floor(h) + 'h ' + (sl.duration % 60) + 'm' + (sl.score != null ? ' · score ' + sl.score : ''));
    } else add('sleep', 'Last night', 20, 40, 'No sleep logged');

    // Sleep debt 7d (20)
    var debt = sleepDebt7d(8);
    if (debt != null) {
      var dp = debt <= 0.5 ? 20 : debt <= 2 ? 17 : debt <= 4 ? 13 : debt <= 7 ? 8 : 4;
      add('debt', 'Sleep debt', dp, 20, debt + 'h short vs 8h/night (7d)');
    } else add('debt', 'Sleep debt', 10, 20, 'No 7d sleep data');

    // Training load (15): rested yesterday = more ready today
    var done = workoutDone();
    var yest = !!done[todayStr(-1)], before = !!done[todayStr(-2)];
    if (yest && before) add('load', 'Training load', 5, 15, 'Trained 2 days straight');
    else if (yest) add('load', 'Training load', 9, 15, 'Trained yesterday');
    else add('load', 'Training load', 15, 15, 'Rested yesterday');

    // Mood trend (15): avg of last 3 logged moods (1-5)
    var moods = moodLogs().slice(-3).map(function (m) { return m.mood; }).filter(function (v) { return v >= 1; });
    if (moods.length) {
      var avg = moods.reduce(function (a, b) { return a + b; }, 0) / moods.length;
      add('mood', 'Mood trend', avg / 5 * 15, 15, avg.toFixed(1) + '/5 last ' + moods.length + ' logs');
    } else add('mood', 'Mood trend', 8, 15, 'No mood logged');

    // Logging consistency (10): sleep logged days of last 7
    var logged = lastDates(7).filter(function (ds) { return !!sleepFor(ds); }).length;
    add('consistency', 'Sleep logging', logged / 7 * 10, 10, logged + '/7 nights logged');

    var worst = parts.slice().sort(function (a, b) { return a.pts / a.max - b.pts / b.max; })[0];
    var ADVICE = {
      sleep: 'Rough night. Keep today light and get to bed early.',
      debt: 'Sleep debt is stacking up. Protect tonight: no late screens, fixed bedtime.',
      load: 'Back-to-back training. Make today easy or rest.',
      mood: 'Mood is low. One easy win this morning beats a heavy session.',
      consistency: 'Log sleep nightly or readiness stays a guess.',
    };
    var label = total >= 75 ? 'Ready' : total >= 55 ? 'Moderate' : 'Low';
    return { score: total, label: label, parts: parts, sleep_debt_hrs: debt, advice: ADVICE[worst.key] || '' };
  }

  /* ---------- data quality ---------- */

  function quality() {
    var checks = [];
    function check(key, label, lastDate, maxDays, why) {
      var d = daysAgo(lastDate);
      var fresh = d != null && d <= maxDays;
      checks.push({ key: key, label: label, fresh: fresh, lastDate: lastDate || null, daysAgo: d, maxDays: maxDays, why: why });
    }

    var w = latestWeight();
    check('weight', 'Weight', w && w.dateKey, 3, 'Weight trend drives nutrition and training advice.');
    var sl = sleepLogs().map(function (e) { return e.date; }).sort().pop();
    check('sleep', 'Sleep', sl, 1, 'Sleep drives readiness and recovery advice.');
    var ntDates = ntLogs().map(function (l) { return String(l.dateKey || '').replace(/\//g, '-'); }).sort().pop();
    check('nutrition', 'Nutrition', ntDates, 1, 'No meals logged means calorie advice is a guess.');
    var doneDates = Object.keys(workoutDone()).sort().pop();
    check('training', 'Training', doneDates, 4, 'Training frequency feeds progression and recovery.');
    var md = moodLogs().map(function (e) { return e.date; }).sort().pop();
    check('mood', 'Mood', md, 2, 'Mood and energy power correlation insights.');
    var bl = bloodLogs().map(function (e) { return e.date; }).sort().pop();
    check('bloodwork', 'Bloodwork', bl, 90, 'Stale bloodwork hides health risks.');
    var bd = bodyLogs().map(function (e) { return e.date; }).sort().pop();
    check('measurements', 'Measurements', bd, 30, 'Measurements verify what the scale claims.');
    var fi = finIncome().map(function (e) { return e.date; }).sort().pop();
    check('finance', 'Finance', fi, 35, 'Income data drives savings rate and afford checks.');
    var pp = (get('body:photos:v1', []) || []).map(function (p) { return p.date; }).sort().pop();
    check('photos', 'Progress photos', pp, 14, 'Visual checks keep weight-trend advice honest.');
    var sk = (get('skin:logs', []) || []).map(function (e) { return e.date; }).sort().pop();
    check('skin', 'Skin checks', sk, 7, 'Skin ratings power product-reaction detection.');

    var freshCount = checks.filter(function (c) { return c.fresh; }).length;
    var stale = checks.filter(function (c) { return !c.fresh; });
    return {
      score: Math.round(freshCount / checks.length * 100),
      checks: checks,
      stale: stale,
      worst: stale.sort(function (a, b) { return (b.daysAgo == null ? 9999 : b.daysAgo) - (a.daysAgo == null ? 9999 : a.daysAgo); })[0] || null,
    };
  }

  /* ---------- context slices ---------- */

  function sliceToday() {
    var w = latestWeight(), nt = ntTotalsFor(ntDateKey()), tgt = ntTargets();
    var sl = sleepFor(todayStr()) || sleepFor(todayStr(-1));
    var sc = score(), q = quality(), rd = readiness();
    return {
      date: todayStr(),
      life_score: sc.total,
      readiness: { score: rd.score, label: rd.label, sleep_debt_hrs: rd.sleep_debt_hrs, advice: rd.advice },
      biggest_drag: sc.drag ? sc.drag.label + ' (' + sc.drag.detail + ')' : null,
      data_quality_pct: q.score,
      weight_kg: w ? w.weight : null,
      weight_trend_7d_kg: weightTrend7d(),
      sleep_last_night_min: sl ? sl.duration : null,
      calories_today: nt.calories, calories_target: tgt.calories,
      protein_today_g: nt.protein, protein_target_g: tgt.protein,
      water: waterToday(),
      supplements: suppsToday(),
      workout_done_today: !!workoutDone()[todayStr()],
      habits: habitsToday(),
      goals_today: goalsFor(todayStr()).map(function (g) { return { text: g.text, done: !!g.done }; }).slice(0, 10),
      tasks_open: tasksAll().filter(function (t) { return !t.done; }).slice(0, 8).map(function (t) { return t.title; }),
      missing_data: q.stale.map(function (c) { return c.label + (c.daysAgo != null ? ' (' + c.daysAgo + 'd old)' : ' (never)'); }),
    };
  }

  function sliceNutrition() {
    var tgt = ntTargets();
    var days = lastDates(7).map(function (ds) { var t = ntTotalsFor(ds); return { date: ds, kcal: t.calories, protein: t.protein, entries: t.entries }; });
    var recentMeals = ntLogs().slice(-30).map(function (l) { return l.name; }).filter(Boolean);
    return { targets: tgt, last7d: days, protein_consistency_pct: proteinConsistency7d(), recent_meals: recentMeals.slice(-15), weight_kg: (latestWeight() || {}).weight || null, weight_trend_7d_kg: weightTrend7d() };
  }

  function sliceTraining() {
    var done = workoutDone();
    var days = lastDates(14).filter(function (ds) { return done[ds]; });
    return { sessions_last_14d: days, sessions_7d: workouts7d(), workout_done_today: !!done[todayStr()], sleep_last_night_min: (sleepFor(todayStr()) || sleepFor(todayStr(-1)) || {}).duration || null, weight_kg: (latestWeight() || {}).weight || null };
  }

  function sliceRecovery() {
    var days = lastDates(7).map(function (ds) {
      var e = sleepFor(ds), m = moodLogs().find(function (x) { return x.date === ds; });
      return { date: ds, sleep_min: e ? e.duration : null, sleep_score: e && e.score != null ? e.score : null, mood: m ? m.mood : null };
    });
    var rd = readiness();
    return { last7d: days, sleep_debt_hrs_7d: sleepDebt7d(8), sessions_7d: workouts7d(), readiness: { score: rd.score, label: rd.label, advice: rd.advice, parts: rd.parts } };
  }

  function sliceHealth() {
    var bl = bloodLogs();
    var latest = bl.length ? bl[bl.length - 1] : null;
    return {
      bloodwork_latest: latest,
      bloodwork_age_days: latest ? daysAgo(latest.date) : null,
      supplements: { stack: stackItems().map(function (i) { return i.name; }), today: suppsToday() },
      sleep_debt_hrs_7d: sleepDebt7d(8),
      weight_kg: (latestWeight() || {}).weight || null,
    };
  }

  function sliceFinance() { return financeSnapshot(); }

  function sliceProductivity() {
    var tasks = tasksAll();
    return {
      goals_today: goalsFor(todayStr()),
      tasks_open: tasks.filter(function (t) { return !t.done; }).map(function (t) { return { title: t.title, due: t.due, priority: t.priority }; }).slice(0, 15),
      tasks_overdue: tasks.filter(function (t) { return !t.done && t.due && t.due < todayStr(); }).length,
      habits: habitsToday(),
      focus_min_today: focusMinToday(),
    };
  }

  function sliceMissing() {
    var q = quality();
    return { data_quality_pct: q.score, stale: q.stale };
  }

  function sliceMail() {
    var s = get('mail:summary:v1', null);
    if (!s) return { synced: false, note: 'Gmail not synced yet (mail.html)' };
    return {
      synced_hours_ago: Math.round((Date.now() - (s.ts || 0)) / 3600000),
      total_inbox: s.total_inbox,
      needs_reply: s.needs_reply,
      bills: s.bills,
      orders_active: s.orders_active,
      delivery_issues: s.delivery_issues,
      opportunities: s.opportunities,
      newsletters_promo: s.newsletters_promo,
    };
  }

  function sliceOpportunities() {
    var s = get('radar:summary:v1', null);
    if (!s) return { scanned: false, note: 'Opportunity Radar not opened yet (radar.html)' };
    return {
      generated_hours_ago: Math.round((Date.now() - new Date(s.generated_at).getTime()) / 3600000),
      total_found: s.total_found,
      top: s.shown,
    };
  }

  function sliceSkin() {
    var logs = get('skin:logs', []) || [];
    var prods = get('skin:products', []) || [];
    var routine = get('skin:routine:v1', {}) || {};
    var checks = 0;
    lastDates(7).forEach(function (ds) { checks += (routine[ds] || []).length; });
    var recent = logs.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 7);
    return {
      adherence_7d_pct: prods.length ? Math.min(100, Math.round(checks / (7 * prods.length) * 100)) : null,
      products: prods.map(function (p) { return p.name; }).filter(Boolean),
      recent_ratings: recent.map(function (e) { return { date: e.date, rating: e.rating, concerns: e.concerns }; }),
      latest_analysis: (recent.find(function (e) { return e.analysis; }) || {}).analysis || null,
      last_check_date: recent.length ? recent[0].date : null,
    };
  }

  function sliceBodyProgress() {
    var ps = get('body:photos:v1', []) || [];
    var rs = get('body:photo_reports:v1', []) || [];
    var last = ps.map(function (p) { return p.date; }).sort().pop() || null;
    var recent30 = ps.filter(function (p) { return daysAgo(p.date) != null && daysAgo(p.date) <= 30; });
    var angles = {};
    recent30.forEach(function (p) { angles[p.angle] = (angles[p.angle] || 0) + 1; });
    return {
      photos_total: ps.length,
      last_photo_date: last,
      last_photo_age_days: last ? daysAgo(last) : null,
      angles_last_30d: angles,
      latest_reports: rs.slice(-3).map(function (r) {
        return { date: r.date, angle: r.angle, confidence: r.report && r.report.confidence, summary: r.report && r.report.summary, next_action: r.report && r.report.next_action };
      }),
      weight_kg: (latestWeight() || {}).weight || null,
      weight_trend_7d_kg: weightTrend7d(),
      measurements_latest: bodyLogs().slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })[0] || null,
    };
  }

  function sliceFull() {
    return {
      today: sliceToday(),
      nutrition: sliceNutrition(),
      training: sliceTraining(),
      recovery: sliceRecovery(),
      finance: sliceFinance(),
      productivity: sliceProductivity(),
    };
  }

  function context(slice) {
    switch (slice) {
      case 'nutrition': return sliceNutrition();
      case 'training': return sliceTraining();
      case 'recovery': return sliceRecovery();
      case 'health': return sliceHealth();
      case 'finance': return sliceFinance();
      case 'productivity': return sliceProductivity();
      case 'missing_data': return sliceMissing();
      case 'body_progress': return sliceBodyProgress();
      case 'skin': return sliceSkin();
      case 'mail': return sliceMail();
      case 'opportunities': return sliceOpportunities();
      case 'full_summary': return sliceFull();
      case 'today':
      default: return sliceToday();
    }
  }

  /* ---------- typed log writers ---------- */

  function log(entry) {
    if (!entry || !entry.type) return { ok: false, message: 'No entry type' };
    var t = todayStr();
    try {
      switch (entry.type) {
        case 'weight': {
          var kg = parseFloat(entry.kg || entry.weight);
          if (!kg || kg < 20 || kg > 400) return { ok: false, message: 'Bad weight value' };
          var logs = weightLogs().filter(function (e) { return e.dateKey !== t; });
          logs.push({ dateKey: t, weight: kg });
          logs.sort(function (a, b) { return String(a.dateKey).localeCompare(String(b.dateKey)); });
          set('po_coach_weights', logs);
          return { ok: true, message: 'Weight ' + kg + 'kg logged' };
        }
        case 'sleep': {
          var mins = entry.minutes ? Math.round(entry.minutes) : Math.round((parseFloat(entry.hours) || 0) * 60);
          if (!mins || mins < 60 || mins > 1000) return { ok: false, message: 'Bad sleep duration' };
          var sls = sleepLogs().filter(function (e) { return e.date !== t; });
          var rec = { id: Date.now(), date: t, duration: mins };
          if (entry.score != null) rec.score = entry.score;
          sls.push(rec);
          set('sleep:logs', sls);
          return { ok: true, message: 'Sleep ' + Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm logged' };
        }
        case 'mood': {
          var mv = Math.round(parseFloat(entry.mood));
          if (!mv || mv < 1) return { ok: false, message: 'Bad mood value' };
          if (mv > 5) mv = Math.round(mv / 2); // accept 1-10 input, store 1-5
          mv = Math.max(1, Math.min(5, mv));
          var ml = moodLogs().filter(function (e) { return e.date !== t; });
          var mrec = { date: t, mood: mv };
          if (entry.note) mrec.note = String(entry.note).slice(0, 200);
          ml.push(mrec);
          set('mind:mood:v1', ml);
          return { ok: true, message: 'Mood ' + mv + '/5 logged' };
        }
        case 'meal': {
          if (!entry.name) return { ok: false, message: 'Meal needs a name' };
          var all = ntLogs();
          all.push({
            id: genId(), dateKey: ntDateKey(), foodId: null, name: String(entry.name).slice(0, 80),
            amount: entry.amount || 1, unit: entry.unit || 'serving',
            calories: Math.round(entry.calories || 0), protein: Math.round(entry.protein || 0),
            carbs: Math.round(entry.carbs || 0), fat: Math.round(entry.fat || 0),
            micros: {}, estimated: true, loggedAt: Date.now(),
          });
          set('nt:logs', all);
          return { ok: true, message: entry.name + ' logged (' + Math.round(entry.calories || 0) + ' kcal, estimated)' };
        }
        case 'water': {
          var ws = waterState();
          ws.logs = ws.logs || {};
          ws.logs[t] = (ws.logs[t] || 0) + (entry.count || 1);
          set('po_water_v1', ws);
          return { ok: true, message: 'Water logged (' + ws.logs[t] + ' today)' };
        }
        case 'supplement': {
          var name = String(entry.name || '').toLowerCase();
          var item = stackItems().find(function (i) { return (i.name || '').toLowerCase().indexOf(name) >= 0; });
          if (!item) return { ok: false, message: 'No "' + entry.name + '" in stack' };
          var taken = stackTaken(t);
          taken[item.id] = true;
          set('stack:taken:' + t, taken);
          return { ok: true, message: item.name + ' marked taken' };
        }
        case 'task': {
          if (!entry.title) return { ok: false, message: 'Task needs a title' };
          var tasks = tasksAll();
          tasks.push({ id: genId(), title: String(entry.title).slice(0, 120), project: 'inbox', priority: entry.priority || 'med', due: entry.due || null, notes: null, done: false, subtasks: [], createdAt: new Date().toISOString() });
          set('tasks:v1', tasks);
          return { ok: true, message: 'Task added: ' + entry.title };
        }
        case 'goal': {
          if (!entry.text) return { ok: false, message: 'Goal needs text' };
          var gs = goalsFor(t);
          gs.push({ text: String(entry.text).slice(0, 120), done: false });
          set('goals:' + t, gs);
          return { ok: true, message: 'Goal added: ' + entry.text };
        }
        case 'note': {
          if (!entry.text) return { ok: false, message: 'Empty note' };
          var existing = get('dashboard:notes', '') || '';
          set('dashboard:notes', (existing ? existing + '\n' : '') + entry.text);
          return { ok: true, message: 'Note saved' };
        }
        default:
          return { ok: false, message: 'Unknown type: ' + entry.type };
      }
    } catch (e) {
      return { ok: false, message: 'Write failed: ' + e.message };
    } finally {
      try { window.dispatchEvent(new CustomEvent('lifeos:logged', { detail: entry })); } catch (_) {}
    }
  }

  /* ---------- global search ---------- */

  function search(q) {
    q = String(q || '').trim().toLowerCase();
    if (q.length < 2) return [];
    var out = [];
    function hit(type, label, detail, href, date) {
      out.push({ type: type, label: label, detail: detail || '', href: href, date: date || '' });
    }
    ntLogs().slice(-300).reverse().forEach(function (l) {
      if (out.length < 40 && l.name && l.name.toLowerCase().indexOf(q) >= 0)
        hit('Meal', l.name, (l.calories || 0) + ' kcal · ' + (l.protein || 0) + 'g P', '/nutrition', String(l.dateKey || '').replace(/\//g, '-'));
    });
    tasksAll().forEach(function (tk) {
      if (tk.title && tk.title.toLowerCase().indexOf(q) >= 0)
        hit('Task', tk.title, tk.done ? 'done' : (tk.due ? 'due ' + tk.due : 'open'), '/tasks');
    });
    habitsDef().forEach(function (h) {
      var nm = h.name || h.title || '';
      if (nm.toLowerCase().indexOf(q) >= 0) hit('Habit', nm, '', '/habits');
    });
    stackItems().forEach(function (i) {
      if ((i.name || '').toLowerCase().indexOf(q) >= 0) hit('Supplement', i.name, i.dose || '', '/health');
    });
    finSubs().forEach(function (s) {
      var nm = s.name || s.title || '';
      if (nm.toLowerCase().indexOf(q) >= 0) hit('Subscription', nm, (s.cost || s.amount || '') + '', '/finance');
    });
    bloodLogs().slice(-5).forEach(function (b) {
      Object.keys(b).forEach(function (k) {
        if (k !== 'date' && k !== 'id' && k.toLowerCase().indexOf(q) >= 0)
          hit('Bloodwork', k, b[k] + '', '/health', b.date);
      });
    });
    (get('body:photo_reports:v1', []) || []).forEach(function (r) {
      var txt = ((r.report && r.report.summary) || '') + ' ' + (r.note || '');
      if (txt.toLowerCase().indexOf(q) >= 0)
        hit('Photo report', (r.report && r.report.summary || '').slice(0, 60), r.angle + ' · ' + (r.report && r.report.confidence || ''), '/body', r.date);
    });
    var notes = get('dashboard:notes', '') || '';
    if (typeof notes === 'string' && notes.toLowerCase().indexOf(q) >= 0) {
      var line = notes.split('\n').find(function (l) { return l.toLowerCase().indexOf(q) >= 0; });
      hit('Note', line ? line.slice(0, 60) : 'Quick notes', '', '/');
    }
    // last 30 days of goals
    lastDates(30).forEach(function (ds) {
      goalsFor(ds).forEach(function (g) {
        if (out.length < 60 && g.text && g.text.toLowerCase().indexOf(q) >= 0)
          hit('Goal', g.text, g.done ? 'done' : 'open', '/', ds);
      });
    });
    moodLogs().slice(-60).forEach(function (m) {
      if (m.note && m.note.toLowerCase().indexOf(q) >= 0) hit('Mood note', m.note.slice(0, 60), 'mood ' + m.mood + '/5', '/mood', m.date);
    });
    return out.slice(0, 20);
  }

  window.LifeOS = window.LifeOS || {};
  window.LifeOS.context = context;
  window.LifeOS.score = score;
  window.LifeOS.readiness = readiness;
  window.LifeOS.quality = quality;
  window.LifeOS.log = log;
  window.LifeOS.search = search;
  window.LifeOS.todayStr = todayStr;
  try { window.dispatchEvent(new CustomEvent('lifeos:ready')); } catch (_) {}
})();

/* ============================================================
   Phase 12 — daily cloud backup of localStorage.
   Once per day, on the first page open, a snapshot (minus photo
   payloads and AI caches) is upserted into one of 14 rolling
   app_state slots: key 'backup:slotNN', NN = dayIndex % 14.
   Guards: needs 20+ keys AND 50+ KB of real data, so an empty
   browser (fresh device, preview, post-wipe) can never overwrite
   a real backup slot. Failed pushes retry on reconnect.
   ============================================================ */
(function dailyCloudBackup() {
  'use strict';
  var SUPA_URL = 'https://nwdyuiimfqhlqscnbqmq.supabase.co';
  var SUPA_KEY = 'sb_publishable_KFOU1sDCxRp8c1M3kSytHg_nuQWzfPT';
  var MARKER = 'backup:last:v1';
  var EXCLUDE = ['ai:cache:v1', 'mail:cache:v1', 'mail:aiclass:v1', MARKER];
  var MAX_KEY_BYTES = 200 * 1024; // photo stores etc. — too heavy for a daily row

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function buildSnapshot() {
    var snap = {}, excluded = [], keys = 0, bytes = 0;
    Object.keys(localStorage).forEach(function (k) {
      if (EXCLUDE.indexOf(k) >= 0) { excluded.push(k); return; }
      var raw = localStorage.getItem(k) || '';
      if (raw.length > MAX_KEY_BYTES) { excluded.push(k + ' (' + Math.round(raw.length / 1024) + 'KB)'); return; }
      try { snap[k] = JSON.parse(raw); } catch (e) { snap[k] = raw; }
      keys++; bytes += raw.length;
    });
    return { snap: snap, excluded: excluded, keys: keys, bytes: bytes };
  }

  function push() {
    try {
      if (!navigator.onLine) return;
      if (localStorage.getItem(MARKER) === todayKey()) return;
      var b = buildSnapshot();
      if (b.keys < 20 || b.bytes < 50 * 1024) return; // not a real dataset — never risk a slot
      var slot = 'backup:slot' + String(Math.floor(Date.now() / 86400000) % 14).padStart(2, '0');
      fetch(SUPA_URL + '/rest/v1/app_state?on_conflict=key', {
        method: 'POST',
        headers: {
          apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY,
          'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          key: slot,
          data: { at: new Date().toISOString(), date: todayKey(), keys: b.keys, bytes: b.bytes, excluded: b.excluded, snapshot: b.snap },
          updated_at: new Date().toISOString(),
        }),
      }).then(function (r) {
        if (r.ok) try { localStorage.setItem(MARKER, todayKey()); } catch (e) {}
      }).catch(function () { /* marker not set -> retried on reconnect / next open */ });
    } catch (e) {}
  }

  window.__cloudBackupPush = push;            // test hooks
  window.__cloudBackupSnapshot = buildSnapshot;

  setTimeout(push, 8000); // off the critical path of page load
  window.addEventListener('online', function () { setTimeout(push, 3000); });
})();
