const Runtime = require('../ui/canonical-runtime.js');
const Repositories = require('../event-repository.js');

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) { pass += 1; return; }
  fail += 1;
  console.error('FAIL: ' + message);
}
function storage(seed) {
  const values = Object.assign({}, seed);
  return {
    get length() { return Object.keys(values).length; },
    key(index) { return Object.keys(values)[index] || null; },
    getItem(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setItem(key, value) { values[key] = String(value); },
    removeItem(key) { delete values[key]; },
    clear() { Object.keys(values).forEach((key) => delete values[key]); },
  };
}

(async function () {
  const date = '2026-07-21';
  const adapter = new Repositories.MemoryAdapter();
  const repository = Repositories.create({ adapter, userId: 'owner-phase-h', deviceId: 'device-phase-h', timezone: 'Europe/Amsterdam' });
  const local = storage({
    'mail:summary:v1': JSON.stringify({ total_inbox: 4, needs_reply: [{ subject: 'Reply to accountant' }], bills: [{ amount: 42 }], opportunities: [{ title: 'Contract lead' }], orders_active: 1, generated_at: date + 'T08:00:00Z' }),
    'radar:summary:v1': JSON.stringify({ total_found: 2, shown: [{ title: 'Training course', category: 'Learning' }], generated_at: date + 'T07:00:00Z' }),
    'review:ritual:v1': JSON.stringify({ [date]: { wins: 'Logged consistently', improve: 'Hydrate earlier' } }),
    'coach:plans:v1': JSON.stringify([{ id: 'plan-1', title: 'Recovery plan', status: 'active' }]),
    'ing:tx': JSON.stringify([
      { id: 'bank-1', provider_record_id: 'bank-1', provider: 'test-bank', date, description: 'Invoice paid', amount: 1500, category: 'Income' },
      { id: 'bank-2', provider_record_id: 'bank-2', provider: 'test-bank', date, description: 'Groceries', amount: -120, category: 'Food' },
    ]),
    'fin:accounts:v1': JSON.stringify([
      { id: 'checking', name: 'Checking', type: 'checking', balance: 4000, currency: 'EUR' },
      { id: 'card', name: 'Credit card', type: 'credit', balance: 500, currency: 'EUR', liability: true },
    ]),
    'gl:revenue': JSON.stringify([{ id: 'invoice-1', date, client: 'Client A', amount: 800 }]),
    'gl:expenses': JSON.stringify([{ id: 'expense-1', date, vendor: 'Software', amount: 75, category: 'Software' }]),
    'backup:last:v1': JSON.stringify({ created_at: date + 'T06:00:00Z', status: 'complete' }),
  });
  const runtime = Runtime.create({ storage: local, repository, userId: 'owner-phase-h', deviceId: 'device-phase-h', timezone: 'Europe/Amsterdam' });

  let phase = await runtime.phaseH(date);
  ok(phase['finance.transactions'].value.total === 4, 'legacy bank and GlowLab records bridge into one canonical transaction stream');
  ok(phase['finance.transactions'].value.imported === 4 && phase['finance.transactions'].value.manual === 0, 'bridged provider records remain visibly imported');
  ok(phase['finance.cashflow'].value.income_minor === 230000 && phase['finance.cashflow'].value.expenses_minor === 19500, 'cash flow composes personal and business records in minor units');
  ok(phase['finance.spending'].value.categories.some((row) => row.category === 'Food' && row.amount_minor === 12000), 'spending categories derive from canonical transaction facts');
  ok(phase['finance.accounts'].value.assets_minor === 400000 && phase['finance.accounts'].value.liabilities_minor === 50000, 'accounts distinguish assets from liabilities');
  ok(phase['finance.wealth'].value.net_worth_minor === 350000, 'wealth is the shared account projection, not a separate total');
  ok(phase['finance.business'].value.ytd_profit_minor === 72500, 'GlowLab revenue and expenses feed the shared business P&L');
  ok(phase['finance.planning'].value.truth_class === 'deterministic-estimate' && phase['finance.planning'].value.limitations.length > 0, 'planning is labeled as an estimate with limitations');
  ok(phase['finance.reconciliation'].value.status === 'reconciled' && phase['finance.reconciliation'].value.imported === 4, 'reconciliation reports identity/schema status without claiming bank verification');

  ok(phase['communications.inbox'].value.connected && phase['communications.inbox'].value.unread === 4, 'Coach inbox consumes the stored provider summary');
  ok(phase['coach.followups'].value.items.some((item) => item.title === 'Reply to accountant'), 'Coach follow-ups include communication actions');
  ok(phase['coach.opportunities'].value.available && phase['coach.opportunities'].value.shown.length === 1, 'Coach opportunities render the stored Radar result without regeneration');
  ok(phase['coach.reviews'].value.weeks.length === 1 && phase['coach.reviews'].value.plans.length === 1, 'Coach reviews compose review rituals and plans');
  ok(phase['coach.briefing'].value.lines.length === 5, 'Coach briefing has one deterministic line per supported area');
  ok(phase['coach.briefing'].value.lines.find((line) => line.area === 'Money').truth_class !== 'missing-data', 'Coach briefing sees the same current-month finance facts as Money');
  ok(phase['coach.context'].value.limitations.some((line) => /measured facts/.test(line)), 'Coach context forces truth-class distinctions');
  ok(phase['coach.context'].value.limitations.some((line) => /social or mental-health/.test(line)), 'Coach context excludes unsupported social and mental-health inference');

  const firstBridgeCount = (await repository.query({ domain: 'finance' })).length;
  await runtime.phaseH(date);
  ok((await repository.query({ domain: 'finance' })).length === firstBridgeCount, 'Phase H finance bridging is idempotent');

  await runtime.saveFinanceTransaction({ id: 'manual-1', date, description: 'Manual transport', amount: -18.5, category: 'Transport', imported: false });
  await runtime.saveFinanceTransaction({ id: 'provider-3', provider_record_id: 'provider-3', provider: 'test-bank', date, description: 'Coffee', amount: -4.5, category: 'Food', imported: true });
  await runtime.saveFinanceTransaction({ id: 'provider-3-copy', provider_record_id: 'provider-3', provider: 'test-bank', date, description: 'Coffee', amount: -4.5, category: 'Food', imported: true });
  await runtime.projections.whenIdle();
  phase = await runtime.phaseH(date);
  ok(phase['finance.transactions'].value.total === 6, 'manual and provider writes update the canonical stream without duplicating a provider identity');
  ok(phase['finance.transactions'].value.manual === 1 && phase['finance.transactions'].value.imported === 5, 'manual and imported truth classes remain distinct after writes');
  ok(phase['finance.reconciliation'].value.manual === 1 && phase['finance.reconciliation'].value.imported === 5, 'reconciliation updates from the same transaction projection');
  ok(phase['finance.cashflow'].value.net_minor === 208200, 'new transactions propagate into cash flow');

  const secondDevice = Runtime.create({ storage: storage({}), repository, userId: 'owner-phase-h', deviceId: 'device-phase-h-2', timezone: 'Europe/Amsterdam' });
  const secondPhase = await secondDevice.phaseH(date);
  ok(secondPhase['finance.cashflow'].value.net_minor === phase['finance.cashflow'].value.net_minor, 'a second device projects the same effective finance facts without legacy storage');
  ok(secondPhase['finance.business'].value.ytd_profit_minor === phase['finance.business'].value.ytd_profit_minor, 'Business and Money share the same cross-device P&L');

  const status = await runtime.systemStatus();
  ok(status.canonical_events >= 8 && status.domain_counts.finance >= 6, 'system status reports canonical event and domain counts');
  ok(status.pending_sync >= 8 && status.sync_status === 'pending', 'system status exposes the real outbox state');
  ok(status.connections.mail && status.connections.finance, 'system status reports recorded integration evidence');
  ok(status.limitations.some((line) => /authenticated sync service/.test(line)), 'system status states the cross-device sync requirement');

  const snapshot = await runtime.exportSnapshot();
  ok(snapshot.schema_version === 1 && snapshot.canonical_events.length === status.canonical_events, 'complete export includes versioned canonical events');
  ok(snapshot.pending_outbox.length === status.pending_sync && snapshot.local_storage['mail:summary:v1'], 'complete export includes outbox state and compatibility storage');

  await runtime.clearDeviceData();
  ok((await repository.rawQuery({ includeDeleted: true, includeSuperseded: true })).length === 0, 'device reset clears the canonical repository transactionally');
  ok(local.length === 0, 'device reset clears compatibility storage after the repository succeeds');

  console.log('canonical-phase-h-runtime.test.js: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
