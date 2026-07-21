-- Phase A canonical event ledger (STAGED, NOT APPLIED).
--
-- Do not run this file until:
--   1. the owner account is authenticated on every active device;
--   2. the client outbox transport targets this table with the session JWT;
--   3. backup, bootstrap, reconnect, conflict, and RLS tests pass; and
--   4. the owner explicitly approves the database migration.
--
-- This is a new table so the current public.events and app_state paths remain
-- untouched during compatibility work. Canonical facts are immutable: edits
-- and deletes are new rows through supersedes_id and deleted_at tombstones.

create table if not exists public.canonical_events (
  id              text primary key,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type            text not null,
  domain          text not null,
  occurred_at     timestamptz not null,
  recorded_at     timestamptz not null default now(),
  local_date      date not null,
  timezone        text not null,
  source          text not null,
  source_ref      text,
  schema_version  integer not null,
  payload         jsonb not null default '{}'::jsonb,
  units           jsonb not null default '{}'::jsonb,
  confidence      double precision not null default 1 check (confidence >= 0 and confidence <= 1),
  provenance      jsonb not null default '{}'::jsonb,
  supersedes_id   text references public.canonical_events(id),
  deleted_at      timestamptz,
  device_id       text not null,
  sync_state      text not null default 'synced' check (sync_state in ('local','pending','synced','error','tombstone')),
  received_at     timestamptz not null default now(),
  constraint canonical_tombstone_target check (
    deleted_at is null or (supersedes_id is not null and payload ? 'target_event_id')
  )
);

create unique index if not exists canonical_events_owner_source_ref
  on public.canonical_events (user_id, type, source_ref)
  where source_ref is not null;
create index if not exists canonical_events_owner_occurred
  on public.canonical_events (user_id, occurred_at desc);
create index if not exists canonical_events_owner_domain_date
  on public.canonical_events (user_id, domain, local_date desc);
create index if not exists canonical_events_supersedes
  on public.canonical_events (user_id, supersedes_id)
  where supersedes_id is not null;
create index if not exists canonical_events_payload
  on public.canonical_events using gin (payload);

alter table public.canonical_events enable row level security;

drop policy if exists canonical_events_owner_select on public.canonical_events;
create policy canonical_events_owner_select
  on public.canonical_events for select
  using (auth.uid() = user_id);

drop policy if exists canonical_events_owner_insert on public.canonical_events;
create policy canonical_events_owner_insert
  on public.canonical_events for insert
  with check (auth.uid() = user_id);

-- No UPDATE or DELETE policy is intentional. Corrections and deletes append
-- replacement/tombstone events, preserving history and preventing resurrection.

do $$ begin
  alter publication supabase_realtime add table public.canonical_events;
exception when duplicate_object then null;
end $$;

-- Verification after an approved migration:
-- select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename = 'canonical_events';
-- select policyname, cmd from pg_policies
--   where schemaname = 'public' and tablename = 'canonical_events';

-- Rollback before any canonical client cutover:
-- drop table if exists public.canonical_events;
