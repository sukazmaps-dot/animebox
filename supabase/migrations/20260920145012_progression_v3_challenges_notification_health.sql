-- AnimeBox Progression v3: challenges, streaks, and notification diagnostics.

alter table public.user_progression
  add column if not exists challenge_xp bigint not null default 0;

alter table public.progression_events
  add column if not exists challenge_xp integer not null default 0,
  add column if not exists challenge_codes text[] not null default '{}'::text[];

create table if not exists public.challenge_definitions (
  code text primary key,
  period_type text not null check (period_type in ('daily','weekly')),
  title text not null,
  description text not null,
  metric text not null check (metric in ('active_minutes','completed_episodes','active_days')),
  goal integer not null check (goal > 0),
  xp_reward integer not null check (xp_reward >= 0 and xp_reward <= 5000),
  sort_order integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.challenge_definitions enable row level security;
revoke all on table public.challenge_definitions from anon, authenticated;
grant select, insert, update, delete on table public.challenge_definitions to service_role;
create index if not exists challenge_definitions_period_enabled_idx
  on public.challenge_definitions(period_type, enabled, sort_order);

create table if not exists public.challenge_activity_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  activity_date date not null,
  active_ms bigint not null default 0 check (active_ms >= 0),
  completed_episodes integer not null default 0 check (completed_episodes >= 0),
  comments integer not null default 0 check (comments >= 0),
  completed_titles integer not null default 0 check (completed_titles >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, event_key)
);
alter table public.challenge_activity_events enable row level security;
revoke all on table public.challenge_activity_events from anon, authenticated;
grant select, insert, update, delete on table public.challenge_activity_events to service_role;
create index if not exists challenge_activity_events_user_date_idx
  on public.challenge_activity_events(user_id, activity_date desc);

create table if not exists public.user_activity_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null,
  active_ms bigint not null default 0 check (active_ms >= 0),
  completed_episodes integer not null default 0 check (completed_episodes >= 0),
  comments integer not null default 0 check (comments >= 0),
  completed_titles integer not null default 0 check (completed_titles >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, activity_date)
);
alter table public.user_activity_days enable row level security;
revoke all on table public.user_activity_days from anon, authenticated;
grant select, insert, update, delete on table public.user_activity_days to service_role;
create index if not exists user_activity_days_user_date_idx
  on public.user_activity_days(user_id, activity_date desc);

create table if not exists public.user_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_active_date date,
  updated_at timestamptz not null default now()
);
alter table public.user_streaks enable row level security;
revoke all on table public.user_streaks from anon, authenticated;
grant select, insert, update, delete on table public.user_streaks to service_role;

create table if not exists public.user_challenge_completions (
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_code text not null references public.challenge_definitions(code) on delete cascade,
  period_key text not null,
  reward_xp integer not null default 0 check (reward_xp >= 0),
  completed_at timestamptz not null default now(),
  primary key (user_id, challenge_code, period_key)
);
alter table public.user_challenge_completions enable row level security;
revoke all on table public.user_challenge_completions from anon, authenticated;
grant select, insert, update, delete on table public.user_challenge_completions to service_role;
create index if not exists user_challenge_completions_user_time_idx
  on public.user_challenge_completions(user_id, completed_at desc);

create table if not exists public.notification_service_health (
  id smallint primary key default 1 check (id = 1),
  status text not null default 'unknown' check (status in ('unknown','ok','degraded','failed')),
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  checked integer not null default 0,
  matched integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  skipped integer not null default 0,
  player_available integer not null default 0,
  waiting_for_player integer not null default 0,
  availability_unknown integer not null default 0,
  duration_ms integer not null default 0,
  last_error_code text,
  updated_at timestamptz not null default now()
);
alter table public.notification_service_health enable row level security;
revoke all on table public.notification_service_health from anon, authenticated;
grant select, insert, update, delete on table public.notification_service_health to service_role;
insert into public.notification_service_health(id) values (1)
on conflict (id) do nothing;

insert into public.challenge_definitions
(code,period_type,title,description,metric,goal,xp_reward,sort_order,enabled)
values
('daily_warmup','daily','Разогрев','Набери 10 минут подтверждённого просмотра сегодня.','active_minutes',10,15,10,true),
('daily_episode','daily','Одна серия','Полностью посмотри хотя бы одну серию сегодня.','completed_episodes',1,25,20,true),
('daily_session','daily','Вечер в AnimeBox','Набери 30 минут подтверждённого просмотра сегодня.','active_minutes',30,35,30,true),
('weekly_watch','weekly','Неделя просмотра','Набери 3 часа подтверждённого просмотра за неделю.','active_minutes',180,100,110,true),
('weekly_episodes','weekly','Серийный марафон','Полностью посмотри 5 серий за неделю.','completed_episodes',5,100,120,true),
('weekly_stability','weekly','Стабильность','Будь активен минимум 10 минут в 3 разные дни недели.','active_days',3,125,130,true)
on conflict (code) do update set
  period_type=excluded.period_type,title=excluded.title,description=excluded.description,
  metric=excluded.metric,goal=excluded.goal,xp_reward=excluded.xp_reward,
  sort_order=excluded.sort_order,enabled=excluded.enabled,updated_at=now();

alter table public.achievements drop constraint if exists achievements_metric_check;
alter table public.achievements
  add constraint achievements_metric_check
  check (metric = any (array[
    'episodes'::text,'titles'::text,'watch_minutes'::text,'comments'::text,
    'shonen_titles'::text,'romance_titles'::text,'action_titles'::text,
    'fantasy_titles'::text,'comedy_titles'::text,'longest_streak'::text
  ]));

insert into public.achievements
(code,title,description,metric,threshold,icon,category,rarity,xp_reward,hidden,sort_order)
values
('streak_3','Три дня подряд','Поддерживай серию активности 3 дня подряд.','longest_streak',3,'/brand/achievements/marathon.svg','community','common',25,false,510),
('streak_7','Неделя в ритме','Поддерживай серию активности 7 дней подряд.','longest_streak',7,'/brand/achievements/marathon.svg','community','uncommon',50,false,520),
('streak_14','Две недели без паузы','Поддерживай серию активности 14 дней подряд.','longest_streak',14,'/brand/achievements/marathon.svg','community','rare',100,false,530),
('streak_30','Месяц в AnimeBox','Поддерживай серию активности 30 дней подряд.','longest_streak',30,'/brand/achievements/marathon.svg','community','epic',250,false,540),
('streak_100','Несокрушимая серия','Поддерживай серию активности 100 дней подряд.','longest_streak',100,'/brand/achievements/marathon.svg','community','legendary',500,false,550)
on conflict (code) do update set
  title=excluded.title,description=excluded.description,metric=excluded.metric,
  threshold=excluded.threshold,icon=excluded.icon,category=excluded.category,
  rarity=excluded.rarity,xp_reward=excluded.xp_reward,hidden=excluded.hidden,
  sort_order=excluded.sort_order;

update public.anime_notification_subscriptions s
set enabled=false, updated_at=now()
from public.anime_catalog a
where a.id=s.anime_id
  and a.finished=true
  and s.enabled=true;

CREATE OR REPLACE FUNCTION public.community_metrics(p_user uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with completed_episode_rows as (
    select e.anime_id, e.episode_number
    from animebox_watch.progress p
    join animebox_watch.episodes e on e.id = p.episode_id
    where p.user_id = p_user
      and p.completed_at is not null
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
    from animebox_watch.progress p
    where p.user_id = p_user
  )
  select jsonb_build_object(
    'episodes', (select completed_episodes from watch_totals),
    'titles', (select count(*) from completed_titles),
    'minutes', (select floor(active_ms / 60000.0)::bigint from watch_totals),
    'watch_minutes', (select floor(active_ms / 60000.0)::bigint from watch_totals),
    'active_ms', (select active_ms from watch_totals),
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
    'comments', (
      select count(*) from public.comments
      where user_id = p_user
        and deleted_at is null
    ),
    'longest_streak', coalesce(
      (select longest_streak from public.user_streaks where user_id = p_user),
      0
    ),
    'watching', (
      select count(*) from public.anime_library
      where user_id = p_user and status = 'watching'
    ),
    'planned', (
      select count(*) from public.anime_library
      where user_id = p_user and status = 'planned'
    ),
    'completed', (
      select count(*) from public.anime_library
      where user_id = p_user and status = 'completed'
    ),
    'dropped', (
      select count(*) from public.anime_library
      where user_id = p_user and status = 'dropped'
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.sync_user_challenges(p_user uuid, p_event_key text, p_active_ms bigint DEFAULT 0, p_completed_episodes integer DEFAULT 0, p_comments integer DEFAULT 0, p_completed_titles integer DEFAULT 0, p_activity_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  activity_day date;
  week_start date;
  daily_key text;
  weekly_key text;
  inserted_event integer := 0;
  day_active_ms bigint := 0;
  daily_minutes bigint := 0;
  daily_episodes bigint := 0;
  weekly_minutes bigint := 0;
  weekly_episodes bigint := 0;
  weekly_active_days bigint := 0;
  streak_row public.user_streaks%rowtype;
  next_streak integer := 0;
  effective_current_streak integer := 0;
  reward_gain bigint := 0;
  completed_codes text[] := '{}'::text[];
  previous_total bigint := 0;
  event_id bigint := null;
begin
  if p_user is null then
    raise exception 'INVALID_USER';
  end if;

  if p_event_key is null
     or length(trim(p_event_key)) = 0
     or length(p_event_key) > 160 then
    raise exception 'INVALID_EVENT_KEY';
  end if;

  if p_active_ms < 0
     or p_active_ms > 86400000
     or p_completed_episodes < 0
     or p_completed_episodes > 100
     or p_comments < 0
     or p_comments > 100
     or p_completed_titles < 0
     or p_completed_titles > 50 then
    raise exception 'INVALID_CHALLENGE_DELTA';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 417));

  activity_day := (coalesce(p_activity_at, now()) at time zone 'UTC')::date;
  week_start := date_trunc(
    'week',
    coalesce(p_activity_at, now()) at time zone 'UTC'
  )::date;
  daily_key := to_char(activity_day, 'YYYY-MM-DD');
  weekly_key := to_char(week_start, 'YYYY-MM-DD');

  insert into public.challenge_activity_events(
    user_id,
    event_key,
    activity_date,
    active_ms,
    completed_episodes,
    comments,
    completed_titles
  )
  values (
    p_user,
    trim(p_event_key),
    activity_day,
    p_active_ms,
    p_completed_episodes,
    p_comments,
    p_completed_titles
  )
  on conflict (user_id, event_key) do nothing;

  get diagnostics inserted_event = row_count;

  if inserted_event = 0 then
    select
      case
        when s.last_active_date is null then 0
        when s.last_active_date >= ((now() at time zone 'UTC')::date - 1)
          then s.current_streak
        else 0
      end
    into effective_current_streak
    from public.user_streaks s
    where s.user_id = p_user;

    return jsonb_build_object(
      'duplicate', true,
      'reward_xp', 0,
      'completed', '[]'::jsonb,
      'current_streak', coalesce(effective_current_streak, 0)
    );
  end if;

  insert into public.user_activity_days(
    user_id,
    activity_date,
    active_ms,
    completed_episodes,
    comments,
    completed_titles,
    updated_at
  )
  values (
    p_user,
    activity_day,
    p_active_ms,
    p_completed_episodes,
    p_comments,
    p_completed_titles,
    now()
  )
  on conflict (user_id, activity_date) do update set
    active_ms = public.user_activity_days.active_ms + excluded.active_ms,
    completed_episodes = public.user_activity_days.completed_episodes + excluded.completed_episodes,
    comments = public.user_activity_days.comments + excluded.comments,
    completed_titles = public.user_activity_days.completed_titles + excluded.completed_titles,
    updated_at = now()
  returning active_ms into day_active_ms;

  if day_active_ms >= 600000 then
    insert into public.user_streaks(
      user_id,
      current_streak,
      longest_streak,
      last_active_date,
      updated_at
    )
    values (
      p_user,
      1,
      1,
      activity_day,
      now()
    )
    on conflict (user_id) do nothing;

    select *
    into streak_row
    from public.user_streaks
    where user_id = p_user
    for update;

    if streak_row.last_active_date is null
       or streak_row.last_active_date < activity_day then
      next_streak := case
        when streak_row.last_active_date = activity_day - 1
          then streak_row.current_streak + 1
        else 1
      end;

      update public.user_streaks
      set
        current_streak = next_streak,
        longest_streak = greatest(longest_streak, next_streak),
        last_active_date = activity_day,
        updated_at = now()
      where user_id = p_user
      returning * into streak_row;
    end if;
  end if;

  select
    floor(d.active_ms / 60000.0)::bigint,
    d.completed_episodes::bigint
  into daily_minutes, daily_episodes
  from public.user_activity_days d
  where d.user_id = p_user
    and d.activity_date = activity_day;

  select
    floor(coalesce(sum(d.active_ms), 0) / 60000.0)::bigint,
    coalesce(sum(d.completed_episodes), 0)::bigint,
    count(*) filter (where d.active_ms >= 600000)::bigint
  into weekly_minutes, weekly_episodes, weekly_active_days
  from public.user_activity_days d
  where d.user_id = p_user
    and d.activity_date >= week_start
    and d.activity_date < week_start + 7;

  with candidate as (
    select
      c.code,
      c.period_type,
      c.xp_reward,
      case
        when c.period_type = 'daily' then daily_key
        else weekly_key
      end as period_key,
      case c.metric
        when 'active_minutes' then
          case when c.period_type = 'daily' then daily_minutes else weekly_minutes end
        when 'completed_episodes' then
          case when c.period_type = 'daily' then daily_episodes else weekly_episodes end
        when 'active_days' then
          case
            when c.period_type = 'daily'
              then case when day_active_ms >= 600000 then 1 else 0 end
            else weekly_active_days
          end
        else 0
      end as progress
    from public.challenge_definitions c
    where c.enabled
  ),
  inserted as (
    insert into public.user_challenge_completions(
      user_id,
      challenge_code,
      period_key,
      reward_xp
    )
    select
      p_user,
      c.code,
      c.period_key,
      c.xp_reward
    from candidate c
    join public.challenge_definitions d on d.code = c.code
    where c.progress >= d.goal
    on conflict do nothing
    returning challenge_code, reward_xp
  )
  select
    coalesce(sum(reward_xp), 0)::bigint,
    coalesce(array_agg(challenge_code order by challenge_code), '{}'::text[])
  into reward_gain, completed_codes
  from inserted;

  if reward_gain > 0 then
    insert into public.user_progression(user_id)
    values (p_user)
    on conflict (user_id) do nothing;

    select total_xp
    into previous_total
    from public.user_progression
    where user_id = p_user
    for update;

    update public.user_progression
    set
      challenge_xp = challenge_xp + reward_gain,
      total_xp = total_xp + reward_gain,
      updated_at = now()
    where user_id = p_user;

    insert into public.progression_events(
      user_id,
      event_key,
      reason,
      previous_total_xp,
      base_xp,
      premium_bonus_xp,
      achievement_xp,
      challenge_xp,
      total_xp,
      unlocked_codes,
      challenge_codes
    )
    values (
      p_user,
      'challenge:' || trim(p_event_key),
      'challenge_completed',
      previous_total,
      0,
      0,
      0,
      reward_gain::integer,
      reward_gain::integer,
      '{}'::text[],
      completed_codes
    )
    on conflict (user_id, event_key) do nothing
    returning id into event_id;
  end if;

  select
    case
      when s.last_active_date is null then 0
      when s.last_active_date >= ((now() at time zone 'UTC')::date - 1)
        then s.current_streak
      else 0
    end
  into effective_current_streak
  from public.user_streaks s
  where s.user_id = p_user;

  return jsonb_build_object(
    'duplicate', false,
    'event_id', event_id,
    'reward_xp', reward_gain,
    'completed', to_jsonb(completed_codes),
    'current_streak', coalesce(effective_current_streak, 0),
    'activity_date', daily_key,
    'week_key', weekly_key
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.user_challenges_snapshot(p_user uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with bounds as (
    select
      (now() at time zone 'UTC')::date as today,
      date_trunc('week', now() at time zone 'UTC')::date as week_start
  ),
  day_metrics as (
    select
      coalesce(floor(d.active_ms / 60000.0), 0)::bigint as active_minutes,
      coalesce(d.completed_episodes, 0)::bigint as completed_episodes,
      case when coalesce(d.active_ms, 0) >= 600000 then 1::bigint else 0::bigint end as active_days
    from bounds b
    left join public.user_activity_days d
      on d.user_id = p_user
     and d.activity_date = b.today
  ),
  week_metrics as (
    select
      coalesce(floor(sum(d.active_ms) / 60000.0), 0)::bigint as active_minutes,
      coalesce(sum(d.completed_episodes), 0)::bigint as completed_episodes,
      count(*) filter (where d.active_ms >= 600000)::bigint as active_days
    from bounds b
    left join public.user_activity_days d
      on d.user_id = p_user
     and d.activity_date >= b.week_start
     and d.activity_date < b.week_start + 7
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
          case when c.period_type = 'daily' then dm.active_minutes else wm.active_minutes end
        when 'completed_episodes' then
          case when c.period_type = 'daily' then dm.completed_episodes else wm.completed_episodes end
        when 'active_days' then
          case when c.period_type = 'daily' then dm.active_days else wm.active_days end
        else 0
      end::bigint as progress
    from public.challenge_definitions c
    cross join bounds b
    cross join day_metrics dm
    cross join week_metrics wm
    where c.enabled
  )
  select jsonb_build_object(
    'today_key', to_char(b.today, 'YYYY-MM-DD'),
    'week_key', to_char(b.week_start, 'YYYY-MM-DD'),
    'streak', jsonb_build_object(
      'current', coalesce(
        (
          select case
            when s.last_active_date >= b.today - 1 then s.current_streak
            else 0
          end
          from public.user_streaks s
          where s.user_id = p_user
        ),
        0
      ),
      'longest', coalesce(
        (select s.longest_streak from public.user_streaks s where s.user_id = p_user),
        0
      ),
      'last_active_date',
        (select s.last_active_date from public.user_streaks s where s.user_id = p_user)
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
  from bounds b;
$function$;

CREATE OR REPLACE FUNCTION animebox_watch.session_accepted_ms(p_user_id uuid, p_session_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(sum(h.accepted_ms), 0)::bigint
  from animebox_watch.sessions s
  join animebox_watch.heartbeats h on h.session_id = s.id
  where s.id = p_session_id
    and s.user_id = p_user_id
    and h.accepted_ms > 0;
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
      challenge_xp,
      total_xp,
      unlocked_codes,
      challenge_codes
    )
    values (
      p_user,
      p_event_key,
      left(p_reason, 120),
      previous_total,
      activity_gain::integer,
      premium_gain::integer,
      achievement_gain::integer,
      0,
      (activity_gain + premium_gain + achievement_gain)::integer,
      unlocked_codes,
      '{}'::text[]
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
    'challenge_xp', challenge_xp,
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
          'challenge_xp', p.challenge_xp,
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
        'challenge_xp', 0,
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

revoke execute on function public.sync_user_challenges(uuid,text,bigint,integer,integer,integer,timestamptz)
from public,anon,authenticated;
grant execute on function public.sync_user_challenges(uuid,text,bigint,integer,integer,integer,timestamptz)
to service_role;

revoke execute on function public.user_challenges_snapshot(uuid)
from public,anon,authenticated;
grant execute on function public.user_challenges_snapshot(uuid)
to service_role;

revoke execute on function animebox_watch.session_accepted_ms(uuid,uuid)
from public,anon,authenticated;
grant execute on function animebox_watch.session_accepted_ms(uuid,uuid)
to service_role;

revoke execute on function public.sync_user_progression(uuid,boolean,text,text)
from public,anon,authenticated;
grant execute on function public.sync_user_progression(uuid,boolean,text,text)
to service_role;

revoke execute on function public.my_community_profile()
from public,anon;
grant execute on function public.my_community_profile()
to authenticated,service_role;
