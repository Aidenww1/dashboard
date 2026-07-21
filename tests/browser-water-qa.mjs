import { assert, consoleSummary, delay, launchBrowser } from './browser-cdp.mjs';

const baseUrl = 'http://127.0.0.1:4173';
const screenshots = 'C:\\Users\\maila\\Desktop\\dashboard\\docs\\phase7-screenshots';
const browser = await launchBrowser({
  port: 9228,
  url: `${baseUrl}/ui/log.html#water`,
  profileName: 'lifeos-water-qa',
});
const { cdp } = browser;

try {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await cdp.eval("document.readyState==='complete' && document.body.innerText.includes('Nothing logged yet')")) break;
    await delay(100);
  }
  await cdp.eval("window.__qaErrors=[];addEventListener('error',e=>window.__qaErrors.push(String(e.message||e.error)));addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));true");

  const fresh = await cdp.eval(`(() => ({
    tabs: [...document.querySelectorAll('.lg-subtabs button')].map((node) => node.textContent.trim()),
    empty: document.body.innerText.includes('Nothing logged yet') && document.body.innerText.includes('No water logged yet'),
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    errors: (window.__qaErrors || []).slice(),
  }))()`);
  assert(JSON.stringify(fresh.tabs) === JSON.stringify(['Overview', 'Target', 'History', 'Settings']), 'Water subtab contract is incorrect');
  assert(fresh.empty, 'Fresh Water profile does not show honest empty states');
  assert(fresh.width <= fresh.viewport, 'Water overflows at desktop width');
  assert(fresh.errors.length === 0, `Fresh Water errors: ${fresh.errors.join(', ')}`);

  await cdp.eval("document.querySelector('[data-add-ml=\"250\"]').click();true");
  await delay(100);
  let state = await cdp.eval("JSON.parse(localStorage.getItem('po_water_v1'))");
  const date = Object.keys(state.logs)[0];
  assert(state.logs[date] === 0.5, '250 ml quick-add did not persist as half a 500 ml bottle');
  await cdp.eval("document.querySelector('[data-add-ml=\"500\"]').click();true");
  await delay(90);
  state = await cdp.eval("JSON.parse(localStorage.getItem('po_water_v1'))");
  assert(state.logs[date] === 1.5, '500 ml quick-add did not accumulate');
  await cdp.eval("document.querySelector('[data-undo-ml]').click();true");
  await delay(100);
  state = await cdp.eval("JSON.parse(localStorage.getItem('po_water_v1'))");
  assert(state.logs[date] === 0.5, 'Water Undo did not restore the prior count');

  await cdp.eval("document.querySelector('[data-sub=settings]').click();true");
  await delay(100);
  assert(await cdp.eval("!!document.querySelector('#wtr-settings-form') && !!document.querySelector('[data-water-export]')"), 'Water Settings controls did not render');
  await cdp.eval(`(() => {
    document.querySelector('#wtr-weight').value = '80';
    document.querySelector('#wtr-weight-unit').value = 'kg';
    document.querySelector('#wtr-age').value = '30';
    document.querySelector('#wtr-sex').value = 'm';
    document.querySelector('#wtr-activity').value = '7';
    document.querySelector('#wtr-caffeine').value = '300';
    document.querySelector('#wtr-bottle').value = '600';
    document.querySelector('#wtr-glass').value = '300';
    document.querySelector('#wtr-settings-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    return true;
  })()`);
  await delay(150);
  state = await cdp.eval("JSON.parse(localStorage.getItem('po_water_v1'))");
  assert(state.profile.weightKg === 80 && state.profile.age === 30 && state.profile.activityHrsPerWeek === 7, 'Water profile settings did not persist');
  assert(state.caffeineMgPerDay === 300 && state.bottleMl === 600 && state.glassMl === 300, 'Water display/caffeine settings did not persist');
  assert(Math.abs(state.logs[date] * 600 - 250) < 0.1, 'Changing bottle size altered historical milliliters');

  await cdp.eval("document.querySelector('[data-unit=glass]').click();true");
  await delay(130);
  state = await cdp.eval("JSON.parse(localStorage.getItem('po_water_v1'))");
  assert(state.unit === 'glass' && Math.abs(state.logs[date] * 300 - 250) < 0.1, 'Changing Water units altered historical milliliters');

  await cdp.eval("document.querySelector('[data-sub=target]').click();true");
  await delay(100);
  assert(await cdp.eval("(document.body.innerText.includes('3.6 L') || document.body.innerText.includes('3.7 L')) && document.body.innerText.includes('80 kg x 35 ml')"), 'Water target did not update from saved profile factors');

  await cdp.eval("document.querySelector('[data-sub=settings]').click();true");
  await delay(80);
  await cdp.eval(`(() => {
    const backup = { unit: 'bottle', bottleMl: 500, glassMl: 250, weightUnit: 'lb', profile: { weightKg: 176, age: 35, sex: 'f', activityHrsPerWeek: 0 }, caffeineMgPerDay: 0, substances: [], logs: { '2026-07-18': 4 } };
    const file = new File([JSON.stringify(backup)], 'water-backup.json', { type: 'application/json' });
    const transfer = new DataTransfer(); transfer.items.add(file);
    const input = document.querySelector('[data-water-import-file]'); input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true })); return true;
  })()`);
  await delay(120);
  assert(await cdp.eval("document.querySelector('[role=alertdialog]')?.getAttribute('aria-label')==='Import Water backup?'"), 'Water import was not confirm-gated');
  await cdp.eval("document.querySelector('[role=alertdialog] [data-confirm]').click();true");
  await delay(220);
  state = await cdp.eval("JSON.parse(localStorage.getItem('po_water_v1'))");
  assert(state.weightUnit === 'lb' && state.profile.weightKg === 176 && state.logs['2026-07-18'] === 4, 'Water backup import did not replace the store');

  await cdp.eval("document.querySelector('[data-sub=target]').click();true");
  await delay(100);
  assert(await cdp.eval("document.body.innerText.includes('176 lb') && document.body.innerText.includes('2.8 L')"), 'Pound-based Water target did not calculate correctly');
  await cdp.eval("document.querySelector('.toast-host')?.remove();true");
  await cdp.screenshot(`${screenshots}\\water-target-1440x900.png`);

  await cdp.eval("document.querySelector('[data-sub=history]').click();true");
  await delay(100);
  assert(await cdp.eval("document.querySelector('[data-panel=water]').innerText.includes('Hydration trend') && document.querySelector('[data-panel=water]').innerText.includes('Monthly consistency')"), 'Water History did not render imported canonical logs');
  await cdp.screenshot(`${screenshots}\\water-history-1440x900.png`);

  await cdp.eval("document.querySelector('[data-sub=settings]').click();true");
  await delay(80);
  await cdp.eval("document.querySelector('[data-water-reset]').click();true");
  await delay(70);
  assert(await cdp.eval("document.querySelector('[role=alertdialog]')?.getAttribute('aria-label')==='Reset all Water data?'"), 'Water reset was not confirm-gated');
  await cdp.eval("document.querySelector('[role=alertdialog] [data-x]').click();true");
  await delay(220);
  assert(await cdp.eval("JSON.parse(localStorage.getItem('po_water_v1')).weightUnit==='lb'"), 'Canceling Water reset changed the store');

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(160);
  const mobile = await cdp.eval(`(() => {
    const tabs = [...document.querySelectorAll('.lg-subtabs button')];
    return {
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
      tabs: tabs.map((node) => node.textContent.trim()),
      tabsFit: tabs.every((node) => node.getBoundingClientRect().right <= innerWidth + 1),
      errors: (window.__qaErrors || []).slice(),
    };
  })()`);
  assert(mobile.width <= mobile.viewport, 'Water overflows at 390px');
  assert(mobile.tabsFit, 'Water subtabs do not all fit at 390px');
  assert(mobile.errors.length === 0, `Water errors: ${mobile.errors.join(', ')}`);
  await cdp.screenshot(`${screenshots}\\water-settings-mobile-390x844.png`);

  const consoleResult = consoleSummary(cdp);
  assert(consoleResult.actionableConsoleProblems.length === 0, `Water console problems: ${JSON.stringify(consoleResult.actionableConsoleProblems)}`);
  console.log(JSON.stringify({ fresh, state, mobile, ...consoleResult }, null, 2));
} finally {
  browser.close();
}
