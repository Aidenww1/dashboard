import { assert, consoleSummary, delay, launchBrowser } from './browser-cdp.mjs';

const baseUrl = 'http://127.0.0.1:4173';
const screenshots = 'C:\\Users\\maila\\Desktop\\dashboard\\docs\\phase13-screenshots';
const browser = await launchBrowser({
  port: 9234,
  url: `${baseUrl}/ui/today.html`,
  profileName: 'lifeos-mobile-parity-qa',
});
const { cdp } = browser;

const destinations = [
  ['today', '/ui/today.html', ''],
  ['food', '/ui/log.html#food', '#seg-food'],
  ['body', '/ui/log.html#body', '#seg-body'],
  ['training', '/ui/log.html#training', '#seg-training'],
  ['skin', '/ui/log.html#skin', '#seg-skin'],
  ['water', '/ui/log.html#water', '#seg-water'],
  ['supplements', '/ui/log.html#supps', '#seg-supps'],
  ['coach', '/ui/coach.html#briefing', '#coach-tabs'],
  ['money', '/ui/money.html#overview', '#mnTabs'],
  ['more', '/ui/more.html#settings', '#mrTabs'],
];

async function navigate(path, readySelector) {
  await cdp.send('Page.navigate', {url: baseUrl + path});
  for (let attempt = 0; attempt < 70; attempt += 1) {
    const ready = await cdp.eval(`document.readyState==='complete' && document.body && ${readySelector ? `document.querySelector(${JSON.stringify(readySelector)})` : 'true'}`);
    if (ready) break;
    await delay(75);
  }
  await delay(120);
  await cdp.eval("window.__qaErrors=[];addEventListener('error',e=>window.__qaErrors.push(String(e.message||e.error)));addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));true");
}

async function inspect(name, width) {
  const result = await cdp.eval(`(() => {
    const visible = (node) => { const style=getComputedStyle(node); const rect=node.getBoundingClientRect(); return style.display!=='none' && style.visibility!=='hidden' && rect.width>0 && rect.height>0; };
    const pageTabs = document.querySelectorAll('#seg button, #coach-tabs button, #mnTabs button, #mrTabs button');
    const secondaryTabs = document.querySelectorAll('.lg-panel:not([hidden]) .lg-subtabs button');
    const fit = (nodes) => [...nodes].filter(visible).every((node) => { const rect=node.getBoundingClientRect(); return rect.left>=-0.5 && rect.right<=innerWidth+0.5; });
    const cards = [...document.querySelectorAll('.card')].filter(visible);
    const cardFit = cards.every((node) => node.getBoundingClientRect().width <= innerWidth + 0.5);
    const bottomNav = [...document.querySelectorAll('.tabbar a')].filter(visible);
    const primaryRows = [...new Set([...document.querySelectorAll('#seg button')].filter(visible).map((node)=>Math.round(node.getBoundingClientRect().top)))];
    return {
      name: ${JSON.stringify(name)}, width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      pageTabsFit: fit(pageTabs), secondaryTabsFit: fit(secondaryTabs), cardFit,
      bottomNavItems: bottomNav.length, primaryRows: primaryRows.length,
      errors: (window.__qaErrors||[]).slice(), bodyText: document.body.innerText.length,
    };
  })()`);
  assert(result.scrollWidth <= result.width, `${name} overflows at ${width}px`);
  assert(result.pageTabsFit, `${name} primary/page tabs require horizontal scrolling at ${width}px`);
  assert(result.secondaryTabsFit, `${name} secondary tabs require horizontal scrolling at ${width}px`);
  assert(result.cardFit, `${name} has a card wider than the ${width}px viewport`);
  assert(result.bottomNavItems === 5, `${name} does not expose the five-item mobile navigation at ${width}px`);
  assert(result.errors.length === 0, `${name} errors at ${width}px: ${result.errors.join(', ')}`);
  assert(result.bodyText > 20, `${name} rendered blank at ${width}px`);
  if (name === 'food' && width === 390) assert(result.primaryRows === 2, 'Log primary tabs are not a stable 3-by-2 phone grid');
  return result;
}

try {
  await cdp.eval('localStorage.clear();true');
  const all = [];
  for (const viewport of [{width:768,height:1024,label:'tablet'},{width:390,height:844,label:'phone'}]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:true});
    for (const [name,path,selector] of destinations) {
      await navigate(path, selector);
      all.push(await inspect(name, viewport.width));
      await cdp.screenshot(`${screenshots}\\${name}-${viewport.label}-${viewport.width}x${viewport.height}.png`);
    }
  }
  const consoleResult = consoleSummary(cdp);
  assert(consoleResult.actionableConsoleProblems.length === 0, `Mobile parity console problems: ${JSON.stringify(consoleResult.actionableConsoleProblems)}`);
  console.log(JSON.stringify({checked:all.length,results:all,...consoleResult},null,2));
} finally {
  browser.close();
}
