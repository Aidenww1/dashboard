import { assert, consoleSummary, delay, launchBrowser } from './browser-cdp.mjs';

const baseUrl = 'http://127.0.0.1:4173';
const screenshots = 'C:\\Users\\maila\\Desktop\\dashboard\\docs\\phase6-screenshots';
const browser = await launchBrowser({
  port: 9227,
  url: `${baseUrl}/ui/log.html#skin`,
  profileName: 'lifeos-skin-qa',
});
const { cdp } = browser;

try {
  await cdp.eval("localStorage.clear();sessionStorage.clear();true");
  await cdp.send('Page.navigate', { url: `${baseUrl}/ui/log.html?qa=skin#skin` });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await cdp.eval("document.readyState==='complete' && performance.getEntriesByType('navigation')[0]?.name.includes('?qa=skin') && document.body.innerText.includes('Skin check-in')")) break;
    await delay(100);
  }
  await cdp.eval("window.__qaErrors=[];addEventListener('error',e=>window.__qaErrors.push(String(e.message||e.error)));addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));true");

  const fresh = await cdp.eval(`(() => ({
    tabs: [...document.querySelectorAll('.lg-subtabs button')].map((node) => node.textContent.trim()),
    dashboard: document.querySelectorAll('[data-panel=skin] .lg-statgrid .lg-kpi').length === 4 && ["Today's routine", 'Skin check-in', 'Recent check-ins', 'Recent breakouts'].every((label) => document.body.innerText.includes(label)),
    honest: document.body.innerText.includes('No check-ins yet.') && document.body.innerText.includes('No breakouts in the last 30 days.'),
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    errors: (window.__qaErrors || []).slice(),
  }))()`);
  assert(JSON.stringify(fresh.tabs) === JSON.stringify(['Overview', 'Routine', 'Products', 'Lab', 'Photos']), 'Skin subtab contract is incorrect');
  assert(fresh.dashboard && fresh.honest, 'Fresh Skin profile does not show the full honest zero-data dashboard');
  assert(fresh.width <= fresh.viewport, 'Skin overflows at desktop width');
  assert(fresh.errors.length === 0, `Fresh Skin errors: ${fresh.errors.join(', ')}`);

  await cdp.eval("document.querySelector('[data-add]').click();true");
  await delay(100);
  await cdp.eval(`(() => {
    document.querySelector('#sk-r').value = '4';
    document.querySelector('#sk-c').value = 'redness, dryness';
    document.querySelector('#sk-water').value = '2.4';
    document.querySelector('#sk-sleep').value = '7.5';
    document.querySelector('#sk-treat').value = 'Cleanser, SPF';
    document.querySelector('#sk-notes').value = 'Baseline check-in';
    document.querySelector('#sk-save').click();
    return true;
  })()`);
  await delay(160);
  let checkin = await cdp.eval("JSON.parse(localStorage.getItem('skin:logs'))[0]");
  assert(checkin.rating === 4 && checkin.water === 2.4 && checkin.sleep === 7.5, 'Skin check-in numeric fields did not persist');
  assert(checkin.concerns.join(',') === 'redness,dryness' && checkin.treatments === 'Cleanser, SPF', 'Skin check-in details did not persist');

  await cdp.eval(`(() => {
    const logs = JSON.parse(localStorage.getItem('skin:logs'));
    logs[0].analysis = { summary: 'Saved analysis', next_action: 'Keep routine stable' };
    logs[0].photo = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
    localStorage.setItem('skin:logs', JSON.stringify(logs));
    location.reload(); return true;
  })()`);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await cdp.eval("document.readyState==='complete' && !!document.querySelector('[data-entries] [data-edit]')")) break;
    await delay(100);
  }
  assert(await cdp.eval("!!document.querySelector('[data-entries] [data-edit]')"), 'Saved Skin check-in did not render after reload');
  await cdp.eval("document.querySelector('[data-entries] [data-edit]').click();true");
  await delay(100);
  await cdp.eval("document.querySelector('#sk-r').value='5';document.querySelector('#sk-notes').value='Updated note';document.querySelector('#sk-save').click();true");
  await delay(160);
  const edited = await cdp.eval("JSON.parse(localStorage.getItem('skin:logs'))[0]");
  assert(edited.id === checkin.id && edited.rating === 5 && edited.analysis.summary === 'Saved analysis' && edited.photo.startsWith('data:image/'), 'Skin edit did not preserve identity, photo, or analysis');

  await cdp.eval("document.querySelector('[data-sub=products]').click();true");
  await delay(100);
  await cdp.eval("document.querySelector('[data-skin-product-add]').click();true");
  await delay(80);
  await cdp.eval(`(() => {
    document.querySelector('#skp-name').value = 'Daily SPF';
    document.querySelector('#skp-brand').value = 'Test Brand';
    document.querySelector('#skp-type').value = 'spf';
    document.querySelector('#skp-time').value = 'am';
    document.querySelector('#skp-freq').value = 'daily';
    document.querySelector('#skp-concern').value = 'UV protection';
    document.querySelector('#skp-save').click(); return true;
  })()`);
  await delay(160);
  let product = await cdp.eval("JSON.parse(localStorage.getItem('skin:products'))[0]");
  assert(product.name === 'Daily SPF' && product.type === 'spf' && product.time === 'am' && product.freq === 'daily', 'Skin product did not persist canonical enums');
  await cdp.eval("document.querySelector('[data-skin-product-edit]').click();true");
  await delay(80);
  await cdp.eval("document.querySelector('#skp-brand').value='Updated Brand';document.querySelector('#skp-save').click();true");
  await delay(140);
  product = await cdp.eval("JSON.parse(localStorage.getItem('skin:products'))[0]");
  assert(product.brand === 'Updated Brand', 'Skin product edit failed');

  await cdp.eval("document.querySelector('[data-skin-product-del]').click();true");
  await delay(70);
  assert(await cdp.eval("document.querySelector('[role=alertdialog]')?.getAttribute('aria-label')==='Delete this product?'"), 'Product deletion was not confirm-gated');
  await cdp.eval("document.querySelector('[role=alertdialog] [data-x]').click();true");
  await delay(240);
  assert(await cdp.eval("JSON.parse(localStorage.getItem('skin:products')).length===1"), 'Canceling product deletion removed the product');

  await cdp.eval("document.querySelector('[data-sub=routine]').click();true");
  await delay(90);
  await cdp.eval("document.querySelector('[data-rt]').click();true");
  await delay(120);
  assert(await cdp.eval("Object.values(JSON.parse(localStorage.getItem('skin:routine:v1')))[0].length===1"), 'Routine completion did not persist');

  await cdp.eval("document.querySelector('[data-sub=lab]').click();true");
  await delay(100);
  assert(await cdp.eval("document.body.innerText.includes('Observed data only') && document.body.innerText.includes('Not connected')"), 'Skin Lab did not render honest analysis/environment states');
  await cdp.eval("document.querySelector('[data-skin-ing-add]').click();true");
  await delay(80);
  await cdp.eval("document.querySelector('#skin-simple-value').value='Fragrance';document.querySelector('#skin-simple-save').click();true");
  await delay(260);
  assert(await cdp.eval("JSON.parse(localStorage.getItem('skin:ingredients'))[0]==='Fragrance'"), 'Ingredient watch item did not persist');
  await cdp.eval("document.querySelector('[data-skin-goal-add]').click();true");
  await delay(80);
  await cdp.eval("document.querySelector('#skin-simple-value').value='Reduce redness';document.querySelector('#skin-simple-save').click();true");
  await delay(260);
  assert(await cdp.eval("JSON.parse(localStorage.getItem('skin:goals'))[0].text==='Reduce redness'"), 'Skin goal did not persist');
  await cdp.eval("document.querySelector('[data-skin-device-add]').click();true");
  await delay(80);
  await cdp.eval("document.querySelector('#skd-type').value='led';document.querySelector('#skd-notes').value='10 minutes';document.querySelector('#skd-save').click();true");
  await delay(140);
  assert(await cdp.eval("JSON.parse(localStorage.getItem('skin:device_sessions'))[0].type==='led'"), 'Skin treatment did not persist');

  await cdp.eval("document.querySelector('[data-sub=photos]').click();true");
  await delay(100);
  assert(await cdp.eval("document.body.innerText.includes('Gallery / timeline') && !!document.querySelector('.lg-gallery img')"), 'Skin Photos did not render the saved photo');
  await cdp.eval("document.querySelector('.toast-host')?.remove();true");
  await cdp.screenshot(`${screenshots}\\skin-photos-1440x900.png`);

  await cdp.eval("document.querySelector('[data-sub=lab]').click();true");
  await delay(100);
  await cdp.screenshot(`${screenshots}\\skin-lab-1440x900.png`);
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
  assert(mobile.width <= mobile.viewport, 'Skin overflows at 390px');
  assert(mobile.tabsFit, 'Skin subtabs do not all fit at 390px');
  assert(mobile.errors.length === 0, `Skin errors: ${mobile.errors.join(', ')}`);
  await cdp.screenshot(`${screenshots}\\skin-lab-mobile-390x844.png`);

  const consoleResult = consoleSummary(cdp);
  assert(consoleResult.actionableConsoleProblems.length === 0, `Skin console problems: ${JSON.stringify(consoleResult.actionableConsoleProblems)}`);
  console.log(JSON.stringify({ fresh, checkin, edited, product, mobile, ...consoleResult }, null, 2));
} finally {
  browser.close();
}
