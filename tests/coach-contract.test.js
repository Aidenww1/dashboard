const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../ui/coach.html'), 'utf8');

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) pass++;
  else {
    fail++;
    console.error('FAIL: ' + message);
  }
}

ok(/\['briefing', 'Briefing'\]/.test(source), 'Briefing tab is present');
ok(/\['readiness', 'Readiness'\]/.test(source), 'Readiness tab is present');
ok(/\['ask', 'Ask'\]/.test(source), 'Ask tab is present');
ok(/\['inbox', 'Inbox'\]/.test(source), 'Inbox tab is present');
ok(/\['opportunities', 'Opportunities'\]/.test(source), 'Opportunities tab is present');
ok(/\['reviews', 'Reviews'\]/.test(source), 'Reviews tab is present');
ok(/role="tablist"/.test(source) && /role="tabpanel"/.test(source), 'Coach tabs expose accessible roles');
ok(/typeof L\.readiness === 'function'/.test(source), 'Readiness uses the core calculation');
ok(/typeof L\.briefing === 'function'/.test(source), 'Briefing uses the core calculation');
ok(/mail:summary:v1/.test(source), 'Inbox uses the canonical Mail summary');
ok(/radar:summary:v1/.test(source), 'Opportunities use the canonical Radar summary');
ok(/review:ritual:v1/.test(source), 'Reviews use the weekly ritual store');
ok(/coach:plans:v1/.test(source), 'Coach plans use the established store');
ok(/Inbox not connected/.test(source) && /No scan available/.test(source), 'Disconnected integrations have honest states');
ok(/LifeOSCmd\.ask\(question\)/.test(source), 'Ask uses the single established Coach engine');
ok(/addEventListener\('submit'/.test(source), 'Coach runs only after explicit form submission');
ok(/\.ch-tabs\{display:flex/.test(source) && /\.ch-tabs\{flex-wrap:wrap/.test(source), 'Coach tabs fit narrow screens without a forced horizontal scroller');
ok(/This Coach view could not load/.test(source), 'Coach has an isolated render error state');
ok(/item\.detail \|\| item\.sub/.test(source), 'Coach preserves shared attention detail such as lab marker status');
ok(/data\.js\?v=phase-e/.test(source), 'Coach cache-busts the shared Phase E adapter');
ok(/canonical-runtime\.js/.test(source) && /phaseH\(\)/.test(source), 'Coach loads the shared Phase H canonical runtime');
ok(/subscribePhaseH/.test(source), 'Coach reacts to canonical changes from other pages');
ok(/phaseValue\('coach\.briefing'\)/.test(source) && /phaseValue\('coach\.followups'\)/.test(source), 'Briefing and follow-ups consume canonical projections first');
ok(/phaseValue\('communications\.inbox'\)/.test(source) && /phaseValue\('coach\.opportunities'\)/.test(source) && /phaseValue\('coach\.reviews'\)/.test(source), 'Inbox, opportunities, and reviews consume canonical projections first');
ok(/Nothing is sent until you press Ask/.test(source) && /Coach runs only after you submit a question/.test(source), 'Generative Coach work requires an explicit user action');

console.log('coach-contract.test.js: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
