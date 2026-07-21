import { assert, consoleSummary, delay, launchBrowser } from './browser-cdp.mjs';

const baseUrl = 'http://127.0.0.1:4173';
const screenshots = 'C:\\Users\\maila\\Desktop\\dashboard\\docs\\phase10-screenshots';
const browser = await launchBrowser({
  port: 9231,
  url: `${baseUrl}/ui/money.html#overview`,
  profileName: 'lifeos-money-qa',
});
const { cdp } = browser;

try {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await cdp.eval("document.readyState==='complete' && document.querySelector('#mnTabs')")) break;
    await delay(100);
  }
  await cdp.eval("localStorage.clear();sessionStorage.clear();true");
  await cdp.send('Page.navigate', { url: baseUrl + '/ui/money.html?qa=money#overview' });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await cdp.eval("document.readyState==='complete' && performance.getEntriesByType('navigation')[0]?.name.includes('?qa=money') && document.querySelectorAll('#mnTabs button').length===7")) break;
    await delay(100);
  }
  await cdp.eval("window.__qaErrors=[];addEventListener('error',e=>window.__qaErrors.push(String(e.message||e.error)));addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));true");

  const fresh = await cdp.eval(`(() => ({
    tabs: [...document.querySelectorAll('#mnTabs button')].map((node) => node.textContent.trim()),
    empty: document.querySelector('#mnPanels').innerText.includes('add accounts in Finance'),
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    errors: (window.__qaErrors || []).slice(),
  }))()`);
  assert(JSON.stringify(fresh.tabs) === JSON.stringify(['Overview','Accounts','Cash Flow','Spending','Business','Wealth','Planning']), 'Money tab contract is incorrect');
  assert(fresh.empty, 'Fresh Money profile does not show an honest empty state');
  assert(fresh.width <= fresh.viewport, 'Money overflows at desktop width');

  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const day = `${ym}-10`;
  const prev = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const prevYm = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}`;
  await cdp.eval(`(() => {
    const ym=${JSON.stringify(ym)}, day=${JSON.stringify(day)}, prevYm=${JSON.stringify(prevYm)};
    localStorage.setItem('nw:bank',JSON.stringify([{name:'ING Checking',amount:12340},{name:'Savings',amount:11140}]));
    localStorage.setItem('nw:stocks',JSON.stringify([{name:'Index portfolio',amount:46250}]));
    localStorage.setItem('nw:crypto',JSON.stringify([{name:'Bitcoin',amount:9680}]));
    localStorage.setItem('nw:other',JSON.stringify([{name:'Business assets',amount:6230}]));
    localStorage.setItem('nw:history',JSON.stringify([{t:Date.now()-50*86400000,v:81000},{t:Date.now()-31*86400000,v:83000},{t:Date.now(),v:85640}]));
    localStorage.setItem('ing:tx',JSON.stringify([
      {date:prevYm+'-08',description:'Client invoice',amount:5000},
      {date:prevYm+'-12',description:'Office rent',amount:-1200},
      {date:day,description:'Client X payment',amount:7980},
      {date:ym+'-11',description:'Groceries',amount:-842},
      {date:ym+'-12',description:'Housing',amount:-1610},
      {date:ym+'-13',description:'Transport',amount:-586}
    ]));
    localStorage.setItem('fin:accounts:v1',JSON.stringify([{name:'ING Checking',type:'checking',balance:12340,purpose:'Daily spending'},{name:'Credit Card',type:'credit',balance:1250,purpose:'Credit'}]));
    localStorage.setItem('fin:subs',JSON.stringify([{name:'Gym Membership',cost:57,frequency:'monthly',active:true},{name:'Cloud storage',cost:9.99,frequency:'monthly',active:true}]));
    localStorage.setItem('fin:budgets',JSON.stringify({Housing:2000,Food:1000,Transport:800}));
    localStorage.setItem('sav:goals',JSON.stringify([{name:'Emergency Fund',current:8450,target:15000},{name:'House Deposit',current:12750,target:50000}]));
    localStorage.setItem('gl:revenue',JSON.stringify([{name:'Client X',date:day,amount:7980}]));
    localStorage.setItem('gl:expenses',JSON.stringify([{name:'Software',date:ym+'-05',amount:846}]));
    location.reload(); return true;
  })()`);
  await delay(420);

  assert(await cdp.eval("document.querySelector('#p-overview').innerText.includes('85,640')"), 'Overview did not calculate canonical net worth');
  await cdp.screenshot(`${screenshots}\\money-overview-1440x900.png`);
  await cdp.eval("document.querySelector('#mnQuick').value='42 Coffee';document.querySelector('#mnQuick').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));true");
  await delay(420);
  assert(await cdp.eval("JSON.parse(localStorage.getItem('ing:tx')).some((row)=>row.description==='Coffee'&&row.amount===-42&&row.source==='quick-log')"), 'Money Quick Log did not persist a canonical expense');
  await cdp.eval("window.__qaErrors=[];addEventListener('error',e=>window.__qaErrors.push(String(e.message||e.error)));addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));true");

  const checks = {
    accounts: 'ING Checking',
    cashflow: 'Client X payment',
    spending: 'Groceries',
    business: 'Client X',
    wealth: 'Index portfolio',
    planning: 'Emergency Fund',
  };
  for (const [view, expected] of Object.entries(checks)) {
    await cdp.eval(`document.querySelector('[data-tab=${view}]').click();true`);
    await delay(100);
    assert(await cdp.eval(`document.querySelector('#p-${view}').innerText.includes(${JSON.stringify(expected)})`), `Money ${view} did not render canonical data`);
  }

  await cdp.eval("document.querySelector('#affAmt').value='2000';document.querySelector('[data-aff-check]').click();true");
  await delay(60);
  assert(await cdp.eval("document.querySelector('#affOut').innerText.includes('bank balance') && document.querySelector('#affOut').innerText.includes('cash flow')"), 'Affordability check did not use cash and cash flow');

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(180);
  const mobile = await cdp.eval(`(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    tabs: [...document.querySelectorAll('#mnTabs button')].map((node) => node.textContent.trim()),
    tabsVisible: [...document.querySelectorAll('#mnTabs button')].every((node) => node.getBoundingClientRect().left >= 0 && node.getBoundingClientRect().right <= innerWidth),
    errors: (window.__qaErrors || []).slice(),
  }))()`);
  assert(mobile.width <= mobile.viewport, 'Money overflows at 390px');
  assert(mobile.tabsVisible, 'Money tabs require horizontal scrolling at 390px');
  assert(JSON.stringify(mobile.tabs) === JSON.stringify(fresh.tabs), 'Mobile Money lost a locked tab');
  assert(mobile.errors.length === 0, `Money errors: ${mobile.errors.join(', ')}`);
  await cdp.screenshot(`${screenshots}\\money-planning-mobile-390x844.png`);

  const consoleResult = consoleSummary(cdp);
  assert(consoleResult.actionableConsoleProblems.length === 0, `Money console problems: ${JSON.stringify(consoleResult.actionableConsoleProblems)}`);
  console.log(JSON.stringify({ fresh, mobile, ...consoleResult }, null, 2));
} finally {
  browser.close();
}
