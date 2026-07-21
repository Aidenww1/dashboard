import { assert, consoleSummary, delay, launchBrowser } from './browser-cdp.mjs';

const baseUrl = 'http://127.0.0.1:4173';
const screenshots = 'C:\\Users\\maila\\Desktop\\dashboard\\docs\\phase-c-screenshots';
const viewports = [
  { width: 1440, height: 900, label: 'desktop-1440x900' },
  { width: 1680, height: 945, label: 'desktop-1680x945' },
  { width: 1792, height: 1024, label: 'desktop-1792x1024' },
  { width: 768, height: 1024, label: 'tablet-768x1024' },
  { width: 390, height: 844, label: 'phone-390x844' },
];

const browser = await launchBrowser({
  port: 9250,
  url: `${baseUrl}/ui/components.html`,
  width: viewports[0].width,
  height: viewports[0].height,
  profileName: 'lifeos-components-qa',
});
const { cdp } = browser;

async function inspect(viewport) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.width <= 900,
  });
  await delay(120);
  const result = await cdp.eval(`(() => {
    const visible = (node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const candidates = [...document.querySelectorAll('button,a,input,select,textarea,.card,.subnav,.domain-tabs')].filter(visible);
    const clipped = candidates.filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.left < -1 || rect.right > innerWidth + 1;
    }).map((node) => node.id || node.className || node.tagName).slice(0, 10);
    const clippedLabels = [...document.querySelectorAll('button')].filter(visible).filter((node) => node.textContent.trim()).filter((node) => node.scrollWidth > node.clientWidth + 1).map((node) => node.textContent.trim()).slice(0, 10);
    const domainTabs = [...document.querySelectorAll('.domain-tabs [role="tab"]')].filter(visible);
    const domainRows = [...new Set(domainTabs.map((node) => Math.round(node.getBoundingClientRect().top)))];
    const sectionTabs = [...document.querySelectorAll('.subnav a')].filter(visible);
    const sectionRows = [...new Set(sectionTabs.map((node) => Math.round(node.getBoundingClientRect().top)))];
    const chart = document.querySelector('#galleryChart svg');
    const chartRect = chart ? chart.getBoundingClientRect() : null;
    const sidebarVisible = !!document.querySelector('.sidebar') && visible(document.querySelector('.sidebar'));
    const mobileNavItems = [...document.querySelectorAll('.tabbar a')].filter(visible).length;
    const stackedTable = innerWidth <= 640 ? getComputedStyle(document.querySelector('.data-table thead')).display === 'none' : true;
    const stateWidths = [...document.querySelectorAll('#states .card')].filter(visible).map((node) => Math.round(node.getBoundingClientRect().width));
    return {
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      clipped,
      clippedLabels,
      domainCount: domainTabs.length,
      domainRows: domainRows.length,
      sectionRows: sectionRows.length,
      sidebarVisible,
      mobileNavItems,
      chartPoints: chart ? chart.querySelectorAll('circle[fill]').length : 0,
      chartRole: chart ? chart.getAttribute('role') : null,
      chartWidth: chartRect ? Math.round(chartRect.width) : 0,
      chartHeight: chartRect ? Math.round(chartRect.height) : 0,
      chartSummary: !!document.querySelector('#galleryChart .chart-summary'),
      chartTable: !!document.querySelector('#galleryChart .chart-table'),
      stackedTable,
      stateCount: document.querySelectorAll('[data-state]').length,
      minStateCardWidth: stateWidths.length ? Math.min(...stateWidths) : 0,
      errors: (window.__componentErrors || []).slice(),
    };
  })()`);

  assert(result.scrollWidth <= result.width, `${viewport.label} has document overflow: ${result.scrollWidth}px`);
  assert(result.clipped.length === 0, `${viewport.label} clips controls or cards: ${result.clipped.join(', ')}`);
  assert(result.clippedLabels.length === 0, `${viewport.label} clips button labels: ${result.clippedLabels.join(', ')}`);
  assert(result.domainCount === 6, `${viewport.label} does not show all six domain tabs`);
  assert(result.domainRows === (viewport.width <= 640 ? 2 : 1), `${viewport.label} domain tabs use ${result.domainRows} unexpected rows`);
  assert(result.sectionRows === (viewport.width <= 640 ? 2 : 1), `${viewport.label} section tabs use ${result.sectionRows} unexpected rows`);
  assert(viewport.width > 900 ? result.sidebarVisible && result.mobileNavItems === 0 : !result.sidebarVisible && result.mobileNavItems === 5, `${viewport.label} responsive navigation is incorrect`);
  assert(result.chartPoints === 7 && result.chartRole === 'img', `${viewport.label} shared chart did not render all observations`);
  assert(result.chartWidth > 200 && result.chartHeight >= 140, `${viewport.label} shared chart dimensions are unstable`);
  assert(result.chartSummary && result.chartTable, `${viewport.label} chart accessibility fallback is missing`);
  assert(result.stackedTable, `${viewport.label} responsive table did not switch to labeled rows`);
  assert(result.stateCount >= 6, `${viewport.label} operational state specimens are incomplete`);
  assert(result.minStateCardWidth >= (viewport.width <= 640 ? 300 : 250), `${viewport.label} state cards are too narrow for readable content`);
  assert(result.errors.length === 0, `${viewport.label} emitted runtime errors: ${result.errors.join(', ')}`);
  return result;
}

async function inspectInteractions() {
  const dialogResult = await cdp.eval(`new Promise((resolve) => {
    const trigger = document.getElementById('openDialog');
    trigger.focus();
    trigger.click();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const open = !!dialog && dialog.classList.contains('open');
      const focusInside = !!dialog && dialog.contains(document.activeElement);
      const backgroundHidden = document.querySelector('.app').getAttribute('aria-hidden') === 'true';
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      setTimeout(() => resolve({ open, focusInside, backgroundHidden, restored: document.activeElement === trigger, bodyUnlocked: !document.body.classList.contains('overlay-open') }), 280);
    }));
  })`);
  assert(dialogResult.open && dialogResult.focusInside, 'dialog does not open with focus inside');
  assert(dialogResult.backgroundHidden, 'dialog does not hide background content from assistive technology');
  assert(dialogResult.restored && dialogResult.bodyUnlocked, 'dialog does not restore focus and page scrolling');

  const menuResult = await cdp.eval(`new Promise((resolve) => {
    const trigger = document.getElementById('openMenu');
    trigger.click();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const first = document.activeElement.textContent.trim();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      const second = document.activeElement.textContent.trim();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      setTimeout(() => resolve({ first, second, restored: document.activeElement === trigger, menuClosed: !document.querySelector('.menu.open') }), 180);
    }));
  })`);
  assert(menuResult.first === 'Edit' && menuResult.second === 'Duplicate', 'menu arrow-key navigation is incorrect');
  assert(menuResult.restored && menuResult.menuClosed, 'menu Escape handling does not restore its trigger');
  return { dialogResult, menuResult };
}

try {
  await cdp.eval("window.__componentErrors=[];addEventListener('error',e=>window.__componentErrors.push(String(e.message||e.error)));addEventListener('unhandledrejection',e=>window.__componentErrors.push(String(e.reason)));true");
  const results = [];
  for (const viewport of viewports) {
    results.push({ viewport: viewport.label, ...(await inspect(viewport)) });
    await cdp.screenshot(`${screenshots}\\components-${viewport.label}.png`);
    if (viewport.width <= 900) {
      await cdp.eval('scrollTo(0, document.documentElement.scrollHeight); true');
      await delay(100);
      const bottom = await cdp.eval(`(() => {
        const nav = document.querySelector('.tabbar').getBoundingClientRect();
        const last = document.querySelector('.gallery-section:last-of-type').getBoundingClientRect();
        return { navTop: Math.round(nav.top), lastBottom: Math.round(last.bottom) };
      })()`);
      assert(bottom.lastBottom <= bottom.navTop - 8, `${viewport.label} bottom navigation overlaps final content`);
      await cdp.screenshot(`${screenshots}\\components-${viewport.label}-bottom.png`);
      await cdp.eval('scrollTo(0, 0); true');
    }
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const interactions = await inspectInteractions();
  const consoleResult = consoleSummary(cdp);
  assert(consoleResult.actionableConsoleProblems.length === 0, `Component console problems: ${JSON.stringify(consoleResult.actionableConsoleProblems)}`);
  console.log(JSON.stringify({ checked: results.length, results, interactions, ...consoleResult }, null, 2));
} finally {
  browser.close();
}
