(function () {
  'use strict';

  const TABS = [
    { href: 'index.html',     label: 'Dashboard', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>' },
    { href: 'health.html',    label: 'Health',    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' },
    { href: 'watch.html',     label: 'Watch',     icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="5" width="10" height="14" rx="3"/><path d="M10 3h4M10 21h4"/><polyline points="12 9 12 12 14 14"/></svg>' },
    { href: 'water.html',     label: 'Water',     icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>' },
    { href: 'gym.html',       label: 'Gym',       icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v16M18 4v16M6 12h12M2 8h4M18 8h4M2 16h4M18 16h4"/></svg>' },
    { href: 'finance.html',   label: 'Finance',   icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>' },
    { href: 'nutrition.html', label: 'Nutrition', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h1"/><path d="M21 15v7"/></svg>' },
    { href: 'calendar.html',  label: 'Calendar',  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
    { href: 'mail.html',      label: 'Mail',      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/></svg>' },
    { href: 'radar.html',     label: 'Radar',     icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><line x1="12" y1="12" x2="19" y2="5"/></svg>' },
    { href: 'export.html',    label: 'Export',    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' },
    { href: 'reminders.html', label: 'Reminders', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' },
    { href: 'skin.html',      label: 'Skin',      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>' },
    { href: 'review.html',    label: 'Review',    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>' },
    { href: 'usage.html',     label: 'Usage',     icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>' },
    { href: 'privacy.html',   label: 'Privacy',   icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' },
    { href: 'fix.html',       label: 'Fix data',  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2 2.6-2.6z"/></svg>' },
    { href: 'settings.html',  label: 'Settings',  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' },
    { href: 'travel.html',    label: 'Travel',    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>' },
    { href: 'social.html',    label: 'Social',    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>' },
    { href: 'library.html',   label: 'Library',   icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' },
  ];

  // Clean-URL servers (Vercel, the dev server) serve /gym not /gym.html, so
  // normalize to the .html form the BAR hrefs + ACCENTS map use. Fixes active
  // tab detection and per-page accent on extensionless URLs.
  let page = (window.location.pathname.split('/').pop() || 'index.html').split('?')[0];
  if (!page) page = 'index.html';
  if (!/\.html$/.test(page)) page += '.html';

  // ---- Design system (shared tokens, grid, buttons, states) ----
  if (!document.querySelector('link[href="design.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'design.css';
    document.head.appendChild(link);
  }

  // ---- Per-module accent (iOS multi-tint) ----
  // One value per page drives --accent; design.css derives the dim/border
  // variants via color-mix, so this is the whole theming surface.
  const ACCENTS = {
    'index.html': '#0A84FF', 'health.html': '#FF375F', 'watch.html': '#FF453A',
    'water.html': '#64D2FF', 'gym.html': '#30D158', 'finance.html': '#00C7BE',
    'nutrition.html': '#FF9F0A', 'calendar.html': '#FF453A', 'mail.html': '#0A84FF',
    'radar.html': '#5E5CE6', 'reminders.html': '#FF9500', 'skin.html': '#FF2D55',
    'mood.html': '#BF5AF2', 'habits.html': '#32D74B', 'tasks.html': '#0A84FF',
    'review.html': '#5E5CE6', 'usage.html': '#64D2FF', 'export.html': '#0A84FF',
    'privacy.html': '#30D158', 'fix.html': '#FF9F0A', 'library.html': '#5E5CE6',
    'social.html': '#FF2D55', 'travel.html': '#64D2FF', 'glowlab.html': '#FF2D55',
    'body.html': '#30D158', 'ai.html': '#0A84FF',
    'log.html': '#0A84FF', 'coach.html': '#5E5CE6', 'money.html': '#00C7BE', 'more.html': '#8E8E93',
  };
  document.documentElement.style.setProperty('--accent', ACCENTS[page] || '#0A84FF');

  // ---- LifeOS layer: AI service, context core, command bar ----
  // Loaded sequentially so command.js can rely on both globals.
  (function loadLifeOS() {
    const chain = ['errlog.js', 'dates.js', 'ds.js', 'claude.js', 'lifeos-core.js', 'command.js', 'pwa.js', 'auth.js']
      .filter(src => !document.querySelector('script[src="' + src + '"]'));
    function next() {
      const src = chain.shift();
      if (!src) return;
      const s = document.createElement('script');
      s.src = src;
      s.onload = next;
      s.onerror = next;
      document.head.appendChild(s);
    }
    next();
  })();

  // ---- CSS ----
  const style = document.createElement('style');
  style.textContent = `
.tabbar {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 200;
  background: rgba(10,10,11,0.94);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  border-top: 1px solid rgba(255,255,255,0.08);
  padding: 6px 4px max(14px, env(safe-area-inset-bottom)) 4px;
}
.tabbar-inner {
  max-width: 880px; margin: 0 auto;
  display: flex; align-items: stretch;
  overflow-x: auto; scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.tabbar-inner::-webkit-scrollbar { display: none; }
.tab {
  flex: 1 1 0; min-width: 52px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 3px; padding: 6px 4px 4px;
  text-decoration: none;
  color: #85837C; /* AA: 5.2:1 on tabbar bg (was #76746E = 4.2, under 4.5) */
  font-size: 10px; font-weight: 600; letter-spacing: 0.04em;
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
  transition: color 0.15s; -webkit-tap-highlight-color: transparent;
  white-space: nowrap; background: transparent; border: none;
}
.tab:hover  { color: #B8B6B0; }
.tab.active { color: var(--accent, #34D399); }
.tab-icon   { width: 22px; height: 22px; flex-shrink: 0; }
.tab-icon svg { width: 100%; height: 100%; display: block; }

/* More sheet */
.tab-sheet-backdrop {
  position: fixed; inset: 0; z-index: 199;
  background: rgba(0,0,0,0.5); opacity: 0; pointer-events: none;
  transition: opacity .2s;
}
.tab-sheet-backdrop.open { opacity: 1; pointer-events: auto; }
.tab-sheet {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 201;
  background: rgba(16,16,18,0.98);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  border-top: 1px solid rgba(255,255,255,0.1);
  border-radius: 18px 18px 0 0;
  padding: 14px 16px max(20px, env(safe-area-inset-bottom)) 16px;
  transform: translateY(110%); transition: transform .24s cubic-bezier(.2,.8,.2,1);
  max-width: 880px; margin: 0 auto;
}
.tab-sheet.open { transform: translateY(0); }
.tab-sheet-grab { width: 36px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.18); margin: 0 auto 14px; }
.tab-sheet-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.tab-sheet-item {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  padding: 12px 4px; border-radius: 12px; text-decoration: none;
  color: #B8B6B0; font-size: 11px; font-weight: 600;
  font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
  -webkit-tap-highlight-color: transparent; background: transparent; border: none;
}
.tab-sheet-item:hover { background: rgba(255,255,255,0.05); }
.tab-sheet-item.active { color: var(--accent, #34D399); background: rgb(from var(--accent) r g b / 0.10); }
.tab-sheet-item .tab-icon { width: 24px; height: 24px; }
@media (min-width: 700px) { .tab-sheet-grid { grid-template-columns: repeat(6, 1fr); } }

/* Grid utilities, mobile fixes, and container widening live in design.css */
@media (min-width: 900px) {
  .tabbar { padding-left: 16px; padding-right: 16px; }
  .tabbar-inner { max-width: 1100px; }
  .tab { min-width: 58px; }
}
`;
  document.head.appendChild(style);

  // ---- Remove any existing inline tabbar ----
  document.querySelectorAll('nav.tabbar').forEach(el => el.remove());

  // ---- Build ----
  const nav = document.createElement('nav');
  nav.className = 'tabbar';
  nav.setAttribute('role', 'navigation');
  nav.setAttribute('aria-label', 'Main navigation');

  const inner = document.createElement('div');
  inner.className = 'tabbar-inner';

  // ── 5-tab IA (APPLE_PLAN section 3) ──────────────────────────
  // Today / Log / Coach / Money / More. Every old page belongs to a
  // tab via TAB_OF so the right tab lights up; the rest fall to More.
  // Old pages stay reachable through the More sheet (full grid below)
  // and through the Log/Coach landing pages during migration.
  const BAR = [
    { id: 'today', href: 'index.html',   label: 'Today', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>' },
    { id: 'log',   href: 'log.html',     label: 'Log',   icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>' },
    { id: 'coach', href: 'coach.html',   label: 'Coach', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z"/></svg>' },
    { id: 'money', href: 'money.html', label: 'Money', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' },
  ];
  const TAB_OF = {
    'index.html': 'today', 'calendar.html': 'today', 'tasks.html': 'today',
    'log.html': 'log', 'health.html': 'log', 'watch.html': 'log', 'water.html': 'log',
    'gym.html': 'log', 'body.html': 'log', 'nutrition.html': 'log',
    'mood.html': 'log', 'habits.html': 'log', 'skin.html': 'log', 'glowlab.html': 'log',
    'reminders.html': 'log',
    'coach.html': 'coach', 'mail.html': 'coach', 'radar.html': 'coach', 'review.html': 'coach',
    'ai.html': 'coach',
    'money.html': 'money', 'finance.html': 'money',
    // everything else (usage, travel, social, library, export, settings,
    // privacy, fix, ds) → More
  };
  const activeTab = TAB_OF[page] || 'more';
  const moreIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';

  BAR.forEach(function (t) {
    const a = document.createElement('a');
    a.href = t.href;
    a.className = 'tab' + (t.id === activeTab ? ' active' : '');
    if (t.id === activeTab) a.setAttribute('aria-current', 'page');
    a.innerHTML = '<span class="tab-icon">' + t.icon + '</span><span>' + t.label + '</span>';
    inner.appendChild(a);
  });

  // More is now a real searchable page (more.html), not a sheet.
  const moreLink = document.createElement('a');
  moreLink.href = 'more.html';
  moreLink.className = 'tab' + (activeTab === 'more' ? ' active' : '');
  if (activeTab === 'more') moreLink.setAttribute('aria-current', 'page');
  moreLink.innerHTML = '<span class="tab-icon">' + moreIcon + '</span><span>More</span>';
  inner.appendChild(moreLink);

  nav.appendChild(inner);
  document.body.appendChild(nav);
})();
