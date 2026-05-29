-- Decision: no user_id column. This app has no Supabase Auth (single-user, no login flow).
-- RLS enabled; anon-role policies allow full access — single-user app, anon key is published
-- in frontend HTML. When auth is added, replace policies with auth.uid() scope and add
-- user_id uuid not null references auth.users(id) default auth.uid().

create table if not exists events (
  id         uuid primary key default gen_random_uuid(),
  ts         timestamptz not null,
  created_at timestamptz not null default now(),
  type       text not null,
  domains    text[] not null default '{}',
  data       jsonb not null default '{}',
  source     text not null default 'manual',
  note       text
);

alter table events enable row level security;

create policy "anon_select" on events for select to anon using (true);
create policy "anon_insert" on events for insert to anon with check (true);
create policy "anon_update" on events for update to anon using (true);
create policy "anon_delete" on events for delete to anon using (true);

create index if not exists events_ts      on events (ts desc);
create index if not exists events_type    on events (type);
create index if not exists events_domains on events using gin (domains);
create index if not exists events_data    on events using gin (data);
