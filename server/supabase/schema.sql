-- Action AI: run once in Supabase → SQL Editor.
-- Only the backend (service_role) touches these tables, so RLS is on with no public policies.

create table if not exists public.qloo_cache (
  key text primary key,
  value jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.qloo_cache enable row level security;
alter table public.campaigns enable row level security;
