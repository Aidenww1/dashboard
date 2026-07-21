(function () {
  'use strict';

  var D = window.LifeOS && window.LifeOS.data || {};
  var UI = window.UI || {};
  var dash = document.getElementById('dash');
  var qlog = document.getElementById('qlog');
  var shareButton = document.getElementById('shareToday');
  var canonicalNutrition = null;
  var canonicalPhaseF = null;
  var canonicalNutritionError = null;
  var canonicalRequest = 0;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"]/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char];
    });
  }
  function num(value, digits) {
    if (value == null || !isFinite(Number(value))) return '-';
    return Number(value).toLocaleString('en-GB', {
      minimumFractionDigits: digits == null ? 0 : digits,
      maximumFractionDigits: digits == null ? 0 : digits,
    });
  }
  function euro(value) {
    if (value == null || !isFinite(Number(value))) return '-';
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(Number(value));
  }
  function clamp(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
  }
  function todayKey() {
    if (window.LifeOS && window.LifeOS.todayStr) return window.LifeOS.todayStr();
    var date = new Date();
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }
  function refreshCanonicalNutrition(shouldRender) {
    var api = window.LifeOS && window.LifeOS.canonical;
    if (!api || !api.nutritionDaily) return Promise.resolve(null);
    var request = ++canonicalRequest;
    if (api.refreshPhaseF) api.refreshPhaseF(); else api.refresh();
    var query = api.phaseF ? api.phaseF(todayKey()) : api.nutritionDaily(todayKey());
    return query.then(function (result) {
      if (request !== canonicalRequest) return result;
      canonicalPhaseF = api.phaseF ? result : null;
      var envelope = api.phaseF ? result && result['nutrition.daily'] : result;
      canonicalNutrition = envelope && envelope.value || null;
      canonicalNutritionError = null;
      if (shouldRender !== false) render();
      return envelope;
    }).catch(function (error) {
      if (request === canonicalRequest) canonicalNutritionError = error;
      if (shouldRender !== false) render();
      return null;
    });
  }
  function icon(path) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
  }
  function read(name, fallback) {
    try {
      if (typeof D[name] !== 'function') return { value: fallback, error: 'Source unavailable' };
      var value = D[name]();
      if (value && value.error) return { value: fallback, error: value.error };
      return { value: value == null ? fallback : value, error: null };
    } catch (error) {
      return { value: fallback, error: error && error.message || 'Could not load data' };
    }
  }
  function card(classes, html) {
    var section = document.createElement('section');
    section.className = 'card td-card ' + classes;
    section.innerHTML = html;
    dash.appendChild(section);
    return section;
  }
  function head(title, svg, right) {
    return '<div class="card-head"><span class="card-title"><span class="card-ic">' + svg + '</span>' + esc(title) + '</span>' + (right || '') + '</div>';
  }
  function badge(text, tone) {
    return '<span class="badge ' + esc(tone || '') + '">' + esc(text) + '</span>';
  }
  function empty(title, copy, href, label) {
    return '<div class="empty td-empty"><span class="empty-title">' + esc(title) + '</span><span>' + esc(copy) + '</span>' +
      (href && label ? '<a class="btn btn-secondary btn-sm" href="' + esc(href) + '">' + esc(label) + '</a>' : '') + '</div>';
  }
  function errorCard(classes, title, svg, message) {
    card(classes + ' td-card-error', head(title, svg) +
      '<div class="state-banner" data-state="error"><span class="dot red"></span><div><strong>Could not load this card</strong><div class="t-cap">' +
      esc(message || 'Local data could not be read.') + '</div></div></div><button class="btn btn-secondary btn-sm" data-retry>Retry</button>');
  }
  function isolated(classes, title, svg, render) {
    try {
      render();
    } catch (error) {
      errorCard(classes, title, svg, error && error.message);
    }
  }
  function trend(values, color) {
    var series = (values || []).filter(function (value) {
      return typeof value === 'number' && isFinite(value);
    }).slice(-12);
    if (series.length < 2) return '<div class="td-trend-empty">Trend starts after another entry</div>';
    var min = Math.min.apply(null, series);
    var max = Math.max.apply(null, series);
    var range = max - min || 1;
    var points = series.map(function (value, index) {
      return (index / (series.length - 1) * 100).toFixed(1) + ',' + (48 - (value - min) / range * 38).toFixed(1);
    }).join(' ');
    return '<div class="td-spark" style="color:' + color + '"><svg viewBox="0 0 100 52" preserveAspectRatio="none" role="img" aria-label="Recent trend"><polyline points="' +
      points + '" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg></div>';
  }
  function micro(values, color, label) {
    var series = (values || []).filter(function (value) {
      return typeof value === 'number' && isFinite(value);
    }).slice(-12);
    if (series.length < 2) return '<div class="t-cap">Log another measurement to start the ' + esc(label) + ' trend.</div>';
    var min = Math.min.apply(null, series);
    var max = Math.max.apply(null, series);
    var range = max - min || 1;
    var points = series.map(function (value, index) {
      return (index / (series.length - 1) * 100).toFixed(1) + ',' + (42 - (value - min) / range * 34).toFixed(1);
    }).join(' ');
    return '<div class="td-micro-chart"><svg viewBox="0 0 100 46" preserveAspectRatio="none" role="img" aria-label="' + esc(label) +
      ' trend"><polyline points="' + points + '" fill="none" stroke="' + color +
      '" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg></div>';
  }
  function metricCard(classes, title, value, unit, sub, subClass, svg, color, values) {
    card('td-metric-card ' + classes,
      '<div class="td-metric-top"><div>' + head(title, svg) +
      '<div class="td-big"><span class="num">' + esc(value) + '</span><span class="unit">' + esc(unit || '') +
      '</span></div><div class="t-2 ' + esc(subClass || '') + '">' + esc(sub || '') +
      '</div></div><span class="td-icbox">' + svg + '</span></div>' + trend(values, color));
  }
  function row(title, sub, tone, end) {
    return '<div class="row td-row-tight"><span class="dot ' + esc(tone || '') + '"></span><div class="row-main"><div class="row-title">' +
      esc(title) + '</div>' + (sub ? '<div class="row-sub">' + esc(sub) + '</div>' : '') + '</div>' +
      (end ? '<span class="row-end">' + esc(end) + '</span>' : '') + '</div>';
  }
  function delta(value, unit, lowerIsBetter) {
    if (value == null || !isFinite(Number(value)) || Number(value) === 0) return '<span class="t-cap">No previous comparison</span>';
    var improved = lowerIsBetter ? Number(value) < 0 : Number(value) > 0;
    return '<span class="delta ' + (improved ? 'up' : 'warn') + '">' + (Number(value) > 0 ? 'Up ' : 'Down ') +
      esc(Math.abs(Number(value)).toFixed(1)) + esc(unit) + '</span>';
  }
  function pctStroke(value) {
    return (clamp(value) / 100 * 289).toFixed(1);
  }
  function formatSleep(minutes) {
    if (minutes == null || !isFinite(Number(minutes))) return '-';
    return Math.floor(Number(minutes) / 60) + 'h ' + Math.round(Number(minutes) % 60) + 'm';
  }

  var icons = {
    score: icon('<path d="M4 13a8 8 0 1 1 16 0"/><path d="M12 13l4-4"/><path d="M7 17h10"/>'),
    heart: icon('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 1 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>'),
    body: icon('<path d="M6 3h12l2 5-8 13L4 8z"/><path d="M6 3l6 18 6-18"/>'),
    alert: icon('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'),
    calendar: icon('<rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M3 9h18M8 2v4M16 2v4"/>'),
    nutrition: icon('<path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 9-11 1 6-1 11-2 18z"/>'),
    moon: icon('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
    pill: icon('<path d="m10.5 20.5 9-9a3.5 3.5 0 0 0-5-5l-9 9a3.5 3.5 0 0 0 5 5z"/><path d="m8.5 8.5 7 7"/>'),
    money: icon('<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/>'),
    mail: icon('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3 7 9 6 9-6"/>'),
    composition: icon('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
  };

  function renderLoading() {
    dash.setAttribute('aria-busy', 'true');
    dash.innerHTML = Array.from({ length: 12 }, function (_, index) {
      var span = index < 3 ? 'col-4' : index < 6 ? 'col-4' : index < 10 ? 'col-3' : 'col-4';
      return '<section class="card td-loading ' + span + '" aria-hidden="true"><div class="skeleton line short"></div><div class="skeleton line lg" style="width:45%"></div><div class="skeleton line"></div></section>';
    }).join('');
  }

  function render() {
    dash.innerHTML = '';
    dash.setAttribute('aria-busy', 'false');

    var todaySource = read('today', {});
    var bodySource = read('bodyComposition', {});
    var nutritionSource = read('nutritionToday', {});
    var recoverySource = read('recovery', {});
    var productivitySource = read('productivity', {});
    var moneySource = read('money', {});
    var mailSource = read('mail', {});
    var wearableSource = read('wearable', {});
    var settingsSource = read('settings', {});
    var qualitySource = read('quality', {});
    var attentionSource = read('attention', []);

    var today = Object.assign({}, todaySource.value || {});
    var body = bodySource.value || {};
    var nutrition = nutritionSource.value || {};
    var recovery = recoverySource.value || {};
    var productivity = productivitySource.value || {};
    var moneyData = moneySource.value || {};
    var mail = mailSource.value || {};
    var wearable = wearableSource.value || {};
    var settings = settingsSource.value || {};
    var quality = qualitySource.value || {};
    var attention = Array.isArray(attentionSource.value) ? attentionSource.value : [];
    var canonicalHydration = canonicalPhaseF && canonicalPhaseF['hydration.daily'] && canonicalPhaseF['hydration.daily'].value;
    var canonicalEnergyEnvelope = canonicalPhaseF && canonicalPhaseF['energy.forecast_24h'];
    var canonicalEnergy = canonicalEnergyEnvelope && canonicalEnergyEnvelope.value;
    var canonicalCurrentEnergy = canonicalPhaseF && canonicalPhaseF['energy.current'] && canonicalPhaseF['energy.current'].value;
    var canonicalLifeScore = canonicalPhaseF && canonicalPhaseF['life_score.daily'] && canonicalPhaseF['life_score.daily'].value;
    var canonicalReadiness = canonicalPhaseF && canonicalPhaseF['readiness.daily'] && canonicalPhaseF['readiness.daily'].value;
    if (canonicalLifeScore && Number.isFinite(Number(canonicalLifeScore.total))) {
      today.life_score = Number(canonicalLifeScore.total);
      today.biggest_drag = canonicalLifeScore.drag
        ? canonicalLifeScore.drag.label + (canonicalLifeScore.drag.detail ? ' (' + canonicalLifeScore.drag.detail + ')' : '')
        : null;
    }
    if (canonicalReadiness && Number.isFinite(Number(canonicalReadiness.score))) {
      today.readiness = canonicalReadiness;
    }
    if (canonicalNutrition && canonicalNutrition.date === todayKey()) {
      nutrition = {
        entries: Number(canonicalNutrition.entries) || 0,
        calories: Number(canonicalNutrition.calories) || 0,
        protein: Number(canonicalNutrition.protein_g) || 0,
        calorie_target: canonicalNutrition.targets && Number(canonicalNutrition.targets.calories),
        protein_target: canonicalNutrition.targets && Number(canonicalNutrition.targets.protein_g),
        configured: !!(canonicalNutrition.targets && canonicalNutrition.targets.configured),
      };
    }

    isolated('col-4', 'Life Score', icons.score, function () {
      if (todaySource.error) return errorCard('col-4', 'Life Score', icons.score, todaySource.error);
      metricCard('col-4 accent-green', 'Life Score', today.life_score == null ? '-' : num(today.life_score), '/100',
        today.biggest_drag ? 'Biggest drag: ' + today.biggest_drag : 'No limiting signal', today.biggest_drag ? '' : 'td-good',
        icons.score, 'var(--green)', today._scoreSeries);
    });

    isolated('col-4', 'Readiness', icons.heart, function () {
      var readiness = today.readiness || {};
      if (todaySource.error) return errorCard('col-4', 'Readiness', icons.heart, todaySource.error);
      metricCard('col-4 accent-green', 'Readiness', readiness.score == null ? '-' : num(readiness.score), '%',
        readiness.label || 'No recovery data', readiness.score == null ? '' : (readiness.score >= 70 ? 'td-good' : 'td-amber'),
        icons.heart, 'var(--green)', today._readySeries);
    });

    isolated('col-4', 'Body trend', icons.body, function () {
      if (bodySource.error) return errorCard('col-4', 'Body trend', icons.body, bodySource.error);
      var weightDelta = body.weight_delta_kg;
      var weightSub = weightDelta == null ? 'Log another weight to build a trend' :
        (weightDelta < 0 ? 'Down ' : 'Up ') + Math.abs(weightDelta).toFixed(1) + ' kg from the previous entry';
      metricCard('col-4 accent-blue', 'Body trend', body.weight_kg == null ? '-' : num(body.weight_kg, 1), 'kg',
        weightSub, weightDelta == null ? '' : 'td-blue', icons.body, 'var(--blue)', body.weight_series);
    });

    isolated('col-4', 'Priority', icons.alert, function () {
      var supplements = today.supplements || {};
      var due = Array.isArray(supplements.due) ? supplements.due : [];
      var missing = Array.isArray(today.missing_data) ? today.missing_data : [];
      var title = 'You are on top of it';
      var copy = 'No urgent item is competing for your attention.';
      var href = '';
      var label = '';
      var extraClass = '';
      if (due.length) {
        title = 'Take your supplements';
        copy = due.length + ' scheduled item' + (due.length === 1 ? ' is' : 's are') + ' still due today.';
        href = 'log.html#supps';
        label = 'Review supplements';
        extraClass = ' td-priority-supps';
      } else if (missing.length) {
        var missingDetail = String(missing[0]);
        var gap = missingDetail.replace(/\s*\(.*/, '');
        title = 'Complete ' + gap.toLowerCase();
        copy = /\(never\)/i.test(missingDetail) ? 'No ' + gap.toLowerCase() + ' data yet. Add it to improve Today.' : missingDetail + ' limits the accuracy of Today.';
        href = /finance/i.test(gap) ? 'money.html' : /skin/i.test(gap) ? 'log.html#skin' : /blood|measure|weight|sleep|photo/i.test(gap) ? 'log.html#body' : 'log.html';
        label = 'Open log';
      }
      card('priority td-priority col-4' + extraClass,
        '<div class="stack"><span class="card-title td-amber"><span class="card-ic">' + icons.alert +
        '</span>Priority</span><span class="t-h2">' + esc(title) + '</span><span class="t-2">' + esc(copy) + '</span>' +
        (href ? '<a class="btn btn-amber" href="' + esc(href) + '" style="align-self:flex-start">' + esc(label) + '</a>' : '') + '</div>');
    });

    isolated('col-4', 'Schedule / Day plan', icons.calendar, function () {
      if (productivitySource.error) return errorCard('col-4', 'Schedule / Day plan', icons.calendar, productivitySource.error);
      var goals = Array.isArray(productivity.goals_today) ? productivity.goals_today : [];
      var tasks = Array.isArray(productivity.tasks_open) ? productivity.tasks_open : [];
      var plan = goals.filter(function (goal) { return !goal.done; }).map(function (goal) {
        return { kind: 'Goal', title: goal.text || goal.title, sub: 'Today' };
      }).concat(tasks.map(function (task) {
        return { kind: task.due === todayKey() ? 'Due' : 'Task', title: task.title || task, sub: task.due || task.priority || '' };
      })).filter(function (item) { return item.title; }).slice(0, 3);
      var html = head('Schedule / Day plan', icons.calendar, '<a class="btn btn-ghost btn-sm" href="../calendar.html">View full day</a>');
      if (!plan.length) {
        html += empty('Nothing planned', 'Add a goal or task for today.', 'tasks.html', 'Add task');
      } else {
        html += plan.map(function (item) {
          return '<div class="td-plan-row"><span class="td-plan-kind">' + esc(item.kind) + '</span><div><div class="row-title">' +
            esc(item.title) + '</div>' + (item.sub ? '<div class="row-sub">' + esc(item.sub) + '</div>' : '') + '</div></div>';
        }).join('');
        html += '<div class="t-cap">' + plan.length + ' open item' + (plan.length === 1 ? '' : 's') + ' shown</div>';
      }
      card('td-plan col-4 accent-violet', html);
    });

    isolated('col-4', 'Nutrition', icons.nutrition, function () {
      if (nutritionSource.error) return errorCard('col-4', 'Nutrition', icons.nutrition, nutritionSource.error);
      var html = head('Nutrition', icons.nutrition);
      if (canonicalNutritionError) {
        html += '<div class="state-banner" data-state="error"><span class="dot amber"></span><div><strong>Live totals unavailable</strong><div class="t-cap">Showing the local nutrition cache.</div></div><button class="btn btn-secondary btn-sm" data-canonical-retry>Retry</button></div>';
      }
      if (!nutrition.configured) {
        if (Number(nutrition.entries) > 0) {
          html += '<div class="stack"><div class="td-mini-grid"><div class="td-kv"><span class="value">' + num(nutrition.calories) +
            '</span><span class="t-cap">kcal logged</span></div><div class="td-kv"><span class="value">' + num(nutrition.protein) +
            '</span><span class="t-cap">g protein logged</span></div></div><div class="t-cap">Set targets to calculate what remains today.</div>' +
            '<a class="btn btn-secondary btn-sm btn-block" href="log.html#food">Set targets</a></div>';
        } else {
          html += empty('Targets not configured', 'Log food now or set targets to calculate what remains.', 'log.html#food', 'Open Food');
        }
        return card('td-nutrition col-4 accent-green', html);
      }
      var calLeft = Math.max(0, nutrition.calorie_target - nutrition.calories);
      var proteinLeft = Math.max(0, nutrition.protein_target - nutrition.protein);
      var calPct = clamp(nutrition.calories / nutrition.calorie_target * 100);
      var proteinPct = clamp(nutrition.protein / nutrition.protein_target * 100);
      html += '<div class="stack"><div class="td-mini-grid"><div class="td-kv"><span class="value">' + num(calLeft) +
        '</span><span class="t-cap">kcal left</span></div><div class="td-kv"><span class="value">' + num(proteinLeft) +
        '</span><span class="t-cap">g protein left</span></div></div><div class="bar"><i style="width:' + calPct +
        '%"></i></div><div class="between t-2"><span>Calories</span><span>' + num(nutrition.calories) + ' / ' +
        num(nutrition.calorie_target) + '</span></div><div class="between t-2"><span>Protein</span><span>' +
        num(nutrition.protein) + ' / ' + num(nutrition.protein_target) + 'g</span></div><a class="btn btn-secondary btn-sm btn-block" href="log.html#food">Log meal</a></div>' +
        '<div class="td-ring"><svg viewBox="0 0 100 100" role="img" aria-label="Protein target progress"><circle class="track" cx="50" cy="50" r="46" fill="none" stroke-width="8"/><circle class="fill" cx="50" cy="50" r="46" fill="none" stroke-width="8" stroke-dasharray="' +
        pctStroke(proteinPct) + ' 289"/></svg></div>';
      card('td-nutrition col-4 accent-green', html);
    });

    isolated('col-3', 'Recovery', icons.moon, function () {
      if (recoverySource.error) return errorCard('col-3', 'Recovery', icons.moon, recoverySource.error);
      var readiness = recovery.readiness || {};
      var sleepMinutes = today.sleep_last_night_min != null ? today.sleep_last_night_min : wearable.sleep_last_night_min;
      var hasRecovery = sleepMinutes != null || (recovery.last7d || []).some(function (day) { return day.sleep_min != null || day.mood != null; });
      var html = head('Recovery', icons.moon);
      if (!hasRecovery) {
        html += empty('No recovery data', 'Log sleep or connect a wearable to track recovery.', 'log.html#body', 'Log sleep');
      } else {
        var factors = Array.isArray(readiness.parts) ? readiness.parts.slice(0, 4) : [];
        html += '<div class="td-mini-grid"><div class="td-kv"><span class="t-cap">Sleep</span><span class="value">' +
          formatSleep(sleepMinutes) + '</span><span class="t-cap">Last night</span></div><div class="td-kv"><span class="t-cap">Sleep debt</span><span class="value">' +
          (today.readiness && today.readiness.sleep_debt_hrs != null ? num(today.readiness.sleep_debt_hrs, 1) + 'h' : '-') +
          '</span><span class="t-cap">Seven-day estimate</span></div></div>';
        if (factors.length) {
          html += '<div class="td-factor-row">' + factors.map(function (factor) {
            var tone = factor.pts >= factor.max * 0.66 ? 'green' : factor.pts >= factor.max * 0.33 ? 'amber' : 'red';
            return '<span class="inline t-cap"><span class="dot ' + tone + '"></span>' + esc(factor.label || factor.key) + '</span>';
          }).join('') + '</div>';
        }
      }
      card('td-summary-card col-3 accent-violet', html);
    });

    isolated('col-3', 'Supplements due', icons.pill, function () {
      var supplements = today.supplements || {};
      var due = Array.isArray(supplements.due) ? supplements.due : [];
      var total = Number(supplements.total) || 0;
      var right = total ? (due.length ? badge(due.length + ' due', 'violet') : badge('Done', 'green')) : '';
      var html = head('Supplements due', icons.pill, right);
      if (!total) {
        html += empty('No schedule yet', 'Add supplements before Today can track doses.', 'log.html#supps', 'Add supplements');
      } else if (!due.length) {
        html += empty('All taken', 'No scheduled supplements remain today.', 'log.html#supps', 'View schedule');
      } else {
        html += due.slice(0, 3).map(function (name) { return row(name, 'Due today', 'amber'); }).join('');
        html += '<a class="btn btn-ghost btn-sm btn-block" href="log.html#supps">View all supplements</a>';
      }
      card('td-list-card col-3', html);
    });

    isolated('col-3', 'Money snapshot', icons.money, function () {
      if (moneySource.error) return errorCard('col-3', 'Money snapshot', icons.money, moneySource.error);
      var hasMoney = Number(moneyData.accounts) > 0 || Number(moneyData.monthly_income) !== 0 || moneyData.business_profit_ytd != null;
      var savingsRate = moneyData.savings_rate_last_month_actual_pct != null ? moneyData.savings_rate_last_month_actual_pct : moneyData.savings_rate_pct;
      var right = savingsRate == null ? '' : badge(savingsRate >= 0 ? 'On track' : 'Review', savingsRate >= 0 ? 'green' : 'amber');
      var html = head('Money snapshot', icons.money, right);
      if (!hasMoney) {
        html += empty('No financial data', 'Add an account or import transactions for a snapshot.', 'money.html', 'Open Money');
      } else {
        var value = Number(moneyData.accounts) > 0 ? moneyData.net_worth : (moneyData.business_profit_ytd != null ? moneyData.business_profit_ytd : moneyData.monthly_income);
        var label = Number(moneyData.accounts) > 0 ? 'net worth' : (moneyData.business_profit_ytd != null ? 'business profit YTD' : 'income this month');
        html += '<div class="td-kv"><span class="value">' + euro(value) + '</span><span class="t-cap">' + esc(label) + '</span></div>';
        if (savingsRate != null) {
          html += '<div class="between t-2"><span>Savings rate</span><span>' + num(savingsRate) + '%</span></div><div class="bar"><i style="width:' + clamp(savingsRate) + '%"></i></div>';
        }
        html += '<a class="btn btn-ghost btn-sm btn-block" href="money.html">View money</a>';
      }
      card('td-summary-card col-3 accent-green', html);
    });

    isolated('col-3', 'Inbox / important', icons.mail, function () {
      if (mailSource.error) return errorCard('col-3', 'Inbox / important', icons.mail, mailSource.error);
      var messages = Array.isArray(mail.needs_reply) ? mail.needs_reply : [];
      var synced = mail.total_inbox != null || mail.synced_hours_ago != null;
      var stale = mail.synced_hours_ago != null && mail.synced_hours_ago > 24;
      var right = messages.length ? badge(messages.length + ' to reply', 'amber') : '';
      var html = head('Inbox / important', icons.mail, right);
      if (!synced) {
        html += empty('Inbox not connected', 'Connect Gmail in More, then sync your inbox.', '../mail.html', 'Connect Gmail');
      } else if (!messages.length) {
        html += empty('No important mail', 'Nothing currently needs a reply.', '../mail.html', 'Open inbox');
      } else {
        if (stale) html += '<div class="state-banner" data-state="stale"><span class="dot amber"></span><span>Cached inbox, synced ' + num(mail.synced_hours_ago) + ' hours ago</span></div>';
        html += messages.slice(0, 2).map(function (message) {
          return row(message.from || 'Message', message.subject || '', 'blue');
        }).join('');
        html += '<a class="btn btn-ghost btn-sm btn-block" href="../mail.html">Go to inbox</a>';
      }
      card('td-list-card col-3', html);
    });

    isolated('col-4', 'Body composition', icons.composition, function () {
      if (bodySource.error) return errorCard('col-4', 'Body composition', icons.composition, bodySource.error);
      var html = head('Body composition', icons.composition, '<a class="btn btn-ghost btn-sm" href="log.html#body">View body</a>');
      if (body.body_fat_pct == null || body.lean_mass_kg == null) {
        html += empty('Composition not available', 'Log weight and body fat to calculate lean body mass.', 'log.html#body', 'Log measurement');
      } else {
        html += '<div class="td-mini-grid"><div class="td-kv"><span class="t-cap">Lean body mass</span><span class="value">' +
          num(body.lean_mass_kg, 1) + '<span class="metric-unit"> kg</span></span>' + delta(body.lean_mass_delta_kg, ' kg', false) +
          '</div><div class="td-kv"><span class="t-cap">Body fat</span><span class="value">' + num(body.body_fat_pct, 1) +
          '<span class="metric-unit">%</span></span>' + delta(body.body_fat_delta_pct, '%', true) + '</div></div>' +
          micro(body.body_fat_series, 'var(--accent)', 'body fat');
      }
      card('td-summary-card col-4 accent-violet', html);
    });

    isolated('col-4', 'Health / recovery details', icons.heart, function () {
      var readiness = today.readiness || {};
      var sleepMinutes = today.sleep_last_night_min != null ? today.sleep_last_night_min : wearable.sleep_last_night_min;
      var sleepGoalPct = sleepMinutes != null && settings.sleep_goal_hours ? clamp(sleepMinutes / (settings.sleep_goal_hours * 60) * 100) : null;
      var tiles = [];
      if (wearable.steps_today != null) tiles.push(['Steps', num(wearable.steps_today)]);
      if (sleepGoalPct != null) tiles.push(['Sleep goal', num(sleepGoalPct) + '%']);
      if (wearable.resting_hr != null) tiles.push(['Resting HR', num(wearable.resting_hr) + ' bpm']);
      if (readiness.score != null) tiles.push(['Readiness', num(readiness.score) + '/100']);
      if (quality.score != null) tiles.push(['Data quality', num(quality.score) + '%']);
      if (canonicalHydration) tiles.push(['Hydration', num(canonicalHydration.explicit_beverage_ml / 1000, 1) + ' / ' + num(canonicalHydration.target_ml / 1000, 1) + ' L']);
      if (canonicalEnergy) tiles.push(['Energy outlook', canonicalEnergy.score_1_to_5 == null ? 'Needs check-ins' : num(canonicalEnergy.score_1_to_5, 1) + ' / 5']);
      var html = head('Health / recovery details', icons.heart);
      if (!tiles.length) {
        html += empty('No health details', 'Log sleep or connect a wearable to populate this card.', 'log.html#body', 'Open Body');
      } else {
        if (wearable.tracked && wearable.synced_hours_ago > 24) {
          html += '<div class="state-banner" data-state="stale"><span class="dot amber"></span><span>Wearable data is ' + num(wearable.synced_hours_ago) + ' hours old</span></div>';
        }
        html += '<div class="td-health-grid">' + tiles.slice(0, 6).map(function (tile) {
          return '<div class="td-health-tile"><span class="t-cap">' + esc(tile[0]) + '</span><span class="t-metric-sm">' + esc(tile[1]) + '</span></div>';
        }).join('') + '</div>';
        html += '<div style="margin-top:10px"><div class="between"><span class="t-cap">Energy right now</span><span class="t-cap">Personal 1-5 check-in</span></div><div class="segmented" style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-top:6px">' + [1,2,3,4,5].map(function (value) {
          return '<button type="button" role="tab" data-energy-checkin="' + value + '" aria-label="Log energy ' + value + ' out of 5"' + (canonicalCurrentEnergy && canonicalCurrentEnergy.value === value ? ' aria-selected="true"' : '') + '>' + value + '</button>';
        }).join('') + '</div></div>';
      }
      card('td-summary-card col-4 accent-blue', html);
    });

    isolated('col-4', 'Attention queue', icons.alert, function () {
      if (attentionSource.error) return errorCard('col-4', 'Attention queue', icons.alert, attentionSource.error);
      var html = '<div class="card-head"><span class="card-title td-amber"><span class="card-ic">' + icons.alert +
        '</span>Attention queue</span>' + (attention.length ? badge(attention.length + ' items', 'amber') : badge('Clear', 'green')) + '</div>';
      if (!attention.length) {
        html += empty('Nothing needs attention', 'Current tracked signals are clear.', 'coach.html', 'Open Coach');
      } else {
        html += attention.slice(0, 3).map(function (item) {
          return '<a class="row td-row-tight td-attention-row" href="' + esc(item.href || 'coach.html') +
            '"><span class="dot amber"></span><div class="row-main"><div class="row-title">' + esc(item.title) +
            '</div><div class="row-sub">' + esc(item.sub || '') + '</div></div></a>';
        }).join('');
      }
      card('td-summary-card col-4 accent-amber', html);
    });
  }

  function inferSegment(value) {
    var query = String(value || '').toLowerCase();
    if (/\b(water|hydrate|hydration|ml|litre|liter)\b/.test(query)) return 'water';
    if (/\b(weight|body fat|waist|sleep|kg)\b/.test(query)) return 'body';
    if (/\b(workout|training|run|cardio|bench|squat|deadlift)\b/.test(query)) return 'training';
    if (/\b(skin|breakout|irritation|spf|routine)\b/.test(query)) return 'skin';
    if (/\b(supplement|creatine|vitamin|magnesium|dose|taken)\b/.test(query)) return 'supps';
    return 'food';
  }

  if (qlog) {
    qlog.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return;
      var value = qlog.value.trim();
      if (!value) return;
      location.href = 'log.html?q=' + encodeURIComponent(value) + '#' + inferSegment(value);
    });
  }
  document.addEventListener('keydown', function (event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    var target = event.target;
    var typing = target && /input|textarea|select/i.test(target.tagName);
    if (!typing && event.key.toLowerCase() === 'k' && qlog) {
      event.preventDefault();
      qlog.focus();
    }
  });
  if (shareButton) {
    shareButton.addEventListener('click', function () {
      var payload = { title: 'Life OS Today', text: 'Life OS Today', url: location.href };
      if (navigator.share) {
        navigator.share(payload).catch(function () {});
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(location.href).then(function () {
          if (UI.toast) UI.toast('Today link copied');
        }).catch(function () {
          if (UI.toast) UI.toast('Could not copy link', { type: 'error' });
        });
      } else if (UI.toast) {
        UI.toast('Sharing is not available', { type: 'error' });
      }
    });
  }
  dash.addEventListener('click', function (event) {
    if (event.target.closest('[data-retry]')) render();
    if (event.target.closest('[data-canonical-retry]')) refreshCanonicalNutrition(true);
    var energy = event.target.closest('[data-energy-checkin]');
    if (energy) {
      var api = window.LifeOS && window.LifeOS.canonical;
      if (!api || !api.checkInEnergy) return;
      energy.disabled = true;
      api.checkInEnergy({ value: Number(energy.getAttribute('data-energy-checkin')), date: todayKey(), occurred_at: new Date().toISOString(), context: 'today-dashboard', source: 'manual' }).then(function () {
        if (UI.toast) UI.toast('Energy check-in logged');
        return refreshCanonicalNutrition(true);
      }).catch(function () { energy.disabled = false; if (UI.toast) UI.toast('Energy check-in could not be saved'); });
    }
  });
  window.addEventListener('lifeos:logged', function () { render(); refreshCanonicalNutrition(true); });
  window.addEventListener('storage', function (event) {
    render();
    if (!event || /^nt:/.test(event.key || '')) refreshCanonicalNutrition(true);
  });
  window.addEventListener('lifeos:projections-changed', function (event) {
    var ids = event && event.detail && event.detail.ids || [];
    if (ids.some(function (id) { return /^(nutrition|hydration|energy|readiness|today)\./.test(id); })) refreshCanonicalNutrition(true);
  });

  try {
    document.getElementById('date').textContent = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date());
  } catch (_) {
    document.getElementById('date').textContent = todayKey();
  }

  renderLoading();
  setTimeout(render, 0);
  setTimeout(function () { refreshCanonicalNutrition(true); }, 0);
})();
