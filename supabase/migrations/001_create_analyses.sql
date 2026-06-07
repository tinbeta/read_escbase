create extension if not exists pgcrypto;

create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-f0-9]{12}$'),
  source_url text not null,
  source_type text not null check (source_type in ('x', 'web')),
  title text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists analyses_source_url_created_at_idx
  on public.analyses (source_url, created_at desc);

alter table public.analyses enable row level security;

drop policy if exists "Public analyses are readable" on public.analyses;
create policy "Public analyses are readable"
  on public.analyses
  for select
  to anon
  using (true);

-- Writes are performed only by the server with SUPABASE_SERVICE_ROLE_KEY.
