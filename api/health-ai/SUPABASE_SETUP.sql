-- Run this in Supabase → SQL Editor

create table if not exists health_insights (
  id bigserial primary key,
  data jsonb not null,
  created_at timestamptz default now()
);

create table if not exists calendar_events (
  id bigserial primary key,
  data jsonb not null,
  created_at timestamptz default now()
);

create table if not exists api_usage (
  id bigserial primary key,
  data jsonb not null,
  created_at timestamptz default now()
);

create index if not exists health_insights_created_at on health_insights(created_at desc);
create index if not exists calendar_events_created_at on calendar_events(created_at desc);
create index if not exists api_usage_created_at on api_usage(created_at desc);
