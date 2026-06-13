/* ============================================================
   ActivityWatch -> Life OS bridge.

   Runs on YOUR machine (where ActivityWatch is installed). Reads
   the local ActivityWatch REST API (localhost:5600), aggregates
   today's activity into a small summary, and pushes ONLY that
   summary to Supabase (app_state key 'activity:summary:v1').
   Life OS then reads the summary. Raw URL/app history never leaves
   your machine — only top apps, top domains, and active seconds.

   Why a local script and not the web app: a browser page on https
   (or a different port) cannot fetch http://localhost:5600 — mixed
   content + private-network blocks. A local Node process has no
   such restriction.

   SETUP
   1. Install ActivityWatch (activitywatch.net) + its browser
      extension (aw-watcher-web). Leave it running.
   2. Node 18+ (global fetch).
   3. Run:
        node aw-bridge.mjs
      Optional env:
        AW_URL=http://localhost:5600
        SUPABASE_URL=...            (defaults to the project URL)
        SUPABASE_KEY=...            (publishable works; service key is safer)
   4. Schedule it (Windows Task Scheduler / cron) every ~30 min, e.g.
        schtasks /create /tn "AW->LifeOS" /tr "node C:\path\aw-bridge.mjs" /sc minute /mo 30

   SECURITY: only run this once your Supabase RLS is verified locked.
   Activity data is sensitive even as a summary.
   ============================================================ */

const AW = process.env.AW_URL || 'http://localhost:5600';
const SUPA_URL = process.env.SUPABASE_URL || 'https://nwdyuiimfqhlqscnbqmq.supabase.co';
const SUPA_KEY = process.env.SUPABASE_KEY || 'sb_publishable_KFOU1sDCxRp8c1M3kSytHg_nuQWzfPT';

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' -> ' + r.status);
  return r.json();
}

function aggregate(events, keyFn) {
  const m = {};
  for (const e of events) {
    const k = keyFn(e);
    if (!k) continue;
    m[k] = (m[k] || 0) + (e.duration || 0);
  }
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

async function main() {
  let buckets;
  try { buckets = await getJSON(`${AW}/api/0/buckets/`); }
  catch (e) { console.error('Cannot reach ActivityWatch at ' + AW + '. Is it running? ' + e.message); process.exit(1); }

  const ids = Object.keys(buckets);
  const winId = ids.find(i => /aw-watcher-window/i.test(i) || (buckets[i] && buckets[i].type === 'currentwindow'));
  const webId = ids.find(i => /aw-watcher-web/i.test(i));

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const end = now.toISOString();
  const evUrl = id => `${AW}/api/0/buckets/${encodeURIComponent(id)}/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&limit=20000`;
  const events = async id => (id ? getJSON(evUrl(id)).catch(() => []) : []);

  const win = await events(winId);
  const web = await events(webId);

  const topApps = aggregate(win, e => e.data && e.data.app).slice(0, 10)
    .map(([app, sec]) => ({ app, seconds: Math.round(sec) }));
  const topDomains = aggregate(web, e => {
    try { return new URL(e.data.url).hostname.replace(/^www\./, ''); } catch (_) { return null; }
  }).slice(0, 10).map(([domain, sec]) => ({ domain, seconds: Math.round(sec) }));
  const activeSeconds = Math.round(win.reduce((s, e) => s + (e.duration || 0), 0));

  const summary = {
    date: start.slice(0, 10),
    generated_at: new Date().toISOString(),
    active_seconds: activeSeconds,
    top_apps: topApps,
    top_domains: topDomains,
  };

  const res = await fetch(`${SUPA_URL}/rest/v1/app_state?on_conflict=key`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ key: 'activity:summary:v1', data: summary, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) { console.error('Push failed: ' + res.status + ' ' + await res.text()); process.exit(1); }
  console.log(`Pushed: ${Math.round(activeSeconds / 60)}m active, ${topApps.length} apps, ${topDomains.length} domains (${summary.date})`);
}

main().catch(e => { console.error(e); process.exit(1); });
