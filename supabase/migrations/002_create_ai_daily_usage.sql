create table if not exists public.ai_daily_usage (
  usage_day date primary key,
  used_tokens bigint not null default 0 check (used_tokens >= 0),
  reserved_tokens bigint not null default 0 check (reserved_tokens >= 0),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.ai_daily_usage enable row level security;

create or replace function public.reserve_ai_tokens(
  p_day date,
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

  insert into public.ai_daily_usage (usage_day, reserved_tokens)
  select p_day, p_tokens
  where p_tokens <= p_limit
  on conflict (usage_day) do update
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
  where usage_day = p_day;

  return jsonb_build_object(
    'allowed', false,
    'remaining', greatest(0, p_limit - coalesce(usage_row.used_tokens, 0) - coalesce(usage_row.reserved_tokens, 0))
  );
end;
$$;

create or replace function public.finalize_ai_tokens(
  p_day date,
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
  where usage_day = p_day;
end;
$$;

revoke all on function public.reserve_ai_tokens(date, bigint, bigint) from public, anon, authenticated;
revoke all on function public.finalize_ai_tokens(date, bigint, bigint, boolean) from public, anon, authenticated;
grant execute on function public.reserve_ai_tokens(date, bigint, bigint) to service_role;
grant execute on function public.finalize_ai_tokens(date, bigint, bigint, boolean) to service_role;

-- The service role reads and updates this table from server-only code.
