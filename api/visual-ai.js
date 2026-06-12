export const config = { maxDuration: 45 };

// Generic visual analysis endpoint: body progress (and later skin) photos.
// Analyze is explicit user action; nothing here persists data — the client
// shows the report and only saves after the user taps Log.
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' }); return; }

  const { kind, image, mimeType, prevImage, prevMimeType, tags, context } = req.body || {};
  if (!image) { res.status(400).json({ error: 'Provide an image' }); return; }

  const t = tags || {};
  const c = context || {};

  const safety = [
    'Safety and honesty rules:',
    '- Never claim exact body fat percentage, exact muscle gain, or exact weight change from a photo.',
    '- Never diagnose any medical or skin condition.',
    '- State confidence honestly. Different lighting, pose, angle, pump, bloating or time of day lower confidence; say so explicitly.',
    '- Direct, short, practical tone. No motivation fluff.',
  ].join('\n');

  const skinPrompt = [
    'You are analyzing a skin photo for a personal skincare log.',
    t.area ? `Area: ${t.area}.` : '',
    t.ampm ? `Taken ${t.ampm}.` : '',
    c.products ? `Active products/routine: ${c.products}.` : '',
    c.adherencePct != null ? `Routine adherence last 7 days: ${c.adherencePct}%.` : '',
    c.recentChanges ? `Recent product changes: ${c.recentChanges}.` : '',
    prevImage
      ? `The FIRST image is a previous photo of the same area${c.prevDate ? ` taken ${c.prevDate}` : ''}. The SECOND image is today's. Compare them.`
      : 'No previous photo of this area exists; analyze the single photo.',
    '',
    safety,
    '- Never name a skin disease or condition. Describe what is visible (redness, dryness, texture, breakouts) and possible product/behavior correlations only.',
    '- If something looks like it needs professional attention, say "consider seeing a professional" without naming a condition.',
    '',
    'Reply with ONLY a JSON object, no markdown fences:',
    '{"summary":"2-3 sentence overall skin status","findings":["visible irritation/redness/dryness/texture observations"],"comparison":"vs previous photo, or why not possible","product_correlation":"possible link to listed products/changes, or none","confidence":"low|medium|high","quality_notes":["lighting/angle/distance factors"],"next_action":"one concrete suggested action","professional":"yes or no - whether professional input seems worth it","data_wanted":"what extra data would raise confidence"}',
  ].filter(Boolean).join('\n');

  const bodyPrompt = [
    'You are analyzing a body progress photo for a personal fitness log.',
    t.angle ? `Angle: ${t.angle}.` : '',
    t.flexed != null ? `Flexed: ${t.flexed ? 'yes' : 'no'}.` : '',
    t.weightKg ? `Scale weight today: ${t.weightKg} kg.` : '',
    t.lighting ? `Lighting/pose note: ${t.lighting}.` : '',
    t.pump ? 'Taken after training (pumped).' : '',
    c.goal ? `Current goal: ${c.goal}.` : '',
    c.weightTrend ? `7-day weight trend: ${c.weightTrend}.` : '',
    prevImage
      ? `The FIRST image is the previous photo of the same angle${c.prevDate ? ` taken ${c.prevDate}` : ''}${c.prevWeightKg ? ` at ${c.prevWeightKg} kg` : ''}. The SECOND image is today's photo. Compare them.`
      : 'No previous photo of this angle exists, so there is nothing to compare against; analyze the single photo and say comparison will be possible from the next photo on.',
    '',
    safety,
    '',
    'Reply with ONLY a JSON object, no markdown fences:',
    '{"summary":"2-3 sentence overall visual summary","comparison":"what changed vs the previous photo, or why no comparison is possible","changes":["visible change 1","..."],"confidence":"low|medium|high","quality_notes":["lighting/pose/pump/etc factors affecting reliability"],"explanations":["plausible reasons for what is visible"],"goal_relation":"how this relates to the stated goal","next_action":"one concrete suggested action","data_wanted":"what extra data would raise confidence"}',
  ].filter(Boolean).join('\n');

  const content = [];
  if (prevImage) content.push({ type: 'image', source: { type: 'base64', media_type: prevMimeType || 'image/jpeg', data: prevImage } });
  content.push({ type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: image } });
  content.push({ type: 'text', text: kind === 'skin' ? skinPrompt : bodyPrompt });

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      // Visual progress interpretation is a high-complexity task: smart model.
      model: process.env.CLAUDE_MODEL_SMART || 'claude-sonnet-4-6',
      max_tokens: 800,
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
  const m = text.match(/\{[\s\S]*\}/);
  let report = null;
  if (m) { try { report = JSON.parse(m[0]); } catch {} }
  if (!report) { res.status(500).json({ error: 'Could not parse analysis', raw: text.slice(0, 200) }); return; }

  res.json({ kind: kind || 'body_progress', report, usage: data.usage });
}
