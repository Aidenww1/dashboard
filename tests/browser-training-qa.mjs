import { assert, consoleSummary, delay, launchBrowser } from './browser-cdp.mjs';

const baseUrl = 'http://127.0.0.1:4173';
const screenshots = 'C:\\Users\\maila\\Desktop\\dashboard\\docs\\phase5-screenshots';
const browser = await launchBrowser({
  port: 9226,
  url: `${baseUrl}/ui/log.html#training`,
  profileName: 'lifeos-training-qa',
});
const { cdp } = browser;

try {
  await cdp.eval("localStorage.clear();sessionStorage.clear();true");
  await cdp.send('Page.navigate', { url: `${baseUrl}/ui/log.html?qa=training#training` });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await cdp.eval("document.readyState==='complete' && performance.getEntriesByType('navigation')[0]?.name.includes('?qa=training') && document.body.innerText.includes('Log workout')")) break;
    await delay(100);
  }
  await cdp.eval("window.__qaErrors=[];addEventListener('error',e=>window.__qaErrors.push(String(e.message||e.error)));addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));true");

  const fresh = await cdp.eval(`(() => ({
    tabs: [...document.querySelectorAll('.lg-subtabs button')].map((node) => node.textContent.trim()),
    dashboard: document.querySelectorAll('[data-panel=training] .lg-statgrid .lg-kpi').length === 4 && ['Log workout', 'Coach insights'].every((label) => document.body.innerText.includes(label)),
    honest: document.body.innerText.includes('Add exercises to build your framework.') && document.body.innerText.includes('No sets logged this week.'),
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    errors: (window.__qaErrors || []).slice(),
  }))()`);
  assert(JSON.stringify(fresh.tabs) === JSON.stringify(['Overview', 'Cardio', 'Progress', 'History']), 'Training subtab contract is incorrect');
  assert(fresh.dashboard && fresh.honest, 'Fresh Training profile does not show the full honest zero-data dashboard');
  assert(fresh.width <= fresh.viewport, 'Training overflows at desktop width');
  assert(fresh.errors.length === 0, `Fresh Training errors: ${fresh.errors.join(', ')}`);

  await cdp.eval("document.querySelector('[data-start-session]').click();true");
  await delay(120);
  assert(await cdp.eval("!!document.querySelector('#ex-name') && !!document.querySelector('[data-save-ex]')"), 'First-session exercise editor did not open');
  await cdp.eval(`(() => {
    const set = (selector, value) => { document.querySelector(selector).value = value; };
    set('#ex-name', 'Bench Press'); set('#ex-muscle', 'chest'); set('#ex-repmin', '6');
    set('#ex-repmax', '8'); set('#ex-step', '2.5'); set('#ex-start', '60');
    document.querySelector('[data-save-ex]').click(); return true;
  })()`);
  await delay(140);
  assert(await cdp.eval("JSON.parse(localStorage.getItem('po_coach_v1')).exercises[0].name==='Bench Press'"), 'Exercise did not persist');

  await cdp.eval("document.querySelector('[data-wu-skip]').click();true");
  await delay(100);
  await cdp.eval(`(() => {
    const weight = document.querySelector('#sess-w'); weight.value = '60';
    weight.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-rep="8"]').click(); return true;
  })()`);
  await delay(100);
  await cdp.eval(`document.querySelector('[data-rpe="8"]').click();true`);
  await delay(100);
  await cdp.eval("document.querySelector('[data-log-set]').click();true");
  await delay(160);
  const strength = await cdp.eval(`(() => {
    const state = JSON.parse(localStorage.getItem('po_coach_v1'));
    const exercise = state.exercises[0];
    return { exercise, set: state.logs[exercise.id][0], prs: JSON.parse(localStorage.getItem('gym:prs:v1') || '{}') };
  })()`);
  assert(strength.set.weight === 60 && strength.set.reps === 8 && strength.set.rpe === 8, 'Set logging did not persist the entered values');
  assert(Object.keys(strength.prs).length === 1, 'PR detection did not persist');

  await cdp.eval("document.querySelector('[data-del-set]').click();true");
  await delay(80);
  assert(await cdp.eval("document.querySelector('[role=alertdialog]')?.getAttribute('aria-label')==='Delete this set?'"), 'Set deletion was not confirm-gated');
  await cdp.eval("document.querySelector('[role=alertdialog] [data-x]').click();true");
  await delay(280);
  assert(await cdp.eval("Object.values(JSON.parse(localStorage.getItem('po_coach_v1')).logs)[0].length===1"), 'Canceling set deletion removed the set');

  await cdp.eval("document.querySelector('[data-end-session]').click();true");
  await delay(120);
  await cdp.eval("document.querySelector('[data-view-program]').click();true");
  await delay(120);
  assert(await cdp.eval("document.body.innerText.includes('All exercises') && document.body.innerText.includes('Cycle status') && document.body.innerText.includes('Nutrition targets')"), 'Framework management is not reachable from Overview');
  await cdp.eval("document.querySelector('[data-edit-ex-launch]').click();true");
  await delay(100);
  await cdp.eval("document.querySelector('[data-del-ex]').click();true");
  await delay(80);
  assert(await cdp.eval("document.querySelector('[role=alertdialog]')?.getAttribute('aria-label')==='Delete Bench Press?'"), 'Exercise deletion was not confirm-gated');
  await cdp.eval("document.querySelector('[role=alertdialog] [data-x]').click();true");
  await delay(280);

  await cdp.eval("document.querySelector('[data-sub=cardio]').click();true");
  await delay(120);
  await cdp.eval(`(() => {
    document.querySelector('#cd-dur').value = '30'; document.querySelector('#cd-dist').value = '5';
    document.querySelector('#cd-hr').value = '140'; document.querySelector('#cd-notes').value = 'Easy run';
    document.querySelector('#cd-save').click(); return true;
  })()`);
  await delay(150);
  let cardio = await cdp.eval("JSON.parse(localStorage.getItem('gym:cardio:v1'))");
  assert(cardio.length === 1 && cardio[0].duration === 30 && cardio[0].distance === 5, 'Cardio logging did not persist');

  await cdp.eval("document.querySelector('[data-edit-cardio]').click();true");
  await delay(100);
  assert(await cdp.eval("document.querySelector('#cd-dur').value==='30' && document.querySelector('#cd-notes').value==='Easy run'"), 'Cardio edit did not prefill');
  await cdp.eval("document.querySelector('#cd-dur').value='35';document.querySelector('#cd-dist').value='5.5';document.querySelector('#cd-save').click();true");
  await delay(150);
  cardio = await cdp.eval("JSON.parse(localStorage.getItem('gym:cardio:v1'))");
  assert(cardio.length === 1 && cardio[0].duration === 35 && cardio[0].distance === 5.5, 'Cardio edit created a duplicate or failed to update');

  await cdp.eval("document.querySelector('[data-del-cardio]').click();true");
  await delay(80);
  assert(await cdp.eval("document.querySelector('[role=alertdialog]')?.getAttribute('aria-label')==='Delete this cardio session?'"), 'Cardio deletion was not confirm-gated');
  await cdp.eval("document.querySelector('[role=alertdialog] [data-x]').click();true");
  await delay(280);

  for (const [tab, text] of [['progress', 'Progress overview'], ['history', 'Training history'], ['overview', 'Log workout']]) {
    await cdp.eval(`document.querySelector('[data-sub=${tab}]').click();true`);
    await delay(120);
    assert(await cdp.eval(`document.body.innerText.includes(${JSON.stringify(text)})`), `${tab} view did not render`);
  }

  await cdp.eval("document.querySelector('.toast-host')?.remove();true");
  await cdp.screenshot(`${screenshots}\\training-overview-1440x900.png`);
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
  assert(mobile.width <= mobile.viewport, 'Training overflows at 390px');
  assert(mobile.tabsFit, 'Training subtabs do not all fit at 390px');
  assert(mobile.errors.length === 0, `Training errors: ${mobile.errors.join(', ')}`);
  await cdp.screenshot(`${screenshots}\\training-mobile-390x844.png`);

  const consoleResult = consoleSummary(cdp);
  assert(consoleResult.actionableConsoleProblems.length === 0, `Training console problems: ${JSON.stringify(consoleResult.actionableConsoleProblems)}`);
  console.log(JSON.stringify({ fresh, strength, cardio, mobile, ...consoleResult }, null, 2));
} finally {
  browser.close();
}
