const SUPA_URL = 'https://nwdyuiimfqhlqscnbqmq.supabase.co';
const SUPA_KEY = 'sb_publishable_KFOU1sDCxRp8c1M3kSytHg_nuQWzfPT';
const KEY = 'watch:data';

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
    body: JSON.stringify({ key, data, updated_at: new Date().toISOString() }),
  });
}

function mergeDay(arr, key, newEntry) {
  if (!newEntry) return arr || [];
  const existing = (arr || []).filter(e => e[key] !== newEntry[key]);
  return [...existing, newEntry].sort((a, b) => a[key] > b[key] ? 1 : -1);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sync-Token');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const data = await supaGet(KEY);
    if (!data) return res.json({ syncTime: null });
    return res.json(data);
  }

  if (req.method === 'POST') {
    const expectedToken = process.env.HEALTH_SYNC_TOKEN;
    const body = req.body || {};
    const providedToken = req.headers['x-sync-token'] || body.token;
    if (expectedToken && providedToken !== expectedToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      date, steps, heart_rate_bpm, heart_rate_time,
      sleep_hours, sleep_start_ms, sleep_end_ms,
      calories_kcal, weight_kg, spo2_pct,
    } = body;

    if (!date) return res.status(400).json({ error: 'date required (YYYY-MM-DD)' });

    const now = Date.now();
    const existing = (await supaGet(KEY)) || {};

    const updated = {
      steps: mergeDay(existing.steps, 'date',
        steps != null ? { date, steps: Number(steps) } : null),
      heartRate: mergeDay(existing.heartRate, 'time',
        heart_rate_bpm != null ? { time: Number(heart_rate_time || now), bpm: Number(heart_rate_bpm) } : null),
      sleep: (() => {
        if (sleep_hours == null) return existing.sleep || [];
        const start = Number(sleep_start_ms || 0);
        const end = Number(sleep_end_ms || 0);
        const entry = { start, end, hours: Number(sleep_hours) };
        const arr = (existing.sleep || []).filter(s => {
          const d = new Date(s.start || 0).toISOString().slice(0, 10);
          return d !== date;
        });
        return [...arr, entry].sort((a, b) => a.start - b.start);
      })(),
      calories: mergeDay(existing.calories, 'date',
        calories_kcal != null ? { date, kcal: Math.round(Number(calories_kcal)) } : null),
      weight: mergeDay(existing.weight, 'time',
        weight_kg != null ? { time: now, kg: Number(weight_kg) } : null),
      oxygenSat: mergeDay(existing.oxygenSat, 'time',
        spo2_pct != null ? { time: now, pct: Number(spo2_pct) } : null),
      exercises: existing.exercises || [],
      syncTime: now,
    };

    await supaSet(KEY, updated);
    return res.json({ ok: true, syncTime: now });
  }

  res.status(405).end();
}
