import { sendPushToAll } from '../_webpush.js';

export const config = { maxDuration: 60 };

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const TABLE_MAP = {
  heartrate: 'heart_rate', steps: 'steps', calories: 'calories',
  sleep: 'sleep', height: 'height', weight: 'weight',
  oxygensaturation: 'oxygen_saturation', exercise: 'exercise',
  sleepstage: 'sleep_stage', nutrition: 'nutrition', mindfulness: 'mindfulness',
  hrv: 'hrv', skintemperature: 'skin_temperature', respiratoryrate: 'respiratory_rate',
  floorsclimbed: 'floors_climbed', hydration: 'hydration',
  totalcalories: 'total_calories', basalmetabolicrate: 'basal_metabolic_rate',
  bodyfat: 'body_fat', distance: 'distance', bloodwork: 'bloodwork',
  mood: 'mood', insights: 'health_insights', calendar: 'calendar_events',
};

const MODELS = {
  fast: process.env.CLAUDE_MODEL_FAST || 'claude-haiku-4-5-20251001',
  smart: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
};

const RATES = {
  'claude-haiku-4-5-20251001': { in: 0.80, out: 4.00 },
  'claude-sonnet-4-6': { in: 3.00, out: 15.00 },
};

async function logUsage(model, inputTokens, outputTokens, mode, eventType) {
  const rates = RATES[model] || RATES['claude-haiku-4-5-20251001'];
  const costUsd = +((inputTokens * rates.in + outputTokens * rates.out) / 1_000_000).toFixed(7);
  return sbWrite('api_usage', {
    model, input_tokens: inputTokens, output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens, cost_usd: costUsd,
    mode: mode || 'agent', event_type: eventType || null,
  });
}

const TOOLS = [
  {
    name: 'read_health_data',
    description: 'Read recent rows from any health metric table. Use this to get context before deciding what to write.',
    input_schema: {
      type: 'object',
      properties: {
        metric: { type: 'string', description: 'Metric name — any of: nutrition, hydration, steps, sleep, exercise, totalcalories, weight, heartrate, distance, floorsclimbed, bloodwork, mood, insights, hrv, oxygensaturation, skintemperature, respiratoryrate, mindfulness, sleepstage, bodyfat, height, basalmetabolicrate, calories, calendar' },
        days: { type: 'number', description: 'How many days back to read (default 7)' },
        limit: { type: 'number', description: 'Max rows (default 20)' },
      },
      required: ['metric'],
    },
  },
  {
    name: 'write_health_data',
    description: 'Write derived or enriched data to any health metric table. Use for water content from food, energy estimates, derived nutrition values, enriched workout data, etc.',
    input_schema: {
      type: 'object',
      properties: {
        metric: { type: 'string', description: 'Table to write to: hydration, nutrition, insights, calendar, mood, etc.' },
        data: { type: 'object', description: 'Data object — any shape, stored in jsonb. Be descriptive with field names.' },
      },
      required: ['metric', 'data'],
    },
  },
  {
    name: 'add_water',
    description: 'Credit water intake derived from food, exercise compensation, or beverages. Adds to daily hydration total which shows in water.html.',
    input_schema: {
      type: 'object',
      properties: {
        ml: { type: 'number', description: 'Millilitres to add' },
        source: { type: 'string', description: 'Why this water is being credited: food_water_content, exercise_sweat_compensation, beverage, etc.' },
        note: { type: 'string', description: 'Human-readable note shown in the dashboard' },
      },
      required: ['ml', 'source'],
    },
  },
  {
    name: 'save_insight',
    description: 'Save a health insight, correlation, or recommendation to display in the dashboard. Use when you spot patterns, trends, or have actionable advice.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'nutrition, exercise, sleep, bloodwork, hydration, energy, general' },
        text: { type: 'string', description: 'The insight text shown to the user. Be specific and actionable.' },
        severity: { type: 'string', enum: ['info', 'tip', 'warning', 'alert'], description: 'info=neutral fact, tip=recommendation, warning=concern to watch, alert=action needed now' },
        metrics: { type: 'array', items: { type: 'string' }, description: 'Which metrics this insight relates to, e.g. ["sleep", "exercise"]' },
      },
      required: ['category', 'text', 'severity'],
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Queue a Google Calendar event. Events are queued in Supabase and synced to Google Calendar from the frontend.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        date: { type: 'string', description: 'ISO date: YYYY-MM-DD' },
        start_time: { type: 'string', description: 'HH:MM 24h, omit if all-day' },
        end_time: { type: 'string', description: 'HH:MM 24h' },
        description: { type: 'string' },
        all_day: { type: 'boolean' },
        category: { type: 'string', description: 'health, nutrition, workout, reminder, bloodwork' },
      },
      required: ['title', 'date'],
    },
  },
  {
    name: 'get_today_summary',
    description: 'Get everything logged today across all metrics. Use at the start of analysis to understand what happened today.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'read_finance_data',
    description: 'Read the user\'s full finance data: bank accounts, stocks, crypto, other assets, subscriptions, transactions, income, savings goals, wishlist, net worth history. Call this for any finance/money question.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'read_events',
    description: 'Read recent rows from the unified events table. Covers manually-logged data across all domains: training, sleep, mood, body, nutrition, finance, supplements, skin, bloodwork, ai. Use to find cross-domain patterns.',
    input_schema: {
      type: 'object',
      properties: {
        type_prefix: { type: 'string', description: 'Filter by event type prefix, e.g. "workout", "sleep", "mood", "nutrition", "bloodwork", "ai". Omit to get all.' },
        days: { type: 'number', description: 'How many days back (default 7)' },
        limit: { type: 'number', description: 'Max rows (default 30)' },
      },
      required: [],
    },
  },
  {
    name: 'save_briefing',
    description: 'Save the daily briefing as an ai.briefing event so it can be displayed on the dashboard. Call once per briefing run with the final text.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Full briefing text to display on the dashboard.' },
        sections: { type: 'array', items: { type: 'string' }, description: 'Optional array of section labels covered.' },
      },
      required: ['text'],
    },
  },
  {
    name: 'save_flag',
    description: 'Save an anomaly, out-of-range marker, or important warning as an ai.flag event. Flags surface prominently on the dashboard.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The flag message shown to the user. Be specific: what, why it matters, what to do.' },
        severity: { type: 'string', enum: ['info', 'warning', 'alert'], description: 'warning=watch this, alert=act now' },
        domains: { type: 'array', items: { type: 'string' }, description: 'Domains this flag touches, e.g. ["bloodwork","supplements"]' },
        metric: { type: 'string', description: 'Specific metric or marker name, e.g. "hematocrit", "weight", "hba1c"' },
      },
      required: ['text', 'severity'],
    },
    // Prompt caching: breakpoint on the last tool caches the whole TOOLS array
    // (tools render first in the prompt prefix).
    cache_control: { type: 'ephemeral' },
  },
];

// Build a system param with the stable prompt cached and volatile context
// (date, page context) in a separate uncached block after the breakpoint.
function cachedSystem(stableText, dynamicText) {
  const blocks = [{ type: 'text', text: stableText, cache_control: { type: 'ephemeral' } }];
  if (dynamicText) blocks.push({ type: 'text', text: dynamicText });
  return blocks;
}

async function sbRead(metric, days = 7, limit = 20) {
  const table = TABLE_MAP[metric.toLowerCase()] || metric.toLowerCase();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const url = `${SUPA_URL}/rest/v1/${table}?select=id,data,created_at&order=created_at.desc&limit=${limit}&created_at=gte.${encodeURIComponent(since)}`;
  const r = await fetch(url, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } });
  if (!r.ok) return { error: `${table}: ${await r.text()}` };
  return await r.json();
}

async function sbReadAppState(key) {
  const url = `${SUPA_URL}/rest/v1/app_state?select=data,updated_at&key=eq.${encodeURIComponent(key)}&limit=1`;
  const r = await fetch(url, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } });
  if (!r.ok) return { error: `app_state: ${await r.text()}` };
  const rows = await r.json();
  return rows[0] || { error: 'no data found' };
}

async function sbWrite(metric, data) {
  const table = TABLE_MAP[metric.toLowerCase()] || metric.toLowerCase();
  const r = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ data }),
  });
  if (!r.ok) return { error: `${table}: ${await r.text()}` };
  return { ok: true, table };
}

async function executeTool(name, input) {
  try {
    switch (name) {
      case 'read_health_data':
        return await sbRead(input.metric, input.days || 7, input.limit || 20);

      case 'write_health_data':
        return await sbWrite(input.metric, input.data);

      case 'add_water':
        return await sbWrite('hydration', {
          ml: input.ml,
          source: input.source,
          note: input.note || '',
          auto_credited: true,
          credited_at: new Date().toISOString(),
        });

      case 'save_insight':
        return await sbWrite('health_insights', {
          category: input.category,
          text: input.text,
          severity: input.severity,
          metrics: input.metrics || [],
          created_by: 'agent',
        });

      case 'create_calendar_event':
        return await sbWrite('calendar_events', {
          title: input.title,
          date: input.date,
          start_time: input.start_time || null,
          end_time: input.end_time || null,
          description: input.description || '',
          all_day: input.all_day ?? !input.start_time,
          category: input.category || 'health',
          gcal_pending: true,
          created_by: 'agent',
        });

      case 'get_today_summary': {
        const today = new Date().toISOString().slice(0, 10);
        const metrics = ['nutrition', 'hydration', 'steps', 'exercise', 'sleep', 'totalcalories', 'mood'];
        const results = {};
        await Promise.all(metrics.map(async m => {
          const rows = await sbRead(m, 1, 20);
          results[m] = Array.isArray(rows)
            ? rows.filter(r => r.created_at?.startsWith(today))
            : [];
        }));
        return results;
      }

      case 'read_finance_data':
        return await sbReadAppState('finance-app');

      case 'read_events': {
        const since = new Date(Date.now() - (input.days || 7) * 86400000).toISOString();
        let url = `${SUPA_URL}/rest/v1/events?select=type,domains,data,ts,source,note&order=ts.desc&limit=${input.limit || 30}&ts=gte.${encodeURIComponent(since)}`;
        if (input.type_prefix) url += `&type=like.${encodeURIComponent(input.type_prefix + '*')}`;
        const r = await fetch(url, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } });
        if (!r.ok) return { error: await r.text() };
        return await r.json();
      }

      case 'save_briefing': {
        const row = {
          type: 'ai.briefing',
          domains: ['ai'],
          data: { text: input.text, sections: input.sections || [], generated_at: new Date().toISOString() },
          source: 'ai',
          note: null,
          ts: new Date().toISOString(),
        };
        const r = await fetch(`${SUPA_URL}/rest/v1/events`, {
          method: 'POST',
          headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(row),
        });
        if (r.ok) {
          // stash the briefing where the SW can read it, then push a tickle to subscribed devices
          try {
            await fetch(`${SUPA_URL}/rest/v1/app_state?on_conflict=key`, {
              method: 'POST',
              headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
              body: JSON.stringify({ key: 'push:briefing:v1', data: { text: input.text, at: new Date().toISOString(), date: new Date().toISOString().slice(0, 10) }, updated_at: new Date().toISOString() }),
            });
            await sendPushToAll();
          } catch (e) { /* push failure must never fail the briefing */ }
        }
        return r.ok ? { ok: true } : { error: await r.text() };
      }

      case 'save_flag': {
        const row = {
          type: 'ai.flag',
          domains: Array.isArray(input.domains) ? input.domains : ['ai'],
          data: { text: input.text, severity: input.severity, metric: input.metric || null },
          source: 'ai',
          note: input.text,
          ts: new Date().toISOString(),
        };
        const r = await fetch(`${SUPA_URL}/rest/v1/events`, {
          method: 'POST',
          headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(row),
        });
        return r.ok ? { ok: true } : { error: await r.text() };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e.message };
  }
}

const SYSTEM = `You are an autonomous personal health intelligence agent. You have full read and write access to the user's health database and can queue Google Calendar events.

When you receive a health event or daily_summary trigger you MUST:
1. Call get_today_summary and read_events (last 7-14 days) for cross-domain context
2. Derive ALL secondary data without being asked:
   - Food logged → add_water (200-400ml per main meal), estimate energy curve
   - Workout logged → add_water for sweat compensation (~500ml/30min intense), calendar event
   - Sleep synced → save insight on quality + energy forecast
   - Weight logged → check 30-day trend, save insight if trending
   - Bloodwork imported → check every marker against reference ranges; call save_flag (severity=alert) for any out-of-range value with the marker name and context
3. Cross-domain pattern analysis: look at sleep vs mood, training load vs weight, nutrition vs energy — call save_insight for any real pattern you find spanning ≥2 domains
4. Anomaly detection: weight swings >1kg/day, sleep <5h consecutive nights, no nutrition logged in 3+ days, bloodwork markers outside range → save_flag
5. For daily_summary trigger: call read_events broadly, synthesize a concise morning briefing (what happened yesterday, what to focus on today, 1-2 specific action items), then call save_briefing with the final text
6. Save insights for patterns; save flags for anomalies and out-of-range markers

Be specific — not "you slept well" but "7.2h sleep — your avg is 6.8h. High readiness day, good for a hard session."

Act now, don't ask for confirmation.`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Cron GET handler (Vercel crons send GET) ──
  if (req.method === 'GET') {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth = req.headers.authorization;
      if (auth !== `Bearer ${cronSecret}`) return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!ANTHROPIC_KEY || !SUPA_URL || !SUPA_KEY) return res.status(500).json({ error: 'Missing env vars' });
    const isEvening = req.query?.briefing === 'evening' || new Date().getUTCHours() >= 15;
    req.method = 'POST';
    req.body = isEvening
      ? {
          event: 'daily_summary',
          data: {
            trigger: 'cron_evening',
            scheduled_time: new Date().toISOString(),
            briefing_type: 'evening',
            note: "Evening wrap-up: 3-line summary of today (what got done, how body/mind felt, notable numbers). Then 2 concrete setup items for tomorrow. Keep it tight — no more than 5 sentences total.",
          },
        }
      : {
          event: 'daily_summary',
          data: {
            trigger: 'cron',
            scheduled_time: new Date().toISOString(),
            briefing_type: 'morning',
            note: "Morning review: summarize yesterday, surface patterns, set today's health focus.",
          },
        };
  }

  if (req.method !== 'POST') return res.status(405).end();

  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in Vercel env vars' });
  if (!SUPA_URL || !SUPA_KEY) return res.status(500).json({ error: 'Supabase env vars not set' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  // ── Chat mode ──
  if (body?.mode === 'chat') {
    const { messages: chatMsgs, context: pageCtx, web_search: webSearch } = body;
    if (!Array.isArray(chatMsgs) || !chatMsgs.length) {
      return res.status(400).json({ error: 'messages required' });
    }
    // web_search: true routes to the smart model with Anthropic's server-side
    // web search tool instead of the local health-data tools. Used by the
    // Opportunity Radar weekly news scan (client caches the result 7 days).
    const useWeb = webSearch === true;
    const chatModel = useWeb ? MODELS.smart : MODELS.fast;
    const chatTools = useWeb
      ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 }]
      : TOOLS;
    const chatMaxTokens = useWeb ? 2000 : 600;
    const chatMaxIter = useWeb ? 6 : 4;
    const chatSystemStable = `You are Claude, embedded in the user's personal health and life dashboard. You have tools to read their actual data. Available via read_health_data: nutrition, hydration, steps, sleep, exercise, totalcalories, weight, heartrate, distance, floorsclimbed, bloodwork, mood, insights, hrv, oxygensaturation, skintemperature, respiratoryrate, mindfulness, sleepstage, bodyfat, height, basalmetabolicrate, calories, calendar. Use read_finance_data for any money/finance question (accounts, transactions, subscriptions, net worth, income, savings goals, wishlist). Use the right tool and give specific data-driven answers.

Be concise — this is a mobile chat. If you look something up, summarize what you found rather than dumping raw data. If you write anything, briefly mention it.`;
    const chatSystem = cachedSystem(
      chatSystemStable,
      `${pageCtx ? pageCtx + '\n' : ''}Today: ${new Date().toISOString().slice(0, 10)}`,
    );

    const msgs = chatMsgs.slice(-12);
    let totalIn = 0, totalOut = 0, iterations = 0, finalReply = '';

    try {
      while (iterations < chatMaxIter) {
        iterations++;
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: chatModel, max_tokens: chatMaxTokens, system: chatSystem, tools: chatTools, messages: msgs }),
        });
        if (!r.ok) return res.status(500).json({ error: await r.text() });
        const resp = await r.json();
        totalIn += resp.usage?.input_tokens || 0;
        totalOut += resp.usage?.output_tokens || 0;
        msgs.push({ role: 'assistant', content: resp.content });
        if (resp.stop_reason === 'end_turn') {
          finalReply = resp.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
          break;
        }
        // Server-side web search can pause mid-turn; re-send to let it resume.
        if (resp.stop_reason === 'pause_turn') continue;
        if (resp.stop_reason === 'tool_use') {
          const calls = resp.content.filter(b => b.type === 'tool_use');
          const results = [];
          for (const call of calls) {
            const out = await executeTool(call.name, call.input);
            results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(out) });
          }
          msgs.push({ role: 'user', content: results });
        } else break;
      }
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }

    await logUsage(chatModel, totalIn, totalOut, 'chat', useWeb ? 'web_search' : null).catch(() => {});
    return res.json({ ok: true, reply: finalReply, usage: { input_tokens: totalIn, output_tokens: totalOut } });
  }

  // ── Agent mode ──
  const { event, data, model: modelPref } = body || {};
  if (!event) return res.status(400).json({ error: 'event required' });

  const useSmartModel = modelPref === 'smart' || ['bloodwork_imported', 'daily_summary', 'weekly_review', 'meal_pattern_analysis', 'habit_pattern_analysis', 'mood_pattern_analysis'].includes(event);
  const model = useSmartModel ? MODELS.smart : MODELS.fast;

  const messages = [{
    role: 'user',
    content: `Health event: ${event}\n\nData: ${JSON.stringify(data || {}, null, 2)}\n\nProcess this now. Read context, derive everything you can, write it all.`,
  }];

  const actions = [];
  let iterations = 0;
  let totalIn = 0, totalOut = 0;

  try {
    while (iterations < 12) {
      iterations++;

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          system: cachedSystem(SYSTEM, `Today is ${new Date().toISOString().slice(0, 10)}.`),
          tools: TOOLS,
          messages,
        }),
      });

      if (!r.ok) {
        const err = await r.text();
        return res.status(500).json({ error: `Anthropic: ${err}` });
      }

      const resp = await r.json();
      totalIn += resp.usage?.input_tokens || 0;
      totalOut += resp.usage?.output_tokens || 0;
      messages.push({ role: 'assistant', content: resp.content });

      if (resp.stop_reason === 'end_turn') break;

      if (resp.stop_reason === 'tool_use') {
        const calls = resp.content.filter(b => b.type === 'tool_use');
        const results = [];
        for (const call of calls) {
          const output = await executeTool(call.name, call.input);
          actions.push({ tool: call.name, input: call.input, output });
          results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(output) });
        }
        messages.push({ role: 'user', content: results });
      } else {
        break;
      }
    }

    const summary = messages
      .filter(m => m.role === 'assistant')
      .flatMap(m => (Array.isArray(m.content) ? m.content : [m.content]))
      .filter(b => b?.type === 'text')
      .map(b => b.text)
      .join(' ')
      .trim();

    await logUsage(model, totalIn, totalOut, 'agent', event).catch(() => {});
    return res.json({ ok: true, model, iterations, actions, summary, usage: { input_tokens: totalIn, output_tokens: totalOut } });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
