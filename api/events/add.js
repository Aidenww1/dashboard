export const config = { maxDuration: 20 };

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const NL_MODEL = process.env.CLAUDE_MODEL_FAST || 'claude-haiku-4-5-20251001';

async function insertEvent(row) {
  const r = await fetch(`${SUPA_URL}/rest/v1/events`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    // Phase 10 RLS: stamp owner (OWNER_UID unset pre-cutover -> omitted -> no change).
    body: JSON.stringify({ ...row, user_id: process.env.OWNER_UID }),
  });
  if (!r.ok) throw new Error(await r.text());
  const rows = await r.json();
  return rows[0] || row;
}

async function parseNL(text) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: NL_MODEL,
      max_tokens: 800,
      system: `Parse the user's text into one or more structured life/health events. Return ONLY a JSON array (no markdown) where each item has:
- type: string, e.g. 'workout.set', 'sleep.night', 'nutrition.meal', 'mood.rating', 'body.weight', 'finance.expense', 'supplements.taken', 'skin.routine', 'bloodwork.panel', 'note'
- domains: string array, e.g. ['training'], ['sleep'], ['nutrition'], ['mood'], ['body'], ['finance'], ['supplements'], ['skin'], ['bloodwork']
- data: object with relevant fields (exercise/kg/reps for workout, duration_mins/score for sleep, name/calories for meals, mood/1-5 for mood, kg for weight, etc.)
- note: short human-readable description (optional)
If the text doesn't match any structured event, return [{"type":"note","domains":["general"],"data":{"text":"<original text>"},"note":"<original text>"}].
Today is ${new Date().toISOString().slice(0, 10)}.`,
      messages: [{ role: 'user', content: text }],
    }),
  });
  if (!r.ok) throw new Error(`Claude: ${await r.text()}`);
  const resp = await r.json();
  const raw = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [{ type: 'note', domains: ['general'], data: { text }, note: text }];
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ status: 'ok', ts: new Date().toISOString() });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (!SUPA_URL || !SUPA_KEY) return res.status(500).json({ error: 'Supabase env vars not set' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  // ── NL parse mode ──────────────────────────────────────────────────
  if (body?.text && !body?.type) {
    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
    try {
      const parsed = await parseNL(body.text);
      const ts = new Date().toISOString();
      const events = await Promise.all(parsed.map(e => insertEvent({
        type: e.type,
        domains: Array.isArray(e.domains) ? e.domains : [],
        data: (e.data && typeof e.data === 'object') ? e.data : {},
        source: 'nlp',
        note: e.note || null,
        ts: e.ts || ts,
      })));
      return res.status(200).json({ ok: true, events, parsed_count: events.length });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Lab OCR mode ───────────────────────────────────────────────────
  if (body?.mode === 'lab_ocr') {
    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
    const { image_base64, media_type } = body;
    if (!image_base64) return res.status(400).json({ error: 'image_base64 required' });
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: NL_MODEL,
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: media_type || 'image/jpeg', data: image_base64 },
              },
              {
                type: 'text',
                text: `Extract all lab/bloodwork values from this image. Return ONLY a JSON object where keys are marker names (use these exact keys where applicable: hematocrit, hemoglobin, testosterone, estradiol, lh, fsh, totalCholesterol, ldl, hdl, triglycerides, vitaminD, ferritin, tsh, freeT3, freeT4, glucose, hba1c, crp) and values are numbers. If a marker is not present, omit it. Example: {"hemoglobin": 14.2, "testosterone": 650}`,
              },
            ],
          }],
        }),
      });
      if (!r.ok) throw new Error(`Claude: ${await r.text()}`);
      const resp = await r.json();
      const raw = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
      try {
        const markers = JSON.parse(raw);
        return res.status(200).json({ ok: true, markers });
      } catch {
        return res.status(200).json({ ok: true, markers: {}, raw });
      }
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Structured event mode ──────────────────────────────────────────
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

  try {
    const event = await insertEvent(row);
    return res.status(200).json({ ok: true, event });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
