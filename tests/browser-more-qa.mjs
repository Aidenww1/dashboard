import { assert, consoleSummary, delay, launchBrowser } from './browser-cdp.mjs';

const baseUrl = 'http://127.0.0.1:4173';
const screenshots = 'C:\\Users\\maila\\Desktop\\dashboard\\docs\\phase11-screenshots';
const browser = await launchBrowser({
  port: 9232,
  url: `${baseUrl}/ui/more.html#settings`,
  profileName: 'lifeos-more-qa',
});
const { cdp } = browser;

try {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await cdp.eval("document.readyState==='complete' && document.querySelector('#mrTabs')")) break;
    await delay(100);
  }
  await cdp.eval("localStorage.clear();sessionStorage.clear();true");
  await cdp.send('Page.navigate', { url: baseUrl + '/ui/more.html?qa=more#settings' });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await cdp.eval("document.readyState==='complete' && performance.getEntriesByType('navigation')[0]?.name.includes('?qa=more') && document.querySelectorAll('#mrTabs button').length===6")) break;
    await delay(100);
  }
  await cdp.eval("window.__qaErrors=[];addEventListener('error',e=>window.__qaErrors.push(String(e.message||e.error)));addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));true");

  const fresh = await cdp.eval(`(() => ({
    tabs: [...document.querySelectorAll('#mrTabs button')].map((node) => node.textContent.trim()),
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    errors: (window.__qaErrors || []).slice(),
  }))()`);
  assert(JSON.stringify(fresh.tabs) === JSON.stringify(['Settings','Integrations','Notifications','Data','Life','About']), 'More tab contract is incorrect');
  assert(fresh.width <= fresh.viewport, 'More overflows at desktop width');

  await cdp.eval(`(() => {
    document.querySelector('#setCalories').value='2400';
    document.querySelector('#setProtein').value='180';
    document.querySelector('#setSleep').value='8';
    document.querySelector('#setWater').value='7';
    document.querySelector('[data-save-targets]').click(); return true;
  })()`);
  await delay(80);
  const savedTargets = await cdp.eval("JSON.parse(localStorage.getItem('settings:v1'))");
  const nutritionTargets = await cdp.eval("JSON.parse(localStorage.getItem('nt:tdee'))");
  assert(savedTargets.goalCalories === 2400 && savedTargets.goalWater === 7, 'Settings targets did not persist');
  assert(nutritionTargets.calories === 2400 && nutritionTargets.protein === 180, 'Settings did not share nutrition targets');

  await cdp.eval("document.querySelector('#setFinance').click();document.querySelector('#setBlood').click();document.querySelector('[data-save-context]').click();true");
  await delay(80);
  const savedContext = await cdp.eval("JSON.parse(localStorage.getItem('settings:v1'))");
  assert(savedContext.aiIncludeFinance === true && savedContext.aiIncludeBloodwork === false, 'Coach context switches did not persist');

  await cdp.eval("document.querySelector('[data-tab=integrations]').click();true");
  await delay(90);
  assert(await cdp.eval("document.querySelector('.mr-view').innerText.includes('0') && document.querySelector('.mr-view').innerText.includes('Not connected')"), 'Integrations do not show an honest disconnected state');
  await cdp.eval(`(() => {
    localStorage.setItem('mail:summary:v1',JSON.stringify({total_inbox:3}));
    localStorage.setItem('gcal:events',JSON.stringify([{title:'Gym'}]));
    localStorage.setItem('ing:tx',JSON.stringify([{date:'2026-07-19',amount:-42,description:'Food'}]));
    location.hash='settings';location.hash='integrations';return true;
  })()`);
  await delay(140);
  assert(await cdp.eval("document.querySelector('.mr-view').innerText.includes('3') && document.querySelectorAll('.mr-status:not(.off)').length>=3"), 'Integration status did not react to canonical signals');
  await cdp.screenshot(`${screenshots}\\more-integrations-1440x900.png`);

  await cdp.eval(`(() => {
    localStorage.setItem('reminders:v1',JSON.stringify({builtin:{water_morning:{enabled:true,time:'08:00'}},custom:[{label:'Call mom',time:'18:00'}]}));
    localStorage.setItem('briefing:enabled:v1','1');
    localStorage.setItem('briefing:waketime:v1','07:30');
    document.querySelector('[data-tab=notifications]').click(); return true;
  })()`);
  await delay(100);
  assert(await cdp.eval("document.querySelector('.mr-view').innerText.includes('1') && document.querySelector('.mr-view').innerText.includes('07:30')"), 'Notification summary did not use canonical reminder data');

  await cdp.eval("document.querySelector('[data-tab=data]').click();true");
  await delay(90);
  await cdp.eval(`(() => {
    window.__downloaded='';
    URL.createObjectURL=()=> 'blob:qa';
    URL.revokeObjectURL=()=>{};
    HTMLAnchorElement.prototype.click=function(){window.__downloaded=this.download;};
    document.querySelector('[data-export]').click();return true;
  })()`);
  assert(await cdp.eval("window.__downloaded.startsWith('lifeos-export-')"), 'Data export did not create a JSON download');
  await cdp.eval("document.querySelector('[data-clear]').click();true");
  await delay(70);
  assert(await cdp.eval("document.querySelector('[role=alertdialog]')?.getAttribute('aria-label')==='Clear ALL local data?'"), 'Data reset is not confirm-gated');
  await cdp.eval("document.querySelector('[role=alertdialog] [data-x]').click();true");
  await delay(60);
  assert(await cdp.eval("localStorage.getItem('settings:v1')!==null"), 'Cancelling data reset changed local data');

  await cdp.eval("document.querySelector('[data-tab=life]').click();true");
  await delay(80);
  assert(await cdp.eval("document.querySelector('.mr-view').innerText.includes('Tasks') && document.querySelector('.mr-view').innerText.includes('Weekly review')"), 'Life view lost core extended workflows');
  await cdp.eval("document.querySelector('#mrSearch').value='not-a-real-destination';document.querySelector('#mrSearch').dispatchEvent(new Event('input',{bubbles:true}));true");
  await delay(60);
  assert(await cdp.eval("document.querySelector('[data-search-empty]')?.innerText.includes('No matches')"), 'More search does not show its empty state');

  await cdp.eval("document.querySelector('[data-tab=about]').click();true");
  await delay(160);
  assert(await cdp.eval("document.querySelector('.mr-view').innerText.includes('Life OS') && document.querySelector('.mr-view').innerText.includes('Local storage')"), 'About view did not render product and system facts');

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp.eval("document.querySelector('[data-tab=settings]').click();true");
  await delay(180);
  const mobile = await cdp.eval(`(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    tabs: [...document.querySelectorAll('#mrTabs button')].map((node) => node.textContent.trim()),
    allVisible: [...document.querySelectorAll('#mrTabs button')].every((node) => node.getBoundingClientRect().left >= 0 && node.getBoundingClientRect().right <= innerWidth),
    errors: (window.__qaErrors || []).slice(),
  }))()`);
  assert(mobile.width <= mobile.viewport, 'More overflows at 390px');
  assert(mobile.allVisible, 'More tabs require horizontal scrolling at 390px');
  assert(JSON.stringify(mobile.tabs) === JSON.stringify(fresh.tabs), 'Mobile More lost a locked tab');
  assert(mobile.errors.length === 0, `More errors: ${mobile.errors.join(', ')}`);
  await cdp.screenshot(`${screenshots}\\more-settings-mobile-390x844.png`);

  const consoleResult = consoleSummary(cdp);
  assert(consoleResult.actionableConsoleProblems.length === 0, `More console problems: ${JSON.stringify(consoleResult.actionableConsoleProblems)}`);
  console.log(JSON.stringify({ fresh, savedTargets, savedContext, mobile, ...consoleResult }, null, 2));
} finally {
  browser.close();
}
