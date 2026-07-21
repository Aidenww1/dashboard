import { assert, consoleSummary, delay, launchBrowser } from './browser-cdp.mjs';

const baseUrl = 'http://127.0.0.1:4173';
const screenshots = 'C:\\Users\\maila\\Desktop\\dashboard\\docs\\phase-e-screenshots';
const viewports = [
  { width: 1440, height: 900, label: 'desktop-1440x900' },
  { width: 1680, height: 945, label: 'desktop-1680x945' },
  { width: 1792, height: 1024, label: 'desktop-1792x1024' },
  { width: 768, height: 1024, label: 'tablet-768x1024' },
  { width: 390, height: 844, label: 'phone-390x844' },
];
const pages = [
  { name: 'body', path: '/ui/log.html?qa=phase-e#body', subtabs: ['Overview', 'Composition', 'Recovery', 'Labs', 'Photos'] },
  { name: 'training', path: '/ui/log.html?qa=phase-e#training', subtabs: ['Overview', 'Cardio', 'Progress', 'History'] },
];

const browser = await launchBrowser({
  port: 9255,
  url: `${baseUrl}${pages[0].path}`,
  width: viewports[0].width,
  height: viewports[0].height,
  profileName: 'lifeos-phase-e-qa',
});
const { cdp } = browser;

async function navigate(path) {
  const expected = new URL(`${baseUrl}${path}`);
  await cdp.send('Page.navigate', { url: expected.href });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = await cdp.eval(`location.pathname === ${JSON.stringify(expected.pathname)} && document.readyState !== 'loading'`).catch(() => false);
    if (ready) {
      await delay(180);
      return;
    }
    await delay(80);
  }
  throw new Error(`Page did not load: ${expected.pathname}`);
}

async function inspect(page, viewport) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.width <= 900,
  });
  await navigate(page.path);
  const result = await cdp.eval(`(() => {
    const visible = (node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const viewportWidth = document.documentElement.clientWidth;
    const controls = [...document.querySelectorAll('button,a,input,select,textarea,[role="tab"]')].filter(visible);
    const clipped = controls.filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.left < -1 || rect.right > viewportWidth + 1;
    }).map((node) => node.getAttribute('aria-label') || node.textContent.trim().slice(0, 36) || node.tagName).slice(0, 12);
    const clippedLabels = controls.filter((node) => node.textContent.trim() && node.scrollWidth > node.clientWidth + 1)
      .map((node) => node.textContent.trim().slice(0, 36)).slice(0, 12);
    const cards = [...document.querySelectorAll('[data-panel="${page.name}"] .card')].filter(visible)
      .filter((node) => !node.parentElement.closest('.card')).map((node) => node.getBoundingClientRect());
    let cardCollisions = 0;
    for (let left = 0; left < cards.length; left += 1) {
      for (let right = left + 1; right < cards.length; right += 1) {
        const a = cards[left], b = cards[right];
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 3 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 3) cardCollisions += 1;
      }
    }
    const tabs = [...document.querySelectorAll('#seg [role="tab"]')].filter(visible);
    const tabRows = [...new Set(tabs.map((node) => Math.round(node.getBoundingClientRect().top)))];
    const subtabs = [...document.querySelectorAll('[data-panel="${page.name}"] .lg-subtabs button')].filter(visible);
    return {
      width: innerWidth,
      clientWidth: viewportWidth,
      scrollWidth: document.documentElement.scrollWidth,
      clipped,
      clippedLabels,
      cardCollisions,
      tabs: tabs.map((node) => node.textContent.trim()),
      tabRows: tabRows.length,
      tabsVisible: tabs.every((node) => { const rect = node.getBoundingClientRect(); return rect.left >= -1 && rect.right <= viewportWidth + 1; }),
      subtabs: subtabs.map((node) => node.textContent.trim()),
      subtabsVisible: subtabs.every((node) => { const rect = node.getBoundingClientRect(); return rect.left >= -1 && rect.right <= viewportWidth + 1; }),
      sidebarVisible: !!document.querySelector('.sidebar') && visible(document.querySelector('.sidebar')),
      mobileNavItems: [...document.querySelectorAll('.tabbar a')].filter(visible).length,
      errors: (window.__phaseEErrors || []).slice(),
    };
  })()`);

  assert(result.scrollWidth <= result.clientWidth + 1, `${page.name} ${viewport.label} has document overflow: ${result.scrollWidth}px`);
  assert(result.clipped.length === 0, `${page.name} ${viewport.label} clips controls: ${result.clipped.join(', ')}`);
  assert(result.clippedLabels.length === 0, `${page.name} ${viewport.label} clips labels: ${result.clippedLabels.join(', ')}`);
  assert(result.cardCollisions === 0, `${page.name} ${viewport.label} has overlapping cards`);
  assert(result.tabs.length === 6 && result.tabsVisible, `${page.name} ${viewport.label} does not show all domain tabs`);
  assert(result.tabRows === (viewport.width <= 900 ? 2 : 1), `${page.name} ${viewport.label} uses ${result.tabRows} domain-tab rows`);
  assert(JSON.stringify(result.subtabs) === JSON.stringify(page.subtabs) && result.subtabsVisible, `${page.name} ${viewport.label} subtab contract failed`);
  assert(viewport.width > 900 ? result.sidebarVisible && result.mobileNavItems === 0 : !result.sidebarVisible && result.mobileNavItems === 5, `${page.name} ${viewport.label} navigation mode is incorrect`);
  assert(result.errors.length === 0, `${page.name} ${viewport.label} emitted errors: ${result.errors.join(', ')}`);

  if (viewport.width <= 900) {
    await cdp.eval('scrollTo(0, document.documentElement.scrollHeight); true');
    await delay(80);
    const bottom = await cdp.eval(`(() => {
      const nav = document.querySelector('.tabbar').getBoundingClientRect();
      const cards = [...document.querySelectorAll('[data-panel="${page.name}"] .card')].filter((node) => getComputedStyle(node).display !== 'none');
      return { navTop: Math.round(nav.top), contentBottom: Math.round(cards.at(-1).getBoundingClientRect().bottom) };
    })()`);
    assert(bottom.contentBottom <= bottom.navTop - 8, `${page.name} ${viewport.label} bottom navigation overlaps content`);
    await cdp.eval('scrollTo(0, 0); true');
  }
  return result;
}

try {
  await cdp.eval("window.__phaseEErrors=[];addEventListener('error',e=>window.__phaseEErrors.push(String(e.message||e.error)));addEventListener('unhandledrejection',e=>window.__phaseEErrors.push(String(e.reason)));true");
  const results = [];
  for (const viewport of viewports) {
    for (const page of pages) {
      results.push({ page: page.name, viewport: viewport.label, ...(await inspect(page, viewport)) });
      await cdp.screenshot(`${screenshots}\\${page.name}-${viewport.label}.png`);
    }
  }
  const consoleResult = consoleSummary(cdp);
  assert(consoleResult.actionableConsoleProblems.length === 0, `Phase E console problems: ${JSON.stringify(consoleResult.actionableConsoleProblems)}`);
  console.log(JSON.stringify({ checked: results.length, results, ...consoleResult }, null, 2));
} finally {
  browser.close();
}
