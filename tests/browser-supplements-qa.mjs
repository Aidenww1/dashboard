import { assert, consoleSummary, delay, launchBrowser } from './browser-cdp.mjs';

const baseUrl = 'http://127.0.0.1:4173';
const screenshots = 'C:\\Users\\maila\\Desktop\\dashboard\\docs\\phase8-screenshots';
const browser = await launchBrowser({
  port: 9229,
  url: `${baseUrl}/ui/log.html#supps`,
  profileName: 'lifeos-supplements-qa',
});
const { cdp } = browser;

try {
  await cdp.eval("localStorage.clear();sessionStorage.clear();true");
  await cdp.send('Page.navigate', { url: `${baseUrl}/ui/log.html?qa=supplements#supps` });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await cdp.eval("document.readyState==='complete' && performance.getEntriesByType('navigation')[0]?.name.includes('?qa=supplements') && document.body.innerText.includes('Today’s protocol')")) break;
    await delay(100);
  }
  await cdp.eval("window.__qaErrors=[];addEventListener('error',e=>window.__qaErrors.push(String(e.message||e.error)));addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));true");

  const fresh = await cdp.eval(`(() => ({
    tabs: [...document.querySelectorAll('[data-panel=supps] .lg-subtabs button')].map((node) => node.textContent.trim()),
    dashboard: document.querySelectorAll('[data-panel=supps] .lg-statgrid .lg-kpi').length === 4 && ['Today’s protocol', 'Add compound'].every((label) => document.querySelector('[data-panel=supps]').innerText.includes(label)),
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    errors: (window.__qaErrors || []).slice(),
  }))()`);
  assert(JSON.stringify(fresh.tabs) === JSON.stringify(['Overview', 'Schedule', 'Compounds', 'Monitoring', 'Inventory', 'Notes']), 'Supplements subtab contract is incorrect');
  assert(fresh.dashboard, 'Fresh Supplements profile does not show the full zero-data dashboard and setup action');
  assert(fresh.width <= fresh.viewport, 'Supplements overflows at desktop width');
  assert(fresh.errors.length === 0, `Fresh Supplements errors: ${fresh.errors.join(', ')}`);

  await cdp.eval("document.querySelector('[data-panel=supps] [data-sub=compounds]').click();true");
  await delay(80);
  await cdp.eval("document.querySelector('[data-supp-add]').click();true");
  await delay(80);
  assert(await cdp.eval("document.querySelector('.sheet')?.getAttribute('aria-label')==='Add compound'"), 'Add compound sheet did not open');
  await cdp.eval(`(() => {
    document.querySelector('#si-name').value = 'Creatine Monohydrate';
    document.querySelector('#si-dose').value = '5 g';
    document.querySelector('#si-window').value = 'morning';
    document.querySelector('#si-time').value = '07:30';
    document.querySelector('#si-frequency').value = 'Daily';
    document.querySelector('#si-category').value = 'Supplement';
    document.querySelector('#si-route').value = 'Oral';
    document.querySelector('#si-note').value = 'With breakfast';
    document.querySelector('#si-save').click(); return true;
  })()`);
  await delay(320);
  let items = await cdp.eval("JSON.parse(localStorage.getItem('stack:items'))");
  assert(items.length === 1 && items[0].name === 'Creatine Monohydrate' && items[0].time === '07:30', 'Compound add did not preserve schedule fields');

  await cdp.eval("document.querySelector('[data-supp-edit]').click();true");
  await delay(80);
  await cdp.eval("document.querySelector('#si-dose').value='6 g';document.querySelector('#si-window').value='evening';document.querySelector('#si-time').value='20:30';document.querySelector('#si-save').click();true");
  await delay(320);
  items = await cdp.eval("JSON.parse(localStorage.getItem('stack:items'))");
  assert(items[0].dose === '6 g' && items[0].window === 'evening' && items[0].note === 'With breakfast', 'Compound edit did not preserve untouched fields');

  await cdp.eval("document.querySelector('[data-supp-add]').click();true");
  await delay(70);
  await cdp.eval(`(() => {
    document.querySelector('#si-name').value = 'Test Cypionate';
    document.querySelector('#si-dose').value = '100 mg';
    document.querySelector('#si-window').value = 'morning';
    document.querySelector('#si-time').value = '08:00';
    document.querySelector('#si-frequency').value = 'Weekly';
    document.querySelector('#si-category').value = 'Compound';
    document.querySelector('#si-route').value = 'Injection';
    document.querySelector('#si-save').click(); return true;
  })()`);
  await delay(320);
  items = await cdp.eval("JSON.parse(localStorage.getItem('stack:items'))");
  assert(items.length === 2 && items[1].route === 'Injection', 'Second compound did not persist route/category metadata');
  await cdp.eval("document.querySelector('.toast-host')?.remove();true");
  await cdp.screenshot(`${screenshots}\\supplements-compounds-1440x900.png`);

  await cdp.eval("document.querySelector('[data-panel=supps] [data-sub=inventory]').click();true");
  await delay(100);
  await cdp.eval("document.querySelector('[data-stock-edit]').click();true");
  await delay(70);
  await cdp.eval(`(() => {
    document.querySelector('#ss-stock').value = '6';
    document.querySelector('#ss-unit').value = 'caps';
    document.querySelector('#ss-reorder').value = '10';
    document.querySelector('#ss-expiry').value = '2026-08-01';
    document.querySelector('#ss-low').checked = true;
    document.querySelector('#ss-save').click(); return true;
  })()`);
  await delay(320);
  items = await cdp.eval("JSON.parse(localStorage.getItem('stack:items'))");
  const lowIds = await cdp.eval("JSON.parse(localStorage.getItem('stack:low'))");
  assert(items[0].stock === 6 && items[0].reorderAt === 10 && items[0].expiry === '2026-08-01', 'Inventory fields did not persist');
  assert(lowIds.includes(items[0].id), 'Low-stock flag did not persist to stack:low');
  await cdp.eval("document.querySelector('.toast-host')?.remove();true");
  await cdp.screenshot(`${screenshots}\\supplements-inventory-1440x900.png`);

  await cdp.eval("document.querySelector('[data-panel=supps] [data-sub=overview]').click();true");
  await delay(90);
  await cdp.eval(`document.querySelector('[data-s="${items[0].id}"]').click();true`);
  await delay(90);
  let taken = await cdp.eval("JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('stack:taken:'))))");
  assert(taken[items[0].id] === true, 'Overview dose toggle did not persist');
  await cdp.eval("document.querySelector('#qlog').value='Test Cyp';document.querySelector('#qlog').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));true");
  await delay(120);
  taken = await cdp.eval("JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.startsWith('stack:taken:'))))");
  assert(taken[items[1].id] === true, 'Quick Log did not mark an existing stack item taken');

  await cdp.eval(`localStorage.setItem('blood:logs',JSON.stringify([{date:'2026-07-18',markers:{vitaminD:45,ldl:120}}]));document.querySelector('[data-panel=supps] [data-sub=monitoring]').click();true`);
  await delay(120);
  assert(await cdp.eval("document.querySelector('[data-panel=supps]').innerText.includes('Latest panel') && document.querySelector('[data-panel=supps]').innerText.includes('Vitamin D')"), 'Monitoring did not render canonical Body Labs data');
  await cdp.eval("document.querySelector('.toast-host')?.remove();true");
  await cdp.screenshot(`${screenshots}\\supplements-monitoring-1440x900.png`);
  await cdp.eval("document.querySelector('[data-open-body-labs]').click();true");
  await delay(130);
  assert(await cdp.eval("document.querySelector('#seg-body').getAttribute('aria-selected')==='true' && document.querySelector('[data-panel=body] [data-sub=labs]').getAttribute('aria-selected')==='true'"), 'Monitoring did not deep-link to canonical Body Labs');

  await cdp.eval("document.querySelector('#seg-supps').click();true");
  await delay(100);
  await cdp.eval("document.querySelector('[data-panel=supps] [data-sub=notes]').click();true");
  await delay(80);
  await cdp.eval("document.querySelector('#sp-note-in').value='Sleep felt better';document.querySelector('[data-tag=Recovery]').click();document.querySelector('[data-note-save]').click();true");
  await delay(100);
  assert(await cdp.eval("JSON.parse(localStorage.getItem('supps:notes:v1')).some(n=>n.text==='Sleep felt better'&&n.tag==='Recovery')"), 'Supplement note did not persist');
  await cdp.eval("document.querySelector('[data-del-note]').click();true");
  await delay(70);
  assert(await cdp.eval("document.querySelector('[role=alertdialog]')?.getAttribute('aria-label')==='Delete this note?'"), 'Note deletion was not confirm-gated');
  await cdp.eval("document.querySelector('[role=alertdialog] [data-confirm]').click();true");
  await delay(100);
  assert(await cdp.eval("JSON.parse(localStorage.getItem('supps:notes:v1')).length===0"), 'Confirmed note deletion did not persist');
  await cdp.eval("[...document.querySelectorAll('.toast button')].find(b=>b.textContent==='Undo').click();true");
  await delay(100);
  assert(await cdp.eval("JSON.parse(localStorage.getItem('supps:notes:v1')).length===1"), 'Note Undo did not restore the store');

  await cdp.eval("document.querySelector('[data-panel=supps] [data-sub=compounds]').click();true");
  await delay(80);
  await cdp.eval("document.querySelector('[data-supp-delete]').click();true");
  await delay(70);
  assert(await cdp.eval("document.querySelector('[role=alertdialog]')?.getAttribute('aria-label')==='Delete this compound?'"), 'Compound deletion was not confirm-gated');
  await cdp.eval("document.querySelector('[role=alertdialog] [data-confirm]').click();true");
  await delay(100);
  assert(await cdp.eval("JSON.parse(localStorage.getItem('stack:items')).length===1"), 'Confirmed compound deletion did not persist');
  await cdp.eval("[...document.querySelectorAll('.toast button')].find(b=>b.textContent==='Undo').click();true");
  await delay(100);
  assert(await cdp.eval("JSON.parse(localStorage.getItem('stack:items')).length===2"), 'Compound Undo did not restore stack and inventory data');

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(160);
  const mobile = await cdp.eval(`(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    tabs: [...document.querySelectorAll('[data-panel=supps] .lg-subtabs button')].map((node) => node.textContent.trim()),
    errors: (window.__qaErrors || []).slice(),
  }))()`);
  assert(mobile.width <= mobile.viewport, 'Supplements overflows at 390px');
  assert(JSON.stringify(mobile.tabs) === JSON.stringify(['Overview', 'Schedule', 'Compounds', 'Monitoring', 'Inventory', 'Notes']), 'Mobile Supplements lost a locked subtab');
  assert(mobile.errors.length === 0, `Supplements errors: ${mobile.errors.join(', ')}`);
  await cdp.eval("document.querySelector('.toast-host')?.remove();true");
  await cdp.screenshot(`${screenshots}\\supplements-compounds-mobile-390x844.png`);

  const consoleResult = consoleSummary(cdp);
  assert(consoleResult.actionableConsoleProblems.length === 0, `Supplements console problems: ${JSON.stringify(consoleResult.actionableConsoleProblems)}`);
  console.log(JSON.stringify({ fresh, items, lowIds, mobile, ...consoleResult }, null, 2));
} finally {
  browser.close();
}
