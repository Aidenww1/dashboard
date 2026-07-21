import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9224;
const baseUrl = 'http://127.0.0.1:4173';
const outputDir = new URL('../docs/phase3-screenshots/', import.meta.url);
const profile = `${process.env.TEMP}\\lifeos-food-qa-${Date.now()}`;
const child = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--window-size=1440,900',
  `${baseUrl}/ui/log.html#food`,
], { stdio: 'ignore', windowsHide: true });

async function targets() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
      const page = pages.find((entry) => entry.type === 'page' && entry.url.includes('/ui/log.html'));
      if (page) return page;
    } catch {}
    await delay(100);
  }
  throw new Error('Chrome page target was not ready');
}

class Cdp {
  constructor(url) {
    this.nextId = 0;
    this.pending = new Map();
    this.events = [];
    this.socket = new WebSocket(url);
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
      } else if (message.method) {
        this.events.push(message);
      }
    });
  }

  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

let cdp;
try {
  const page = await targets();
  cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Log.enable');
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await cdp.eval("document.readyState === 'complete' && Boolean(document.querySelector('[data-food-panel]'))")) break;
    await delay(100);
  }
  await cdp.eval("window.__qaErrors=[];addEventListener('error',e=>window.__qaErrors.push(String(e.message||e.error)));addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));true");
  await delay(300);

  const fresh = await cdp.eval(`(() => {
    const heading = [...document.querySelectorAll('.lg-card-title')]
      .find((node) => node.textContent.includes("Today's nutrition"));
    const nutrition = heading?.closest('.card');
    const text = nutrition?.innerText || '';
    return {
      ready: document.readyState,
      text,
      hasFake2600: text.includes('2,600'),
      hasFake200: text.includes('/ 200'),
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
      errors: (window.__qaErrors || []).slice(),
    };
  })()`);
  assert(fresh.ready === 'complete', 'Food page did not finish loading');
  assert(fresh.text.includes('Targets not configured'), 'Fresh profile does not show target setup state');
  assert(!fresh.hasFake2600 && !fresh.hasFake200, 'Fresh profile still exposes fictional targets');
  assert(fresh.width <= fresh.viewport, 'Food page overflows at 1440px');
  assert(fresh.errors.length === 0, `Fresh page errors: ${fresh.errors.join(', ')}`);

  await mkdir(outputDir, { recursive: true });
  const desktop = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(new URL('food-empty-1440x900.png', outputDir), Buffer.from(desktop.data, 'base64'));

  await cdp.eval("document.querySelector('[data-targets]').click();true");
  await delay(100);
  assert(await cdp.eval("!!document.querySelector('#tg-save')"), 'Target sheet did not open');
  await cdp.eval(`(() => {
    const set = (selector, value) => { document.querySelector(selector).value = value; };
    set('#tg-cal', '2400'); set('#tg-pro', '180'); set('#tg-carb', '250');
    set('#tg-fat', '75'); set('#tg-fib', '30'); set('#tg-sug', '70');
    document.querySelector('#tg-save').click();
    return true;
  })()`);
  await delay(150);
  const savedTargets = await cdp.eval("JSON.parse(localStorage.getItem('nt:targets'))");
  assert(savedTargets.calories === 2400 && savedTargets.protein === 180, 'Targets did not persist');

  await cdp.eval("document.querySelector('[data-add]').click();true");
  await delay(100);
  assert(await cdp.eval("!!document.querySelector('#m-save')"), 'Meal sheet did not open');
  await cdp.eval(`(() => {
    const set = (selector, value) => { document.querySelector(selector).value = value; };
    set('#m-name', 'QA Chicken Bowl'); set('#m-cal', '640'); set('#m-pro', '48');
    set('#m-carb', '66'); set('#m-fat', '18'); document.querySelector('#m-save').click();
    return true;
  })()`);
  await delay(200);
  const logged = await cdp.eval(`(() => {
    const entries = JSON.parse(localStorage.getItem('nt:logs') || '[]');
    return { exists: entries.some((entry) => entry.name === 'QA Chicken Bowl'), visible: document.body.innerText.includes('QA Chicken Bowl') };
  })()`);
  assert(logged.exists && logged.visible, 'Manual meal did not persist and render');

  await cdp.eval("document.querySelector('[data-viewlog]').click();true");
  await delay(120);
  const deleteState = await cdp.eval(`(() => {
    const buttons = [...document.querySelectorAll('[data-fl-del]')];
    const button = buttons[0];
    const sheet = document.querySelector('#fl-list');
    const state = { count: buttons.length, hasSheet: Boolean(sheet), sheetText: sheet?.innerText || '', dialogs: [...document.querySelectorAll('[role=dialog]')].length };
    button?.click(); return state;
  })()`);
  assert(deleteState.count > 0, `Meal delete control was not available: ${JSON.stringify(deleteState)}`);
  await delay(100);
  assert(await cdp.eval("document.body.innerText.includes('Delete this meal?')"), 'Meal deletion skipped confirmation');
  await cdp.eval("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Delete meal')?.click();true");
  await delay(150);
  const deleted = await cdp.eval(`(() => ({
    exists: JSON.parse(localStorage.getItem('nt:logs') || '[]').some((entry) => entry.name === 'QA Chicken Bowl'),
    undo: [...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Undo'),
  }))()`);
  assert(!deleted.exists && deleted.undo, 'Delete or Undo affordance failed');
  await cdp.eval("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Undo')?.click();true");
  await delay(150);
  assert(await cdp.eval("JSON.parse(localStorage.getItem('nt:logs')||'[]').some(e=>e.name==='QA Chicken Bowl')"), 'Undo did not restore the meal');

  await cdp.eval("document.querySelector('[data-fl-edit]')?.click();true");
  await delay(120);
  assert(await cdp.eval("!!document.querySelector('#m-save')"), 'Edit meal sheet did not open');
  await cdp.eval("document.querySelector('#m-name').value='QA Chicken Bowl Updated';document.querySelector('#m-save').click();true");
  await delay(160);
  assert(await cdp.eval("JSON.parse(localStorage.getItem('nt:logs')||'[]').some(e=>e.name==='QA Chicken Bowl Updated')"), 'Meal edit did not persist');

  await cdp.eval("document.querySelector('[data-photo]').click();true");
  await delay(80);
  assert(await cdp.eval("!!document.querySelector('#ph-go')"), 'Photo meal flow did not open');
  await cdp.eval("document.querySelector('#ph-go').click();true");
  await delay(50);
  assert(await cdp.eval("document.querySelector('#ph-err').innerText.includes('Add a photo')"), 'Photo meal validation did not render');
  await cdp.eval("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true");
  await delay(260);

  await cdp.eval("document.querySelector('[data-barcode]').click();true");
  await delay(80);
  assert(await cdp.eval("!!document.querySelector('#bc-go')"), 'Barcode flow did not open');
  await cdp.eval("document.querySelector('#bc-go').click();true");
  await delay(50);
  assert(await cdp.eval("document.querySelector('#bc-err').innerText.includes('Enter a barcode')"), 'Barcode validation did not render');
  await cdp.eval("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true");
  await delay(260);

  await cdp.eval("document.querySelector('[data-search]').click();true");
  await delay(80);
  assert(await cdp.eval("!!document.querySelector('#fs-q')"), 'Food search flow did not open');
  await cdp.eval("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true");
  await delay(260);

  await cdp.eval("document.querySelector('[data-templates]').click();true");
  await delay(80);
  assert(await cdp.eval("!!document.querySelector('#tp-list')"), 'Meal templates flow did not open');
  await cdp.eval("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true");
  await delay(280);

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await delay(180);
  const mobile = await cdp.eval(`(() => ({
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    errors: (window.__qaErrors || []).slice(),
  }))()`);
  assert(mobile.width <= mobile.viewport, 'Food page overflows at 390px');
  assert(mobile.errors.length === 0, `Mobile page errors: ${mobile.errors.join(', ')}`);
  const mobileShot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(new URL('food-mobile-390x844.png', outputDir), Buffer.from(mobileShot.data, 'base64'));

  const consoleProblems = cdp.events
    .filter((event) => event.method === 'Log.entryAdded' && ['error', 'warning'].includes(event.params.entry.level))
    .map((event) => ({ level: event.params.entry.level, text: event.params.entry.text, url: event.params.entry.url || '' }));
  const expectedNetworkProblems = consoleProblems.filter((entry) =>
    entry.url.endsWith('/favicon.ico') ||
    entry.url.includes('.supabase.co/rest/v1/app_state') ||
    entry.url.includes('/api/health/read/')
  );
  const actionableConsoleProblems = consoleProblems.filter((entry) => !expectedNetworkProblems.includes(entry));
  assert(actionableConsoleProblems.length === 0, `Console problems: ${JSON.stringify(actionableConsoleProblems)}`);

  console.log(JSON.stringify({ fresh, savedTargets, logged, deleted, mobile, actionableConsoleProblems, expectedNetworkProblems }, null, 2));
} finally {
  cdp?.socket.close();
  child.kill();
}
