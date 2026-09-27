-- AnimeBox 20.0 — Trusted League finalization.
-- High-risk users are removed before ranking. Existing finalized seasons remain
-- immutable because the function returns early when the season already exists.

create or replace function public.finalize_leaderboard_season(
  p_period_type text,
  p_period_key text,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  season_uuid uuid;
  inserted_season boolean := false;
  entry_count integer := 0;
  quarantined_count integer := 0;
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
      'entries', entry_count,
      'quarantined', 0
    );
  end if;

  with high_risk_users as materialized (
    select distinct pe.user_id
    from public.product_events pe
    where pe.user_id is not null
      and pe.event_name = 'watch_trust_assessed'
      and pe.created_at >= p_starts_at
      and pe.created_at < p_ends_at
      and coalesce(pe.metadata->>'state', '') = 'high_risk'
  )
  select count(*)::integer
  into quarantined_count
  from high_risk_users;

  with high_risk_users as materialized (
    select distinct pe.user_id
    from public.product_events pe
    where pe.user_id is not null
      and pe.event_name = 'watch_trust_assessed'
      and pe.created_at >= p_starts_at
      and pe.created_at < p_ends_at
      and coalesce(pe.metadata->>'state', '') = 'high_risk'
  ),
  heartbeat_sessions as materialized (
    select
      h.session_id,
      sum(h.accepted_ms)::bigint as accepted_ms,
      max(h.received_at) as last_watched_at
    from animebox_watch.heartbeats h
    where h.accepted_ms > 0
      and h.received_at >= p_starts_at
      and h.received_at < p_ends_at
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
    where not exists (
      select 1
      from high_risk_users hru
      where hru.user_id = s.user_id
    )
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
      and not exists (
        select 1
        from high_risk_users hru
        where hru.user_id = p.user_id
      )
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
    'entries', entry_count,
    'quarantined', quarantined_count
  );
end;
$$;

revoke all on function public.finalize_leaderboard_season(
  text, text, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.finalize_leaderboard_season(
  text, text, timestamptz, timestamptz
) to service_role;

comment on function public.finalize_leaderboard_season(
  text, text, timestamptz, timestamptz
) is
  'Creates an immutable trusted League snapshot. High-risk watch users are removed before row_number ranking and reward materialization.';
