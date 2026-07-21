import { assert, delay, launchBrowser } from './browser-cdp.mjs';

const baseUrl = 'http://127.0.0.1:4173';
const browser = await launchBrowser({
  port: 9240,
  url: `${baseUrl}/ui/log.html#food`,
  profileName: 'lifeos-navigation-audit',
});
const { cdp } = browser;
const results = [];

async function ready(selector) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await cdp.eval(`document.readyState==='complete' && !!document.querySelector(${JSON.stringify(selector)})`)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${selector}`);
}

async function resetErrors() {
  await cdp.eval("window.__navErrors=[];addEventListener('error',e=>window.__navErrors.push(String(e.message||e.error)));addEventListener('unhandledrejection',e=>window.__navErrors.push(String(e.reason)));true");
}

async function click(selector) {
  const found = await cdp.eval(`(() => { const node=document.querySelector(${JSON.stringify(selector)}); if(!node)return false; node.click(); return true; })()`);
  assert(found, `Missing control: ${selector}`);
  await delay(120);
}

async function auditLog() {
  await ready('#seg [role="tab"]');
  await resetErrors();
  const domains = ['food', 'body', 'training', 'skin', 'water', 'supps'];
  const subtabs = {
    body: ['overview', 'composition', 'recovery', 'labs', 'photos'],
    training: ['overview', 'cardio', 'progress', 'history'],
    skin: ['overview', 'routine', 'products', 'lab', 'photos'],
    water: ['overview', 'target', 'history', 'settings'],
    supps: ['overview', 'schedule', 'compounds', 'monitoring', 'inventory', 'notes'],
  };
  for (const domain of domains) {
    await click(`#seg [data-value="${domain}"]`);
    const state = await cdp.eval(`(() => { const p=document.querySelector('.lg-panel:not([hidden])'); return {hash:location.hash,active:document.querySelector('#seg [aria-selected="true"]')?.dataset.value,text:(p?.innerText||'').trim(),hidden:p?.hidden,errors:window.__navErrors.slice()}; })()`);
    assert(state.hash === `#${domain}` && state.active === domain && state.text.length > 40 && state.hidden === false, `Log ${domain} did not activate correctly: ${JSON.stringify(state)}`);
    results.push(`log:${domain}`);
    for (const subtab of subtabs[domain] || []) {
      await click(`.lg-panel:not([hidden]) .lg-subtabs [data-sub="${subtab}"]`);
      const subState = await cdp.eval(`(() => { const p=document.querySelector('.lg-panel:not([hidden])'); return {selected:p?.querySelector('.lg-subtabs [data-sub="${subtab}"][aria-selected="true"]')!==null,text:(p?.innerText||'').trim(),errors:window.__navErrors.slice()}; })()`);
      assert(subState.selected && subState.text.length > 80, `Log ${domain}/${subtab} did not render: ${JSON.stringify(subState)}`);
      results.push(`log:${domain}/${subtab}`);
    }
  }
  const errors = await cdp.eval('window.__navErrors');
  assert(errors.length === 0, `Log navigation emitted errors: ${JSON.stringify(errors)}`);
}

async function auditHashedPage(page, selector, ids) {
  await cdp.send('Page.navigate', { url: `${baseUrl}/ui/${page}.html#${ids[0]}` });
  await ready(selector);
  await resetErrors();
  for (const id of ids) {
    await click(`${selector}[data-${page === 'coach' ? 'view' : 'tab'}="${id}"]`);
    const state = await cdp.eval(`(() => { const selected=document.querySelector(${JSON.stringify(selector + '[aria-selected="true"]')}); const panel=document.querySelector('[role="tabpanel"]')||document.querySelector('main'); return {hash:location.hash,selected:selected?.getAttribute(${JSON.stringify('data-' + (page === 'coach' ? 'view' : 'tab'))}),text:(panel?.innerText||'').trim(),errors:window.__navErrors.slice()}; })()`);
    assert(state.hash === `#${id}` && state.selected === id && state.text.length > 60, `${page}/${id} did not render: ${JSON.stringify(state)}`);
    results.push(`${page}:${id}`);
  }
  const errors = await cdp.eval('window.__navErrors');
  assert(errors.length === 0, `${page} navigation emitted errors: ${JSON.stringify(errors)}`);
}

try {
  await auditLog();
  await auditHashedPage('coach', '#coach-tabs [data-view]', ['briefing', 'readiness', 'ask', 'inbox', 'opportunities', 'reviews']);
  await auditHashedPage('money', '#mnTabs [data-tab]', ['overview', 'accounts', 'cashflow', 'spending', 'business', 'wealth', 'planning']);
  await auditHashedPage('more', '#mrTabs [data-tab]', ['settings', 'integrations', 'notifications', 'data', 'life', 'about']);
  console.log(JSON.stringify({ passed: results.length, destinations: results }, null, 2));
} finally {
  browser.close();
}
