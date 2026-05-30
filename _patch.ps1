param()
$f = 'C:\Users\maila\Desktop\dashboard\finance.html'
$bytes   = [System.IO.File]::ReadAllBytes($f)
$content = [System.Text.Encoding]::UTF8.GetString($bytes)

# ── 1) Add ING CSS after the .gc-msg block ─────────────────────────────────
# Anchor: the opening of .gc-msg (unique enough)
$cssAnchor = ".gc-msg {$([char]13)$([char]10)  font-size: 11px; color: var(--text-tertiary);$([char]13)$([char]10)  font-family: var(--font-mono); padding: 6px 2px;"

$ingCss = "$([char]13)$([char]10)$([char]13)$([char]10)/* ===== ING CSV import ===== */$([char]13)$([char]10)" +
".ing-confirm { font-size: 12px; padding: 6px 0; }$([char]13)$([char]10)" +
".ing-confirm-info { color: var(--text-secondary); margin-bottom: 8px; font-size: 12px; }$([char]13)$([char]10)" +
".ing-confirm-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }$([char]13)$([char]10)" +
".ing-confirm-label { color: var(--text-tertiary); font-size: 11px; white-space: nowrap; }$([char]13)$([char]10)" +
".ing-confirm-input {$([char]13)$([char]10)" +
"  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);$([char]13)$([char]10)" +
"  color: var(--text-primary); font-family: var(--font-mono); font-size: 13px;$([char]13)$([char]10)" +
"  padding: 5px 9px; border-radius: 7px; width: 120px; outline: none;$([char]13)$([char]10)" +
"  -webkit-appearance: none;$([char]13)$([char]10)" +
"}$([char]13)$([char]10)" +
".ing-confirm-input:focus { border-color: rgba(255,153,0,0.5); }$([char]13)$([char]10)" +
".ing-tx-list { font-size: 12px; margin: 8px 0 4px; }$([char]13)$([char]10)" +
".ing-tx-row {$([char]13)$([char]10)" +
"  display: flex; align-items: center; gap: 8px; padding: 4px 0;$([char]13)$([char]10)" +
"  border-bottom: 1px solid rgba(255,255,255,0.04);$([char]13)$([char]10)" +
"}$([char]13)$([char]10)" +
".ing-tx-row:last-child { border-bottom: none; }$([char]13)$([char]10)" +
".ing-tx-date { color: var(--text-tertiary); min-width: 72px; font-size: 11px; font-family: var(--font-mono); flex-shrink: 0; }$([char]13)$([char]10)" +
".ing-tx-desc { flex: 1; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; }$([char]13)$([char]10)" +
".ing-tx-amt { min-width: 64px; text-align: right; font-weight: 600; font-family: var(--font-mono); flex-shrink: 0; font-size: 12px; }$([char]13)$([char]10)" +
".ing-tx-in  { color: #6BE3A4; }$([char]13)$([char]10)" +
".ing-tx-out { color: #FF6B6B; }"

if ($content.Contains($cssAnchor)) {
    $content = $content.Replace($cssAnchor, $cssAnchor + $ingCss)
    Write-Host "CSS inserted"
} else {
    Write-Host "CSS anchor not found"
}

# ── 2) Replace Salt Edge JS block using position-based splice ──────────────
# Start marker: the // ===... line right before // GOCARDLESS
$startMarker = "  // ============================================================$([char]13)$([char]10)  // GOCARDLESS"
$endMarker   = "  seRenderStatus();$([char]13)$([char]10)$([char]13)$([char]10)})();"

$startIdx = $content.IndexOf($startMarker)
$endIdx   = $content.IndexOf($endMarker)
Write-Host "SE block start: $startIdx  end: $endIdx"

if ($startIdx -ge 0 -and $endIdx -gt $startIdx) {
    $before = $content.Substring(0, $startIdx)
    $after  = $content.Substring($endIdx + $endMarker.Length)

    $ingJs = "  // ============================================================$([char]13)$([char]10)" +
"  // ING CSV IMPORT$([char]13)$([char]10)" +
"  // ============================================================$([char]13)$([char]10)" +
"  const ING_TX_KEY   = 'ing:tx';$([char]13)$([char]10)" +
"  const ING_META_KEY = 'ing:meta';$([char]13)$([char]10)" +
"$([char]13)$([char]10)" +
"  function ingBar() { return document.getElementById('gcBar'); }$([char]13)$([char]10)" +
"$([char]13)$([char]10)" +
"  function ingRenderStatus() {$([char]13)$([char]10)" +
"    const bar = ingBar();$([char]13)$([char]10)" +
"    if (!bar) return;$([char]13)$([char]10)" +
"    const meta = storeGet(ING_META_KEY);$([char]13)$([char]10)" +
"    if (!meta) {$([char]13)$([char]10)" +
"      bar.innerHTML =$([char]13)$([char]10)" +
"        '<input type=""file"" id=""ingFile"" accept="".csv"" style=""display:none"">'$([char]13)$([char]10)" +
"        + '<button class=""gc-connect-btn"" id=""ingImportBtn"">Import ING CSV</button>';$([char]13)$([char]10)" +
"      document.getElementById('ingImportBtn').onclick = function() { document.getElementById('ingFile').click(); };$([char]13)$([char]10)" +
"      document.getElementById('ingFile').onchange = ingHandleFile;$([char]13)$([char]10)" +
"      return;$([char]13)$([char]10)" +
"    }$([char]13)$([char]10)" +
"    const elapsed = Date.now() - meta.imported_at;$([char]13)$([char]10)" +
"    const mins = Math.round(elapsed / 60000);$([char]13)$([char]10)" +
"    const ago  = mins < 1 ? 'just now'$([char]13)$([char]10)" +
"               : mins < 60 ? mins + 'm ago'$([char]13)$([char]10)" +
"               : Math.round(mins / 60) < 24 ? Math.round(mins / 60) + 'h ago'$([char]13)$([char]10)" +
"               : Math.round(mins / 1440) + 'd ago';$([char]13)$([char]10)" +
"    bar.innerHTML =$([char]13)$([char]10)" +
"      '<div class=""gc-status-bar"">'$([char]13)$([char]10)" +
"      + '<span class=""gc-status-dot""></span>'$([char]13)$([char]10)" +
"      + '<span class=""gc-status-text"">' + escapeHtml(meta.iban || 'ING') + ' $([char]183) ' + meta.tx_count + ' tx $([char]183) ' + ago + '</span>'$([char]13)$([char]10)" +
"      + '<input type=""file"" id=""ingFile"" accept="".csv"" style=""display:none"">'$([char]13)$([char]10)" +
"      + '<button class=""gc-sync-btn"" id=""ingReimport"">$([char]8635) Re-import</button>'$([char]13)$([char]10)" +
"      + '<button class=""gc-disc-btn"" id=""ingClear"">Clear</button>'$([char]13)$([char]10)" +
"      + '</div>';$([char]13)$([char]10)" +
"    document.getElementById('ingReimport').onclick = function() { document.getElementById('ingFile').click(); };$([char]13)$([char]10)" +
"    document.getElementById('ingFile').onchange = ingHandleFile;$([char]13)$([char]10)" +
"    document.getElementById('ingClear').onclick = ingClear;$([char]13)$([char]10)" +
"    ingRenderTx();$([char]13)$([char]10)" +
"  }$([char]13)$([char]10)" +
"$([char]13)$([char]10)" +
"  function ingHandleFile(e) {$([char]13)$([char]10)" +
"    const file = e.target.files && e.target.files[0];$([char]13)$([char]10)" +
"    if (!file) return;$([char]13)$([char]10)" +
"    e.target.value = '';$([char]13)$([char]10)" +
"    const bar = ingBar();$([char]13)$([char]10)" +
"    if (bar) bar.innerHTML = '<div class=""gc-msg"">Reading file$([char]8230)</div>';$([char]13)$([char]10)" +
"    const reader = new FileReader();$([char]13)$([char]10)" +
"    reader.onload = function(ev) { ingParseAndStage(ev.target.result); };$([char]13)$([char]10)" +
"    reader.readAsText(file, 'UTF-8');$([char]13)$([char]10)" +
"  }$([char]13)$([char]10)" +
"$([char]13)$([char]10)" +
"  function ingParseCsvLine(line) {$([char]13)$([char]10)" +
"    const fields = [];$([char]13)$([char]10)" +
"    let cur = '', inQ = false;$([char]13)$([char]10)" +
"    for (let i = 0; i < line.length; i++) {$([char]13)$([char]10)" +
"      const c = line[i];$([char]13)$([char]10)" +
"      if (c === '""') { inQ = !inQ; }$([char]13)$([char]10)" +
"      else if (c === ';' && !inQ) { fields.push(cur); cur = ''; }$([char]13)$([char]10)" +
"      else { cur += c; }$([char]13)$([char]10)" +
"    }$([char]13)$([char]10)" +
"    fields.push(cur);$([char]13)$([char]10)" +
"    return fields;$([char]13)$([char]10)" +
"  }$([char]13)$([char]10)" +
"$([char]13)$([char]10)" +
"  function ingParseAndStage(text) {$([char]13)$([char]10)" +
"    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');$([char]13)$([char]10)" +
"    if (lines.length < 2) { ingShowError('File appears empty or not a valid ING CSV.'); return; }$([char]13)$([char]10)" +
"$([char]13)$([char]10)" +
"    const header = ingParseCsvLine(lines[0]).map(function(h) { return h.trim().toLowerCase(); });$([char]13)$([char]10)" +
"    const iDatum  = header.findIndex(function(h) { return h.indexOf('datum')      >= 0; });$([char]13)$([char]10)" +
"    const iNaam   = header.findIndex(function(h) { return h.indexOf('naam')       >= 0; });$([char]13)$([char]10)" +
"    const iRek    = header.findIndex(function(h) { return h.indexOf('rekening')   >= 0 && h.indexOf('tegen') < 0; });$([char]13)$([char]10)" +
"    const iAfBij  = header.findIndex(function(h) { return h.indexOf('af')         >= 0 && h.indexOf('bij')   >= 0; });$([char]13)$([char]10)" +
"    const iBedrag = header.findIndex(function(h) { return h.indexOf('bedrag')     >= 0; });$([char]13)$([char]10)" +
"    const iMemo   = header.findIndex(function(h) { return h.indexOf('mededeling') >= 0; });$([char]13)$([char]10)" +
"$([char]13)$([char]10)" +
"    if (iDatum < 0 || iBedrag < 0) {$([char]13)$([char]10)" +
"      ingShowError('Not a recognised ING CSV. Expected: Datum and Bedrag columns.');$([char]13)$([char]10)" +
"      return;$([char]13)$([char]10)" +
"    }$([char]13)$([char]10)" +
"$([char]13)$([char]10)" +
"    const transactions = [];$([char]13)$([char]10)" +
"    let iban = '';$([char]13)$([char]10)" +
"$([char]13)$([char]10)" +
"    for (let i = 1; i < lines.length; i++) {$([char]13)$([char]10)" +
"      const line = lines[i].trim();$([char]13)$([char]10)" +
"      if (!line) continue;$([char]13)$([char]10)" +
"      const r = ingParseCsvLine(line);$([char]13)$([char]10)" +
"      if (r.length < 2) continue;$([char]13)$([char]10)" +
"$([char]13)$([char]10)" +
"      const dateStr = r[iDatum] ? r[iDatum].trim() : '';$([char]13)$([char]10)" +
"      if (!dateStr || dateStr.length < 8) continue;$([char]13)$([char]10)" +
"$([char]13)$([char]10)" +
"      if (!iban && iRek >= 0 && r[iRek]) iban = r[iRek].trim();$([char]13)$([char]10)" +
"$([char]13)$([char]10)" +
"      const afBij  = iAfBij  >= 0 ? r[iAfBij].trim()                    : 'Af';$([char]13)$([char]10)" +
"      const naam   = iNaam   >= 0 ? r[iNaam].trim()                     : '';$([char]13)$([char]10)" +
"      const memo   = iMemo   >= 0 ? r[iMemo].trim()                     : '';$([char]13)$([char]10)" +
"      const bedrag = iBedrag >= 0 ? r[iBedrag].trim().replace(',', '.') : '0';$([char]13)$([char]10)" +
"      const amount = parseFloat(bedrag) || 0;$([char]13)$([char]10)" +
"      const signed = afBij === 'Bij' ? amount : -amount;$([char]13)$([char]10)" +
"      const date   = dateStr.slice(0, 4) + '-' + dateStr.slice(4, 6) + '-' + dateStr.slice(6, 8);$([char]13)$([char]10)" +
"$([char]13)$([char]10)" +
"      transactions.push({ date: date, amount: signed, currency: 'EUR', description: memo || naam });$([char]13)$([char]10)" +
"    }$([char]13)$([char]10)" +
"$([char]13)$([char]10)" +
"    if (!transactions.length) { ingShowError('No transactions found. Is this an ING CSV export?'); return; }$([char]13)$([char]10)" +
"    transactions.sort(function(a, b) { return b.date.localeCompare(a.date); });$([char]13)$([char]10)" +
"    ingShowConfirm(iban, transactions);$([char]13)$([char]10)" +
"  }$([char]13)$([char]10)" +
"$([char]13)$([char]10)" +
"  function ingShowError(msg) {$([char]13)$([char]10)" +
"    const bar = ingBar();$([char]13)$([char]10)" +
"    if (bar) bar.innerHTML = '<div class=""gc-msg"" style=""color:#FF6B6B"">' + escapeHtml(msg) + '</div>';$([char]13)$([char]10)" +
"    setTimeout(ingRenderStatus, 3500);$([char]13)$([char]10)" +
"  }$([char]13)$([char]10)" +
"$([char]13)$([char]10)" +
"  function ingShowConfirm(iban, transactions) {$([char]13)$([char]10)" +
"    const bar = ingBar();$([char]13)$([char]10)" +
"    if (!bar) return;$([char]13)$([char]10)" +
"    const dateFrom = transactions[transactions.length - 1].date;$([char]13)$([char]10)" +
"    const dateTo   = transactions[0].date;$([char]13)$([char]10)" +
"    bar.innerHTML =$([char]13)$([char]10)" +
"      '<div class=""ing-confirm"">'$([char]13)$([char]10)" +
"      + '<div class=""ing-confirm-info"">$([char]128194) <strong>' + escapeHtml(iban || 'ING Account') + '</strong>'$([char]13)$([char]10)" +
"      + ' $([char]183) ' + transactions.length + ' transactions (' + dateFrom + ' $([char]8594) ' + dateTo + ')</div>'$([char]13)$([char]10)" +
"      + '<div class=""ing-confirm-row"">'$([char]13)$([char]10)" +
"      + '<span class=""ing-confirm-label"">Current balance (EUR):</span>'$([char]13)$([char]10)" +
"      + '<input type=""number"" id=""ingBalInput"" class=""ing-confirm-input"" placeholder=""e.g. 1250.00"" step=""0.01"">'$([char]13)$([char]10)" +
"      + '<button class=""gc-sync-btn"" id=""ingConfirmBtn"" style=""flex-shrink:0"">Import</button>'$([char]13)$([char]10)" +
"      + '<button class=""gc-disc-btn"" id=""ingCancelBtn"" style=""flex-shrink:0"">Cancel</button>'$([char]13)$([char]10)" +
"      + '</div></div>';$([char]13)$([char]10)" +
"    const input = document.getElementById('ingBalInput');$([char]13)$([char]10)" +
"    if (input) input.focus();$([char]13)$([char]10)" +
"    document.getElementById('ingConfirmBtn').onclick = function() { ingCommit(iban, transactions); };$([char]13)$([char]10)" +
"    document.getElementById('ingCancelBtn').onclick  = ingRenderStatus;$([char]13)$([char]10)" +
"    if (input) input.addEventListener('keydown', function(e) { if (e.key === 'Enter') ingCommit(iban, transactions); });$([char]13)$([char]10)" +
"  }$([char]13)$([char]10)" +
"$([char]13)$([char]10)" +
"  function ingCommit(iban, transactions) {$([char]13)$([char]10)" +
"    const input  = document.getElementById('ingBalInput');$([char]13)$([char]10)" +
"    const raw    = input ? input.value.replace(',', '.') : '';$([char]13)$([char]10)" +
"    const balEur = parseFloat(raw);$([char]13)$([char]10)" +
"    if (isNaN(balEur)) { if (input) input.style.borderColor = '#FF6B6B'; return; }$([char]13)$([char]10)" +
"$([char]13)$([char]10)" +
"    const rate   = (exchangeRates && exchangeRates['EUR']) ? exchangeRates['EUR'] : 1;$([char]13)$([char]10)" +
"    const amtCHF = balEur / rate;$([char]13)$([char]10)" +
"    const accName = iban || 'ING Account';$([char]13)$([char]10)" +
"$([char]13)$([char]10)" +
"    const bankItems = storeGet('nw:bank') || [];$([char]13)$([char]10)" +
"    let idx = iban ? bankItems.findIndex(function(b) { return b.iban === iban; }) : -1;$([char]13)$([char]10)" +
"    if (idx < 0) idx = bankItems.findIndex(function(b) { return b.name === accName || b.name === 'ING Account'; });$([char]13)$([char]10)" +
"    if (idx >= 0) {$([char]13)$([char]10)" +
"      const delta = amtCHF - (Number(bankItems[idx].amount) || 0);$([char]13)$([char]10)" +
"      bankItems[idx].amount = amtCHF;$([char]13)$([char]10)" +
"      bankItems[idx].iban   = iban;$([char]13)$([char]10)" +
"      bankItems[idx].name   = accName;$([char]13)$([char]10)" +
"      if (Math.abs(delta) > 0.005) logActivity('bank', bankItems[idx].name, delta, 'edit');$([char]13)$([char]10)" +
"    } else {$([char]13)$([char]10)" +
"      bankItems.push({ name: accName, amount: amtCHF, iban: iban });$([char]13)$([char]10)" +
"      logActivity('bank', accName, amtCHF, 'add');$([char]13)$([char]10)" +
"    }$([char]13)$([char]10)" +
"$([char]13)$([char]10)" +
"    storeSet('nw:bank',    bankItems);$([char]13)$([char]10)" +
"    storeSet(ING_TX_KEY,   transactions.slice(0, 300));$([char]13)$([char]10)" +
"    storeSet(ING_META_KEY, { iban: iban, imported_at: Date.now(), tx_count: transactions.length });$([char]13)$([char]10)" +
"$([char]13)$([char]10)" +
"    renderAllNetWorth();$([char]13)$([char]10)" +
"    ingRenderStatus();$([char]13)$([char]10)" +
"  }$([char]13)$([char]10)" +
"$([char]13)$([char]10)" +
"  function ingRenderTx() {$([char]13)$([char]10)" +
"    let cont = document.getElementById('ingTxCont');$([char]13)$([char]10)" +
"    if (!cont) {$([char]13)$([char]10)" +
"      const bar = ingBar();$([char]13)$([char]10)" +
"      if (!bar) return;$([char]13)$([char]10)" +
"      cont = document.createElement('div');$([char]13)$([char]10)" +
"      cont.id = 'ingTxCont';$([char]13)$([char]10)" +
"      bar.insertAdjacentElement('afterend', cont);$([char]13)$([char]10)" +
"    }$([char]13)$([char]10)" +
"    const txs = storeGet(ING_TX_KEY);$([char]13)$([char]10)" +
"    if (!txs || !txs.length) { cont.innerHTML = ''; return; }$([char]13)$([char]10)" +
"    cont.innerHTML = '<div class=""ing-tx-list"">'$([char]13)$([char]10)" +
"      + txs.slice(0, 25).map(function(t) {$([char]13)$([char]10)" +
"          const cls  = t.amount >= 0 ? 'ing-tx-in' : 'ing-tx-out';$([char]13)$([char]10)" +
"          const sign = t.amount >= 0 ? '+' : '';$([char]13)$([char]10)" +
"          return '<div class=""ing-tx-row"">'$([char]13)$([char]10)" +
"            + '<span class=""ing-tx-date"">' + escapeHtml(t.date) + '</span>'$([char]13)$([char]10)" +
"            + '<span class=""ing-tx-desc"">' + escapeHtml(t.description || '') + '</span>'$([char]13)$([char]10)" +
"            + '<span class=""ing-tx-amt ' + cls + '"">' + sign + t.amount.toFixed(2) + '</span>'$([char]13)$([char]10)" +
"            + '</div>';$([char]13)$([char]10)" +
"        }).join('')$([char]13)$([char]10)" +
"      + '</div>';$([char]13)$([char]10)" +
"  }$([char]13)$([char]10)" +
"$([char]13)$([char]10)" +
"  function ingClear() {$([char]13)$([char]10)" +
"    if (!confirm('Clear imported ING data? Your entered balance stays.')) return;$([char]13)$([char]10)" +
"    localStorage.removeItem(ING_TX_KEY);$([char]13)$([char]10)" +
"    localStorage.removeItem(ING_META_KEY);$([char]13)$([char]10)" +
"    const cont = document.getElementById('ingTxCont');$([char]13)$([char]10)" +
"    if (cont) cont.remove();$([char]13)$([char]10)" +
"    ingRenderStatus();$([char]13)$([char]10)" +
"  }$([char]13)$([char]10)" +
"$([char]13)$([char]10)" +
"  ingRenderStatus();"

    $content = $before + $ingJs + $after
    Write-Host "Salt Edge JS replaced with CSV import JS"
} else {
    Write-Host "SE block markers not found"
}

[System.IO.File]::WriteAllBytes($f, [System.Text.Encoding]::UTF8.GetBytes($content))
Write-Host "File saved - length: $($content.Length)"
