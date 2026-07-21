const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../ui/money.html'), 'utf8');

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) pass++;
  else {
    fail++;
    console.error('FAIL: ' + message);
  }
}

const tabs = [
  "['overview', 'Overview', panelOverview]",
  "['accounts', 'Accounts', panelAccounts]",
  "['cashflow', 'Cash Flow', panelCashflow]",
  "['spending', 'Spending', panelSpending]",
  "['business', 'Business', panelBusiness]",
  "['wealth', 'Wealth', panelWealth]",
  "['planning', 'Planning', panelPlanning]",
];

tabs.forEach((tab) => ok(source.includes(tab), `Money tab contract is missing ${tab}`));
ok(/ing:tx/.test(source), 'cash flow and spending use canonical transactions');
ok(/fin:accounts:v1/.test(source), 'Accounts uses the established account store');
ok(/nw:bank/.test(source) && /nw:stocks/.test(source) && /nw:crypto/.test(source) && /nw:history/.test(source), 'Wealth uses canonical balance and history stores');
ok(/fin:subs/.test(source) && /fin:budgets/.test(source), 'Spending uses subscriptions and budgets');
ok(/gl:revenue/.test(source) && /gl:expenses/.test(source), 'Business shares the GlowLab P&L stores');
ok(/sav:goals/.test(source), 'Planning uses the savings goal store');
ok(/No spending data yet/.test(source) && /No business data yet/.test(source) && /No wealth data yet/.test(source), 'Money exposes truthful empty states');
ok(/role="tablist"/.test(source) && /role="tabpanel"/.test(source), 'Money tabs expose accessible roles');
ok(/addEventListener\('keydown'/.test(source) && /ArrowRight/.test(source) && /ArrowLeft/.test(source), 'Money tabs support keyboard navigation');
ok(/data-aff-check/.test(source) && /pctOfCash/.test(source), 'Planning affordability is based on stored cash and cash flow');
ok(/id="mnQuick"/.test(source) && /source: 'quick-log'/.test(source), 'Money Quick Log writes to the canonical transaction store');
ok(!/Math\.random/.test(source), 'Money does not generate fake financial values');
ok(/canonical-runtime\.js/.test(source) && /phaseH\(\)/.test(source), 'Money loads the shared Phase H canonical runtime');
ok(/subscribePhaseH/.test(source), 'Money reacts to canonical changes from other pages');
ok(/phaseValue\('finance\.transactions'\)/.test(source) && /phaseValue\('finance\.accounts'\)/.test(source), 'Transactions and accounts consume canonical projections first');
ok(/phaseValue\('finance\.business'\)/.test(source) && /phaseValue\('finance\.planning'\)/.test(source), 'Business and planning consume shared canonical projections');
ok(/finance\.reconciliation/.test(source) && /Imported/.test(source) && /Manual/.test(source), 'Money exposes reconciliation and source truth classes');
ok(/CanonicalRuntime\.saveFinanceTransaction\(quickRow\)/.test(source), 'Quick Log writes a canonical transaction before its compatibility record');

console.log('money-contract.test.js: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
