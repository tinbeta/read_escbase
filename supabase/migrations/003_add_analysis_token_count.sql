alter table public.analyses
  add column if not exists token_count bigint check (token_count is null or token_count >= 0);

create index if not exists analyses_created_at_idx
  on public.analyses (created_at desc);
