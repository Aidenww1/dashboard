import { assert, consoleSummary, delay, launchBrowser } from './browser-cdp.mjs';

const baseUrl = 'http://127.0.0.1:4173';
const screenshots = 'C:\\Users\\maila\\Desktop\\dashboard\\docs\\phase12-screenshots';
const browser = await launchBrowser({
  port: 9233,
  url: `${baseUrl}/ui/components.html`,
  profileName: 'lifeos-workflows-qa',
});
const { cdp } = browser;

try {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await cdp.eval("document.readyState==='complete' && document.querySelector('#openSheet')")) break;
    await delay(100);
  }
  await cdp.eval("window.__qaErrors=[];addEventListener('error',e=>window.__qaErrors.push(String(e.message||e.error)));addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));true");

  await cdp.eval("document.querySelector('#openSheet').focus();document.querySelector('#openSheet').click();true");
  await delay(60);
  assert(await cdp.eval("document.querySelector('[role=dialog]')!==null && document.querySelector('[role=dialog]').contains(document.activeElement)"), 'Sheet did not open with focus inside');
  await cdp.eval("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));true");
  await delay(300);
  assert(await cdp.eval("document.querySelector('[role=dialog]')===null && document.activeElement.id==='openSheet'"), 'Sheet did not close with Escape and restore focus');

  await cdp.eval("document.querySelector('#openConfirm').click();true");
  await delay(60);
  assert(await cdp.eval("document.querySelector('[role=alertdialog]')?.getAttribute('aria-label')==='Delete item?'"), 'Confirmation did not expose alertdialog semantics');
  await cdp.eval("document.querySelector('[role=alertdialog] [data-confirm]').click();true");
  await delay(60);
  assert(await cdp.eval("[...document.querySelectorAll('.toast')].some((node)=>node.innerText.includes('Confirmed'))"), 'Confirmation action did not complete');

  await cdp.eval("document.querySelector('#deleteSpecimen').click();true");
  await delay(60);
  assert(await cdp.eval("document.querySelector('#undoRow').hidden===true && [...document.querySelectorAll('.toast button')].some((node)=>node.textContent==='Undo')"), 'Delete did not enter a real Undo window');
  await cdp.eval("[...document.querySelectorAll('.toast button')].find((node)=>node.textContent==='Undo').click();true");
  await delay(60);
  assert(await cdp.eval("document.querySelector('#undoRow').hidden===false"), 'Undo did not restore the deleted row');

  await cdp.eval("document.querySelector('#componentSearch').value='overlays';document.querySelector('#componentSearch').dispatchEvent(new Event('input',{bubbles:true}));true");
  await delay(40);
  assert(await cdp.eval("document.querySelector('#overlays').hidden===false && document.querySelector('#forms').hidden===true"), 'Component search did not filter workflow groups');
  await cdp.screenshot(`${screenshots}\\workflow-overlays-1440x900.png`);

  await cdp.send('Page.navigate', { url: `${baseUrl}/export.html` });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await cdp.eval("document.readyState==='complete' && document.querySelector('#importFile')")) break;
    await delay(100);
  }
  await cdp.eval("window.__qaErrors=[];addEventListener('error',e=>window.__qaErrors.push(String(e.message||e.error)));addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));window.confirm=()=>true;true");
  await cdp.eval(`(() => {
    const file = new File([JSON.stringify({'workflow:restore':{ok:true,version:1}})], 'restore.json', {type:'application/json'});
    const input = document.querySelector('#importFile');
    Object.defineProperty(input, 'files', {value:[file], configurable:true});
    input.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  })()`);
  await delay(300);
  assert(await cdp.eval("JSON.parse(localStorage.getItem('workflow:restore')).ok===true"), 'JSON restore did not write the imported snapshot');
  assert(await cdp.eval("(window.__qaErrors||[]).length===0"), 'Backup/restore emitted a browser error');
  await cdp.screenshot(`${screenshots}\\workflow-backup-1440x900.png`);

  const consoleResult = consoleSummary(cdp);
  assert(consoleResult.actionableConsoleProblems.length === 0, `Workflow console problems: ${JSON.stringify(consoleResult.actionableConsoleProblems)}`);
  console.log(JSON.stringify({ restore: await cdp.eval("JSON.parse(localStorage.getItem('workflow:restore'))"), ...consoleResult }, null, 2));
} finally {
  browser.close();
}
