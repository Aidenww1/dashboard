import { assert, consoleSummary, delay, launchBrowser } from './browser-cdp.mjs';

const baseUrl = 'http://127.0.0.1:4173';
const screenshots = 'C:\\Users\\maila\\Desktop\\dashboard\\docs\\phase-d-screenshots';
const viewports = [
  { width: 1440, height: 900, label: 'desktop-1440x900' },
  { width: 1680, height: 945, label: 'desktop-1680x945' },
  { width: 1792, height: 1024, label: 'desktop-1792x1024' },
  { width: 768, height: 1024, label: 'tablet-768x1024' },
  { width: 390, height: 844, label: 'phone-390x844' },
];
const pages = [
  { name: 'food', path: '/ui/log.html?tab=food' },
  { name: 'today', path: '/ui/today.html' },
];

const browser = await launchBrowser({
  port: 9254,
  url: `${baseUrl}${pages[0].path}`,
  width: viewports[0].width,
  height: viewports[0].height,
  profileName: 'lifeos-phase-d-qa',
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
    const candidates = [...document.querySelectorAll('button,a,input,select,textarea,[role="tab"],.card')].filter(visible);
    const clipped = candidates.filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.left < -1 || rect.right > viewportWidth + 1;
    }).map((node) => node.getAttribute('aria-label') || node.textContent.trim().slice(0, 32) || node.className || node.tagName).slice(0, 12);
    const clippedLabels = [...document.querySelectorAll('button')].filter(visible).filter((node) => node.textContent.trim()).filter((node) => node.scrollWidth > node.clientWidth + 1).map((node) => node.textContent.trim().slice(0, 32)).slice(0, 12);
    const cards = [...document.querySelectorAll('.card')].filter(visible).map((node) => node.getBoundingClientRect());
    let cardCollisions = 0;
    for (let left = 0; left < cards.length; left += 1) {
      for (let right = left + 1; right < cards.length; right += 1) {
        const a = cards[left], b = cards[right];
        const overlapWidth = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapHeight = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlapWidth > 3 && overlapHeight > 3) cardCollisions += 1;
      }
    }
    const tabs = [...document.querySelectorAll('#seg [role="tab"]')].filter(visible);
    const tabRows = [...new Set(tabs.map((node) => Math.round(node.getBoundingClientRect().top)))];
    const timelineOverflow = [...document.querySelectorAll('.lg-timeline-row')].filter((node) => node.scrollWidth > node.clientWidth).length;
    return {
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      clipped,
      clippedLabels,
      cardCollisions,
      tabs: tabs.length,
      tabRows: tabRows.length,
      tabsVisible: tabs.every((node) => {
        const rect = node.getBoundingClientRect();
        return rect.left >= -1 && rect.right <= viewportWidth + 1;
      }),
      timelineOverflow,
      sidebarVisible: !!document.querySelector('.sidebar') && visible(document.querySelector('.sidebar')),
      mobileNavItems: [...document.querySelectorAll('.tabbar a')].filter(visible).length,
      runtimeErrors: (window.__phaseDErrors || []).slice(),
    };
  })()`);

  assert(result.scrollWidth <= result.width, `${page.name} ${viewport.label} has document overflow: ${result.scrollWidth}px`);
  assert(result.clipped.length === 0, `${page.name} ${viewport.label} clips controls: ${result.clipped.join(', ')}`);
  assert(result.clippedLabels.length === 0, `${page.name} ${viewport.label} clips button labels: ${result.clippedLabels.join(', ')}`);
  assert(result.cardCollisions === 0, `${page.name} ${viewport.label} has overlapping cards`);
  assert(viewport.width > 900 ? result.sidebarVisible && result.mobileNavItems === 0 : !result.sidebarVisible && result.mobileNavItems === 5, `${page.name} ${viewport.label} responsive navigation is incorrect`);
  if (page.name === 'food') {
    assert(result.tabs === 6 && result.tabsVisible, `${viewport.label} does not show all six Food domain tabs`);
    assert(result.tabRows === (viewport.width <= 900 ? 2 : 1), `${viewport.label} uses ${result.tabRows} unexpected Food tab rows`);
    assert(result.timelineOverflow === 0, `${viewport.label} Food timeline has internal overflow`);
  }
  assert(result.runtimeErrors.length === 0, `${page.name} ${viewport.label} emitted runtime errors: ${result.runtimeErrors.join(', ')}`);

  if (viewport.width <= 900) {
    await cdp.eval('scrollTo(0, document.documentElement.scrollHeight); true');
    await delay(80);
    const bottom = await cdp.eval(`(() => {
      const nav = document.querySelector('.tabbar').getBoundingClientRect();
      const content = [...document.querySelectorAll('.card')].filter((node) => getComputedStyle(node).display !== 'none').at(-1).getBoundingClientRect();
      return { navTop: Math.round(nav.top), contentBottom: Math.round(content.bottom) };
    })()`);
    assert(bottom.contentBottom <= bottom.navTop - 8, `${page.name} ${viewport.label} bottom navigation overlaps content`);
    await cdp.eval('scrollTo(0, 0); true');
  }
  return result;
}

async function verifyCanonicalPropagation() {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate('/ui/log.html?tab=food');
  const appended = await cdp.eval(`(async () => {
    const runtime = await LifeOS.canonicalReady;
    const result = await runtime.appendMeal({ id: 'phase-d-browser-qa', name: 'Phase D browser QA meal', dateKey: new Date().toISOString().slice(0, 10), calories: 321, protein: 23, carbs: 31, fat: 11, fiber: 7, sugar: 4, source: 'manual' });
    return { id: result.canonical_event_id };
  })()`);
  await delay(250);
  const foodState = await cdp.eval(`(() => ({ text: document.body.innerText, rows: document.querySelectorAll('.lg-meal-row').length }))()`);
  assert(foodState.text.includes('Phase D browser QA meal') && foodState.rows === 1, 'canonical meal did not appear on Food');

  await navigate('/ui/today.html');
  const todayState = await cdp.eval(`(() => {
    const card = [...document.querySelectorAll('.card')].find((node) => node.textContent.includes('Nutrition'));
    return card ? card.textContent.replace(/\\s+/g, ' ').trim() : '';
  })()`);
  assert(todayState.includes('321') && todayState.includes('23') && todayState.includes('logged'), 'canonical meal did not propagate to Today');

  const cleanup = await cdp.eval(`(async () => {
    const runtime = await LifeOS.canonicalReady;
    await runtime.deleteMeal({ canonical_event_id: ${JSON.stringify(appended.id)} });
    runtime.refresh();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const projection = await runtime.nutritionDaily(new Date().toISOString().slice(0, 10));
    return { meals: projection.value.meals.length, calories: projection.value.calories };
  })()`);
  assert(cleanup.meals === 0 && cleanup.calories === 0, 'canonical browser QA meal was not deleted cleanly');
  return { foodRows: foodState.rows, todayState, cleanup };
}

try {
  await cdp.eval("window.__phaseDErrors=[];addEventListener('error',e=>window.__phaseDErrors.push(String(e.message||e.error)));addEventListener('unhandledrejection',e=>window.__phaseDErrors.push(String(e.reason)));true");
  const propagation = await verifyCanonicalPropagation();
  const results = [];
  for (const viewport of viewports) {
    for (const page of pages) {
      results.push({ page: page.name, viewport: viewport.label, ...(await inspect(page, viewport)) });
      await cdp.screenshot(`${screenshots}\\${page.name}-${viewport.label}.png`);
    }
  }
  const consoleResult = consoleSummary(cdp);
  assert(consoleResult.actionableConsoleProblems.length === 0, `Phase D console problems: ${JSON.stringify(consoleResult.actionableConsoleProblems)}`);
  console.log(JSON.stringify({ checked: results.length, propagation, results, ...consoleResult }, null, 2));
} finally {
  browser.close();
}
