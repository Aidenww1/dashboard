import { assert, consoleSummary, delay, launchBrowser } from './browser-cdp.mjs';

const baseUrl = 'http://127.0.0.1:4173';
const screenshots = 'C:\\Users\\maila\\Desktop\\dashboard\\docs\\phase-g-screenshots';
const viewports = [
  { width: 1440, height: 900, label: 'desktop-1440x900' },
  { width: 1680, height: 945, label: 'desktop-1680x945' },
  { width: 1792, height: 1024, label: 'desktop-1792x1024' },
  { width: 768, height: 1024, label: 'tablet-768x1024' },
  { width: 390, height: 844, label: 'phone-390x844' },
];
const domainTabs = {
  skin: ['overview', 'routine', 'products', 'lab', 'photos'],
  supps: ['overview', 'schedule', 'compounds', 'monitoring', 'inventory', 'notes'],
};

const browser = await launchBrowser({
  port: 9257,
  url: `${baseUrl}/ui/log.html?qa=phase-g#skin`,
  width: viewports[0].width,
  height: viewports[0].height,
  profileName: 'lifeos-phase-g-qa',
});
const { cdp } = browser;

async function waitFor(expression, message, attempts = 90) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await cdp.eval(expression).catch(() => false)) return;
    await delay(80);
  }
  throw new Error(message);
}

async function navigate(domain) {
  const url = `${baseUrl}/ui/log.html?qa=phase-g-matrix#${domain}`;
  await cdp.send('Page.navigate', { url });
  await waitFor(`location.hash === '#${domain}' && document.readyState !== 'loading' && !!document.querySelector('[data-panel="${domain}"] .lg-subtabs')`, `${domain} did not load`);
  await delay(160);
}

async function inspectDomain(domain, viewport) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width <= 900 });
  await navigate(domain);
  const checkedTabs = [];
  for (const subtab of domainTabs[domain]) {
    const selector = `[data-panel="${domain}"] [data-sub="${subtab}"]`;
    assert(await cdp.eval(`document.querySelector(${JSON.stringify(selector)}) !== null`), `${domain} ${subtab} is missing at ${viewport.label}`);
    await cdp.eval(`document.querySelector(${JSON.stringify(selector)}).click();true`);
    await delay(90);
    const tabResult = await cdp.eval(`(() => {
      const panel = document.querySelector('[data-panel="${domain}"]');
      const visible = (node) => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0; };
      const controls = [...panel.querySelectorAll('button,a,input,select,textarea')].filter(visible);
      const clipped = controls.filter((node) => { const rect = node.getBoundingClientRect(); return rect.left < -1 || rect.right > document.documentElement.clientWidth + 1; }).map((node) => node.getAttribute('aria-label') || node.textContent.trim().slice(0, 36) || node.tagName).slice(0, 12);
      const cards = [...panel.querySelectorAll('.card')].filter(visible).filter((node) => !node.parentElement.closest('.card')).map((node) => node.getBoundingClientRect());
      let collisions = 0;
      for (let left = 0; left < cards.length; left += 1) for (let right = left + 1; right < cards.length; right += 1) {
        const a = cards[left], b = cards[right];
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 3 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 3) collisions += 1;
      }
      return { textLength: panel.innerText.trim().length, clipped, collisions, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth };
    })()`);
    assert(tabResult.textLength > 80, `${domain} ${subtab} rendered empty at ${viewport.label}`);
    assert(tabResult.scrollWidth <= tabResult.clientWidth + 1, `${domain} ${subtab} overflows at ${viewport.label}: ${tabResult.scrollWidth}px`);
    assert(tabResult.clipped.length === 0, `${domain} ${subtab} clips controls at ${viewport.label}: ${tabResult.clipped.join(', ')}`);
    assert(tabResult.collisions === 0, `${domain} ${subtab} overlaps cards at ${viewport.label}`);
    checkedTabs.push(subtab);
  }
  await cdp.eval(`document.querySelector('[data-panel="${domain}"] [data-sub="overview"]').click();true`);
  await delay(80);
  const shell = await cdp.eval(`(() => {
    const visible = (node) => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0; };
    const tabs = [...document.querySelectorAll('#seg [role="tab"]')].filter(visible);
    return {
      domainTabs: tabs.map((node) => node.textContent.trim()),
      domainRows: [...new Set(tabs.map((node) => Math.round(node.getBoundingClientRect().top)))].length,
      subTabs: [...document.querySelectorAll('[data-panel="${domain}"] .lg-subtabs button')].filter(visible).map((node) => node.textContent.trim()),
      sidebarVisible: !!document.querySelector('.sidebar') && visible(document.querySelector('.sidebar')),
      mobileNavItems: [...document.querySelectorAll('.tabbar a')].filter(visible).length,
      errors: (window.__phaseGErrors || []).slice(),
    };
  })()`);
  assert(shell.domainTabs.length === 6, `${domain} lost a primary Log tab at ${viewport.label}`);
  assert(shell.domainRows === (viewport.width <= 900 ? 2 : 1), `${domain} primary tabs use ${shell.domainRows} rows at ${viewport.label}`);
  assert(shell.subTabs.length === domainTabs[domain].length, `${domain} lost an internal tab at ${viewport.label}`);
  assert(viewport.width > 900 ? shell.sidebarVisible && shell.mobileNavItems === 0 : !shell.sidebarVisible && shell.mobileNavItems === 5, `${domain} navigation mode is wrong at ${viewport.label}`);
  assert(shell.errors.length === 0, `${domain} emitted errors at ${viewport.label}: ${shell.errors.join(', ')}`);
  await cdp.screenshot(`${screenshots}\\${domain}-${viewport.label}.png`);
  return { domain, viewport: viewport.label, checkedTabs, ...shell };
}

try {
  await cdp.eval("localStorage.clear();sessionStorage.clear();window.__phaseGErrors=[];addEventListener('error',e=>window.__phaseGErrors.push(String(e.message||e.error)));addEventListener('unhandledrejection',e=>window.__phaseGErrors.push(String(e.reason)));true");
  await cdp.eval(`(() => {
    const today = LifeOS.todayStr();
    localStorage.setItem('skin:logs', JSON.stringify([
      { id:'skin-g-1', date:today, rating:4, concerns:['redness'], water:2.4, sleep:7.5, notes:'Stable baseline' },
      { id:'skin-g-2', date:'2026-07-20', rating:3, concerns:['dryness'], water:2.0, sleep:6.5, notes:'Dry evening' },
      { id:'skin-g-3', date:'2026-07-19', rating:4, concerns:[], water:2.6, sleep:8.0, notes:'Calm' }
    ]));
    localStorage.setItem('skin:products', JSON.stringify([
      { id:'spf-g', name:'Daily SPF', brand:'Test', type:'spf', time:'am', freq:'daily' },
      { id:'cleanser-g', name:'Gentle Cleanser', brand:'Test', type:'cleanser', time:'both', freq:'daily' }
    ]));
    localStorage.setItem('skin:routine:v1', JSON.stringify({ [today]:['spf-g','cleanser-g'] }));
    localStorage.setItem('skin:breakouts', JSON.stringify([{ id:'breakout-g', date:today, locations:['Chin'], trigger:'Unknown' }]));
    localStorage.setItem('skin:ingredients', JSON.stringify(['Fragrance']));
    localStorage.setItem('skin:goals', JSON.stringify([{ id:'goal-g', text:'Improve consistency', done:false }]));
    localStorage.setItem('skin:device_sessions', JSON.stringify([{ id:'led-g', date:today, type:'led', notes:'10 minutes' }]));
    localStorage.setItem('stack:items', JSON.stringify([
      { id:'creatine-g', name:'Creatine', dose:'5 g', window:'morning', time:'07:30', frequency:'Daily', category:'Supplement', route:'Oral', stock:6, stockUnit:'servings', reorderAt:10 },
      { id:'vitamin-d-g', name:'Vitamin D', dose:'2000 IU', window:'morning', time:'08:00', frequency:'Daily', category:'Supplement', route:'Oral', stock:40, stockUnit:'caps', reorderAt:15 }
    ]));
    localStorage.setItem('stack:low', JSON.stringify(['creatine-g']));
    localStorage.setItem('stack:taken:' + today, JSON.stringify({ 'creatine-g':true }));
    localStorage.setItem('supps:notes:v1', JSON.stringify([{ id:'note-g', date:today, text:'Recovery stable', tag:'Recovery' }]));
    localStorage.setItem('blood:logs', JSON.stringify([{ date:'2026-07-18', markers:{ vitaminD:24, ldl:120 } }]));
    return true;
  })()`);
  await navigate('skin');
  await waitFor("LifeOS.canonical.phaseG(LifeOS.todayStr()).then(s=>s['skin.current'].value.checkin?.rating===4 && s['supplements.schedule'].value.total===2)", 'Phase G legacy data did not bridge');
  const phase = await cdp.eval(`LifeOS.canonical.phaseG(LifeOS.todayStr()).then(s=>({
    skin:s['skin.current'].value,
    support:s['skin.support'].value,
    correlations:s['skin.correlations'].value,
    insights:s['skin.insights'].value,
    schedule:s['supplements.schedule'].value,
    adherence:s['supplements.adherence'].value,
    inventory:s['supplements.inventory'].value,
    monitoring:s['supplements.monitoring'].value,
    labs:s['labs.latest'].value
  }))`);
  assert(phase.skin.checkin.rating === 4 && phase.skin.products.length === 2, 'Skin projections did not share check-in and product facts');
  assert(phase.support.treatments.length === 1 && phase.support.ingredients.length === 1 && phase.support.goals.length === 1, 'Skin support projection duplicated or lost records');
  assert(phase.correlations.associations.length === 0 && phase.correlations.status === 'insufficient-sample', 'Skin emitted an unsupported correlation');
  assert(phase.insights.limitations.some((text) => text.includes('does not diagnose')), 'Skin guidance omitted its safety limitation');
  assert(phase.schedule.total === 2 && phase.adherence.taken === 1 && phase.inventory.low_stock.length === 1, 'Supplements projections did not share schedule, adherence, and inventory');
  assert(phase.monitoring.numeric_predictions_enabled === false && phase.monitoring.status === 'review', 'Supplement monitoring crossed the numeric prediction safety boundary');
  assert(phase.labs.available && phase.labs.markers.some((marker) => marker.key === 'vitaminD'), 'Body Labs did not feed shared supplement monitoring');

  const results = [];
  for (const viewport of viewports) {
    results.push(await inspectDomain('skin', viewport));
    results.push(await inspectDomain('supps', viewport));
  }
  const consoleResult = consoleSummary(cdp);
  assert(consoleResult.actionableConsoleProblems.length === 0, `Phase G console problems: ${JSON.stringify(consoleResult.actionableConsoleProblems)}`);
  console.log(JSON.stringify({ checkedPages: results.length, checkedInternalTabs: results.reduce((sum, row) => sum + row.checkedTabs.length, 0), results, ...consoleResult }, null, 2));
} finally {
  browser.close();
}
