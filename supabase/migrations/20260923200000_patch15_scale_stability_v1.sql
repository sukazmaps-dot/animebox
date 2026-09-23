-- AnimeBox Patch 15 — Scale & Stability
-- Bounded Watch Together cleanup + compact production health snapshot.

create index if not exists watch_party_rooms_live_expiry_idx
  on public.watch_party_rooms (expires_at)
  where status <> 'ended';

create index if not exists watch_party_rooms_live_heartbeat_idx
  on public.watch_party_rooms (last_heartbeat_at)
  where status <> 'ended';

create or replace function public.cleanup_watch_party_rooms(
  p_stale_minutes integer default 3,
  p_delete_ended_days integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed_expired bigint := 0;
  closed_stale bigint := 0;
  deleted_ended bigint := 0;
  now_at timestamptz := now();
begin
  if p_stale_minutes < 2 or p_stale_minutes > 30 then
    raise exception 'watch party stale window out of range';
  end if;

  if p_delete_ended_days < 1 or p_delete_ended_days > 60 then
    raise exception 'watch party retention out of range';
  end if;

  update public.watch_party_rooms
  set
    status = 'ended',
    participant_count = 0,
    ended_at = coalesce(ended_at, now_at),
    updated_at = now_at
  where status <> 'ended'
    and expires_at <= now_at;
  get diagnostics closed_expired = row_count;

  update public.watch_party_rooms
  set
    status = 'ended',
    participant_count = 0,
    ended_at = coalesce(ended_at, now_at),
    updated_at = now_at
  where status <> 'ended'
    and expires_at > now_at
    and last_heartbeat_at < now_at - make_interval(mins => p_stale_minutes);
  get diagnostics closed_stale = row_count;

  delete from public.watch_party_rooms
  where status = 'ended'
    and coalesce(ended_at, updated_at, created_at)
      < now_at - make_interval(days => p_delete_ended_days);
  get diagnostics deleted_ended = row_count;

  return jsonb_build_object(
    'closed_expired', closed_expired,
    'closed_stale', closed_stale,
    'deleted_ended', deleted_ended
  );
end;
$$;

revoke execute on function public.cleanup_watch_party_rooms(integer, integer)
  from public, anon, authenticated;
grant execute on function public.cleanup_watch_party_rooms(integer, integer)
  to service_role;

do $$
begin
  if exists (
    select 1 from cron.job
    where jobname = 'animebox-watch-party-cleanup'
  ) then
    perform cron.unschedule('animebox-watch-party-cleanup');
  end if;

  perform cron.schedule(
    'animebox-watch-party-cleanup',
    '*/5 * * * *',
    'select public.cleanup_watch_party_rooms(3, 7);'
  );
end;
$$;


create or replace function public.animebox_production_health_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with now_at as (
    select now() as value
  ),
  watch as (
    select
      count(*) filter (
        where s.ended_at is null
          and s.expires_at > n.value
          and s.last_received_at >= n.value - interval '2 minutes'
      )::bigint as active_sessions,
      count(*) filter (
        where s.created_at >= n.value - interval '1 hour'
      )::bigint as sessions_1h
    from animebox_watch.sessions s
    cross join now_at n
  ),
  heartbeats as (
    select
      count(*) filter (
        where h.received_at >= n.value - interval '5 minutes'
      )::bigint as heartbeats_5m,
      count(*) filter (
        where h.received_at >= n.value - interval '1 hour'
      )::bigint as heartbeats_1h
    from animebox_watch.heartbeats h
    cross join now_at n
  ),
  rooms as (
    select
      count(*) filter (
        where r.status <> 'ended'
          and r.expires_at > n.value
          and r.last_heartbeat_at >= n.value - interval '3 minutes'
      )::bigint as active_rooms,
      coalesce(sum(r.participant_count) filter (
        where r.status <> 'ended'
          and r.expires_at > n.value
          and r.last_heartbeat_at >= n.value - interval '3 minutes'
      ), 0)::bigint as active_participants,
      count(*) filter (
        where r.status <> 'ended'
          and r.last_heartbeat_at < n.value - interval '3 minutes'
      )::bigint as stale_rooms,
      count(*) filter (
        where r.created_at >= n.value - interval '24 hours'
      )::bigint as rooms_created_24h
    from public.watch_party_rooms r
    cross join now_at n
  ),
  chat as (
    select
      count(*) filter (
        where m.created_at >= n.value - interval '1 hour'
          and m.deleted_at is null
      )::bigint as messages_1h,
      count(*) filter (
        where m.created_at >= n.value - interval '24 hours'
          and m.deleted_at is null
      )::bigint as messages_24h
    from public.chat_messages m
    cross join now_at n
  ),
  analytics as (
    select
      count(*) filter (
        where e.created_at >= n.value - interval '1 hour'
      )::bigint as events_1h,
      count(*) filter (
        where e.created_at >= n.value - interval '24 hours'
      )::bigint as events_24h
    from public.product_events e
    cross join now_at n
  ),
  rate_limit as (
    select
      count(*)::bigint as bucket_rows,
      coalesce(sum(b.request_count) filter (
        where b.window_start >= n.value - interval '1 hour'
      ), 0)::bigint as requests_1h
    from public.api_rate_buckets b
    cross join now_at n
  ),
  cron_health as (
    select
      count(*) filter (
        where d.start_time >= n.value - interval '24 hours'
          and d.status <> 'succeeded'
      )::bigint as failed_24h,
      max(d.end_time) filter (
        where d.status = 'succeeded'
      ) as last_success_at,
      max(d.end_time) filter (
        where d.status <> 'succeeded'
      ) as last_failure_at
    from cron.job_run_details d
    cross join now_at n
  ),
  database_health as (
    select
      coalesce(max(s.numbackends), 0)::bigint as connections,
      case
        when coalesce(sum(s.blks_hit + s.blks_read), 0) = 0 then null
        else round(
          100.0 * sum(s.blks_hit)
          / nullif(sum(s.blks_hit + s.blks_read), 0),
          2
        )
      end as cache_hit_pct
    from pg_catalog.pg_stat_database s
    where s.datname = current_database()
  )
  select jsonb_build_object(
    'generated_at', n.value,
    'watch', jsonb_build_object(
      'active_sessions', w.active_sessions,
      'sessions_1h', w.sessions_1h,
      'heartbeats_5m', h.heartbeats_5m,
      'heartbeats_1h', h.heartbeats_1h
    ),
    'watch_party', jsonb_build_object(
      'active_rooms', r.active_rooms,
      'active_participants', r.active_participants,
      'stale_rooms', r.stale_rooms,
      'rooms_created_24h', r.rooms_created_24h
    ),
    'chat', jsonb_build_object(
      'messages_1h', c.messages_1h,
      'messages_24h', c.messages_24h
    ),
    'analytics', jsonb_build_object(
      'events_1h', a.events_1h,
      'events_24h', a.events_24h
    ),
    'rate_limit', jsonb_build_object(
      'bucket_rows', rl.bucket_rows,
      'requests_1h', rl.requests_1h
    ),
    'cron', jsonb_build_object(
      'failed_24h', ch.failed_24h,
      'last_success_at', ch.last_success_at,
      'last_failure_at', ch.last_failure_at
    ),
    'database', jsonb_build_object(
      'connections', db.connections,
      'cache_hit_pct', db.cache_hit_pct
    )
  )
  from now_at n
  cross join watch w
  cross join heartbeats h
  cross join rooms r
  cross join chat c
  cross join analytics a
  cross join rate_limit rl
  cross join cron_health ch
  cross join database_health db;
$function$;

revoke execute on function public.animebox_production_health_snapshot()
  from public, anon, authenticated;
grant execute on function public.animebox_production_health_snapshot()
  to service_role;
