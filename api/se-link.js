const SE_BASE   = 'https://www.saltedge.com/api/v5';
const SUPA_URL  = 'https://nwdyuiimfqhlqscnbqmq.supabase.co';
const SUPA_KEY  = 'sb_publishable_KFOU1sDCxRp8c1M3kSytHg_nuQWzfPT';
const REDIRECT  = 'https://dashboard-pi-green-48.vercel.app/finance.html?se_ref=1';
// ING Netherlands provider code in Salt Edge.
// Verify via: GET /api/v5/providers?country_code=NL&search=ING after signing up.
const PROVIDER  = 'ing_nl';

function seHeaders(customerSecret) {
  const h = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'App-id': process.env.SE_APP_ID,
    Secret: process.env.SE_SECRET,
  };
  if (customerSecret) h['Customer-secret'] = customerSecret;
  return h;
}

async function supaGet(key) {
  const res = await fetch(
    `${SUPA_URL}/rest/v1/app_state?key=eq.${encodeURIComponent(key)}&select=data`,
    { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
  );
  const rows = await res.json();
  return rows && rows[0] ? rows[0].data : null;
}

async function supaSet(key, data) {
  await fetch(`${SUPA_URL}/rest/v1/app_state`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ key, data, updated_at: new Date().toISOString() }),
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { SE_APP_ID, SE_SECRET } = process.env;
  if (!SE_APP_ID || !SE_SECRET) {
    return res.status(500).json({ error: 'SE_APP_ID / SE_SECRET not set in Vercel env vars' });
  }

  try {
    // Load or create the Salt Edge customer (stored in Supabase)
    let customer = await supaGet('se_customer');

    if (!customer) {
      const cRes = await fetch(`${SE_BASE}/customers`, {
        method: 'POST',
        headers: seHeaders(),
        body: JSON.stringify({ data: { identifier: `dashboard-user-${Date.now()}` } }),
      });
      const cData = await cRes.json();
      if (!cData.data) return res.status(500).json({ error: 'Customer creation failed', detail: cData });
      customer = { id: cData.data.id, secret: cData.data.secret };
      await supaSet('se_customer', customer);
    }

    // Create a connect session for ING NL
    const today = new Date();
    const fromDate = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
      .toISOString().slice(0, 10); // 1 year of history

    const sessionRes = await fetch(`${SE_BASE}/connect_sessions/create`, {
      method: 'POST',
      headers: seHeaders(customer.secret),
      body: JSON.stringify({
        data: {
          customer_id: customer.id,
          consent: {
            scopes: ['account_details', 'transactions_details'],
            from_date: fromDate,
          },
          return_to: REDIRECT,
          provider_code: PROVIDER,
        },
      }),
    });
    const sessionData = await sessionRes.json();

    if (!sessionData.data || !sessionData.data.connect_url) {
      return res.status(500).json({ error: 'No connect_url returned', detail: sessionData });
    }

    return res.status(200).json({ connect_url: sessionData.data.connect_url });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
