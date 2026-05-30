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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

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

  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ data: body }),
    });
    if (!r.ok) {
      const err = await r.text();
      console.error(`Insert failed for ${table}:`, err);
      return res.status(500).json({ error: err });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error(`Error inserting into ${table}:`, e.message);
    return res.status(500).json({ error: e.message });
  }
}
