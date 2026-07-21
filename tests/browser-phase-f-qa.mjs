import { assert, consoleSummary, delay, launchBrowser } from './browser-cdp.mjs';

const baseUrl = 'http://127.0.0.1:4173';
const screenshots = 'C:\\Users\\maila\\Desktop\\dashboard\\docs\\phase-f-screenshots';
const viewports = [
  { width: 1440, height: 900, label: 'desktop-1440x900' },
  { width: 1680, height: 945, label: 'desktop-1680x945' },
  { width: 1792, height: 1024, label: 'desktop-1792x1024' },
  { width: 768, height: 1024, label: 'tablet-768x1024' },
  { width: 390, height: 844, label: 'phone-390x844' },
];

const browser = await launchBrowser({
  port: 9256,
  url: `${baseUrl}/ui/log.html?qa=phase-f#water`,
  width: viewports[0].width,
  height: viewports[0].height,
  profileName: 'lifeos-phase-f-qa',
});
const { cdp } = browser;

async function waitFor(expression, message, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await cdp.eval(expression).catch(() => false)) return;
    await delay(80);
  }
  throw new Error(message);
}

async function navigate(path) {
  const url = new URL(path, baseUrl);
  await cdp.send('Page.navigate', { url: url.href });
  await waitFor(`location.pathname === ${JSON.stringify(url.pathname)} && document.readyState !== 'loading'`, `Page did not load: ${url.pathname}`);
  await delay(220);
}

async function inspect(path, pageName, viewport) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width <= 900 });
  await navigate(path);
  const result = await cdp.eval(`(() => {
    const visible = (node) => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0; };
    const viewportWidth = document.documentElement.clientWidth;
    const controls = [...document.querySelectorAll('button,a,input,select,textarea,[role="tab"]')].filter(visible);
    const clipped = controls.filter((node) => { const rect = node.getBoundingClientRect(); return rect.left < -1 || rect.right > viewportWidth + 1; }).map((node) => node.getAttribute('aria-label') || node.textContent.trim().slice(0, 36) || node.tagName).slice(0, 12);
    const labels = controls.filter((node) => node.textContent.trim() && node.scrollWidth > node.clientWidth + 1).map((node) => node.textContent.trim().slice(0, 36)).slice(0, 12);
    const roots = [...document.querySelectorAll('.card')].filter(visible).filter((node) => !node.parentElement.closest('.card')).map((node) => node.getBoundingClientRect());
    let collisions = 0;
    for (let left = 0; left < roots.length; left += 1) for (let right = left + 1; right < roots.length; right += 1) {
      const a = roots[left], b = roots[right];
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 3 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 3) collisions += 1;
    }
    const domainTabs = [...document.querySelectorAll('#seg [role="tab"]')].filter(visible);
    return {
      pageName: ${JSON.stringify(pageName)}, width: innerWidth, clientWidth: viewportWidth, scrollWidth: document.documentElement.scrollWidth,
      clipped, labels, collisions,
      domainTabs: domainTabs.map((node) => node.textContent.trim()),
      domainTabRows: [...new Set(domainTabs.map((node) => Math.round(node.getBoundingClientRect().top)))].length,
      waterSubtabs: [...document.querySelectorAll('[data-panel="water"] .lg-subtabs button')].filter(visible).map((node) => node.textContent.trim()),
      sidebarVisible: !!document.querySelector('.sidebar') && visible(document.querySelector('.sidebar')),
      mobileNavItems: [...document.querySelectorAll('.tabbar a')].filter(visible).length,
      errors: (window.__phaseFErrors || []).slice(),
    };
  })()`);
  assert(result.scrollWidth <= result.clientWidth + 1, `${pageName} ${viewport.label} document overflow: ${result.scrollWidth}px`);
  assert(result.clipped.length === 0, `${pageName} ${viewport.label} clips controls: ${result.clipped.join(', ')}`);
  assert(result.labels.length === 0, `${pageName} ${viewport.label} clips labels: ${result.labels.join(', ')}`);
  assert(result.collisions === 0, `${pageName} ${viewport.label} has overlapping cards`);
  if (pageName === 'water') {
    assert(result.domainTabs.length === 6, `Water ${viewport.label} does not show six domain tabs`);
    assert(result.domainTabRows === (viewport.width <= 900 ? 2 : 1), `Water ${viewport.label} uses ${result.domainTabRows} domain-tab rows`);
    assert(JSON.stringify(result.waterSubtabs) === JSON.stringify(['Overview', 'Target', 'History', 'Settings']), `Water ${viewport.label} subtab contract failed`);
  }
  assert(viewport.width > 900 ? result.sidebarVisible && result.mobileNavItems === 0 : !result.sidebarVisible && result.mobileNavItems === 5, `${pageName} ${viewport.label} navigation mode is incorrect`);
  assert(result.errors.length === 0, `${pageName} ${viewport.label} emitted errors: ${result.errors.join(', ')}`);
  await cdp.screenshot(`${screenshots}\\${pageName}-${viewport.label}.png`);
  return result;
}

try {
  await cdp.eval("window.__phaseFErrors=[];addEventListener('error',e=>window.__phaseFErrors.push(String(e.message||e.error)));addEventListener('unhandledrejection',e=>window.__phaseFErrors.push(String(e.reason)));true");
  await cdp.eval(`(() => {
    const today = LifeOS.todayStr(); const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - 1); const yesterday = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    localStorage.setItem('po_water_v1', JSON.stringify({ unit:'bottle', bottleMl:500, glassMl:250, logs:{ [today]:1, [yesterday]:2 }, profile:{ weightKg:80, age:30, sex:'m', activityHrsPerWeek:7 }, caffeineMgPerDay:300, substances:[] }));
    return true;
  })()`);
  await navigate('/ui/log.html?qa=phase-f-seeded#water');
  await waitFor("!!document.querySelector('[data-energy-panel]') && document.body.innerText.includes('Measured energy')", 'Water Energy panel did not render');

  let phase = await cdp.eval("LifeOS.canonical.phaseF(LifeOS.todayStr()).then(s=>({hydration:s['hydration.daily'].value,energy:s['energy.forecast_24h'].value}))");
  assert(phase.hydration.explicit_beverage_ml === 500 && phase.hydration.sources.legacy_ml === 500, 'Legacy Water seed did not bridge with provenance');
  assert(phase.energy.status === 'insufficient-data' && phase.energy.score_1_to_5 == null, 'Fresh energy forecast guessed without outcomes');

  await cdp.eval("document.querySelector('[data-add-ml=\"250\"]').click();true");
  await waitFor("LifeOS.canonical.phaseF(LifeOS.todayStr()).then(s=>s['hydration.daily'].value.explicit_beverage_ml===750)", 'Canonical quick-add did not reach 750 ml');
  phase = await cdp.eval("LifeOS.canonical.phaseF(LifeOS.todayStr()).then(s=>({hydration:s['hydration.daily'].value,readiness:s['readiness.daily'].value}))");
  assert(phase.hydration.sources.manual_ml === 250, 'Quick-add provenance did not identify manual intake');
  assert(phase.readiness.parts.some((part) => part.key === 'hydration' && /% of target/.test(part.detail)), 'Hydration did not update readiness context');

  for (const value of [3, 4, 2]) {
    await waitFor(`!!document.querySelector('[data-energy-value="${value}"]')`, `Energy button ${value} is missing`);
    await cdp.eval(`document.querySelector('[data-energy-value="${value}"]').click();true`);
    await delay(180);
  }
  await waitFor("LifeOS.canonical.phaseF(LifeOS.todayStr()).then(s=>s['energy.forecast_24h'].value.curve.length===8)", 'Three check-ins did not unlock the Energy curve');
  phase = await cdp.eval("LifeOS.canonical.phaseF(LifeOS.todayStr()).then(s=>({energy:s['energy.forecast_24h']}))");
  assert(phase.energy.value.status === 'early-directional' && phase.energy.confidence.level === 'low', 'Early forecast does not expose low confidence');
  assert(phase.energy.value.contributors.some((item) => item.key === 'hydration'), 'Energy outlook did not consume hydration context');

  for (const tab of ['target', 'history', 'settings', 'overview']) {
    await cdp.eval(`document.querySelector('[data-sub="${tab}"]').click();true`);
    await delay(100);
    assert(await cdp.eval(`document.querySelector('[data-panel="water"]').innerText.length > 200`), `Water ${tab} tab rendered empty`);
  }

  await navigate('/ui/today.html?qa=phase-f');
  await waitFor("document.body.innerText.includes('Hydration') && document.body.innerText.includes('Energy outlook') && !!document.querySelector('[data-energy-checkin]')", 'Today did not consume Water and Energy projections');
  await cdp.eval("document.querySelector('[data-energy-checkin=\"5\"]').click();true");
  await waitFor("LifeOS.canonical.phaseF(LifeOS.todayStr()).then(s=>s['energy.current'].value.value===5)", 'Today energy check-in did not update the shared current outcome');

  const results = [];
  for (const viewport of viewports) {
    results.push(await inspect('/ui/log.html?qa=phase-f-matrix#water', 'water', viewport));
    results.push(await inspect('/ui/today.html?qa=phase-f-matrix', 'today', viewport));
  }
  const consoleResult = consoleSummary(cdp);
  assert(consoleResult.actionableConsoleProblems.length === 0, `Phase F console problems: ${JSON.stringify(consoleResult.actionableConsoleProblems)}`);
  console.log(JSON.stringify({ checked: results.length, results, ...consoleResult }, null, 2));
} finally {
  browser.close();
}
