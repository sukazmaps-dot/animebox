-- AnimeBox Patch 14.4.3 — Supabase hot-path relief
-- Safe, targeted changes only. No destructive index pruning.

-- PostgREST upsert with ON CONFLICT(dedupe_key) cannot infer the previous
-- partial unique index. A normal UNIQUE index still permits multiple NULLs
-- while making the conflict target valid.
drop index if exists public.product_events_dedupe_idx;
create unique index if not exists product_events_dedupe_idx
  on public.product_events (dedupe_key);

-- Cover the FK called out by Supabase's performance advisor. The existing
-- primary key starts with user_id, so it cannot efficiently serve lookups
-- driven by challenge_code.
create index if not exists user_challenge_completions_challenge_code_idx
  on public.user_challenge_completions (challenge_code);

-- Bound raw watch telemetry. Durable user progress lives in progress, while
-- heartbeat/session rows are implementation telemetry and may be aged out.
create or replace function public.cleanup_animebox_watch_hot_data(
  p_heartbeat_retention_days integer default 14,
  p_session_retention_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_heartbeats bigint := 0;
  deleted_sessions bigint := 0;
begin
  if p_heartbeat_retention_days < 1 or p_heartbeat_retention_days > 90 then
    raise exception 'heartbeat retention out of range';
  end if;

  if p_session_retention_days < p_heartbeat_retention_days
     or p_session_retention_days > 180 then
    raise exception 'session retention out of range';
  end if;

  delete from animebox_watch.heartbeats
  where received_at < now() - make_interval(days => p_heartbeat_retention_days);
  get diagnostics deleted_heartbeats = row_count;

  delete from animebox_watch.sessions
  where ended_at is not null
    and ended_at < now() - make_interval(days => p_session_retention_days);
  get diagnostics deleted_sessions = row_count;

  return jsonb_build_object(
    'deleted_heartbeats', deleted_heartbeats,
    'deleted_sessions', deleted_sessions
  );
end;
$$;

revoke execute on function public.cleanup_animebox_watch_hot_data(integer, integer)
  from public, anon, authenticated;
grant execute on function public.cleanup_animebox_watch_hot_data(integer, integer)
  to service_role;


-- Run retention off the request path once per day. Re-scheduling by name keeps
-- the migration idempotent across preview/restore workflows.
do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'animebox-watch-hot-data-cleanup'
  ) then
    perform cron.unschedule('animebox-watch-hot-data-cleanup');
  end if;

  perform cron.schedule(
    'animebox-watch-hot-data-cleanup',
    '23 4 * * *',
    'select public.cleanup_animebox_watch_hot_data(14, 30);'
  );
end;
$$;
