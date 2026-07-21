import { assert, consoleSummary, delay, launchBrowser } from './browser-cdp.mjs';

const baseUrl = 'http://127.0.0.1:4173';
const browser = await launchBrowser({
  port: 9235,
  url: `${baseUrl}/ui/today.html`,
  profileName: 'lifeos-reliability-qa',
});
const { cdp } = browser;

async function waitForReady(selector = 'main') {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await cdp.eval(`document.readyState==='complete' && !!document.querySelector(${JSON.stringify(selector)})`)) return;
    await delay(75);
  }
  throw new Error('Page did not become ready: ' + selector);
}

async function navigate(path, selector = 'main') {
  await cdp.send('Page.navigate', { url: baseUrl + path });
  await waitForReady(selector);
  await delay(180);
}

try {
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__qaErrors=[];
    addEventListener('error',e=>window.__qaErrors.push(String(e.message||e.error)));
    addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));
    window.__qaCLS=0;
    try { new PerformanceObserver(list=>{ for(const e of list.getEntries()) if(!e.hadRecentInput) window.__qaCLS+=e.value; }).observe({type:'layout-shift',buffered:true}); } catch(_) {}
  ` });
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await cdp.eval(`localStorage.clear(); ${JSON.stringify([
    'lifeos:v1','nt:logs','nt:targets','po_coach_weights','body:fat:logs:v1','body:measurements:v1',
    'fin:accounts:v1','ing:tx','sav:goals','gl:revenue','gl:expenses','mail:summary:v1','radar:summary:v1',
    'review:ritual:v1','coach:plans:v1','reminders:v1','settings:v1'
  ])}.forEach(k=>localStorage.setItem(k,'{broken-json')); true`);

  const destinations = [
    ['/ui/today.html', 'main'],
    ['/ui/log.html#body', '#seg-body'],
    ['/ui/coach.html#briefing', '#coach-tabs'],
    ['/ui/money.html#overview', '#mnTabs'],
    ['/ui/more.html#settings', '#mrTabs'],
  ];
  const pages = [];
  for (const [path, selector] of destinations) {
    await navigate(path, selector);
    const result = await cdp.eval(`(() => {
      const nav=performance.getEntriesByType('navigation')[0];
      const activeTabs=[...document.querySelectorAll('[role="tablist"]')].map(list=>({
        selected:list.querySelectorAll('[role="tab"][aria-selected="true"]').length,
        tabbable:list.querySelectorAll('[role="tab"][tabindex="0"]').length,
      }));
      return {
        path:location.pathname+location.hash,
        text:document.body.innerText.length,
        errors:(window.__qaErrors||[]).slice(),
        cls:window.__qaCLS||0,
        loadMs:nav?nav.duration:0,
        main:!!document.querySelector('main'),
        primaryLabel:document.querySelector('nav[aria-label="Primary"],aside[aria-label="Primary"]')?.getAttribute('aria-label')||'',
        activeTabs,
        manifest:document.querySelector('link[rel="manifest"]')?.href||'',
        pwaScript:!!document.querySelector('script[data-lifeos-pwa]'),
      };
    })()`);
    assert(result.text > 80, `${path} rendered blank with corrupt storage`);
    assert(result.errors.length === 0, `${path} raised errors with corrupt storage: ${result.errors.join(', ')}`);
    assert(result.main && result.primaryLabel === 'Primary', `${path} is missing primary landmarks`);
    assert(result.activeTabs.every((item) => item.selected === 1 && item.tabbable === 1), `${path} has an invalid tab selection state`);
    assert(result.manifest.endsWith('/manifest.json') && result.pwaScript, `${path} is missing PWA metadata`);
    assert(result.cls <= 0.05, `${path} cumulative layout shift is ${result.cls}`);
    assert(result.loadMs < 5000, `${path} load took ${result.loadMs}ms`);
    pages.push(result);
  }

  await navigate('/ui/log.html#food', '#seg-food');
  await cdp.eval(`document.querySelector('#seg-food').focus();document.querySelector('#seg-food').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));true`);
  await delay(120);
  assert(await cdp.eval(`location.hash==='#body' && document.querySelector('#seg-body').getAttribute('aria-selected')==='true' && document.activeElement.id==='seg-body'`), 'Log arrow navigation did not activate and focus Body');

  await navigate('/ui/coach.html#briefing', '#coach-tabs');
  await cdp.eval(`document.querySelector('[data-view="briefing"]').focus();document.querySelector('[data-view="briefing"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));true`);
  await delay(120);
  assert(await cdp.eval(`location.hash==='#readiness' && document.querySelector('[data-view="readiness"]').getAttribute('aria-selected')==='true'`), 'Coach arrow navigation did not activate Readiness');

  const motion = await cdp.eval(`(() => { const b=document.querySelector('.btn'); const s=getComputedStyle(b); return {transition:s.transitionDuration,animation:s.animationDuration}; })()`);
  assert(parseFloat(motion.transition) <= 0.001 && parseFloat(motion.animation) <= 0.001, `reduced motion remains active: ${JSON.stringify(motion)}`);

  await navigate('/ui/today.html');
  const swReady = await cdp.eval(`Promise.race([navigator.serviceWorker.ready.then(()=>true),new Promise(r=>setTimeout(()=>r(false),8000))])`);
  assert(swReady, 'service worker did not become ready');
  await cdp.send('Page.reload', { ignoreCache: false });
  await waitForReady('main');
  await delay(250);
  assert(await cdp.eval(`!!navigator.serviceWorker.controller`), 'redesigned page is not service-worker controlled');

  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await cdp.send('Page.navigate', { url: `${baseUrl}/ui/money.html#overview` });
  await waitForReady('#mnTabs');
  const offline = await cdp.eval(`({path:location.pathname,text:document.body.innerText.length,controlled:!!navigator.serviceWorker.controller})`);
  assert(offline.path === '/ui/money.html' && offline.text > 100 && offline.controlled, 'offline Money navigation did not render from the app cache');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  await cdp.screenshot('C:\\Users\\maila\\Desktop\\dashboard\\docs\\phase14-screenshots\\reliability-offline-money-1440x900.png');
  const consoleResult = consoleSummary(cdp);
  assert(consoleResult.actionableConsoleProblems.length === 0, `Reliability console problems: ${JSON.stringify(consoleResult.actionableConsoleProblems)}`);
  console.log(JSON.stringify({ pages, motion, offline, ...consoleResult }, null, 2));
} finally {
  try { await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); } catch {}
  browser.close();
}
