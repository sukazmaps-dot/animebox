-- AnimeBox Profile Progression v2
-- Featured achievements, celebration inbox, calendar leaderboard seasons,
-- and Hall of Fame snapshots.

alter table public.progression_events
  add column if not exists previous_total_xp bigint not null default 0,
  add column if not exists unlocked_codes text[] not null default '{}'::text[],
  add column if not exists seen_at timestamptz;

update public.progression_events
set seen_at = now()
where seen_at is null;

create index if not exists progression_events_user_unseen_idx
  on public.progression_events(user_id, created_at asc)
  where seen_at is null;

create table if not exists public.profile_featured_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_code text not null,
  position smallint not null check (position between 1 and 3),
  created_at timestamptz not null default now(),
  primary key (user_id, position),
  unique (user_id, achievement_code),
  foreign key (user_id, achievement_code)
    references public.user_achievements(user_id, achievement_code)
    on delete cascade
);

alter table public.profile_featured_achievements enable row level security;
revoke all on table public.profile_featured_achievements from anon, authenticated;
grant select, insert, update, delete on table public.profile_featured_achievements to service_role;

create index if not exists profile_featured_achievements_code_idx
  on public.profile_featured_achievements(achievement_code);

create table if not exists public.leaderboard_seasons (
  id uuid primary key default gen_random_uuid(),
  period_type text not null check (period_type in ('week', 'month')),
  period_key text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  finalized_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (period_type, period_key),
  check (ends_at > starts_at)
);

alter table public.leaderboard_seasons enable row level security;
revoke all on table public.leaderboard_seasons from anon, authenticated;
grant select, insert, update, delete on table public.leaderboard_seasons to service_role;

create index if not exists leaderboard_seasons_period_end_idx
  on public.leaderboard_seasons(period_type, ends_at desc);

create table if not exists public.leaderboard_season_entries (
  season_id uuid not null references public.leaderboard_seasons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  place smallint not null check (place between 1 and 10),
  active_ms bigint not null check (active_ms >= 0),
  episodes bigint not null check (episodes >= 0),
  username_snapshot text not null,
  avatar_path_snapshot text,
  created_at timestamptz not null default now(),
  primary key (season_id, place),
  unique (season_id, user_id)
);

alter table public.leaderboard_season_entries enable row level security;
revoke all on table public.leaderboard_season_entries from anon, authenticated;
grant select, insert, update, delete on table public.leaderboard_season_entries to service_role;

create index if not exists leaderboard_season_entries_user_idx
  on public.leaderboard_season_entries(user_id, season_id);

CREATE OR REPLACE FUNCTION public.set_featured_achievements(p_codes text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := auth.uid();
  normalized text[];
  code_count integer;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  normalized := coalesce(
    array(
      select btrim(code)
      from unnest(coalesce(p_codes, '{}'::text[])) with ordinality as item(code, ord)
      where btrim(code) <> ''
      order by ord
    ),
    '{}'::text[]
  );

  code_count := coalesce(array_length(normalized, 1), 0);

  if code_count > 3 then
    raise exception 'TOO_MANY_FEATURED_ACHIEVEMENTS';
  end if;

  if code_count <> (
    select count(distinct code)
    from unnest(normalized) as item(code)
  ) then
    raise exception 'DUPLICATE_FEATURED_ACHIEVEMENTS';
  end if;

  if exists (
    select 1
    from unnest(normalized) as item(code)
    left join public.user_achievements ua
      on ua.user_id = uid
     and ua.achievement_code = item.code
    where ua.achievement_code is null
  ) then
    raise exception 'ACHIEVEMENT_NOT_EARNED';
  end if;

  delete from public.profile_featured_achievements
  where user_id = uid;

  insert into public.profile_featured_achievements(
    user_id,
    achievement_code,
    position
  )
  select
    uid,
    item.code,
    item.ord::smallint
  from unnest(normalized) with ordinality as item(code, ord);
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_user_progression(p_user uuid, p_premium_boost boolean, p_event_key text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  metrics jsonb;
  current_row public.user_progression%rowtype;
  previous_total bigint := 0;
  target_episodes bigint;
  target_titles bigint;
  target_watch_buckets bigint;
  target_comments bigint;
  delta_episodes bigint;
  delta_titles bigint;
  delta_watch_buckets bigint;
  delta_comments bigint;
  activity_gain bigint := 0;
  premium_gain bigint := 0;
  achievement_gain bigint := 0;
  unlocked jsonb := '[]'::jsonb;
  unlocked_codes text[] := '{}'::text[];
  event_id bigint := null;
  result jsonb;
begin
  if p_user is null then
    raise exception 'INVALID_USER';
  end if;

  if p_event_key is null or length(trim(p_event_key)) = 0 or length(p_event_key) > 180 then
    raise exception 'INVALID_EVENT_KEY';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 417));

  metrics := public.community_metrics(p_user);

  insert into public.user_progression(user_id)
  values (p_user)
  on conflict (user_id) do nothing;

  select *
  into current_row
  from public.user_progression
  where user_id = p_user
  for update;

  previous_total := current_row.total_xp;

  target_episodes := greatest(0, coalesce((metrics->>'episodes')::bigint, 0));
  target_titles := greatest(0, coalesce((metrics->>'titles')::bigint, 0));
  target_watch_buckets := greatest(
    0,
    floor(coalesce((metrics->>'active_ms')::numeric, 0) / 1800000.0)::bigint
  );
  target_comments := least(
    50,
    greatest(0, coalesce((metrics->>'comments')::bigint, 0))
  );

  delta_episodes := greatest(0, target_episodes - current_row.credited_episodes);
  delta_titles := greatest(0, target_titles - current_row.credited_titles);
  delta_watch_buckets := greatest(0, target_watch_buckets - current_row.credited_watch_buckets);
  delta_comments := greatest(0, target_comments - current_row.credited_comments);

  activity_gain :=
      delta_episodes * 10
    + delta_titles * 75
    + delta_watch_buckets * 15
    + delta_comments * 2;

  if coalesce(p_premium_boost, false) and activity_gain > 0 then
    premium_gain := floor(activity_gain * 0.20)::bigint;
  end if;

  with eligible as (
    select a.code
    from public.achievements a
    where not a.hidden
      and coalesce((metrics->>a.metric)::bigint, 0) >= a.threshold
  ),
  inserted as (
    insert into public.user_achievements(user_id, achievement_code)
    select p_user, e.code
    from eligible e
    on conflict do nothing
    returning achievement_code
  )
  select
    coalesce(sum(a.xp_reward), 0)::bigint,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'code', a.code,
          'title', a.title,
          'rarity', a.rarity,
          'xpReward', a.xp_reward
        )
        order by a.sort_order, a.code
      ),
      '[]'::jsonb
    ),
    coalesce(
      array_agg(a.code order by a.sort_order, a.code),
      '{}'::text[]
    )
  into achievement_gain, unlocked, unlocked_codes
  from inserted i
  join public.achievements a on a.code = i.achievement_code;

  update public.user_progression
  set
    activity_xp = activity_xp + activity_gain,
    premium_bonus_xp = premium_bonus_xp + premium_gain,
    achievement_xp = achievement_xp + achievement_gain,
    total_xp = total_xp + activity_gain + premium_gain + achievement_gain,
    credited_episodes = greatest(credited_episodes, target_episodes),
    credited_titles = greatest(credited_titles, target_titles),
    credited_watch_buckets = greatest(credited_watch_buckets, target_watch_buckets),
    credited_comments = greatest(credited_comments, target_comments),
    updated_at = now()
  where user_id = p_user;

  if activity_gain + premium_gain + achievement_gain > 0 then
    insert into public.progression_events(
      user_id,
      event_key,
      reason,
      previous_total_xp,
      base_xp,
      premium_bonus_xp,
      achievement_xp,
      total_xp,
      unlocked_codes
    )
    values (
      p_user,
      p_event_key,
      left(p_reason, 120),
      previous_total,
      activity_gain::integer,
      premium_gain::integer,
      achievement_gain::integer,
      (activity_gain + premium_gain + achievement_gain)::integer,
      unlocked_codes
    )
    on conflict (user_id, event_key) do nothing
    returning id into event_id;
  end if;

  select jsonb_build_object(
    'event_id', event_id,
    'previous_total_xp', previous_total,
    'total_xp', total_xp,
    'activity_xp', activity_xp,
    'premium_bonus_xp', premium_bonus_xp,
    'achievement_xp', achievement_xp,
    'credited_episodes', credited_episodes,
    'credited_titles', credited_titles,
    'credited_watch_buckets', credited_watch_buckets,
    'credited_comments', credited_comments,
    'earned_now', activity_gain + premium_gain + achievement_gain,
    'premium_bonus_now', premium_gain,
    'unlocked', unlocked,
    'updated_at', updated_at
  )
  into result
  from public.user_progression
  where user_id = p_user;

  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.my_community_profile()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select jsonb_build_object(
    'stats', public.community_metrics(uid),
    'progression', coalesce(
      (
        select jsonb_build_object(
          'total_xp', p.total_xp,
          'activity_xp', p.activity_xp,
          'premium_bonus_xp', p.premium_bonus_xp,
          'achievement_xp', p.achievement_xp,
          'updated_at', p.updated_at
        )
        from public.user_progression p
        where p.user_id = uid
      ),
      jsonb_build_object(
        'total_xp', 0,
        'activity_xp', 0,
        'premium_bonus_xp', 0,
        'achievement_xp', 0,
        'updated_at', null
      )
    ),
    'featured_achievements', (
      select coalesce(
        jsonb_agg(f.achievement_code order by f.position),
        '[]'::jsonb
      )
      from public.profile_featured_achievements f
      where f.user_id = uid
    ),
    'achievements', (
      select coalesce(
        jsonb_agg(
          to_jsonb(a) || jsonb_build_object('earned_at', u.earned_at)
          order by a.sort_order, a.code
        ),
        '[]'::jsonb
      )
      from public.achievements a
      left join public.user_achievements u
        on u.achievement_code = a.code
       and u.user_id = uid
      where not a.hidden or u.earned_at is not null
    ),
    'library', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'anime_id', l.anime_id,
            'title', a.title,
            'status', l.status
          )
          order by l.updated_at desc
        ),
        '[]'::jsonb
      )
      from public.anime_library l
      join public.anime_catalog a on a.id = l.anime_id
      where l.user_id = uid
    )
  )
  into result;

  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_leaderboard_season(p_period_type text, p_period_key text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  totals as (
    select
      user_id,
      sum(credited_ms)::bigint as active_ms,
      count(*)::bigint as episodes,
      max(last_watched_at) as last_watched_at
    from per_episode
    where credited_ms > 0
    group by user_id
    having sum(credited_ms) > 0
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

CREATE OR REPLACE FUNCTION animebox_watch.leaderboard(p_period text DEFAULT 'week'::text, p_limit integer DEFAULT 100, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(rank_no bigint, user_id uuid, username text, avatar_path text, active_ms bigint, episodes bigint, last_watched_at timestamp with time zone, is_current_user boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'animebox_watch', 'public', 'pg_temp'
AS $function$
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
  totals as (
    select
      user_id,
      sum(credited_ms)::bigint as active_ms,
      count(*)::bigint as episodes,
      max(last_watched_at) as last_watched_at
    from per_episode
    where credited_ms > 0
    group by user_id
    having sum(credited_ms) > 0
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

revoke execute on function public.set_featured_achievements(text[])
from public, anon;
grant execute on function public.set_featured_achievements(text[])
to authenticated, service_role;

revoke execute on function public.sync_user_progression(uuid, boolean, text, text)
from public, anon, authenticated;
grant execute on function public.sync_user_progression(uuid, boolean, text, text)
to service_role;

revoke execute on function public.my_community_profile()
from public, anon;
grant execute on function public.my_community_profile()
to authenticated, service_role;

revoke execute on function public.finalize_leaderboard_season(text, text, timestamptz, timestamptz)
from public, anon, authenticated;
grant execute on function public.finalize_leaderboard_season(text, text, timestamptz, timestamptz)
to service_role;
