# Tasker — Health Connect → Life OS (manual build, every step)

Rebuilds the pipeline that reads Google Health Connect and POSTs each metric to your live server (`/api/health/<metric>` → Supabase). Native Tasker can't read Health Connect, so this uses the **Tasker Health Connect** plugin. Build it by hand exactly in this order.

Before you start: replace the URL below if your deployment domain changed. This doc uses:
`https://dashboard-pi-green-48.vercel.app`

---

## Prerequisites
1. Play Store → install **"Tasker Health Connect"** plugin.
2. Open the plugin once → grant it **Health Connect read access** for every record type (Heart rate, Steps, Sleep, etc.).
3. Open **Health Connect** (or Settings → Security & privacy → More → Health Connect) → confirm Samsung Health / Galaxy Watch is allowed to write data into Health Connect, and that the Tasker Health Connect plugin has read permission.
4. Confirm `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set in Vercel (already done previously).

---

## Build the task

Open Tasker → **Tasks** tab → press **+** → name it `HC -> Life OS` → OK.

Now add the actions below **in this exact order**. Inside the task, each action is added with the **+** button at the bottom.

### Action 1 — set the time window
- **+** → **Code** → **JavaScriptlet**
- In **Code**, paste:
  ```
  var now = new Date();
  var startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0,0,0,0);
  setLocal('start_ts', startOfDay.getTime().toString());
  setLocal('end_ts', now.getTime().toString());
  setLocal('week_ts', (now.getTime() - 7*86400000).toString());
  setLocal('month_ts', (now.getTime() - 30*86400000).toString());
  ```
- Back out to save the action.

> For every metric below you add TWO actions: a **Read data** then an **HTTP Request**. Always add the HTTP Request immediately after that metric's Read — the plugin overwrites `%healthconnectresult` on each read, so reading everything first then posting would only send the last one.

> Read data action path each time: **+** → **Plugins** → **Tasker Health Connect** → **Read data**.
> Where a metric says **Aggregated = Yes**, use the plugin's aggregated form: either a separate **"Read aggregated data"** action, or the **Aggregated** toggle inside **Read data** — whichever your plugin version shows. Aggregated = the day's total (steps, calories, etc.); plain Read data = the individual/latest records.
> HTTP Request action path each time: **+** → **Net** → **HTTP Request**, with Method **POST**, Header `Content-Type:application/json`, Body `%healthconnectresult`, and **Structure Output (JSON)** turned ON.

---

### Metric 1 — Heart rate
- **Action 2 — Read data:** Class = `HeartRateRecord`, Aggregated = **No**, Start timestamp = `%start_ts`, End timestamp = `%end_ts`.
- **Action 3 — HTTP Request:** URL = `https://dashboard-pi-green-48.vercel.app/api/health/heartrate`

### Metric 2 — Heart rate variability
- **Action 4 — Read data:** Class = `HeartRateVariabilityRmssdRecord`, Aggregated = **No**, Start = `%start_ts`, End = `%end_ts`.
- **Action 5 — HTTP Request:** URL = `https://dashboard-pi-green-48.vercel.app/api/health/hrv`

### Metric 3 — Steps
- **Action 6 — Read data:** Class = `StepsRecord`, Aggregated = **Yes**, Start = `%start_ts`, End = `%end_ts`.
- **Action 7 — HTTP Request:** URL = `https://dashboard-pi-green-48.vercel.app/api/health/steps`

### Metric 4 — Active calories
- **Action 8 — Read data:** Class = `ActiveCaloriesBurnedRecord`, Aggregated = **Yes**, Start = `%start_ts`, End = `%end_ts`.
- **Action 9 — HTTP Request:** URL = `https://dashboard-pi-green-48.vercel.app/api/health/calories`

### Metric 5 — Total calories
- **Action 10 — Read data:** Class = `TotalCaloriesBurnedRecord`, Aggregated = **Yes**, Start = `%start_ts`, End = `%end_ts`.
- **Action 11 — HTTP Request:** URL = `https://dashboard-pi-green-48.vercel.app/api/health/totalcalories`

### Metric 6 — Distance
- **Action 12 — Read data:** Class = `DistanceRecord`, Aggregated = **Yes**, Start = `%start_ts`, End = `%end_ts`.
- **Action 13 — HTTP Request:** URL = `https://dashboard-pi-green-48.vercel.app/api/health/distance`

### Metric 7 — Floors / elevation
- **Action 14 — Read data:** Class = `ElevationGainedRecord`, Aggregated = **Yes**, Start = `%start_ts`, End = `%end_ts`.
- **Action 15 — HTTP Request:** URL = `https://dashboard-pi-green-48.vercel.app/api/health/floorsclimbed`

### Metric 8 — Hydration / water
- **Action 16 — Read data:** Class = `HydrationRecord`, Aggregated = **Yes**, Start = `%start_ts`, End = `%end_ts`.
- **Action 17 — HTTP Request:** URL = `https://dashboard-pi-green-48.vercel.app/api/health/hydration`

### Metric 9 — Blood oxygen (SpO2)
- **Action 18 — Read data:** Class = `OxygenSaturationRecord`, Aggregated = **No**, Start = `%start_ts`, End = `%end_ts`.
- **Action 19 — HTTP Request:** URL = `https://dashboard-pi-green-48.vercel.app/api/health/oxygensaturation`

### Metric 10 — Respiratory rate
- **Action 20 — Read data:** Class = `RespiratoryRateRecord`, Aggregated = **No**, Start = `%start_ts`, End = `%end_ts`.
- **Action 21 — HTTP Request:** URL = `https://dashboard-pi-green-48.vercel.app/api/health/respiratoryrate`

### Metric 11 — Skin temperature
- **Action 22 — Read data:** Class = `SkinTemperatureRecord`, Aggregated = **No**, Start = `%start_ts`, End = `%end_ts`.
- **Action 23 — HTTP Request:** URL = `https://dashboard-pi-green-48.vercel.app/api/health/skintemperature`

### Metric 12 — Sleep
- **Action 24 — Read data:** Class = `SleepSessionRecord`, Aggregated = **No**, Start = `%start_ts`, End = `%end_ts`.
- **Action 25 — HTTP Request:** URL = `https://dashboard-pi-green-48.vercel.app/api/health/sleep`

### Metric 13 — Exercise sessions
- **Action 26 — Read data:** Class = `ExerciseSessionRecord`, Aggregated = **No**, Start = `%start_ts`, End = `%end_ts`.
- **Action 27 — HTTP Request:** URL = `https://dashboard-pi-green-48.vercel.app/api/health/exercise`

### Metric 14 — Nutrition / food
- **Action 28 — Read data:** Class = `NutritionRecord`, Aggregated = **No**, Start = `%start_ts`, End = `%end_ts`.
- **Action 29 — HTTP Request:** URL = `https://dashboard-pi-green-48.vercel.app/api/health/nutrition`

### Metric 15 — Mindfulness / well-being
- **Action 30 — Read data:** Class = `MindfulnessSessionRecord`, Aggregated = **No**, Start = `%start_ts`, End = `%end_ts`.
- **Action 31 — HTTP Request:** URL = `https://dashboard-pi-green-48.vercel.app/api/health/mindfulness`

### Metric 16 — Basal metabolic rate
- **Action 32 — Read data:** Class = `BasalMetabolicRateRecord`, Aggregated = **No**, Start = `%start_ts`, End = `%end_ts`.
- **Action 33 — HTTP Request:** URL = `https://dashboard-pi-green-48.vercel.app/api/health/basalmetabolicrate`

### Metric 17 — Weight  (wider window — logged infrequently)
- **Action 34 — Read data:** Class = `WeightRecord`, Aggregated = **No**, Start = `%week_ts`, End = `%end_ts`.
- **Action 35 — HTTP Request:** URL = `https://dashboard-pi-green-48.vercel.app/api/health/weight`

### Metric 18 — Body fat %  (wider window)
- **Action 36 — Read data:** Class = `BodyFatRecord`, Aggregated = **No**, Start = `%week_ts`, End = `%end_ts`.
- **Action 37 — HTTP Request:** URL = `https://dashboard-pi-green-48.vercel.app/api/health/bodyfat`

### Metric 19 — Height  (widest window — rarely changes)
- **Action 38 — Read data:** Class = `HeightRecord`, Aggregated = **No**, Start = `%month_ts`, End = `%end_ts`.
- **Action 39 — HTTP Request:** URL = `https://dashboard-pi-green-48.vercel.app/api/health/height`

Back out of the task to save it.

---

## Create the trigger profile
1. Go to the **Profiles** tab → press **+**.
2. Choose **Time**.
3. Set **From** 06:00, **To** 00:00 (or all day), and **Repeat** every **15 minutes**. Back out.
4. When asked to link a task, pick **`HC -> Life OS`**.
5. Make sure the profile toggle is ON (green).

---

## Test
1. Open the `HC -> Life OS` task → press the **▶ play** button (bottom-left) to run it once.
2. Each Read data row that is **greyed out** = the pull worked but there was no data in that window (normal for metrics you didn't record).
3. In Supabase → Table editor → open `heart_rate`, `steps`, `sleep`, etc. → confirm new rows appeared (each row is `{ data: <Health Connect JSON> }`).
4. If a POST fails: open the HTTP Request action, check the URL spelling and that the body is exactly `%healthconnectresult`.

Done. Health data now syncs every 15 minutes.

---

## Notes
- The metric in each URL (`heartrate`, `hrv`, `steps`, …) must match exactly — these are the server's accepted keys.
- "Every 15 min" is as live as a web backend gets (a watch can't push real-time to a server). Add the plugin's "data updated" event as a second profile trigger if it offers one.
- Each run inserts a new row per metric; the dashboard reads the newest. Rows accumulate — watch Supabase's 500 MB free-tier cap over months (see TODO.md).
- Security: `/api/health/<metric>` currently has no auth — anyone who knows the URL could POST. Add a shared-secret header check before relying on it long term (see TODO.md).
- Pending on the Life OS side: a `wearable` slice + Today card + readiness wiring so this data actually displays and gets used (rows land in Supabase but nothing renders them yet).
