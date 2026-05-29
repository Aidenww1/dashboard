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
];

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

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e.message };
  }
}

const SYSTEM = `You are an autonomous personal health intelligence agent. You have full read and write access to the user's health database and can queue Google Calendar events.

When you receive a health event you MUST proactively:
1. Call get_today_summary or read relevant context first
2. Derive ALL secondary data without being asked — examples:
   - Food logged → estimate water content (200-400ml per main meal, 100-200ml snacks, fruit/veg add more) and call add_water
   - Food logged → estimate energy curve: peak timing, expected energy dip
   - Workout logged → call add_water for sweat compensation (~500ml per 30min intense, ~300ml per 30min light), create a calendar event
   - Sleep synced → save insight about sleep quality and energy forecast for the day
   - Weight logged → check trend over last 30 days, save insight if trending up/down
   - Bloodwork imported → check every marker against previous readings, flag anything changing direction, create follow-up reminders
3. Write all derived data using write_health_data or the specific tools
4. Save insights whenever you spot a pattern, trend, or have advice
5. Create calendar events for workouts, significant meals (>600 kcal), bloodwork follow-ups

Be specific in insights — not "you slept well" but "7.2h sleep last night — you typically perform better on days with >7h. Today looks good for a hard workout."

Today is ${new Date().toISOString().slice(0, 10)}. Act now, don't ask for confirmation.`;

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
    req.method = 'POST';
    req.body = {
      event: 'daily_summary',
      data: { trigger: 'cron', scheduled_time: new Date().toISOString(), note: "Morning review: summarize yesterday, surface patterns, set today's health focus." },
    };
  }

  if (req.method !== 'POST') return res.status(405).end();

  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in Vercel env vars' });
  if (!SUPA_URL || !SUPA_KEY) return res.status(500).json({ error: 'Supabase env vars not set' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  // ── Chat mode ──
  if (body?.mode === 'chat') {
    const { messages: chatMsgs, context: pageCtx } = body;
    if (!Array.isArray(chatMsgs) || !chatMsgs.length) {
      return res.status(400).json({ error: 'messages required' });
    }
    const chatSystem = `You are Claude, embedded in the user's personal health and life dashboard. You have tools to read their actual data. Available via read_health_data: nutrition, hydration, steps, sleep, exercise, totalcalories, weight, heartrate, distance, floorsclimbed, bloodwork, mood, insights, hrv, oxygensaturation, skintemperature, respiratoryrate, mindfulness, sleepstage, bodyfat, height, basalmetabolicrate, calories, calendar. Use read_finance_data for any money/finance question (accounts, transactions, subscriptions, net worth, income, savings goals, wishlist). Use the right tool and give specific data-driven answers.

Be concise — this is a mobile chat. If you look something up, summarize what you found rather than dumping raw data. If you write anything, briefly mention it.

${pageCtx ? pageCtx : ''}
Today: ${new Date().toISOString().slice(0, 10)}`;

    const msgs = chatMsgs.slice(-12);
    let totalIn = 0, totalOut = 0, iterations = 0, finalReply = '';

    try {
      while (iterations < 4) {
        iterations++;
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: MODELS.fast, max_tokens: 600, system: chatSystem, tools: TOOLS, messages: msgs }),
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

    await logUsage(MODELS.fast, totalIn, totalOut, 'chat', null).catch(() => {});
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
        body: JSON.stringify({ model, max_tokens: 1024, system: SYSTEM, tools: TOOLS, messages }),
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
