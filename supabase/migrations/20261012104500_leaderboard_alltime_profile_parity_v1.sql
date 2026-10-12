-- AnimeBox — all-time leaderboard watch history parity with profiles.
-- Keep week/month rankings based on accepted heartbeat events in their UTC
-- windows. For 'all', progress.active_ms matches public.community_metrics()
-- and retains legacy accepted activity after heartbeat history is compacted.
-- No data updates, grants, or changes to progression/anti-abuse ingestion.

create or replace function animebox_watch.leaderboard(
  p_period text default 'week'::text,
  p_limit integer default 100,
  p_user_id uuid default null::uuid
)
returns table(
  rank_no bigint,
  user_id uuid,
  username text,
  avatar_path text,
  active_ms bigint,
  episodes bigint,
  last_watched_at timestamptz,
  is_current_user boolean
)
language sql
stable
set search_path to 'animebox_watch', 'public', 'pg_temp'
as $function$
  with bounds as (
    select case p_period
      when 'week' then
        (date_trunc('week', now() at time zone 'UTC') at time zone 'UTC')
      when 'month' then
        (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC')
      when 'all' then '-infinity'::timestamptz
      else
        (date_trunc('week', now() at time zone 'UTC') at time zone 'UTC')
    end as since
  ),
  heartbeat_sessions as materialized (
    select
      h.session_id,
      sum(h.accepted_ms)::bigint as accepted_ms,
      max(h.received_at) as last_watched_at
    from animebox_watch.heartbeats h
    cross join bounds b
    where p_period <> 'all'
      and h.accepted_ms > 0
      and h.received_at >= b.since
    group by h.session_id
  ),
  per_episode as (
    select
      s.user_id,
      s.episode_id,
      least(
        coalesce(sum(hs.accepted_ms), 0)::bigint,
        coalesce(max(e.duration_ms), 14400000)::bigint
      ) as credited_ms,
      max(hs.last_watched_at) as last_watched_at
    from heartbeat_sessions hs
    join animebox_watch.sessions s on s.id = hs.session_id
    join animebox_watch.episodes e on e.id = s.episode_id
    group by s.user_id, s.episode_id
  ),
  completed as (
    select
      p.user_id,
      count(*)::bigint as completed_episodes
    from animebox_watch.progress p
    cross join bounds b
    where p_period <> 'all'
      and p.completed_at is not null
      and p.completed_at >= b.since
    group by p.user_id
  ),
  period_totals as (
    select
      pe.user_id,
      sum(pe.credited_ms)::bigint as active_ms,
      coalesce(c.completed_episodes, 0)::bigint as episodes,
      max(pe.last_watched_at) as last_watched_at
    from per_episode pe
    left join completed c on c.user_id = pe.user_id
    where pe.credited_ms > 0
    group by pe.user_id, c.completed_episodes
    having sum(pe.credited_ms) > 0
  ),
  -- All-time must use the same durable per-episode progress ledger as
  -- public.community_metrics(), not the shorter-lived heartbeat event log.
  -- Filtering p_period ensures the two branches cannot double count.
  all_time_totals as (
    select
      p.user_id,
      coalesce(sum(p.active_ms), 0)::bigint as active_ms,
      count(*) filter (where p.completed_at is not null)::bigint as episodes,
      max(p.last_watched_at) as last_watched_at
    from animebox_watch.progress p
    where p_period = 'all'
    group by p.user_id
    having coalesce(sum(p.active_ms), 0) > 0
  ),
  totals as (
    select user_id, active_ms, episodes, last_watched_at from period_totals
    union all
    select user_id, active_ms, episodes, last_watched_at from all_time_totals
  ),
  ranked as (
    select
      row_number() over (
        order by t.active_ms desc, t.last_watched_at desc, t.user_id
      )::bigint as rank_no,
      t.user_id,
      coalesce(nullif(btrim(p.username), ''), 'Пользователь')::text as username,
      p.avatar_path,
      t.active_ms,
      t.episodes,
      t.last_watched_at
    from totals t
    join public.profiles p on p.id = t.user_id
  )
  select
    r.rank_no,
    r.user_id,
    r.username,
    r.avatar_path,
    r.active_ms,
    r.episodes,
    r.last_watched_at,
    (p_user_id is not null and r.user_id = p_user_id) as is_current_user
  from ranked r
  where r.rank_no <= least(greatest(coalesce(p_limit, 100), 1), 100)
     or (p_user_id is not null and r.user_id = p_user_id)
  order by r.rank_no;
$function$;

comment on function animebox_watch.leaderboard(text, integer, uuid) is
  'Week/month: time-windowed accepted heartbeats. All-time: durable progress.active_ms, matching community_metrics profile watch time.';
