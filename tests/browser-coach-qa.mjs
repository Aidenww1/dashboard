import { assert, consoleSummary, delay, launchBrowser } from './browser-cdp.mjs';

const baseUrl = 'http://127.0.0.1:4173';
const screenshots = 'C:\\Users\\maila\\Desktop\\dashboard\\docs\\phase9-screenshots';
const browser = await launchBrowser({
  port: 9230,
  url: `${baseUrl}/ui/coach.html#briefing`,
  profileName: 'lifeos-coach-qa',
});
const { cdp } = browser;

try {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await cdp.eval("document.readyState==='complete' && document.querySelector('#coach-tabs')")) break;
    await delay(100);
  }
  await cdp.eval("localStorage.clear();sessionStorage.clear();true");
  await cdp.send('Page.navigate', { url: baseUrl + '/ui/coach.html?qa=coach#briefing' });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await cdp.eval("document.readyState==='complete' && performance.getEntriesByType('navigation')[0]?.name.includes('?qa=coach') && document.querySelectorAll('#coach-tabs button').length===6")) break;
    await delay(100);
  }
  await cdp.eval("window.__qaErrors=[];addEventListener('error',e=>window.__qaErrors.push(String(e.message||e.error)));addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));true");

  const fresh = await cdp.eval(`(() => ({
    tabs: [...document.querySelectorAll('#coach-tabs button')].map((node) => node.textContent.trim()),
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    errors: (window.__qaErrors || []).slice(),
  }))()`);
  assert(JSON.stringify(fresh.tabs) === JSON.stringify(['Briefing', 'Readiness', 'Ask', 'Inbox', 'Opportunities', 'Reviews']), 'Coach tab contract is incorrect');
  assert(fresh.width <= fresh.viewport, 'Coach overflows at desktop width');

  await cdp.eval("document.querySelector('[data-view=inbox]').click();true");
  await delay(80);
  assert(await cdp.eval("document.querySelector('#coach').innerText.includes('Inbox not connected')"), 'Inbox does not show an honest disconnected state');
  await cdp.eval("document.querySelector('[data-view=opportunities]').click();true");
  await delay(80);
  assert(await cdp.eval("document.querySelector('#coach').innerText.includes('No scan available')"), 'Opportunities do not show an honest unscanned state');

  await cdp.eval(`(() => {
    localStorage.setItem('mail:summary:v1', JSON.stringify({total_inbox:14,needs_reply:[{from:'Client X',subject:'Approve proposal'}],bills:['Hosting invoice'],orders_active:2,newsletters_promo:4,opportunities:[{label:'New project lead'}]}));
    localStorage.setItem('radar:summary:v1', JSON.stringify({generated_at:'2026-07-19T09:00:00.000Z',total_found:7,shown:[{title:'Health app partnership',cat:'Business',action:'Review brief'},{title:'Training workshop',cat:'Learning',action:'Reserve'}]}));
    localStorage.setItem('review:ritual:v1', JSON.stringify({'2026-07-13':{wins:'Three sessions completed',sleep:'Improved'} ,'2026-07-06':{wins:'Hit hydration target'}}));
    localStorage.setItem('coach:plans:v1', JSON.stringify([{title:'Recovery reset',detail:'Protect the sleep window',status:'Active'}]));
    location.hash='briefing'; return true;
  })()`);
  await delay(150);
  assert(await cdp.eval("document.querySelector('#coach').innerText.includes('14') && document.querySelector('#coach').innerText.includes('7')"), 'Briefing did not consume Mail and Radar summaries');
  await cdp.screenshot(`${screenshots}\\coach-briefing-1440x900.png`);

  await cdp.eval("document.querySelector('[data-view=inbox]').click();true");
  await delay(100);
  assert(await cdp.eval("document.querySelector('#coach').innerText.includes('Approve proposal') && document.querySelector('#coach').innerText.includes('Hosting invoice')"), 'Inbox did not render canonical summary content');

  await cdp.eval("document.querySelector('[data-view=opportunities]').click();true");
  await delay(100);
  assert(await cdp.eval("document.querySelector('#coach').innerText.includes('Health app partnership') && document.querySelector('#coach').innerText.includes('Training workshop')"), 'Opportunities did not render Radar shortlist content');

  await cdp.eval("document.querySelector('[data-view=reviews]').click();true");
  await delay(100);
  assert(await cdp.eval("document.querySelector('#coach').innerText.includes('Week of 2026-07-13') && document.querySelector('#coach').innerText.includes('Recovery reset')"), 'Reviews did not render ritual history and coach plans');

  await cdp.eval(`(() => {
    window.__askCount = 0;
    window.LifeOSCmd = {ask: async (question) => { window.__askCount += 1; return 'Answer for: ' + question; }};
    document.querySelector('[data-view=ask]').click(); return true;
  })()`);
  await delay(90);
  assert(await cdp.eval('window.__askCount===0'), 'Opening Ask triggered the Coach engine');
  await cdp.eval("document.querySelector('[data-prompt]').click();true");
  await delay(80);
  assert(await cdp.eval('window.__askCount===0'), 'Choosing a prompt triggered the Coach engine');
  await cdp.eval("document.querySelector('#coach-ask-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));true");
  await delay(150);
  assert(await cdp.eval("window.__askCount===1 && document.querySelector('#coach-answer').innerText.includes('Answer for:')"), 'Explicit Ask submission did not run exactly once');

  for (const view of ['briefing','readiness','ask','inbox','opportunities','reviews']) {
    await cdp.eval(`document.querySelector('[data-view=${view}]').click();true`);
    await delay(60);
    assert(await cdp.eval(`location.hash==='#${view}'`), `Coach view ${view} did not update the route`);
  }

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(180);
  const mobile = await cdp.eval(`(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    tabs: [...document.querySelectorAll('#coach-tabs button')].map((node) => node.textContent.trim()),
    allVisible: [...document.querySelectorAll('#coach-tabs button')].every((node) => node.getBoundingClientRect().right <= innerWidth && node.getBoundingClientRect().left >= 0),
    errors: (window.__qaErrors || []).slice(),
  }))()`);
  assert(mobile.width <= mobile.viewport, 'Coach overflows at 390px');
  assert(mobile.allVisible, 'Coach tabs require horizontal scrolling at 390px');
  assert(JSON.stringify(mobile.tabs) === JSON.stringify(fresh.tabs), 'Mobile Coach lost a locked tab');
  assert(mobile.errors.length === 0, `Coach errors: ${mobile.errors.join(', ')}`);
  await cdp.screenshot(`${screenshots}\\coach-reviews-mobile-390x844.png`);

  const consoleResult = consoleSummary(cdp);
  assert(consoleResult.actionableConsoleProblems.length === 0, `Coach console problems: ${JSON.stringify(consoleResult.actionableConsoleProblems)}`);
  console.log(JSON.stringify({ fresh, mobile, askCount: await cdp.eval('window.__askCount'), ...consoleResult }, null, 2));
} finally {
  browser.close();
}
