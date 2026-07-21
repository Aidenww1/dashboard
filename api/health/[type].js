import { checkIngestToken } from '../_ingest-auth.js';

const TABLE_MAP = {
  heartrate: 'heart_rate',
  steps: 'steps',
  calories: 'calories',
  sleep: 'sleep',
  height: 'height',
  weight: 'weight',
  oxygensaturation: 'oxygen_saturation',
  exercise: 'exercise',
  sleepstage: 'sleep_stage',
  nutrition: 'nutrition',
  mindfulness: 'mindfulness',
  hrv: 'hrv',
  skintemperature: 'skin_temperature',
  respiratoryrate: 'respiratory_rate',
  floorsclimbed: 'floors_climbed',
  hydration: 'hydration',
  totalcalories: 'total_calories',
  basalmetabolicrate: 'basal_metabolic_rate',
  bodyfat: 'body_fat',
  distance: 'distance',
  mood: 'mood',
  bloodwork: 'bloodwork',
  habits: 'habits',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Ingest-Token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Staged ingest protection: enforces ONLY once HEALTH_INGEST_TOKEN is set, so it
  // can't break the existing Tasker/Health Connect flow until the owner sets the
  // env + adds the token (header X-Ingest-Token or body.token) on the device. While
  // unset the endpoint stays open (documented residual — Phase 10 §6).
  const auth = checkIngestToken(req, 'HEALTH_INGEST_TOKEN', { failOpenWhenUnset: true });
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  if (auth.unprotected) console.warn('health ingest: HEALTH_INGEST_TOKEN unset — endpoint is OPEN');

  const { type } = req.query;
  const table = TABLE_MAP[type?.toLowerCase()];
  if (!table) return res.status(404).json({ error: 'Unknown metric type: ' + type });

  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPA_URL) return res.status(500).json({ error: 'SUPABASE_URL not set' });
  if (!SUPA_KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY not set' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = { raw: body }; }
  }
  if (!body) body = {};

  // Skip empty reads (Health Connect returned nothing for the window). The
  // plugin sends {} or {longValues:{},doubleValues:{},dataOrigins:[]} when a
  // read is greyed-out — storing those makes "today" show 0 on the dashboard.
  function hasData(b) {
    if (!b || typeof b !== 'object') return false;
    const lv = b.longValues || {}, dv = b.doubleValues || {};
    if (Object.keys(lv).length || Object.keys(dv).length) return true;
    if (Array.isArray(b.records) && b.records.length) return true;
    if (Array.isArray(b.samples) && b.samples.length) return true;
    const meta = ['longValues', 'doubleValues', 'dataOrigins', 'records', 'samples'];
    return Object.keys(b).some(k => !meta.includes(k) && b[k] != null
      && !(typeof b[k] === 'object' && Object.keys(b[k]).length === 0));
  }
  if (!hasData(body)) return res.json({ ok: true, skipped: 'empty' });

  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      // Phase 10 RLS: stamp the owner so service-role inserts satisfy the
      // user_id NOT NULL policy. Pre-cutover OWNER_UID is unset -> undefined ->
      // omitted by JSON.stringify -> identical to today. Set OWNER_UID env at cutover.
      body: JSON.stringify({ data: body, user_id: process.env.OWNER_UID }),
    });
    if (!r.ok) {
      const err = await r.text();
      console.error('Health metric insert failed', { table, error: err });
      return res.status(500).json({ error: err });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error('Health metric insert error', { table, error: e.message });
    return res.status(500).json({ error: e.message });
  }
}
