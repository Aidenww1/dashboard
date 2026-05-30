const SE_BASE  = 'https://www.saltedge.com/api/v5';
const SUPA_URL = 'https://nwdyuiimfqhlqscnbqmq.supabase.co';
const SUPA_KEY = 'sb_publishable_KFOU1sDCxRp8c1M3kSytHg_nuQWzfPT';

function seHeaders(customerSecret) {
  return {
    Accept: 'application/json',
    'App-id': process.env.SE_APP_ID,
    Secret: process.env.SE_SECRET,
    'Customer-secret': customerSecret,
  };
}

async function supaGet(key) {
  const res = await fetch(
    `${SUPA_URL}/rest/v1/app_state?key=eq.${encodeURIComponent(key)}&select=data`,
    { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
  );
  const rows = await res.json();
  return rows && rows[0] ? rows[0].data : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { SE_APP_ID, SE_SECRET } = process.env;
  if (!SE_APP_ID || !SE_SECRET) {
    return res.status(500).json({ error: 'SE_APP_ID / SE_SECRET not set in Vercel env vars' });
  }

  const { connection_id } = req.query;
  if (!connection_id) return res.status(400).json({ error: 'connection_id is required' });

  try {
    const customer = await supaGet('se_customer');
    if (!customer) return res.status(400).json({ error: 'No Salt Edge customer found — connect ING first' });

    const headers = seHeaders(customer.secret);

    // Fetch all accounts for this connection
    const accRes = await fetch(`${SE_BASE}/accounts?connection_id=${connection_id}`, { headers });
    const accData = await accRes.json();
    const accounts = accData.data || [];

    if (!accounts.length) {
      return res.status(202).json({ accounts: [], message: 'No accounts found yet — try again shortly' });
    }

    // Fetch transactions for each account in parallel
    const result = await Promise.all(
      accounts.map(async (acc) => {
        const txRes = await fetch(
          `${SE_BASE}/transactions?account_id=${acc.id}&per_page=100`,
          { headers }
        );
        const txData = await txRes.json();
        const transactions = (txData.data || []).map((t) => ({
          id: t.id,
          date: t.made_on,
          amount: t.amount,
          currency: t.currency_code,
          description: t.description || '',
          category: t.category || null,
        }));

        return {
          id: acc.id,
          name: acc.name || acc.nature || 'ING Account',
          nature: acc.nature, // 'account', 'savings', etc.
          balance: acc.balance,
          currency: acc.currency_code,
          iban: acc.extra?.iban || '',
          transactions,
        };
      })
    );

    return res.status(200).json({ accounts: result, synced_at: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
