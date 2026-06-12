export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' }); return; }

  const { image, mimeType, description, weight, restaurant } = req.body || {};
  if (!image && !description) { res.status(400).json({ error: 'Provide an image or description' }); return; }

  const promptText = [
    'Analyze this food and return nutritional data as a JSON array.',
    weight ? `The total portion weighs ${weight}g. Return values FOR THIS ENTIRE PORTION (not per 100g).` : 'Estimate a typical single serving size in grams for each item.',
    restaurant ? 'This is a RESTAURANT meal: portions are usually larger and cooked with more oil, butter and sugar than home cooking. Estimate on the generous side (typically +20-30% calories and fat vs a home-cooked equivalent).' : '',
    description ? `User describes it as: "${description}"` : '',
    'If multiple distinct foods are present, include one object per food. If only one food, still return an array with one element.',
    'Return ONLY a JSON array — no markdown fences, no extra text:',
    '[{"name":"specific food name","servingSize":<grams>,"servingUnit":"g","calories":<int>,"protein":<decimal>,"carbs":<decimal>,"fat":<decimal>,"fiber":<decimal>,"sodium":<int mg>}]',
  ].filter(Boolean).join('\n');

  const content = image
    ? [
        { type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: image } },
        { type: 'text', text: promptText },
      ]
    : promptText;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL_FAST || 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content }],
    }),
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    res.status(r.status).json({ error: err.error?.message || 'Claude API error' });
    return;
  }

  const data = await r.json();
  const text = (data.content?.[0]?.text || '').trim();

  let parsed = null;
  const arrMatch = text.match(/\[[\s\S]*\]/);
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (arrMatch) { try { parsed = JSON.parse(arrMatch[0]); } catch {} }
  if (!parsed && objMatch) { try { parsed = JSON.parse(objMatch[0]); } catch {} }
  if (!parsed) { res.status(500).json({ error: 'Could not parse AI response', raw: text.slice(0, 200) }); return; }

  res.json({ items: Array.isArray(parsed) ? parsed : [parsed] });
}
