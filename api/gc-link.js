const GC_BASE = 'https://bankaccountdata.gocardless.com/api/v2';
const INSTITUTION_ID = 'ING_NL_INGBNL2A';
const REDIRECT_URL = 'https://dashboard-pi-green-48.vercel.app/finance.html?gc_ref=1';

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

  try {
    const access = await getToken(GC_SECRET_ID, GC_SECRET_KEY);
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${access}` };

    // End-user agreement: 90-day access, full scope
    const agreeRes = await fetch(`${GC_BASE}/agreements/enduser/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        institution_id: INSTITUTION_ID,
        max_historical_days: 90,
        access_valid_for_days: 90,
        access_scope: ['balances', 'details', 'transactions'],
      }),
    });
    const agree = await agreeRes.json();

    // Requisition
    const reqRes = await fetch(`${GC_BASE}/requisitions/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        redirect: REDIRECT_URL,
        institution_id: INSTITUTION_ID,
        reference: `dashboard-${Date.now()}`,
        agreement: agree.id,
        user_language: 'EN',
      }),
    });
    const req2 = await reqRes.json();

    if (!req2.link) return res.status(500).json({ error: 'No link returned', detail: req2 });

    return res.status(200).json({ link: req2.link, requisition_id: req2.id });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
