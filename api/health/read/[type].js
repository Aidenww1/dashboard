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
  apiusage: 'api_usage',
  insights: 'health_insights',
  calendarevents: 'calendar_events',
  mood: 'mood',
  bloodwork: 'bloodwork',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const { type, limit: limitParam, days: daysParam } = req.query;
  const table = TABLE_MAP[type?.toLowerCase()];
  if (!table) return res.status(404).json({ error: 'Unknown metric type: ' + type });

  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPA_URL) return res.status(500).json({ error: 'SUPABASE_URL not set' });
  if (!SUPA_KEY) return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY not set' });

  const limit = Math.min(parseInt(limitParam) || 50, 500);
  let url = `${SUPA_URL}/rest/v1/${table}?select=id,data,created_at&order=created_at.desc&limit=${limit}`;
  if (daysParam) {
    const since = new Date(Date.now() - parseInt(daysParam) * 86400000).toISOString();
    url += `&created_at=gte.${encodeURIComponent(since)}`;
  }

  try {
    const r = await fetch(url, {
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
      },
    });
    if (!r.ok) {
      const err = await r.text();
      return res.status(500).json({ error: err });
    }
    const rows = await r.json();
    return res.json({ ok: true, rows });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
