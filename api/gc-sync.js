const GC_BASE = 'https://bankaccountdata.gocardless.com/api/v2';

async function getToken(secretId, secretKey) {
  const res = await fetch(`${GC_BASE}/token/new/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ secret_id: secretId, secret_key: secretKey }),
  });
  const data = await res.json();
  if (!data.access) throw new Error('Token error: ' + JSON.stringify(data));
  return data.access;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { GC_SECRET_ID, GC_SECRET_KEY } = process.env;
  if (!GC_SECRET_ID || !GC_SECRET_KEY) {
    return res.status(500).json({ error: 'GC_SECRET_ID / GC_SECRET_KEY not set in Vercel env vars' });
  }

  const { requisition_id } = req.query;
  if (!requisition_id) return res.status(400).json({ error: 'requisition_id is required' });

  try {
    const access = await getToken(GC_SECRET_ID, GC_SECRET_KEY);
    const headers = { Accept: 'application/json', Authorization: `Bearer ${access}` };

    // Get the requisition to find account IDs
    const reqRes = await fetch(`${GC_BASE}/requisitions/${requisition_id}/`, { headers });
    const reqData = await reqRes.json();

    if (!reqData.accounts || reqData.accounts.length === 0) {
      return res.status(202).json({ status: reqData.status || 'PENDING', accounts: [] });
    }

    // Fetch details + balances + transactions for each account in parallel
    const accounts = await Promise.all(
      reqData.accounts.map(async (accountId) => {
        const [detailRes, balanceRes, txRes] = await Promise.all([
          fetch(`${GC_BASE}/accounts/${accountId}/details/`, { headers }),
          fetch(`${GC_BASE}/accounts/${accountId}/balances/`, { headers }),
          fetch(`${GC_BASE}/accounts/${accountId}/transactions/`, { headers }),
        ]);

        const [detail, balance, tx] = await Promise.all([
          detailRes.json(),
          balanceRes.json(),
          txRes.json(),
        ]);

        const acc = detail.account || {};
        const balanceArr = balance.balances || [];
        const preferred =
          balanceArr.find((b) => b.balanceType === 'interimAvailable') ||
          balanceArr.find((b) => b.balanceType === 'closingBooked') ||
          balanceArr[0];

        const balanceAmount = preferred ? parseFloat(preferred.balanceAmount.amount) : 0;
        const currency = preferred ? preferred.balanceAmount.currency : 'EUR';

        const booked = (tx.transactions?.booked || []).slice(0, 100).map((t) => ({
          id: t.transactionId || t.internalTransactionId || null,
          date: t.bookingDate || t.valueDate || null,
          amount: parseFloat(t.transactionAmount?.amount ?? 0),
          currency: t.transactionAmount?.currency ?? currency,
          description:
            t.remittanceInformationUnstructured ||
            t.remittanceInformationStructuredArray?.[0]?.reference ||
            t.additionalInformation ||
            '',
          creditorName: t.creditorName || null,
          debtorName: t.debtorName || null,
        }));

        return {
          id: accountId,
          iban: acc.iban || '',
          name: acc.name || acc.product || 'ING Account',
          owner: acc.ownerName || '',
          balance: balanceAmount,
          currency,
          transactions: booked,
        };
      })
    );

    return res.status(200).json({ accounts, synced_at: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
