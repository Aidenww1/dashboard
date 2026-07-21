import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

export function assert(value, message) {
  if (!value) throw new Error(message);
}

export { delay };

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
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }

  async screenshot(path) {
    await mkdir(new URL('.', `file:///${path.replaceAll('\\', '/')}`), { recursive: true }).catch(() => {});
    const result = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path, Buffer.from(result.data, 'base64'));
  }
}

export async function launchBrowser({ port, url, width = 1440, height = 900, profileName = 'lifeos-qa' }) {
  const profile = `${process.env.TEMP}\\${profileName}-${Date.now()}`;
  const child = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, url,
  ], { stdio: 'ignore', windowsHide: true });
  let target;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
      target = pages.find((entry) => entry.type === 'page' && entry.url.includes('/ui/'));
      if (target) break;
    } catch {}
    await delay(100);
  }
  if (!target) {
    child.kill();
    throw new Error('Chrome page target was not ready');
  }
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Log.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const expectedPath = new URL(url).pathname;
  let pageReady = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      pageReady = await cdp.eval("location.protocol === 'http:' && location.pathname === " + JSON.stringify(expectedPath) + " && document.readyState !== 'loading'");
      if (pageReady) break;
    } catch {}
    await delay(100);
  }
  if (!pageReady) {
    cdp.socket.close();
    child.kill();
    throw new Error('Chrome page document was not ready');
  }
  return { cdp, child, close: () => { cdp.socket.close(); child.kill(); } };
}

export function consoleSummary(cdp) {
  const problems = cdp.events
    .filter((event) => event.method === 'Log.entryAdded' && ['error', 'warning'].includes(event.params.entry.level))
    .map((event) => ({ level: event.params.entry.level, text: event.params.entry.text, url: event.params.entry.url || '' }));
  const expectedNetworkProblems = problems.filter((entry) =>
    entry.url.endsWith('/favicon.ico') ||
    entry.url.includes('.supabase.co/rest/v1/app_state') ||
    entry.url.includes('/api/health/read/')
  );
  return {
    actionableConsoleProblems: problems.filter((entry) => !expectedNetworkProblems.includes(entry)),
    expectedNetworkProblems,
  };
}
