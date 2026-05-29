export const config = { maxDuration: 20 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ clientId: process.env.GOOGLE_CLIENT_ID || '' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { text, today, tz } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });

  const todayStr = today || new Date().toISOString().slice(0, 10);
  const tzStr = tz || 'Europe/Amsterdam';

  const prompt = `Parse this natural-language calendar event into a JSON object.
Today is ${todayStr}. The user's timezone is ${tzStr}.

Rules:
- "tomorrow" = next day from today, "next week" = 7 days out
- If no time given: allDay = true, omit start/end time portions
- If time given but no end: assume 1 hour (meetings), 30 min (calls/quick tasks)
- Use ISO 8601 with the correct timezone offset for ${tzStr}
- Do not include markdown, code fences, or any explanation — only raw JSON

Input: "${text.replace(/"/g, "'")}"

Required output format (all fields required):
{"title":"string","start":"ISO8601","end":"ISO8601","allDay":false,"description":"string"}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL_FAST || 'claude-haiku-4-5-20251001',
        max_tokens: 250,
        temperature: 0.1,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: body.error?.message || 'Claude API error' });
    }

    const data = await r.json();
    const raw = (data.content?.[0]?.text || '').trim();
    const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(jsonStr);
    if (!parsed.title || !parsed.start) {
      return res.status(500).json({ error: 'Invalid response: ' + raw.slice(0, 80) });
    }
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(503).json({ error: e.message });
  }
}
