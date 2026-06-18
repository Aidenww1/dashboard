import { checkIngestToken } from './_ingest-auth.js';

const SUPA_URL = process.env.SUPABASE_URL || 'https://nwdyuiimfqhlqscnbqmq.supabase.co';
// Service key (server-only, bypasses RLS) so server ingest keeps writing after the
// Phase 10 RLS cutover. Falls back to the publishable key pre-cutover if the env
// isn't set, so behaviour is unchanged until the service key is configured.
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY || 'sb_publishable_KFOU1sDCxRp8c1M3kSytHg_nuQWzfPT';
const SLEEP_KEY = 'sleep:logs';

async function supaGet(key) {
  const res = await fetch(
    `${SUPA_URL}/rest/v1/app_state?key=eq.${encodeURIComponent(key)}&select=data`,
    { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
  );
  const rows = await res.json();
  return rows?.[0]?.data ?? null;
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
    body: JSON.stringify({ key, data, updated_at: new Date().toISOString(), user_id: process.env.OWNER_UID }),
  });
}

function fmtTime(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function fmtDate(ms) {
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Fail CLOSED: if SLEEP_INGEST_TOKEN is unset the endpoint rejects rather than
  // silently accepting unauthenticated writes (was: `expectedToken && ...` which
  // skipped the check entirely when the env was missing).
  const auth = checkIngestToken(req, 'SLEEP_INGEST_TOKEN');
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const body = req.body || {};

  // Accept either raw timestamps (from MacroDroid) or pre-formatted values
  let { date, bedtime, waketime, duration, score, rem, deep } = body;
  const { start_ms, end_ms } = body;

  if (start_ms && end_ms) {
    const startMs = Number(start_ms);
    const endMs = Number(end_ms);
    bedtime = bedtime || fmtTime(startMs);
    waketime = waketime || fmtTime(endMs);
    date = date || fmtDate(endMs);
    duration = duration || Math.round((endMs - startMs) / 60000);
  }

  if (!date || !duration) {
    return res.status(400).json({ error: 'Provide either (date + duration) or (start_ms + end_ms)' });
  }

  duration = Number(duration);
  if (duration <= 0 || duration > 1200) {
    return res.status(400).json({ error: 'Duration out of range' });
  }

  const entry = {
    id: Date.now(),
    date,
    bedtime: bedtime || null,
    waketime: waketime || null,
    duration,
    score:  score  != null && score  !== '' ? Number(score)  : null,
    rem:    rem    != null && rem    !== '' ? Number(rem)    : null,
    deep:   deep   != null && deep   !== '' ? Number(deep)   : null,
    source: 'macrodroid',
  };

  const existing = (await supaGet(SLEEP_KEY)) || [];
  const updated = [...existing.filter(e => e.date !== date), entry];
  await supaSet(SLEEP_KEY, updated);

  return res.json({ ok: true, entry });
}
