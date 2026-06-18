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

// Publishable (anon) key for verifying a user session against Supabase Auth.
const PUBLISHABLE = process.env.SUPABASE_ANON_KEY || 'sb_publishable_KFOU1sDCxRp8c1M3kSytHg_nuQWzfPT';

// Validate a Supabase session JWT (Authorization: Bearer <token>) by asking the
// auth server who it belongs to. Returns the user or null.
async function verifySession(req) {
  const authz = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const m = /^Bearer\s+(.+)$/i.exec(authz);
  if (!m) return null;
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { apikey: PUBLISHABLE, Authorization: 'Bearer ' + m[1] } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch (_) { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
  }

  if (!SUPA_URL || !SUPA_KEY) return res.status(500).json({ error: 'Supabase env vars not set' });

  // Staged session gate (Phase 10): only enforced once PUSH_REQUIRE_AUTH is set, so
  // the current pre-auth browser flow keeps working until the client sends the
  // session token. Prevents an attacker registering their endpoint to receive the
  // owner's briefing pushes, or deleting the owner's subscriptions.
  if (process.env.PUSH_REQUIRE_AUTH && (req.method === 'POST' || req.method === 'DELETE')) {
    const user = await verifySession(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
  }

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
