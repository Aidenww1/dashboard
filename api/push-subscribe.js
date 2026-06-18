/* ============================================================
   Push subscription registry.
     GET    -> { publicKey }            (client needs it to subscribe)
     POST   { subscription }            store/dedup by endpoint
     DELETE { endpoint }                remove one
   Subscriptions live in Supabase app_state key 'push:subs:v1'
   as { subs: [PushSubscriptionJSON, ...] }.
   ============================================================ */
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
const KEY = 'push:subs:v1';

async function readSubs() {
  const r = await fetch(`${SUPA_URL}/rest/v1/app_state?select=data&key=eq.${KEY}&limit=1`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
  });
  if (!r.ok) return [];
  const rows = await r.json();
  return (rows[0] && rows[0].data && rows[0].data.subs) || [];
}

async function writeSubs(subs) {
  return fetch(`${SUPA_URL}/rest/v1/app_state?on_conflict=key`, {
    method: 'POST',
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key: KEY, data: { subs }, updated_at: new Date().toISOString(), user_id: process.env.OWNER_UID }),
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
  }

  if (!SUPA_URL || !SUPA_KEY) return res.status(500).json({ error: 'Supabase env vars not set' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};

  if (req.method === 'POST') {
    const sub = body.subscription || body;
    if (!sub || !sub.endpoint) return res.status(400).json({ error: 'No subscription endpoint' });
    const subs = await readSubs();
    const next = subs.filter(s => s.endpoint !== sub.endpoint);
    next.push(sub);
    const w = await writeSubs(next);
    if (!w.ok) return res.status(502).json({ error: await w.text() });
    return res.status(200).json({ ok: true, count: next.length });
  }

  if (req.method === 'DELETE') {
    const endpoint = body.endpoint;
    if (!endpoint) return res.status(400).json({ error: 'No endpoint' });
    const subs = await readSubs();
    const next = subs.filter(s => s.endpoint !== endpoint);
    const w = await writeSubs(next);
    if (!w.ok) return res.status(502).json({ error: await w.text() });
    return res.status(200).json({ ok: true, count: next.length });
  }

  return res.status(405).end();
}
