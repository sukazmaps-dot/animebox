create or replace function public.community_metrics(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with completed_episode_rows as (
    select
      e.anime_id,
      e.episode_number
    from animebox_watch.progress p
    join animebox_watch.episodes e
      on e.id = p.episode_id
    where p.user_id = p_user
      and p.completed_at is not null
  ),
  completed_titles as (
    select
      a.id,
      a.genres
    from public.anime_catalog a
    join completed_episode_rows h
      on h.anime_id = a.id
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
    'episodes',
    (select completed_episodes from watch_totals),
    'titles',
    (select count(*) from completed_titles),
    'minutes',
    (select floor(active_ms / 60000.0)::bigint from watch_totals),
    'active_ms',
    (select active_ms from watch_totals),
    'shonen_titles',
    (
      select count(*)
      from completed_titles
      where genres && array['Shounen','Shonen','Сёнен','Сенен']
    ),
    'comments',
    (
      select count(*)
      from public.comments
      where user_id = p_user
        and deleted_at is null
    ),
    'watching',
    (
      select count(*)
      from public.anime_library
      where user_id = p_user
        and status = 'watching'
    ),
    'planned',
    (
      select count(*)
      from public.anime_library
      where user_id = p_user
        and status = 'planned'
    ),
    'completed',
    (
      select count(*)
      from public.anime_library
      where user_id = p_user
        and status = 'completed'
    ),
    'dropped',
    (
      select count(*)
      from public.anime_library
      where user_id = p_user
        and status = 'dropped'
    )
  );
$$;
