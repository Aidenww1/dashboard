import { assert, consoleSummary, delay, launchBrowser } from './browser-cdp.mjs';

const baseUrl = 'http://127.0.0.1:4173';
const browser = await launchBrowser({
  port: 9236,
  url: `${baseUrl}/ui/today.html`,
  profileName: 'lifeos-live-local-qa',
});
const { cdp } = browser;

async function ready(selector) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await cdp.eval(`document.readyState==='complete' && !!document.querySelector(${JSON.stringify(selector)})`)) return;
    await delay(75);
  }
  throw new Error('Not ready: ' + selector);
}

try {
  await ready('main');
  await cdp.eval('localStorage.clear();true');
  const swReady = await cdp.eval(`Promise.race([navigator.serviceWorker.ready.then(()=>true),new Promise(r=>setTimeout(()=>r(false),8000))])`);
  assert(swReady, 'service worker did not install');
  await cdp.send('Page.reload');
  await ready('main');
  await delay(250);
  assert(await cdp.eval('!!navigator.serviceWorker.controller'), 'page is not controlled by the installed service worker');

  const handoff = await cdp.eval(`(async()=>{
    const form=new FormData();
    form.append('title','Phase 15 share target');
    form.append('text','local validation');
    form.append('media',new File([new Uint8Array([137,80,78,71])],'phase15.png',{type:'image/png'}));
    const response=await fetch('/share.html',{method:'POST',body:form});
    const cache=await caches.open('share-target-v1');
    const metaResponse=await cache.match('/__share/meta');
    const fileResponse=await cache.match('/__share/file');
    const meta=metaResponse?await metaResponse.json():null;
    return {status:response.status,meta,hasFile:!!fileResponse,fileSize:fileResponse?(await fileResponse.blob()).size:0};
  })()`);
  assert(handoff.status === 200, `share target returned ${handoff.status}`);
  assert(handoff.meta?.title === 'Phase 15 share target' && handoff.meta?.hasFile, 'share metadata was not cached');
  assert(handoff.hasFile && handoff.fileSize === 4, 'shared file was not cached intact');
  await cdp.eval(`caches.open('share-target-v1').then(c=>Promise.all([c.delete('/__share/meta'),c.delete('/__share/file')]))`);

  await cdp.send('Page.navigate', { url: `${baseUrl}/ui/more.html#integrations` });
  await ready('#mrTabs');
  await delay(150);
  const integrations = await cdp.eval(`({
    text:document.querySelector('#mrViews').innerText,
    notConnected:[...document.querySelectorAll('#mrViews .mr-status.off')].filter(n=>/Not connected/i.test(n.textContent)).length,
    errors:(window.__qaErrors||[]).slice(),
  })`);
  assert(/Google Calendar/.test(integrations.text) && /Mail/.test(integrations.text), 'integration status view is incomplete');
  assert(integrations.notConnected >= 2, 'unconnected providers are not reported honestly');

  await cdp.screenshot('C:\\Users\\maila\\Desktop\\dashboard\\docs\\phase15-screenshots\\integrations-local-state-1440x900.png');
  const consoleResult = consoleSummary(cdp);
  assert(consoleResult.actionableConsoleProblems.length === 0, `Local integration console problems: ${JSON.stringify(consoleResult.actionableConsoleProblems)}`);
  console.log(JSON.stringify({ swReady, handoff, integrations: { notConnected: integrations.notConnected }, ...consoleResult }, null, 2));
} finally {
  browser.close();
}
