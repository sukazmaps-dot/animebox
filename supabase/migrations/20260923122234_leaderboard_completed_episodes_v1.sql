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
  per_episode as (
    select
      s.user_id,
      s.episode_id,
      least(
        coalesce(sum(h.accepted_ms), 0)::bigint,
        coalesce(max(e.duration_ms), 14400000)::bigint
      ) as credited_ms,
      max(h.received_at) as last_watched_at
    from animebox_watch.heartbeats h
    join animebox_watch.sessions s on s.id = h.session_id
    join animebox_watch.episodes e on e.id = s.episode_id
    cross join bounds b
    where h.accepted_ms > 0
      and h.received_at >= b.since
    group by s.user_id, s.episode_id
  ),
  completed as (
    select
      p.user_id,
      count(*)::bigint as completed_episodes
    from animebox_watch.progress p
    cross join bounds b
    where p.completed_at is not null
      and p.completed_at >= b.since
    group by p.user_id
  ),
  totals as (
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

create or replace function public.finalize_leaderboard_season(
  p_period_type text,
  p_period_key text,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  season_uuid uuid;
  inserted_season boolean := false;
  entry_count integer := 0;
begin
  if p_period_type not in ('week', 'month') then
    raise exception 'INVALID_PERIOD_TYPE';
  end if;

  if p_period_key is null
     or length(btrim(p_period_key)) < 4
     or length(p_period_key) > 40 then
    raise exception 'INVALID_PERIOD_KEY';
  end if;

  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'INVALID_PERIOD_BOUNDS';
  end if;

  if p_period_type = 'week' and p_ends_at - p_starts_at > interval '8 days' then
    raise exception 'INVALID_WEEK_LENGTH';
  end if;

  if p_period_type = 'month' and p_ends_at - p_starts_at > interval '32 days' then
    raise exception 'INVALID_MONTH_LENGTH';
  end if;

  insert into public.leaderboard_seasons(
    period_type,
    period_key,
    starts_at,
    ends_at
  )
  values (
    p_period_type,
    btrim(p_period_key),
    p_starts_at,
    p_ends_at
  )
  on conflict (period_type, period_key) do nothing
  returning id into season_uuid;

  if season_uuid is not null then
    inserted_season := true;
  else
    select id
    into season_uuid
    from public.leaderboard_seasons
    where period_type = p_period_type
      and period_key = btrim(p_period_key);

    select count(*)
    into entry_count
    from public.leaderboard_season_entries
    where season_id = season_uuid;

    return jsonb_build_object(
      'season_id', season_uuid,
      'period_type', p_period_type,
      'period_key', btrim(p_period_key),
      'created', false,
      'entries', entry_count
    );
  end if;

  with per_episode as (
    select
      s.user_id,
      s.episode_id,
      least(
        coalesce(sum(h.accepted_ms), 0)::bigint,
        coalesce(max(e.duration_ms), 14400000)::bigint
      ) as credited_ms,
      max(h.received_at) as last_watched_at
    from animebox_watch.heartbeats h
    join animebox_watch.sessions s on s.id = h.session_id
    join animebox_watch.episodes e on e.id = s.episode_id
    where h.accepted_ms > 0
      and h.received_at >= p_starts_at
      and h.received_at < p_ends_at
    group by s.user_id, s.episode_id
  ),
  completed as (
    select
      p.user_id,
      count(*)::bigint as completed_episodes
    from animebox_watch.progress p
    where p.completed_at is not null
      and p.completed_at >= p_starts_at
      and p.completed_at < p_ends_at
    group by p.user_id
  ),
  totals as (
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
  ranked as (
    select
      row_number() over (
        order by t.active_ms desc, t.last_watched_at desc, t.user_id
      )::smallint as place,
      t.user_id,
      t.active_ms,
      t.episodes,
      coalesce(nullif(btrim(p.username), ''), 'Пользователь')::text as username,
      p.avatar_path
    from totals t
    join public.profiles p on p.id = t.user_id
  )
  insert into public.leaderboard_season_entries(
    season_id,
    user_id,
    place,
    active_ms,
    episodes,
    username_snapshot,
    avatar_path_snapshot
  )
  select
    season_uuid,
    r.user_id,
    r.place,
    r.active_ms,
    r.episodes,
    r.username,
    r.avatar_path
  from ranked r
  where r.place <= 10
  order by r.place;

  get diagnostics entry_count = row_count;

  return jsonb_build_object(
    'season_id', season_uuid,
    'period_type', p_period_type,
    'period_key', btrim(p_period_key),
    'created', inserted_season,
    'entries', entry_count
  );
end;
$function$;

update public.leaderboard_season_entries entry
set episodes = coalesce(
  (
    select count(*)::bigint
    from animebox_watch.progress p
    where p.user_id = entry.user_id
      and p.completed_at is not null
      and p.completed_at >= season.starts_at
      and p.completed_at < season.ends_at
  ),
  0
)
from public.leaderboard_seasons season
where season.id = entry.season_id;

comment on column public.leaderboard_season_entries.episodes is
  'Number of episodes completed (>=90% eligible coverage) during the archived leaderboard period.';
