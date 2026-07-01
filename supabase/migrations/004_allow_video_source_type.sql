-- Allow the new "video" source type (YouTube / TikTok / Facebook Reel).
-- Postgres names an unnamed CHECK constraint "<table>_<column>_check" by
-- default, which matches how 001_create_analyses.sql defined it.
alter table public.analyses
  drop constraint if exists analyses_source_type_check;

alter table public.analyses
  add constraint analyses_source_type_check
  check (source_type in ('x', 'web', 'video'));
