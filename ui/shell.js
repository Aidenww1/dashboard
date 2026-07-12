/* ============================================================
   Life OS — application shell (rewrite Phase 1).
   Injects desktop sidebar + mobile bottom nav into a page that
   contains <div class="app"><main class="main">…</main></div>.
   Active destination from <body data-page="…"> or the filename.
   Responsive switch is pure CSS (components.css); this only builds
   the nav + marks active. Compat links to unmigrated pages live on More.
   ============================================================ */
(function () {
  'use strict';
  if (window.__shellLoaded) return;
  window.__shellLoaded = true;

  var IC = {
    today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    log:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>',
    coach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/></svg>',
    money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/></svg>',
    more:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  };
  var TABS = [
    { id: 'today', href: 'today.html', label: 'Today' },
    { id: 'log',   href: 'log.html',   label: 'Log' },
    { id: 'coach', href: 'coach.html', label: 'Coach' },
    { id: 'money', href: 'money.html', label: 'Money' },
    { id: 'more',  href: 'more.html',  label: 'More' },
  ];

  // active destination: explicit data-page wins; else map filename.
  var file = (location.pathname.split('/').pop() || 'today.html').replace(/\.html$/, '') || 'today';
  var active = (document.body && document.body.dataset.page) || file;

  function svgWrap(s) { return '<span class="nav-ic">' + s + '</span>'; }

  function buildSidebar() {
    var aside = document.createElement('aside');
    aside.className = 'sidebar';
    aside.setAttribute('aria-label', 'Primary');
    var nav = TABS.map(function (t) {
      var on = t.id === active;
      return '<a class="nav-item' + (on ? ' active' : '') + '" href="' + t.href + '"' + (on ? ' aria-current="page"' : '') + '>'
        + svgWrap(IC[t.id]) + '<span>' + t.label + '</span></a>';
    }).join('');
    aside.innerHTML =
      '<div class="brand"><span class="brand-mark"></span><span>Life OS</span></div>'
      + '<nav class="nav" role="navigation" aria-label="Primary">' + nav + '</nav>'
      + '<div class="side-score" id="sideScore" hidden></div>'
      + '<div class="nav-spacer"></div>'
      + '<a class="user-row" href="more.html"><span class="avatar"></span><span class="ucol"><span style="font-size:13px;font-weight:600">Kees</span></span></a>';
    return aside;
  }

  function buildTabbar() {
    var nav = document.createElement('nav');
    nav.className = 'tabbar';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'Primary');
    nav.innerHTML = TABS.map(function (t) {
      var on = t.id === active;
      return '<a href="' + t.href + '" class="' + (on ? 'active' : '') + '"' + (on ? ' aria-current="page"' : '') + '>'
        + svgWrap(IC[t.id]) + t.label + '</a>';
    }).join('');
    return nav;
  }

  function mount() {
    var app = document.querySelector('.app');
    if (!app) return;
    if (!app.querySelector('.sidebar')) app.insertBefore(buildSidebar(), app.firstChild);
    if (!document.querySelector('.tabbar')) document.body.appendChild(buildTabbar());
    renderSideScore();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  // expose the legacy-page map for the More compat list (Phase 1 bridge).
  window.LifeOSShell = {
    legacyPages: [
      { label: 'Health / Daily Stack', href: '../health.html' },
      { label: 'Watch', href: '../watch.html' },
      { label: 'Water', href: '../water.html' },
      { label: 'Gym', href: '../gym.html' },
      { label: 'Body', href: '../body.html' },
      { label: 'Nutrition', href: '../nutrition.html' },
      { label: 'Mood / Mind', href: '../mood.html' },
      { label: 'Habits', href: '../habits.html' },
      { label: 'Skin', href: '../skin.html' },
      { label: 'GlowLab', href: 'glowlab.html' },
      { label: 'Reminders', href: '../reminders.html' },
      { label: 'Finance', href: '../finance.html' },
      { label: 'Calendar', href: '../calendar.html' },
      { label: 'Tasks', href: '../tasks.html' },
      { label: 'Mail', href: '../mail.html' },
      { label: 'Radar', href: '../radar.html' },
      { label: 'Review', href: '../review.html' },
      { label: 'AI', href: '../ai.html' },
      { label: 'Usage', href: '../usage.html' },
      { label: 'Travel', href: '../travel.html' },
      { label: 'Social', href: '../social.html' },
      { label: 'Library', href: '../library.html' },
      { label: 'Export / Backup', href: '../export.html' },
      { label: 'Settings', href: '../settings.html' },
      { label: 'Privacy', href: '../privacy.html' },
      { label: 'Fix my data', href: '../fix.html' },
    ],
  };

  function renderSideScore() {
    var box = document.getElementById('sideScore');
    if (!box || !window.LifeOS || !LifeOS.data || !LifeOS.data.today) return;
    var t; try { t = LifeOS.data.today() || {}; } catch (e) { return; }
    var score = t.life_score;
    if (score == null || isNaN(score)) return;
    var pct = Math.max(0, Math.min(100, Number(score)));
    var dash = (pct / 100 * 214).toFixed(1);
    box.hidden = false;
    box.innerHTML = '<a class="side-score-head" href="coach.html"><span>Life Score</span><span>›</span></a>'
      + '<div class="side-ring"><svg viewBox="0 0 82 82"><circle class="track" cx="41" cy="41" r="34" fill="none" stroke-width="6"/><circle class="fill" cx="41" cy="41" r="34" fill="none" stroke-width="6" stroke-dasharray="' + dash + ' 214"/></svg><div><strong>' + Math.round(score) + '</strong><span>/100</span></div></div>'
      + '<div class="side-delta">up 6 from yesterday</div>';
  }
})();
