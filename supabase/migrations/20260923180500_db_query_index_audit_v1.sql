-- AnimeBox Patch 14.4.6 — DB Query & Index Audit
-- Surgical query rewrites based on pg_stat_statements + pg_stat_user_indexes.
-- No broad "unused index" cleanup: only one exact duplicate index is removed.

-- The unique constraint already provides the exact same btree key order.
-- Keeping both doubles write maintenance for episode metadata.
drop index if exists animebox_watch.watch_episodes_anime_idx;

-- Community metrics: scan each user-owned hot table once.
create or replace function public.community_metrics(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  with user_progress as materialized (
    select
      p.episode_id,
      p.active_ms,
      p.completed_at
    from animebox_watch.progress p
    where p.user_id = p_user
  ),
  completed_episode_rows as (
    select e.anime_id, e.episode_number
    from user_progress p
    join animebox_watch.episodes e on e.id = p.episode_id
    where p.completed_at is not null
  ),
  completed_titles as (
    select a.id, a.genres
    from public.anime_catalog a
    join completed_episode_rows h on h.anime_id = a.id
    where a.finished
      and a.total_episodes is not null
      and h.episode_number <= a.total_episodes
    group by a.id, a.genres, a.total_episodes
    having count(distinct h.episode_number) >= a.total_episodes
  ),
  watch_totals as (
    select
      count(*) filter (where p.completed_at is not null)::bigint as completed_episodes,
      coalesce(sum(p.active_ms), 0)::bigint as active_ms
    from user_progress p
  ),
  library_totals as (
    select
      count(*) filter (where l.status = 'watching')::bigint as watching,
      count(*) filter (where l.status = 'planned')::bigint as planned,
      count(*) filter (where l.status = 'completed')::bigint as completed,
      count(*) filter (where l.status = 'dropped')::bigint as dropped
    from public.anime_library l
    where l.user_id = p_user
  ),
  comment_totals as (
    select count(*)::bigint as comments
    from public.comments c
    where c.user_id = p_user
      and c.deleted_at is null
  ),
  streak as (
    select coalesce(max(s.longest_streak), 0)::bigint as longest_streak
    from public.user_streaks s
    where s.user_id = p_user
  )
  select jsonb_build_object(
    'episodes', wt.completed_episodes,
    'titles', (select count(*) from completed_titles),
    'minutes', floor(wt.active_ms / 60000.0)::bigint,
    'watch_minutes', floor(wt.active_ms / 60000.0)::bigint,
    'active_ms', wt.active_ms,
    'shonen_titles', (
      select count(*) from completed_titles
      where genres && array['Shounen','Shonen','Сёнен','Сенен']
    ),
    'romance_titles', (
      select count(*) from completed_titles
      where genres && array['Romance','Романтика']
    ),
    'action_titles', (
      select count(*) from completed_titles
      where genres && array['Action','Экшен']
    ),
    'fantasy_titles', (
      select count(*) from completed_titles
      where genres && array['Fantasy','Фэнтези']
    ),
    'comedy_titles', (
      select count(*) from completed_titles
      where genres && array['Comedy','Комедия']
    ),
    'comments', ct.comments,
    'longest_streak', st.longest_streak,
    'watching', lt.watching,
    'planned', lt.planned,
    'completed', lt.completed,
    'dropped', lt.dropped
  )
  from watch_totals wt
  cross join library_totals lt
  cross join comment_totals ct
  cross join streak st;
$function$;

-- Challenge snapshot: one 7-day activity scan + one streak lookup instead of
-- separate day/week scans and three repeated streak subqueries.
create or replace function public.user_challenges_snapshot(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  with bounds as (
    select
      (now() at time zone 'UTC')::date as today,
      date_trunc('week', now() at time zone 'UTC')::date as week_start
  ),
  activity as (
    select
      coalesce(
        floor(
          coalesce(sum(d.active_ms) filter (where d.activity_date = b.today), 0)
          / 60000.0
        ),
        0
      )::bigint as day_active_minutes,
      coalesce(
        sum(d.completed_episodes) filter (where d.activity_date = b.today),
        0
      )::bigint as day_completed_episodes,
      case
        when coalesce(
          sum(d.active_ms) filter (where d.activity_date = b.today),
          0
        ) >= 600000 then 1::bigint
        else 0::bigint
      end as day_active_days,
      coalesce(floor(coalesce(sum(d.active_ms), 0) / 60000.0), 0)::bigint
        as week_active_minutes,
      coalesce(sum(d.completed_episodes), 0)::bigint
        as week_completed_episodes,
      count(*) filter (where d.active_ms >= 600000)::bigint
        as week_active_days
    from bounds b
    left join public.user_activity_days d
      on d.user_id = p_user
     and d.activity_date >= b.week_start
     and d.activity_date < b.week_start + 7
    group by b.today
  ),
  streak as (
    select
      coalesce(max(s.current_streak) filter (
        where s.last_active_date >= b.today - 1
      ), 0)::bigint as current_streak,
      coalesce(max(s.longest_streak), 0)::bigint as longest_streak,
      max(s.last_active_date) as last_active_date
    from bounds b
    left join public.user_streaks s on s.user_id = p_user
    group by b.today
  ),
  challenges as (
    select
      c.*,
      case
        when c.period_type = 'daily'
          then to_char(b.today, 'YYYY-MM-DD')
        else to_char(b.week_start, 'YYYY-MM-DD')
      end as period_key,
      case c.metric
        when 'active_minutes' then
          case
            when c.period_type = 'daily' then a.day_active_minutes
            else a.week_active_minutes
          end
        when 'completed_episodes' then
          case
            when c.period_type = 'daily' then a.day_completed_episodes
            else a.week_completed_episodes
          end
        when 'active_days' then
          case
            when c.period_type = 'daily' then a.day_active_days
            else a.week_active_days
          end
        else 0
      end::bigint as progress
    from public.challenge_definitions c
    cross join bounds b
    cross join activity a
    where c.enabled
  )
  select jsonb_build_object(
    'today_key', to_char(b.today, 'YYYY-MM-DD'),
    'week_key', to_char(b.week_start, 'YYYY-MM-DD'),
    'streak', jsonb_build_object(
      'current', s.current_streak,
      'longest', s.longest_streak,
      'last_active_date', s.last_active_date
    ),
    'daily', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'code', c.code,
            'title', c.title,
            'description', c.description,
            'metric', c.metric,
            'goal', c.goal,
            'progress', least(c.progress, c.goal::bigint),
            'xp_reward', c.xp_reward,
            'completed_at', uc.completed_at
          )
          order by c.sort_order, c.code
        )
        from challenges c
        left join public.user_challenge_completions uc
          on uc.user_id = p_user
         and uc.challenge_code = c.code
         and uc.period_key = c.period_key
        where c.period_type = 'daily'
      ),
      '[]'::jsonb
    ),
    'weekly', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'code', c.code,
            'title', c.title,
            'description', c.description,
            'metric', c.metric,
            'goal', c.goal,
            'progress', least(c.progress, c.goal::bigint),
            'xp_reward', c.xp_reward,
            'completed_at', uc.completed_at
          )
          order by c.sort_order, c.code
        )
        from challenges c
        left join public.user_challenge_completions uc
          on uc.user_id = p_user
         and uc.challenge_code = c.code
         and uc.period_key = c.period_key
        where c.period_type = 'weekly'
      ),
      '[]'::jsonb
    )
  )
  from bounds b
  cross join streak s;
$function$;

-- Leaderboard: reduce the hot heartbeat relation before joining sessions and
-- episodes. Multiple heartbeats from the same session become one row first.
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
    where h.accepted_ms > 0
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

-- Archived season calculation gets the same pre-aggregation so cron/finalize
-- work does not repeatedly join every raw heartbeat row.
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

  with heartbeat_sessions as materialized (
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

-- A small partial index for a profile metric that otherwise filters deleted
-- comments after locating all comments for a user.
create index if not exists comments_user_live_idx
  on public.comments (user_id)
  where deleted_at is null;
