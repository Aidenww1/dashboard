export const config = { maxDuration: 10 };

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (!SUPA_URL || !SUPA_KEY) return res.status(500).json({ error: 'Supabase env vars not set' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  const { type, domains, data, source, note, ts } = body || {};
  if (!type) return res.status(400).json({ error: 'type required' });

  const row = {
    type,
    domains: Array.isArray(domains) ? domains : [],
    data: (data && typeof data === 'object') ? data : {},
    source: source || 'manual',
    note: note || null,
    ts: ts || new Date().toISOString(),
  };

  const r = await fetch(`${SUPA_URL}/rest/v1/events`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });

  if (!r.ok) return res.status(500).json({ error: await r.text() });

  const rows = await r.json();
  return res.status(200).json({ ok: true, event: rows[0] || row });
}
