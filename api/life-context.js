export const config = { maxDuration: 10 };

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

async function sbLatest(table, days = 7, limit = 10) {
  if (!SUPA_URL || !SUPA_KEY) return [];
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const url = `${SUPA_URL}/rest/v1/${table}?select=id,data,created_at&order=created_at.desc&limit=${limit}&created_at=gte.${encodeURIComponent(since)}`;
  try {
    const r = await fetch(url, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } });
    if (!r.ok) return [];
    return await r.json();
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!SUPA_URL || !SUPA_KEY) {
    return res.status(200).json({ error: 'Supabase not configured', as_of: new Date().toISOString().slice(0, 10) });
  }

  const today = new Date().toISOString().slice(0, 10);

  const [weightRows, sleepRows, bloodworkRows, nutritionRows, moodRows, insightRows, hrvRows, stepsRows] = await Promise.all([
    sbLatest('weight', 14, 14),
    sbLatest('sleep', 7, 7),
    sbLatest('bloodwork', 90, 5),
    sbLatest('nutrition', 1, 50),
    sbLatest('mood', 7, 7),
    sbLatest('health_insights', 7, 10),
    sbLatest('hrv', 7, 7),
    sbLatest('steps', 7, 7),
  ]);

  // ── Body weight ──
  const weightKgs = weightRows
    .map(r => r.data?.weight_kg ?? r.data?.value ?? null)
    .filter(v => typeof v === 'number');
  const latestWeight = weightKgs[0] ?? null;
  let weightTrend = null;
  if (weightKgs.length >= 4) {
    const recent = weightKgs.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const older  = weightKgs.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const diff = +(recent - older).toFixed(1);
    weightTrend = (diff > 0 ? '+' : '') + diff + 'kg (7d)';
  }

  // ── Sleep ──
  const sleepHrs = sleepRows
    .map(r => {
      const d = r.data;
      if (d?.duration_hours) return d.duration_hours;
      if (d?.duration_minutes) return +(d.duration_minutes / 60).toFixed(1);
      if (d?.start && d?.end) return +((new Date(d.end) - new Date(d.start)) / 3600000).toFixed(1);
      return null;
    })
    .filter(v => typeof v === 'number' && v > 2 && v < 14);
  const lastSleepHrs = sleepHrs[0] ?? null;
  const avgSleepHrs = sleepHrs.length
    ? +(sleepHrs.reduce((a, b) => a + b, 0) / sleepHrs.length).toFixed(1)
    : null;

  // ── Bloodwork ──
  let latestBloodwork = null;
  if (bloodworkRows.length) {
    const row = bloodworkRows[0];
    latestBloodwork = {
      date: (row.created_at || '').slice(0, 10),
      markers: row.data?.markers ?? row.data ?? {},
    };
  }

  // ── Nutrition today ──
  const todayNutrition = nutritionRows.filter(r => (r.created_at || '').startsWith(today));
  let nutritionToday = null;
  if (todayNutrition.length) {
    let cal = 0, prot = 0, carb = 0, fat = 0;
    for (const r of todayNutrition) {
      const d = r.data;
      cal  += d?.calories ?? d?.kcal ?? 0;
      prot += d?.protein  ?? d?.protein_g ?? 0;
      carb += d?.carbs    ?? d?.carbs_g   ?? 0;
      fat  += d?.fat      ?? d?.fat_g     ?? 0;
    }
    nutritionToday = { calories: Math.round(cal), protein_g: +prot.toFixed(1), carbs_g: +carb.toFixed(1), fat_g: +fat.toFixed(1), entries: todayNutrition.length };
  }

  // ── Mood ──
  const recentMood = moodRows
    .map(r => r.data?.mood ?? r.data?.score ?? null)
    .filter(v => typeof v === 'number')
    .slice(0, 7);

  // ── Insights ──
  const recentInsights = insightRows.map(r => ({
    category: r.data?.category,
    severity: r.data?.severity,
    text: r.data?.text,
    date: (r.created_at || '').slice(0, 10),
  }));

  // ── HRV ──
  const hrvVals = hrvRows
    .map(r => r.data?.hrv ?? r.data?.value ?? null)
    .filter(v => typeof v === 'number' && v > 0);
  const latestHrv = hrvVals[0] ?? null;
  const avgHrv7d = hrvVals.length
    ? +Math.round(hrvVals.reduce((a, b) => a + b, 0) / hrvVals.length)
    : null;

  // ── Steps ──
  const stepsToday = stepsRows
    .filter(r => (r.created_at || '').startsWith(today))
    .reduce((s, r) => s + (r.data?.steps ?? r.data?.value ?? 0), 0) || null;
  const stepsAvg7d = stepsRows.length
    ? Math.round(stepsRows.reduce((s, r) => s + (r.data?.steps ?? r.data?.value ?? 0), 0) / stepsRows.length)
    : null;

  const ctx = {
    as_of: today,
    body: {
      latest_weight_kg: latestWeight,
      weight_trend: weightTrend,
    },
    sleep: {
      last_night_hrs: lastSleepHrs,
      avg_7d_hrs: avgSleepHrs,
    },
    bloodwork: latestBloodwork,
    nutrition_today: nutritionToday,
    mood_recent_7d: recentMood,
    insights_recent: recentInsights,
    hrv: { latest_ms: latestHrv, avg_7d_ms: avgHrv7d },
    steps: { today: stepsToday, avg_7d: stepsAvg7d },
  };

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  return res.status(200).json(ctx);
}
