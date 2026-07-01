-- Earlier iterations tracked the gpt-5.4 quota bucket by faking a future
-- usage_day (real day + 60 years) so it wouldn't collide with the real daily
-- row used by gpt-5.4-mini, without needing a migration. That's confusing to
-- read in the table editor (e.g. a row dated far in the future). This adds a
-- proper `model` column so each model gets its own row on the REAL date.

alter table public.ai_daily_usage
  add column if not exists model text not null default 'gpt-5.4-mini';

alter table public.ai_daily_usage drop constraint if exists ai_daily_usage_pkey;

-- Un-shift any row created by the old year-offset trick back onto its real
-- date, now that `model` can distinguish it from the same-day mini row.
update public.ai_daily_usage
set usage_day = (usage_day - interval '60 years')::date,
    model = 'gpt-5.4'
where usage_day >= date '2070-01-01';

alter table public.ai_daily_usage add primary key (usage_day, model);

create or replace function public.reserve_ai_tokens(
  p_day date,
  p_model text,
  p_tokens bigint,
  p_limit bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  usage_row public.ai_daily_usage%rowtype;
begin
  if p_tokens <= 0 or p_limit <= 0 then
    return jsonb_build_object('allowed', false, 'remaining', 0);
  end if;

  insert into public.ai_daily_usage (usage_day, model, reserved_tokens)
  select p_day, p_model, p_tokens
  where p_tokens <= p_limit
  on conflict (usage_day, model) do update
    set reserved_tokens = ai_daily_usage.reserved_tokens + excluded.reserved_tokens,
        updated_at = now()
    where ai_daily_usage.used_tokens
        + ai_daily_usage.reserved_tokens
        + excluded.reserved_tokens <= p_limit
  returning * into usage_row;

  if found then
    return jsonb_build_object(
      'allowed', true,
      'remaining', greatest(0, p_limit - usage_row.used_tokens - usage_row.reserved_tokens)
    );
  end if;

  select * into usage_row
  from public.ai_daily_usage
  where usage_day = p_day and model = p_model;

  return jsonb_build_object(
    'allowed', false,
    'remaining', greatest(0, p_limit - coalesce(usage_row.used_tokens, 0) - coalesce(usage_row.reserved_tokens, 0))
  );
end;
$$;

create or replace function public.finalize_ai_tokens(
  p_day date,
  p_model text,
  p_reserved bigint,
  p_actual bigint,
  p_success boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_daily_usage
  set reserved_tokens = greatest(0, reserved_tokens - greatest(0, p_reserved)),
      used_tokens = used_tokens + case when p_success then greatest(0, p_actual) else 0 end,
      request_count = request_count + case when p_success then 1 else 0 end,
      updated_at = now()
  where usage_day = p_day and model = p_model;
end;
$$;

-- Drop the old 3/4-arg signatures — the app now always calls the versions
-- above that take an explicit model.
drop function if exists public.reserve_ai_tokens(date, bigint, bigint);
drop function if exists public.finalize_ai_tokens(date, bigint, bigint, boolean);

revoke all on function public.reserve_ai_tokens(date, text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.finalize_ai_tokens(date, text, bigint, bigint, boolean) from public, anon, authenticated;
grant execute on function public.reserve_ai_tokens(date, text, bigint, bigint) to service_role;
grant execute on function public.finalize_ai_tokens(date, text, bigint, bigint, boolean) to service_role;
