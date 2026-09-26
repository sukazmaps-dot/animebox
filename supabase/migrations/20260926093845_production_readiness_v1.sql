-- Patch 18.5.6 — Production Readiness / Thousands of Users
-- Operational control plane, cron coordination headroom and bounded retention.

create table if not exists public.system_runtime_controls (
  control_key text primary key,
  state text not null,
  reason text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_runtime_controls_key_check
    check (
      control_key in (
        'platform_mode',
        'recommendations',
        'smart_discovery',
        'watch_together',
        'community_writes',
        'background_jobs'
      )
    ),
  constraint system_runtime_controls_state_check
    check (
      (
        control_key = 'platform_mode'
        and state in ('normal', 'brownout')
      )
      or
      (
        control_key <> 'platform_mode'
        and state in ('enabled', 'disabled')
      )
    ),
  constraint system_runtime_controls_reason_len
    check (reason is null or char_length(reason) <= 500)
);

alter table public.system_runtime_controls enable row level security;

revoke all on table public.system_runtime_controls
  from public, anon, authenticated, service_role;

grant select, insert, update
  on table public.system_runtime_controls
  to service_role;

drop policy if exists system_runtime_controls_service_role_only
  on public.system_runtime_controls;

create policy system_runtime_controls_service_role_only
  on public.system_runtime_controls
  for all
  to service_role
  using (true)
  with check (true);

insert into public.system_runtime_controls(
  control_key,
  state,
  reason
)
values
  ('platform_mode', 'normal', null),
  ('recommendations', 'enabled', null),
  ('smart_discovery', 'enabled', null),
  ('watch_together', 'enabled', null),
  ('community_writes', 'enabled', null),
  ('background_jobs', 'enabled', null)
on conflict (control_key) do nothing;

comment on table public.system_runtime_controls is
  'Service-role-only operational switches for AnimeBox emergency degradation and brownout control.';

-- 18.5.5.3 leases already provide the correct cross-instance primitive.
-- Cron jobs need a lease slightly longer than a 60-second function budget.
create or replace function public.try_acquire_runtime_refresh_lease(
  p_scope text,
  p_cache_key text,
  p_owner_token uuid,
  p_ttl_seconds integer default 15
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, private
as $$
declare
  v_acquired boolean := false;
  v_scope text := left(trim(p_scope), 64);
  v_key text := left(trim(p_cache_key), 160);
  v_ttl integer := greatest(5, least(coalesce(p_ttl_seconds, 15), 120));
begin
  if v_scope = '' or v_key = '' or p_owner_token is null then
    return false;
  end if;

  insert into private.runtime_refresh_leases as leases (
    scope,
    cache_key,
    owner_token,
    expires_at,
    updated_at
  )
  values (
    v_scope,
    v_key,
    p_owner_token,
    now() + make_interval(secs => v_ttl),
    now()
  )
  on conflict (scope, cache_key) do update
    set owner_token = excluded.owner_token,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    where leases.expires_at <= now()
       or leases.owner_token = excluded.owner_token
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;

revoke all on function public.try_acquire_runtime_refresh_lease(text, text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.try_acquire_runtime_refresh_lease(text, text, uuid, integer)
  to service_role;

-- One bounded maintenance call removes only operational/telemetry data.
-- User-created content, payments, progress and entitlement history are untouched.
create or replace function public.prune_animebox_operational_data(
  p_job_retention_days integer default 30,
  p_incident_retention_days integer default 30,
  p_request_retention_days integer default 30,
  p_event_retention_days integer default 180,
  p_lease_retention_hours integer default 24
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
declare
  v_job_days integer := greatest(7, least(coalesce(p_job_retention_days, 30), 90));
  v_incident_days integer := greatest(7, least(coalesce(p_incident_retention_days, 30), 180));
  v_request_days integer := greatest(7, least(coalesce(p_request_retention_days, 30), 90));
  v_event_days integer := greatest(30, least(coalesce(p_event_retention_days, 180), 365));
  v_lease_hours integer := greatest(1, least(coalesce(p_lease_retention_hours, 24), 72));
  v_jobs integer := 0;
  v_incidents integer := 0;
  v_requests integer := 0;
  v_events integer := 0;
  v_leases integer := 0;
begin
  delete from public.system_job_runs
  where finished_at < now() - make_interval(days => v_job_days);
  get diagnostics v_jobs = row_count;

  delete from public.system_incidents
  where status = 'resolved'
    and resolved_at is not null
    and resolved_at < now() - make_interval(days => v_incident_days);
  get diagnostics v_incidents = row_count;

  delete from public.system_request_metrics
  where bucket_start < now() - make_interval(days => v_request_days);
  get diagnostics v_requests = row_count;

  delete from public.product_events
  where created_at < now() - make_interval(days => v_event_days);
  get diagnostics v_events = row_count;

  delete from private.runtime_refresh_leases
  where expires_at < now() - make_interval(hours => v_lease_hours);
  get diagnostics v_leases = row_count;

  return jsonb_build_object(
    'system_job_runs', v_jobs,
    'system_incidents', v_incidents,
    'system_request_metrics', v_requests,
    'product_events', v_events,
    'runtime_refresh_leases', v_leases
  );
end;
$$;

revoke all on function public.prune_animebox_operational_data(
  integer, integer, integer, integer, integer
) from public, anon, authenticated;

grant execute on function public.prune_animebox_operational_data(
  integer, integer, integer, integer, integer
) to service_role;

-- Extend the existing production health snapshot with explicit connection
-- headroom. Keep the existing privileged function, but its execution surface
-- remains service-role-only.
create or replace function public.animebox_production_health_snapshot()
returns jsonb
language sql
stable
security definer
set search_path to ''
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
      current_setting('max_connections')::integer as max_connections,
      round(
        100.0 * coalesce(max(s.numbackends), 0)
        / nullif(current_setting('max_connections')::integer, 0),
        2
      ) as connection_pct,
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
      'max_connections', db.max_connections,
      'connection_pct', db.connection_pct,
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
