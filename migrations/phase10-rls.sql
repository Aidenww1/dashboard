-- Phase 10 — Auth + RLS migration.  DO NOT RUN until the coordinated cutover
-- (docs/PHASE10-AUTH-RLS.md): the client must be sending a logged-in session JWT
-- first, or these policies lock the app out (publishable key returns 0 rows).
--
-- Single-user app: one auth account. Set OWNER_UID below to that user's id
-- (Supabase Dashboard -> Authentication -> Users -> copy UID) before running.
-- Run in the Supabase SQL editor. Section 4 (rollback) is at the bottom.

-- ============================================================
-- 0. Replace the zero UUID inside the block with the owner auth UID.
--    The sentinel check aborts before any schema or data changes.
-- ============================================================

-- ============================================================
-- 1. Add owner scoping + RLS to every table, idempotently.
--    Done in a loop so all 26 tables get identical treatment.
-- ============================================================
do $$
declare
  t text;
  owner_uid uuid := '00000000-0000-0000-0000-000000000000'; -- <-- REPLACE
  tbls text[] := array[
    'app_state','events',
    'heart_rate','steps','calories','sleep','height','weight','oxygen_saturation',
    'exercise','sleep_stage','nutrition','mindfulness','hrv','skin_temperature',
    'respiratory_rate','floors_climbed','hydration','total_calories',
    'basal_metabolic_rate','body_fat','distance','mood','bloodwork','habits'
  ];
begin
  if owner_uid = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Replace owner_uid before running the Phase 10 RLS migration';
  end if;

  foreach t in array tbls loop
    -- skip tables that don't exist in this project (defensive)
    if to_regclass('public.' || t) is null then
      raise notice 'skip missing table %', t; continue;
    end if;

    -- 1a. user_id column, defaulting to the caller's auth uid on insert
    execute format(
      'alter table public.%I add column if not exists user_id uuid default auth.uid()', t);

    -- 1b. backfill existing rows to the owner (set via :OWNER_UID above)
    execute format(
      'update public.%I set user_id = %L::uuid where user_id is null', t, owner_uid);

    -- 1c. enforce not-null after backfill
    execute format(
      'alter table public.%I alter column user_id set not null', t);

    -- 1d. enable RLS
    execute format('alter table public.%I enable row level security', t);

    -- 1e. policies (drop-if-exists then create so re-runs are clean)
    execute format('drop policy if exists %I on public.%I', t || '_sel', t);
    execute format(
      'create policy %I on public.%I for select using (auth.uid() = user_id)',
      t || '_sel', t);

    execute format('drop policy if exists %I on public.%I', t || '_mod', t);
    execute format(
      'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_mod', t);

    raise notice 'secured %', t;
  end loop;
end $$;

-- ============================================================
-- 2. Verify (run after, expect rowsecurity = true for all)
-- ============================================================
-- select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' order by tablename;

-- ============================================================
-- 3. Smoke test (expect: anon = 0 rows, owner session = data)
-- ============================================================
-- As anon (publishable key, no session):   select count(*) from app_state;  -> 0
-- As the owner (logged-in session):         select count(*) from app_state;  -> N

-- ============================================================
-- 4. ROLLBACK (instant restore of pre-RLS access)
-- ============================================================
-- do $$
-- declare t text;
--   tbls text[] := array['app_state','events','heart_rate','steps','calories','sleep',
--     'height','weight','oxygen_saturation','exercise','sleep_stage','nutrition',
--     'mindfulness','hrv','skin_temperature','respiratory_rate','floors_climbed',
--     'hydration','total_calories','basal_metabolic_rate','body_fat','distance',
--     'mood','bloodwork','habits'];
-- begin
--   foreach t in array tbls loop
--     if to_regclass('public.'||t) is null then continue; end if;
--     execute format('alter table public.%I disable row level security', t);
--   end loop;
-- end $$;
-- (user_id columns are additive and safe to leave in place.)
