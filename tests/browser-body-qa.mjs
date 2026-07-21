import { assert, consoleSummary, delay, launchBrowser } from './browser-cdp.mjs';

const baseUrl = 'http://127.0.0.1:4173';
const screenshots = 'C:\\Users\\maila\\Desktop\\dashboard\\docs\\phase4-screenshots';
const browser = await launchBrowser({
  port: 9225,
  url: `${baseUrl}/ui/log.html#body`,
  profileName: 'lifeos-body-qa',
});
const { cdp } = browser;

try {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await cdp.eval("document.readyState==='complete' && document.body.innerText.includes('Log measurement')")) break;
    await delay(100);
  }
  await cdp.eval("window.__qaErrors=[];addEventListener('error',e=>window.__qaErrors.push(String(e.message||e.error)));addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));true");

  const fresh = await cdp.eval(`(() => ({
    tabs: [...document.querySelectorAll('.lg-subtabs button')].map((node) => node.textContent.trim()),
    empty: document.body.innerText.includes('Nothing logged yet'),
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    errors: (window.__qaErrors || []).slice(),
  }))()`);
  assert(JSON.stringify(fresh.tabs) === JSON.stringify(['Overview', 'Composition', 'Recovery', 'Labs', 'Photos']), 'Body subtab contract is incorrect');
  assert(fresh.empty, 'Fresh Body profile does not show an honest empty state');
  assert(fresh.width <= fresh.viewport, 'Body overflows at desktop width');
  assert(fresh.errors.length === 0, `Fresh Body errors: ${fresh.errors.join(', ')}`);

  await cdp.eval("document.querySelector('[data-add]').click();true");
  await delay(100);
  assert(await cdp.eval("!!document.querySelector('#ms-save') && !!document.querySelector('#ms-date')"), 'Measurement sheet did not open with a date field');
  const measurementDate = await cdp.eval("document.querySelector('#ms-date').value");
  await cdp.eval(`(() => {
    const set = (selector, value) => { document.querySelector(selector).value = value; };
    set('#ms-weight','78.4'); set('#ms-bf','14.2'); set('#ms-waist','83.1');
    set('#ms-chest','103.2'); set('#ms-arms','36.4'); document.querySelector('#ms-save').click();
    return true;
  })()`);
  await delay(180);
  const measurements = await cdp.eval(`(() => ({
    weight: JSON.parse(localStorage.getItem('po_coach_weights')||'[]').find((entry)=>entry.dateKey==='${measurementDate}'),
    bodyFat: JSON.parse(localStorage.getItem('health:body:v1')||'[]').find((entry)=>entry.date==='${measurementDate}'),
    tape: JSON.parse(localStorage.getItem('body:logs')||'[]').find((entry)=>entry.date==='${measurementDate}'),
    visible: document.body.innerText.includes('78.4') && document.body.innerText.includes('14.2') && document.body.innerText.includes('83.1'),
  }))()`);
  assert(measurements.weight?.weight === 78.4, 'Weight did not persist to the canonical store');
  assert(measurements.bodyFat?.bf === 14.2 && measurements.bodyFat?.waist === 83.1, 'Body fat did not persist with waist');
  assert(measurements.tape?.chest === 103.2 && measurements.tape?.arms === 36.4, 'Tape measurements did not persist');
  assert(measurements.visible, 'Saved measurements did not render');

  await cdp.eval("document.querySelector('[data-body-date]')?.click();true");
  await delay(100);
  assert(await cdp.eval("document.querySelector('#ms-weight').value==='78.4' && document.querySelector('#ms-bf').value==='14.2'"), 'Historical measurement did not prefill');
  await cdp.eval("document.querySelector('#ms-weight').value='78.0';document.querySelector('#ms-save').click();true");
  await delay(160);
  const preserved = await cdp.eval(`(() => ({
    weight: JSON.parse(localStorage.getItem('po_coach_weights')||'[]').find((entry)=>entry.dateKey==='${measurementDate}')?.weight,
    bodyFat: JSON.parse(localStorage.getItem('health:body:v1')||'[]').find((entry)=>entry.date==='${measurementDate}'),
    tape: JSON.parse(localStorage.getItem('body:logs')||'[]').find((entry)=>entry.date==='${measurementDate}'),
  }))()`);
  assert(preserved.weight === 78, 'Historical weight edit did not persist');
  assert(preserved.bodyFat?.bf === 14.2 && preserved.bodyFat?.waist === 83.1, 'Weight edit erased same-day body fat data');
  assert(preserved.tape?.chest === 103.2, 'Weight edit erased same-day tape data');

  await cdp.eval("document.querySelector('[data-goals]').click();true");
  await delay(80);
  await cdp.eval("document.querySelector('#gl-weight').value='75';document.querySelector('#gl-bf').value='12';document.querySelector('#gl-save').click();true");
  await delay(140);
  const goals = await cdp.eval("JSON.parse(localStorage.getItem('gym:goals:v1'))");
  assert(goals.weight === 75 && goals.bf === 12, 'Body goals did not persist');

  await cdp.eval("document.querySelector('[data-sub=composition]').click();true");
  await delay(120);
  assert(await cdp.eval("document.body.innerText.includes('Body composition signals') && document.body.innerText.includes('Measurements')"), 'Composition view did not render');

  await cdp.eval("document.querySelector('[data-sub=recovery]').click();true");
  await delay(100);
  assert(await cdp.eval("document.body.innerText.includes('Sleep Trend') && document.body.innerText.includes('Wearable / Sync Status')"), 'Recovery view did not render');
  await cdp.eval("document.querySelector('[data-sleep]').click();true");
  await delay(80);
  await cdp.eval("document.querySelector('#s-hrs').value='7.5';document.querySelector('#s-save').click();true");
  await delay(160);
  const sleep = await cdp.eval(`JSON.parse(localStorage.getItem('sleep:logs')||'[]').find((entry)=>entry.date==='${measurementDate}')`);
  assert(sleep?.duration === 450, 'Sleep log did not persist');
  assert(await cdp.eval("document.body.innerText.includes('7h 30m')"), 'Recovery did not render saved sleep');

  await cdp.eval("document.querySelector('[data-sub=overview]').click();true");
  await delay(100);
  await cdp.eval("document.querySelector('[data-sleep-date]')?.click();true");
  await delay(80);
  assert(await cdp.eval("document.querySelector('#s-hrs').value==='7.5'"), 'Historical sleep did not prefill');
  await cdp.eval("document.querySelector('#s-hrs').value='8';document.querySelector('#s-save').click();true");
  await delay(140);
  assert(await cdp.eval(`JSON.parse(localStorage.getItem('sleep:logs')||'[]').find((entry)=>entry.date==='${measurementDate}')?.duration===480`), 'Historical sleep edit did not persist');

  await cdp.eval("document.querySelector('[data-sub=labs]').click();true");
  await delay(100);
  assert(await cdp.eval("document.body.innerText.includes('No bloodwork logged yet')"), 'Labs empty state did not render');
  await cdp.eval("document.querySelector('[data-lab]').click();true");
  await delay(80);
  await cdp.eval("document.querySelector('[data-lbm=ldl]').value='142';document.querySelector('[data-lbm=hdl]').value='55';document.querySelector('#lb-save').click();true");
  await delay(160);
  const labs = await cdp.eval(`JSON.parse(localStorage.getItem('blood:logs')||'[]').find((entry)=>entry.date==='${measurementDate}')`);
  assert(labs?.markers?.ldl === 142 && labs?.markers?.hdl === 55, 'Lab markers did not persist');
  assert(await cdp.eval("document.body.innerText.includes('Markers Requiring Attention') && document.body.innerText.includes('142 mg/dL')"), 'Lab attention state did not render');

  await cdp.eval("document.querySelector('[data-sub=photos]').click();true");
  await delay(100);
  assert(await cdp.eval("document.body.innerText.includes('No progress photos yet') && !!document.querySelector('[data-cgal]')"), 'Photos empty/capture state did not render');
  await cdp.eval(`(() => {
    const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), c => c.charCodeAt(0));
    const file = new File([bytes], 'body-qa.png', { type: 'image/png' });
    const transfer = new DataTransfer(); transfer.items.add(file);
    const input = document.querySelector('[data-cgal]');
    Object.defineProperty(input, 'files', { value: transfer.files, configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await cdp.eval("JSON.parse(localStorage.getItem('body:photos:v1')||'[]').length===1")) break;
    await delay(100);
  }
  const photo = await cdp.eval("JSON.parse(localStorage.getItem('body:photos:v1')||'[]')[0]");
  assert(photo?.angle === 'front' && photo?.date === measurementDate, 'Progress photo metadata did not persist');
  await delay(300);
  const photoRender = await cdp.eval("({ rendered: document.body.innerText.toLowerCase().includes('latest photo set'), errors: (window.__qaErrors||[]).slice(), text: document.getElementById('panels').innerText.slice(0,500) })");
  assert(photoRender.rendered, `Saved progress photo did not render: ${JSON.stringify(photoRender)}`);

  await cdp.eval("document.querySelector('[data-sub=overview]').click();true");
  await delay(120);
  await cdp.eval("document.querySelector('.toast-host')?.remove();true");
  await cdp.screenshot(`${screenshots}\\body-populated-1440x900.png`);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(160);
  const mobile = await cdp.eval(`(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    errors: (window.__qaErrors || []).slice(),
  }))()`);
  assert(mobile.width <= mobile.viewport, 'Body overflows at 390px');
  assert(mobile.errors.length === 0, `Body errors: ${mobile.errors.join(', ')}`);
  await cdp.screenshot(`${screenshots}\\body-mobile-390x844.png`);

  const consoleResult = consoleSummary(cdp);
  assert(consoleResult.actionableConsoleProblems.length === 0, `Body console problems: ${JSON.stringify(consoleResult.actionableConsoleProblems)}`);
  console.log(JSON.stringify({ fresh, measurements, preserved, goals, sleep, labs, photo, mobile, ...consoleResult }, null, 2));
} finally {
  browser.close();
}
