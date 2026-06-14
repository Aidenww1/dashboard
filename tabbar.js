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
  ];

  const page = (window.location.pathname.split('/').pop() || 'index.html').split('?')[0];

  // ---- Design system (shared tokens, grid, buttons, states) ----
  if (!document.querySelector('link[href="design.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'design.css';
    document.head.appendChild(link);
  }

  // ---- LifeOS layer: AI service, context core, command bar ----
  // Loaded sequentially so command.js can rely on both globals.
  (function loadLifeOS() {
    const chain = ['errlog.js', 'claude.js', 'lifeos-core.js', 'command.js', 'pwa.js']
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
  color: #76746E;
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
.tab-sheet-item.active { color: var(--accent, #34D399); background: rgba(224,118,88,0.1); }
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

  // Four primary tabs on the bar; everything else lives in the More sheet.
  const PRIMARY = ['index.html', 'health.html', 'gym.html', 'finance.html'];
  const primaryTabs = PRIMARY.map(function (h) { return TABS.find(function (t) { return t.href === h; }); }).filter(Boolean);
  const activeInPrimary = PRIMARY.indexOf(page) >= 0;
  const moreIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';

  primaryTabs.forEach(function (t) {
    const a = document.createElement('a');
    a.href = t.href;
    a.className = 'tab' + (t.href === page ? ' active' : '');
    if (t.href === page) a.setAttribute('aria-current', 'page');
    a.innerHTML = '<span class="tab-icon">' + t.icon + '</span><span>' + t.label + '</span>';
    inner.appendChild(a);
  });

  const moreBtn = document.createElement('button');
  moreBtn.type = 'button';
  moreBtn.className = 'tab' + (activeInPrimary ? '' : ' active');
  moreBtn.setAttribute('aria-label', 'More tabs');
  moreBtn.innerHTML = '<span class="tab-icon">' + moreIcon + '</span><span>More</span>';
  inner.appendChild(moreBtn);

  nav.appendChild(inner);
  document.body.appendChild(nav);

  // ---- More sheet: full grid of every destination ----
  const backdrop = document.createElement('div');
  backdrop.className = 'tab-sheet-backdrop';
  const sheet = document.createElement('div');
  sheet.className = 'tab-sheet';
  sheet.setAttribute('role', 'menu');
  let grid = '<div class="tab-sheet-grab"></div><div class="tab-sheet-grid">';
  TABS.forEach(function (t) {
    grid += '<a class="tab-sheet-item' + (t.href === page ? ' active' : '') + '" href="' + t.href + '">' +
      '<span class="tab-icon">' + t.icon + '</span><span>' + t.label + '</span></a>';
  });
  grid += '</div>';
  sheet.innerHTML = grid;
  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);

  function openSheet() { backdrop.classList.add('open'); sheet.classList.add('open'); }
  function closeSheet() { backdrop.classList.remove('open'); sheet.classList.remove('open'); }
  moreBtn.addEventListener('click', function () { sheet.classList.contains('open') ? closeSheet() : openSheet(); });
  backdrop.addEventListener('click', closeSheet);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
})();
