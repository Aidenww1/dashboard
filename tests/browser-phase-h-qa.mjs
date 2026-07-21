import { assert, consoleSummary, delay, launchBrowser } from './browser-cdp.mjs';

const baseUrl = 'http://127.0.0.1:4173';
const screenshots = 'C:\\Users\\maila\\Desktop\\dashboard\\docs\\phase-h-screenshots';
const viewports = [
  { width: 1440, height: 900, label: 'desktop-1440x900' },
  { width: 1680, height: 945, label: 'desktop-1680x945' },
  { width: 1792, height: 1024, label: 'desktop-1792x1024' },
  { width: 768, height: 1024, label: 'tablet-768x1024' },
  { width: 390, height: 844, label: 'phone-390x844' },
];
const pages = {
  coach: { path: '/ui/coach.html', tabsRoot: '#coach-tabs', panel: '#coach', tabs: ['briefing', 'readiness', 'ask', 'inbox', 'opportunities', 'reviews'], attr: 'data-view' },
  money: { path: '/ui/money.html', tabsRoot: '#mnTabs', panel: '.mn-panel:not([hidden])', tabs: ['overview', 'accounts', 'cashflow', 'spending', 'business', 'wealth', 'planning'], attr: 'data-tab' },
  more: { path: '/ui/more.html', tabsRoot: '#mrTabs', panel: '.mr-view', tabs: ['settings', 'integrations', 'notifications', 'data', 'life', 'about'], attr: 'data-tab' },
};

const browser = await launchBrowser({
  port: 9260,
  url: `${baseUrl}/ui/coach.html?qa=phase-h#briefing`,
  width: viewports[0].width,
  height: viewports[0].height,
  profileName: 'lifeos-phase-h-qa',
});
const { cdp } = browser;

async function waitFor(expression, message, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await cdp.eval(expression).catch(() => false)) return;
    await delay(80);
  }
  throw new Error(message);
}

async function navigate(name) {
  const page = pages[name];
  await cdp.send('Page.navigate', { url: `${baseUrl}${page.path}?qa=phase-h-matrix#${page.tabs[0]}` });
  await waitFor(`document.readyState !== 'loading' && document.querySelectorAll(${JSON.stringify(page.tabsRoot + ' button')}).length === ${page.tabs.length}`, `${name} did not load`);
  if (name === 'coach') await waitFor("window.LifeOS && LifeOS.canonical && document.querySelector('#coach').innerText.length > 80", 'Coach canonical state did not load');
  if (name === 'money') await waitFor("window.CanonicalRuntime && document.querySelector('.mn-panel:not([hidden])').innerText.length > 80", 'Money canonical state did not load');
  if (name === 'more') await waitFor("window.CanonicalRuntime && document.querySelector('.mr-view').innerText.length > 80", 'More system state did not load');
  await delay(140);
}

async function inspectPage(name, viewport) {
  const page = pages[name];
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.width <= 900 });
  await navigate(name);
  const checkedTabs = [];
  for (const tab of page.tabs) {
    const selector = `${page.tabsRoot} [${page.attr}="${tab}"]`;
    assert(await cdp.eval(`!!document.querySelector(${JSON.stringify(selector)})`), `${name} ${tab} is missing at ${viewport.label}`);
    await cdp.eval(`document.querySelector(${JSON.stringify(selector)}).click();true`);
    await delay(110);
    const result = await cdp.eval(`(() => {
      const panel = document.querySelector(${JSON.stringify(page.panel)});
      const visible = (node) => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0; };
      const inScrollContainer = (node) => { let parent = node.parentElement; while (parent && parent !== document.body) { const style = getComputedStyle(parent); if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && parent.scrollWidth > parent.clientWidth + 1) return true; parent = parent.parentElement; } return false; };
      const controls = [...panel.querySelectorAll('button,a,input,select,textarea')].filter(visible);
      const clipped = controls.filter((node) => { const rect = node.getBoundingClientRect(); return !inScrollContainer(node) && (rect.left < -1 || rect.right > document.documentElement.clientWidth + 1); }).map((node) => node.getAttribute('aria-label') || node.textContent.trim().slice(0, 40) || node.tagName).slice(0, 12);
      const cards = [...panel.querySelectorAll('.card')].filter(visible).filter((node) => !node.parentElement.closest('.card')).map((node) => node.getBoundingClientRect());
      let collisions = 0;
      for (let left = 0; left < cards.length; left += 1) for (let right = left + 1; right < cards.length; right += 1) {
        const a = cards[left], b = cards[right];
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 3 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 3) collisions += 1;
      }
      return { textLength: panel.innerText.trim().length, clipped, collisions, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, errorState: /could not load/i.test(panel.innerText) };
    })()`);
    assert(result.textLength > 70, `${name} ${tab} rendered empty at ${viewport.label}`);
    assert(!result.errorState, `${name} ${tab} rendered its isolated error state at ${viewport.label}`);
    assert(result.scrollWidth <= result.clientWidth + 1, `${name} ${tab} overflows at ${viewport.label}: ${result.scrollWidth}px`);
    assert(result.clipped.length === 0, `${name} ${tab} clips controls at ${viewport.label}: ${result.clipped.join(', ')}`);
    assert(result.collisions === 0, `${name} ${tab} overlaps cards at ${viewport.label}`);
    checkedTabs.push(tab);
  }

  const shell = await cdp.eval(`(() => {
    const buttons = [...document.querySelectorAll(${JSON.stringify(page.tabsRoot + ' button')})];
    const rows = [...new Set(buttons.map((node) => Math.round(node.getBoundingClientRect().top)))];
    return {
      tabs: buttons.map((node) => node.textContent.trim()),
      rows: rows.length,
      tabScrollWidth: document.querySelector(${JSON.stringify(page.tabsRoot)}).scrollWidth,
      tabClientWidth: document.querySelector(${JSON.stringify(page.tabsRoot)}).clientWidth,
      allTabsInViewport: buttons.every((node) => { const rect = node.getBoundingClientRect(); return rect.left >= -1 && rect.right <= document.documentElement.clientWidth + 1; }),
    };
  })()`);
  assert(shell.tabs.length === page.tabs.length, `${name} lost a locked tab at ${viewport.label}`);
  assert(shell.allTabsInViewport && shell.tabScrollWidth <= shell.tabClientWidth + 1, `${name} tabs require horizontal scrolling at ${viewport.label}`);
  assert(viewport.width > 900 ? shell.rows === 1 : shell.rows <= 3, `${name} tabs use ${shell.rows} rows at ${viewport.label}`);
  await cdp.screenshot(`${screenshots}\\${name}-${viewport.label}.png`);
  return { name, viewport: viewport.label, checkedTabs, ...shell };
}

try {
  await cdp.eval("localStorage.clear();sessionStorage.clear();true");
  await cdp.eval(`(() => {
    const date = new Date().toISOString().slice(0,10);
    localStorage.setItem('mail:summary:v1',JSON.stringify({total_inbox:4,needs_reply:[{subject:'Reply to accountant'}],bills:[{amount:42}],opportunities:[{title:'Contract lead'}],orders_active:1,generated_at:new Date().toISOString()}));
    localStorage.setItem('radar:summary:v1',JSON.stringify({total_found:2,shown:[{title:'Training course',category:'Learning'},{title:'Conference',category:'Travel'}],generated_at:new Date().toISOString()}));
    localStorage.setItem('review:ritual:v1',JSON.stringify({[date]:{wins:'Logged consistently',improve:'Hydrate earlier'}}));
    localStorage.setItem('coach:plans:v1',JSON.stringify([{id:'plan-h',title:'Recovery plan',status:'active'}]));
    localStorage.setItem('ing:tx',JSON.stringify([{id:'bank-h1',provider_record_id:'bank-h1',provider:'test-bank',date,description:'Invoice paid',amount:1500,category:'Income'},{id:'bank-h2',provider_record_id:'bank-h2',provider:'test-bank',date,description:'Groceries',amount:-120,category:'Food'}]));
    localStorage.setItem('fin:accounts:v1',JSON.stringify([{id:'checking-h',name:'Checking',type:'checking',balance:4000,currency:'EUR'},{id:'card-h',name:'Credit card',type:'credit',balance:500,currency:'EUR',liability:true}]));
    localStorage.setItem('gl:revenue',JSON.stringify([{id:'invoice-h',date,client:'Client A',amount:800}]));
    localStorage.setItem('gl:expenses',JSON.stringify([{id:'expense-h',date,vendor:'Software',amount:75,category:'Software'}]));
    localStorage.setItem('reminders:v1',JSON.stringify({builtin:{water:{enabled:true,time:'08:00'}},custom:[{label:'Weekly review',time:'18:00'}]}));
    localStorage.setItem('briefing:enabled:v1','1');
    localStorage.setItem('briefing:waketime:v1','07:30');
    localStorage.setItem('backup:last:v1',JSON.stringify({created_at:new Date().toISOString(),status:'complete'}));
    return true;
  })()`);
  await navigate('coach');
  await waitFor("LifeOS.canonical.phaseH().then(s=>s['finance.transactions'].value.total===4 && s['communications.inbox'].value.unread===4)", 'Phase H data did not bridge');

  const projectionCheck = await cdp.eval(`LifeOS.canonical.phaseH().then((s)=>({
    transactions:s['finance.transactions'].value,
    cashflow:s['finance.cashflow'].value,
    business:s['finance.business'].value,
    reconciliation:s['finance.reconciliation'].value,
    inbox:s['communications.inbox'].value,
    briefing:s['coach.briefing'].value,
    context:s['coach.context'].value
  }))`);
  assert(projectionCheck.transactions.total === 4 && projectionCheck.transactions.imported === 4, 'Browser finance bridge lost source identity');
  assert(projectionCheck.cashflow.net_minor === 210500 && projectionCheck.business.ytd_profit_minor === 72500, 'Browser Money and Business projections disagree');
  assert(projectionCheck.reconciliation.status === 'reconciled', 'Browser reconciliation is not current');
  assert(projectionCheck.inbox.unread === 4 && projectionCheck.briefing.lines.length === 5, 'Browser Coach projections did not compose shared facts');
  assert(projectionCheck.context.limitations.some((line) => line.includes('social or mental-health')), 'Browser Coach context lost its inference boundary');

  const results = [];
  for (const viewport of viewports) {
    results.push(await inspectPage('coach', viewport));
    results.push(await inspectPage('money', viewport));
    results.push(await inspectPage('more', viewport));
  }
  const consoleResult = consoleSummary(cdp);
  assert(consoleResult.actionableConsoleProblems.length === 0, `Phase H console problems: ${JSON.stringify(consoleResult.actionableConsoleProblems)}`);
  console.log(JSON.stringify({ checkedPages: results.length, checkedInternalTabs: results.reduce((sum, row) => sum + row.checkedTabs.length, 0), checkedStates: results.reduce((sum, row) => sum + row.checkedTabs.length, 0), results, ...consoleResult }, null, 2));
} finally {
  browser.close();
}
