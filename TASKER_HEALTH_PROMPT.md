# Tasker prompt — rebuild the Health Connect → Life OS pipeline

Paste the block below into your Tasker-building AI. It recreates the task + profile that read Health Connect and POST each metric to the existing Vercel endpoint (`/api/health/<metric>`, already live, inserts into Supabase).

Before pasting: confirm your deployment domain. The prompt uses `https://dashboard-pi-green-48.vercel.app` — replace it with your current Vercel URL if different.

---

```
Build me a Tasker TASK and a PROFILE on Android. Goal: read health data from
Google Health Connect using the "Tasker Health Connect" plugin (the one whose
action is Plugins > Tasker Health Connect > Read data) and POST each metric as
JSON to my server.

=== TASK: "HC -> Life OS" ===

ACTION 1 — set the time window (run once, at the top):
  Code > JavaScriptlet, with this code:
    var now = new Date();
    var startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0,0,0,0);
    var weekAgo = new Date(now.getTime() - 7*24*60*60*1000);
    var monthAgo = new Date(now.getTime() - 30*24*60*60*1000);
    setLocal('start_ts', startOfDay.getTime().toString());
    setLocal('end_ts', now.getTime().toString());
    setLocal('week_ts', weekAgo.getTime().toString());
    setLocal('month_ts', monthAgo.getTime().toString());

Then, for EACH row in the table below, add TWO actions back to back:
  (A) Plugins > Tasker Health Connect > Read data
        - Class of the type of Health Record: <RecordClass>
        - Aggregated: <Aggregated>
        - Start timestamp: %<StartVar>
        - End timestamp: %end_ts
  (B) Net > HTTP Request
        - Method: POST
        - URL: https://dashboard-pi-green-48.vercel.app/api/health/<metric>
        - Headers: Content-Type:application/json
        - Body: %healthconnectresult
        - Structure Output (JSON): ON

IMPORTANT: the Read data action always overwrites %healthconnectresult, so the
HTTP Request for a metric MUST come immediately after its own Read data action,
before the next Read. Do not batch all reads then all posts.

Table (metric | RecordClass | Aggregated | StartVar):
  heartrate          | HeartRateRecord                  | No  | start_ts
  hrv                | HeartRateVariabilityRmssdRecord   | No  | start_ts
  steps              | StepsRecord                       | Yes | start_ts
  calories           | ActiveCaloriesBurnedRecord        | Yes | start_ts
  totalcalories      | TotalCaloriesBurnedRecord         | Yes | start_ts
  distance           | DistanceRecord                    | Yes | start_ts
  floorsclimbed      | ElevationGainedRecord             | Yes | start_ts
  hydration          | HydrationRecord                   | Yes | start_ts
  oxygensaturation   | OxygenSaturationRecord            | No  | start_ts
  respiratoryrate    | RespiratoryRateRecord             | No  | start_ts
  skintemperature    | SkinTemperatureRecord             | No  | start_ts
  sleep              | SleepSessionRecord                | No  | start_ts
  exercise           | ExerciseSessionRecord             | No  | start_ts
  nutrition          | NutritionRecord                   | No  | start_ts
  mindfulness        | MindfulnessSessionRecord          | No  | start_ts
  basalmetabolicrate | BasalMetabolicRateRecord          | No  | start_ts
  weight             | WeightRecord                      | No  | week_ts
  bodyfat            | BodyFatRecord                     | No  | week_ts
  height             | HeightRecord                      | No  | month_ts

(weight/bodyfat/height use a wider lookback because they're logged
infrequently — a same-day window would usually be empty.)

=== PROFILE: trigger the task near-live ===
Create a Profile that runs the "HC -> Life OS" task on a Time context:
  - Every 15 minutes, from 06:00 to 00:00.
If the Tasker Health Connect plugin offers a "data updated" event trigger, add
that too so fresh readings sync within minutes.

Output the task in whatever import format you support (Tasker description / XML),
ready for me to import.
```

---

## Notes
- The metric path names (`heartrate`, `hrv`, …) must stay exactly as above — the server's `TABLE_MAP` keys are case-insensitive but spelled this way.
- "Near-live" = every 15 min (and on-update if the plugin supports it). True instant push from a watch to a web backend isn't possible on this stack; 15-min is as fresh as it gets without a native background app.
- Each run inserts a new row per metric; the dashboard reads the newest. Rows accumulate (watch Supabase's 500 MB free-tier cap over time — see TODO.md).
- Security: `/api/health/<metric>` currently has no auth (anyone could POST). Add a shared-secret header check before relying on it long-term (TODO.md).
- Still pending on the Life OS side: a `wearable` slice + Today card + readiness wiring so this data actually shows and gets used (the rows land in Supabase but nothing renders them yet).
