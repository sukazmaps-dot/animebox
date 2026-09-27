-- AnimeBox 20.0 — Trusted Progression Foundation.
-- Existing earned XP/achievements are preserved. After this migration, new
-- watch-derived rewards can only advance from the trusted server event ledger.

create table if not exists public.progression_trust_baselines (
  user_id uuid primary key,
  captured_at timestamptz not null default now(),
  shonen_titles bigint not null default 0 check (shonen_titles >= 0),
  romance_titles bigint not null default 0 check (romance_titles >= 0),
  action_titles bigint not null default 0 check (action_titles >= 0),
  fantasy_titles bigint not null default 0 check (fantasy_titles >= 0),
  comedy_titles bigint not null default 0 check (comedy_titles >= 0)
);

alter table public.progression_trust_baselines enable row level security;
revoke all on table public.progression_trust_baselines from public, anon, authenticated;
grant select, insert, update, delete on table public.progression_trust_baselines to service_role;

insert into public.progression_trust_baselines (
  user_id,
  captured_at,
  shonen_titles,
  romance_titles,
  action_titles,
  fantasy_titles,
  comedy_titles
)
select
  p.user_id,
  now(),
  greatest(0, coalesce((m.metrics->>'shonen_titles')::bigint, 0)),
  greatest(0, coalesce((m.metrics->>'romance_titles')::bigint, 0)),
  greatest(0, coalesce((m.metrics->>'action_titles')::bigint, 0)),
  greatest(0, coalesce((m.metrics->>'fantasy_titles')::bigint, 0)),
  greatest(0, coalesce((m.metrics->>'comedy_titles')::bigint, 0))
from public.user_progression p
cross join lateral (
  select public.community_metrics(p.user_id) as metrics
) m
on conflict (user_id) do nothing;

create or replace function public.trusted_progression_metrics(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with baseline as materialized (
    select
      b.captured_at,
      b.shonen_titles,
      b.romance_titles,
      b.action_titles,
      b.fantasy_titles,
      b.comedy_titles
    from public.progression_trust_baselines b
    where b.user_id = p_user

    union all

    select
      now(),
      0::bigint,
      0::bigint,
      0::bigint,
      0::bigint,
      0::bigint
    where not exists (
      select 1
      from public.progression_trust_baselines b
      where b.user_id = p_user
    )
    limit 1
  ),
  progression as (
    select
      coalesce(max(p.credited_episodes), 0)::bigint as credited_episodes,
      coalesce(max(p.credited_titles), 0)::bigint as credited_titles,
      coalesce(max(p.credited_watch_buckets), 0)::bigint as credited_watch_buckets,
      coalesce(max(p.credited_comments), 0)::bigint as credited_comments
    from public.user_progression p
    where p.user_id = p_user
  ),
  trusted_activity as (
    select
      coalesce(sum(e.active_ms), 0)::bigint as active_ms,
      coalesce(sum(e.completed_episodes), 0)::bigint as completed_episodes,
      coalesce(sum(e.completed_titles), 0)::bigint as completed_titles
    from public.challenge_activity_events e
    where e.user_id = p_user
  ),
  trusted_title_ids as materialized (
    select distinct pe.entity_id::bigint as anime_id
    from public.product_events pe
    cross join baseline b
    where pe.user_id = p_user
      and pe.event_name = 'trusted_episode_completed'
      and pe.created_at >= b.captured_at
      and pe.entity_id ~ '^[0-9]+$'
      and coalesce(pe.metadata->>'completed_title', 'false') = 'true'
  ),
  new_genres as (
    select
      count(*) filter (
        where a.genres && array['Shounen','Shonen','Сёнен','Сенен']
      )::bigint as shonen_titles,
      count(*) filter (
        where a.genres && array['Romance','Романтика']
      )::bigint as romance_titles,
      count(*) filter (
        where a.genres && array['Action','Экшен']
      )::bigint as action_titles,
      count(*) filter (
        where a.genres && array['Fantasy','Фэнтези']
      )::bigint as fantasy_titles,
      count(*) filter (
        where a.genres && array['Comedy','Комедия']
      )::bigint as comedy_titles
    from trusted_title_ids t
    join public.anime_catalog a on a.id = t.anime_id
  ),
  comments as (
    select count(*)::bigint as comments
    from public.comments c
    where c.user_id = p_user
      and c.deleted_at is null
  ),
  streak as (
    select coalesce(max(s.longest_streak), 0)::bigint as longest_streak
    from public.user_streaks s
    where s.user_id = p_user
  ),
  resolved as (
    select
      greatest(p.credited_episodes, a.completed_episodes)::bigint as episodes,
      greatest(p.credited_titles, a.completed_titles)::bigint as titles,
      greatest(
        p.credited_watch_buckets * 1800000,
        a.active_ms
      )::bigint as active_ms,
      greatest(p.credited_comments, c.comments)::bigint as comments,
      s.longest_streak,
      b.shonen_titles + coalesce(g.shonen_titles, 0) as shonen_titles,
      b.romance_titles + coalesce(g.romance_titles, 0) as romance_titles,
      b.action_titles + coalesce(g.action_titles, 0) as action_titles,
      b.fantasy_titles + coalesce(g.fantasy_titles, 0) as fantasy_titles,
      b.comedy_titles + coalesce(g.comedy_titles, 0) as comedy_titles
    from progression p
    cross join trusted_activity a
    cross join baseline b
    cross join new_genres g
    cross join comments c
    cross join streak s
  )
  select jsonb_build_object(
    'episodes', r.episodes,
    'titles', r.titles,
    'minutes', floor(r.active_ms / 60000.0)::bigint,
    'watch_minutes', floor(r.active_ms / 60000.0)::bigint,
    'active_ms', r.active_ms,
    'shonen_titles', r.shonen_titles,
    'romance_titles', r.romance_titles,
    'action_titles', r.action_titles,
    'fantasy_titles', r.fantasy_titles,
    'comedy_titles', r.comedy_titles,
    'comments', r.comments,
    'longest_streak', r.longest_streak
  )
  from resolved r;
$$;

revoke all on function public.trusted_progression_metrics(uuid)
  from public, anon, authenticated;
grant execute on function public.trusted_progression_metrics(uuid)
  to service_role;

create or replace function public.sync_user_progression(
  p_user uuid,
  p_premium_boost boolean,
  p_event_key text,
  p_reason text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  achievement_gain bigint := 0;
  unlocked jsonb := '[]'::jsonb;
  unlocked_codes text[] := '{}'::text[];
  event_id bigint := null;
  result jsonb;
begin
  if p_user is null then
    raise exception 'INVALID_USER';
  end if;

  if p_event_key is null
     or length(trim(p_event_key)) = 0
     or length(p_event_key) > 180 then
    raise exception 'INVALID_EVENT_KEY';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 417));

  insert into public.progression_trust_baselines(user_id)
  values (p_user)
  on conflict (user_id) do nothing;

  metrics := public.trusted_progression_metrics(p_user);

  insert into public.user_progression(user_id)
  values (p_user)
  on conflict (user_id) do nothing;

  select *
  into current_row
  from public.user_progression
  where user_id = p_user
  for update;

  previous_total := current_row.total_xp;

  target_episodes := greatest(
    current_row.credited_episodes,
    coalesce((metrics->>'episodes')::bigint, 0)
  );
  target_titles := greatest(
    current_row.credited_titles,
    coalesce((metrics->>'titles')::bigint, 0)
  );
  target_watch_buckets := greatest(
    current_row.credited_watch_buckets,
    floor(coalesce((metrics->>'active_ms')::numeric, 0) / 1800000.0)::bigint
  );
  target_comments := greatest(
    current_row.credited_comments,
    least(50, greatest(0, coalesce((metrics->>'comments')::bigint, 0)))
  );

  delta_episodes := greatest(0, target_episodes - current_row.credited_episodes);
  delta_titles := greatest(0, target_titles - current_row.credited_titles);
  delta_watch_buckets := greatest(
    0,
    target_watch_buckets - current_row.credited_watch_buckets
  );
  delta_comments := greatest(0, target_comments - current_row.credited_comments);

  activity_gain :=
      delta_episodes * 10
    + delta_titles * 75
    + delta_watch_buckets * 15
    + delta_comments * 2;

  -- Premium is cosmetic only. Keep the historical input argument for API
  -- compatibility, but never mint premium progression XP.
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
    achievement_xp = achievement_xp + achievement_gain,
    total_xp = total_xp + activity_gain + achievement_gain,
    credited_episodes = target_episodes,
    credited_titles = target_titles,
    credited_watch_buckets = target_watch_buckets,
    credited_comments = target_comments,
    updated_at = now()
  where user_id = p_user;

  if activity_gain + achievement_gain > 0 then
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
      trim(p_event_key),
      left(p_reason, 120),
      previous_total,
      activity_gain::integer,
      0,
      achievement_gain::integer,
      0,
      (activity_gain + achievement_gain)::integer,
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
    'earned_now', activity_gain + achievement_gain,
    'premium_bonus_now', 0,
    'unlocked', unlocked,
    'updated_at', updated_at
  )
  into result
  from public.user_progression
  where user_id = p_user;

  return result;
end;
$$;

revoke all on function public.sync_user_progression(uuid, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.sync_user_progression(uuid, boolean, text, text)
  to service_role;

comment on table public.progression_trust_baselines is
  'Frozen legacy genre-achievement baseline used when AnimeBox switched progression to trusted watch events.';

comment on function public.trusted_progression_metrics(uuid) is
  'Reward-only progression metrics. Watch counters advance from server-trusted activity ledger, while legacy credited progress is preserved.';
