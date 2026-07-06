alter table public.analyses
  add column if not exists owner_user_id uuid;

create index if not exists analyses_owner_created_at_idx
  on public.analyses (owner_user_id, created_at desc);

create index if not exists analyses_owner_source_url_created_at_idx
  on public.analyses (owner_user_id, source_url, created_at desc);

create table if not exists public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  source_url text not null,
  source_type text not null default 'video' check (source_type in ('x', 'web', 'video')),
  status text not null default 'queued' check (status in ('queued', 'processing', 'succeeded', 'failed')),
  title text not null default 'Đang phân tích video...',
  slug text,
  result jsonb,
  token_count bigint check (token_count is null or token_count >= 0),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists analysis_jobs_owner_created_at_idx
  on public.analysis_jobs (owner_user_id, created_at desc);

create index if not exists analysis_jobs_owner_status_created_at_idx
  on public.analysis_jobs (owner_user_id, status, created_at desc);

create index if not exists analysis_jobs_source_owner_created_at_idx
  on public.analysis_jobs (source_url, owner_user_id, created_at desc);

alter table public.analysis_jobs enable row level security;

drop policy if exists "No direct public access to analysis jobs" on public.analysis_jobs;
