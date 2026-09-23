-- AnimeBox Patch 14.4.7 — Profile / Leaderboard aggregation
-- Collapse profile and leaderboard read paths into bounded RPC snapshots.

create or replace function animebox_watch.title_overview_rows(
  p_user_id uuid,
  p_anime_ids bigint[]
)
returns table(
  anime_id bigint,
  title text,
  total_episodes integer,
  finished boolean,
  poster_url text,
  slug text,
  progress jsonb
)
language sql
stable
security definer
set search_path to ''
as $function$
  with requested as (
    select distinct value::bigint as anime_id
    from unnest(coalesce(p_anime_ids, '{}'::bigint[])) as value
    where value is not null and value > 0
  ),
  user_progress as materialized (
    select
      e.anime_id,
      e.id as episode_id,
      e.episode_number,
      e.duration_ms,
      p.watched_ranges,
      p.excluded_ranges,
      p.active_ms,
      p.completed_at,
      p.resume_position_ms,
      p.last_watched_at
    from animebox_watch.progress p
    join animebox_watch.episodes e
      on e.id = p.episode_id
    join requested r
      on r.anime_id = e.anime_id
    where p.user_id = p_user_id
  )
  select
    r.anime_id,
    coalesce(a.title, 'Аниме #' || r.anime_id::text)::text as title,
    a.total_episodes,
    coalesce(a.finished, false) as finished,
    a.poster_url,
    a.slug,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'episode_id', up.episode_id,
          'episode_number', up.episode_number,
          'duration_ms', up.duration_ms,
          'watched_ranges', up.watched_ranges,
          'excluded_ranges', up.excluded_ranges,
          'active_ms', up.active_ms,
          'completed_at', up.completed_at,
          'resume_position_ms', up.resume_position_ms,
          'last_watched_at', up.last_watched_at
        )
        order by up.episode_number
      ) filter (where up.episode_id is not null),
      '[]'::jsonb
    ) as progress
  from requested r
  left join public.anime_catalog a
    on a.id = r.anime_id
  left join user_progress up
    on up.anime_id = r.anime_id
  group by
    r.anime_id,
    a.title,
    a.total_episodes,
    a.finished,
    a.poster_url,
    a.slug
  order by r.anime_id;
$function$;

revoke execute on function animebox_watch.title_overview_rows(uuid, bigint[])
  from public, anon, authenticated;
grant execute on function animebox_watch.title_overview_rows(uuid, bigint[])
  to service_role;


create or replace function public.my_community_profile_bundle()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  with library_rows as materialized (
    select
      l.anime_id,
      a.title,
      l.status,
      l.updated_at
    from public.anime_library l
    join public.anime_catalog a
      on a.id = l.anime_id
    where l.user_id = uid
  ),
  library_ids as (
    select coalesce(array_agg(l.anime_id order by l.updated_at desc), '{}'::bigint[]) as ids
    from library_rows l
  )
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
    'premium_badge', exists(
      select 1
      from public.user_entitlements e
      where e.user_id = uid
        and e.entitlement = 'premiumBadge'
        and e.active = true
        and e.starts_at <= now()
        and (e.expires_at is null or e.expires_at > now())
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
            'title', l.title,
            'status', l.status
          )
          order by l.updated_at desc
        ),
        '[]'::jsonb
      )
      from library_rows l
    ),
    'challenges', public.user_challenges_snapshot(uid),
    'watch_overview_rows', (
      select coalesce(
        jsonb_agg(to_jsonb(w) order by w.anime_id),
        '[]'::jsonb
      )
      from library_ids ids
      cross join lateral animebox_watch.title_overview_rows(uid, ids.ids) w
    )
  )
  into result;

  return result;
end;
$function$;

revoke execute on function public.my_community_profile_bundle()
  from public, anon;
grant execute on function public.my_community_profile_bundle()
  to authenticated, service_role;


create or replace function public.community_leaderboard_bundle(
  p_period text default 'week'::text,
  p_limit integer default 100,
  p_user_id uuid default null::uuid
)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  with ranked as materialized (
    select *
    from animebox_watch.leaderboard(
      p_period,
      least(greatest(coalesce(p_limit, 100), 1), 100),
      p_user_id
    )
  ),
  active_entitlements as (
    select
      e.user_id,
      jsonb_agg(e.entitlement order by e.entitlement) as entitlements
    from public.user_entitlements e
    join ranked r
      on r.user_id = e.user_id
    where e.active = true
      and e.starts_at <= now()
      and (e.expires_at is null or e.expires_at > now())
      and e.entitlement in (
        'premiumBadge',
        'profileStudio',
        'premiumThemes',
        'animatedAvatar'
      )
    group by e.user_id
  )
  select jsonb_build_object(
    'entries',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'rank_no', r.rank_no,
          'user_id', r.user_id,
          'username', r.username,
          'avatar_path', r.avatar_path,
          'active_ms', r.active_ms,
          'episodes', r.episodes,
          'last_watched_at', r.last_watched_at,
          'is_current_user', r.is_current_user,
          'progression', jsonb_build_object(
            'total_xp', coalesce(up.total_xp, 0),
            'activity_xp', coalesce(up.activity_xp, 0),
            'premium_bonus_xp', coalesce(up.premium_bonus_xp, 0),
            'achievement_xp', coalesce(up.achievement_xp, 0),
            'challenge_xp', coalesce(up.challenge_xp, 0)
          ),
          'sponsor_total', coalesce(sd.total_stars, 0),
          'sponsor_preferences', coalesce(
            to_jsonb(sp)
              - 'user_id'
              - 'created_at'
              - 'updated_at',
            '{}'::jsonb
          ),
          'premium_settings', coalesce(
            to_jsonb(ps)
              - 'user_id'
              - 'updated_at',
            '{}'::jsonb
          ),
          'entitlements', coalesce(ae.entitlements, '[]'::jsonb)
        )
        order by r.rank_no
      ),
      '[]'::jsonb
    )
  )
  from ranked r
  left join public.user_progression up
    on up.user_id = r.user_id
  left join public.sponsor_directory_v3 sd
    on sd.user_id = r.user_id
  left join public.sponsor_preferences sp
    on sp.user_id = r.user_id
  left join public.premium_profile_settings ps
    on ps.user_id = r.user_id
  left join active_entitlements ae
    on ae.user_id = r.user_id;
$function$;

revoke execute on function public.community_leaderboard_bundle(text, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.community_leaderboard_bundle(text, integer, uuid)
  to service_role;
