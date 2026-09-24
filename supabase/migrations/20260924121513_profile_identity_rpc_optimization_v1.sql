create or replace function public.profile_identity_bundle(p_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with
widget_defaults(widget_key, default_position) as (
  values
    ('favorites'::text, 0),
    ('watching'::text, 1),
    ('ratings'::text, 2),
    ('genres'::text, 3),
    ('activity'::text, 4)
),
layout_rows as (
  select
    d.widget_key,
    coalesce(w.position::int, d.default_position) as position,
    coalesce(w.visible, true) as visible
  from widget_defaults d
  left join public.profile_widgets w
    on w.user_id = p_user_id
   and w.widget_key = d.widget_key
),
layout_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'key', widget_key,
        'position', position,
        'visible', visible
      )
      order by position, widget_key
    ),
    '[]'::jsonb
  ) as value
  from layout_rows
),
favorite_rows as (
  select
    f.anime_id,
    f.position::int as position,
    f.updated_at,
    c.title,
    c.poster_url,
    c.slug,
    coalesce(c.genres, array[]::text[]) as genres,
    c.total_episodes
  from public.profile_favorite_anime f
  join public.anime_catalog c on c.id = f.anime_id
  where f.user_id = p_user_id
  order by f.position asc, f.updated_at desc
  limit 6
),
favorites_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'animeId', anime_id,
        'title', title,
        'slug', slug,
        'posterUrl', poster_url,
        'genres', genres,
        'totalEpisodes', total_episodes,
        'position', position
      )
      order by position, anime_id
    ),
    '[]'::jsonb
  ) as value
  from favorite_rows
),
watching_rows as (
  select
    l.anime_id,
    l.updated_at,
    c.title,
    c.poster_url,
    c.slug,
    coalesce(c.genres, array[]::text[]) as genres,
    c.total_episodes
  from public.anime_library l
  join public.anime_catalog c on c.id = l.anime_id
  where l.user_id = p_user_id
    and l.status = 'watching'
  order by l.updated_at desc
  limit 6
),
watching_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'animeId', anime_id,
        'title', title,
        'slug', slug,
        'posterUrl', poster_url,
        'genres', genres,
        'totalEpisodes', total_episodes,
        'status', 'watching',
        'updatedAt', updated_at
      )
      order by updated_at desc
    ),
    '[]'::jsonb
  ) as value
  from watching_rows
),
rating_top_rows as (
  select
    r.anime_id,
    r.score::int as score,
    r.updated_at,
    c.title,
    c.poster_url,
    c.slug,
    coalesce(c.genres, array[]::text[]) as genres,
    c.total_episodes
  from public.anime_ratings r
  join public.anime_catalog c on c.id = r.anime_id
  where r.user_id = p_user_id
  order by r.score desc, r.updated_at desc
  limit 6
),
ratings_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'animeId', anime_id,
        'title', title,
        'slug', slug,
        'posterUrl', poster_url,
        'genres', genres,
        'totalEpisodes', total_episodes,
        'score', score,
        'updatedAt', updated_at
      )
      order by score desc, updated_at desc
    ),
    '[]'::jsonb
  ) as value
  from rating_top_rows
),
rating_summary as (
  select
    count(*)::int as count,
    case
      when count(*) > 0 then round(avg(score)::numeric, 1)
      else null
    end as average
  from public.anime_ratings
  where user_id = p_user_id
),
genre_signals as (
  select unnest(c.genres) as genre, 1::int as weight
  from public.anime_library l
  join public.anime_catalog c on c.id = l.anime_id
  where l.user_id = p_user_id
    and c.genres is not null

  union all

  select
    unnest(c.genres) as genre,
    case when r.score >= 9 then 3 when r.score >= 7 then 2 else 1 end::int as weight
  from public.anime_ratings r
  join public.anime_catalog c on c.id = r.anime_id
  where r.user_id = p_user_id
    and c.genres is not null

  union all

  select unnest(c.genres) as genre, 4::int as weight
  from public.profile_favorite_anime f
  join public.anime_catalog c on c.id = f.anime_id
  where f.user_id = p_user_id
    and c.genres is not null
),
genre_grouped as (
  select trim(genre) as name, sum(weight)::int as weight
  from genre_signals
  where trim(genre) <> ''
  group by trim(genre)
),
genre_total as (
  select coalesce(sum(weight), 0)::int as total
  from genre_grouped
),
genre_top as (
  select
    g.name,
    g.weight,
    case
      when t.total > 0 then round((g.weight::numeric / t.total::numeric) * 100)::int
      else 0
    end as share
  from genre_grouped g
  cross join genre_total t
  order by g.weight desc, g.name asc
  limit 6
),
genres_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', name,
        'weight', weight,
        'share', share
      )
      order by weight desc, name asc
    ),
    '[]'::jsonb
  ) as value
  from genre_top
),
rating_activity as (
  select
    concat('rating:', r.anime_id, ':', r.updated_at::text) as id,
    'rating'::text as kind,
    r.anime_id,
    c.title,
    c.slug,
    c.poster_url,
    'Поставил оценку'::text as label,
    concat(r.score::text, '/10') as value,
    r.updated_at as occurred_at
  from public.anime_ratings r
  join public.anime_catalog c on c.id = r.anime_id
  where r.user_id = p_user_id
  order by r.updated_at desc
  limit 10
),
library_activity as (
  select
    concat('library:', l.anime_id, ':', l.updated_at::text) as id,
    'library'::text as kind,
    l.anime_id,
    c.title,
    c.slug,
    c.poster_url,
    case l.status
      when 'watching' then 'Добавил в «Смотрю»'
      when 'planned' then 'Добавил в планы'
      when 'completed' then 'Отметил как просмотренное'
      when 'dropped' then 'Отметил как брошенное'
      else 'Обновил библиотеку'
    end as label,
    null::text as value,
    l.updated_at as occurred_at
  from public.anime_library l
  join public.anime_catalog c on c.id = l.anime_id
  where l.user_id = p_user_id
  order by l.updated_at desc
  limit 14
),
activity_top as (
  select *
  from (
    select * from rating_activity
    union all
    select * from library_activity
  ) activity
  order by occurred_at desc
  limit 6
),
activity_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'kind', kind,
        'animeId', anime_id,
        'title', title,
        'slug', slug,
        'posterUrl', poster_url,
        'label', label,
        'value', value,
        'occurredAt', occurred_at
      )
      order by occurred_at desc
    ),
    '[]'::jsonb
  ) as value
  from activity_top
)
select jsonb_build_object(
  'layout', (select value from layout_json),
  'favorites', (select value from favorites_json),
  'watching', (select value from watching_json),
  'ratings', (select value from ratings_json),
  'genres', (select value from genres_json),
  'activity', (select value from activity_json),
  'ratingSummary', jsonb_build_object(
    'count', (select count from rating_summary),
    'average', (select average from rating_summary)
  )
);
$$;

revoke all on function public.profile_identity_bundle(uuid) from public, anon, authenticated;
grant execute on function public.profile_identity_bundle(uuid) to service_role;

create or replace function public.save_my_profile_identity(
  p_layout jsonb,
  p_anime_ids bigint[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_layout_count int;
  v_layout_distinct int;
  v_anime_count int;
  v_anime_distinct int;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_layout is null
     or jsonb_typeof(p_layout) <> 'array'
     or jsonb_array_length(p_layout) <> 5 then
    raise exception 'Invalid profile widget layout' using errcode = '22023';
  end if;

  select
    count(*)::int,
    count(distinct item.widget_key)::int
  into v_layout_count, v_layout_distinct
  from jsonb_to_recordset(p_layout)
    as item(widget_key text, position int, visible boolean)
  where item.widget_key in ('favorites', 'watching', 'ratings', 'genres', 'activity')
    and item.position between 0 and 4;

  if v_layout_count <> 5 or v_layout_distinct <> 5 then
    raise exception 'Invalid profile widget layout' using errcode = '22023';
  end if;

  p_anime_ids := coalesce(p_anime_ids, array[]::bigint[]);
  v_anime_count := cardinality(p_anime_ids);

  if v_anime_count > 6 then
    raise exception 'Too many favorite anime' using errcode = '22023';
  end if;

  select count(distinct anime_id)::int
  into v_anime_distinct
  from unnest(p_anime_ids) as anime_id
  where anime_id is not null and anime_id > 0;

  if v_anime_distinct <> v_anime_count then
    raise exception 'Invalid favorite anime list' using errcode = '22023';
  end if;

  insert into public.profile_widgets (
    user_id,
    widget_key,
    position,
    visible,
    updated_at
  )
  select
    v_user_id,
    item.widget_key,
    item.position::smallint,
    coalesce(item.visible, true),
    now()
  from jsonb_to_recordset(p_layout)
    as item(widget_key text, position int, visible boolean)
  on conflict (user_id, widget_key) do update
  set
    position = excluded.position,
    visible = excluded.visible,
    updated_at = excluded.updated_at;

  delete from public.profile_favorite_anime
  where user_id = v_user_id
    and not (anime_id = any(p_anime_ids));

  insert into public.profile_favorite_anime (
    user_id,
    anime_id,
    position,
    updated_at
  )
  select
    v_user_id,
    favorite.anime_id,
    (favorite.ordinality - 1)::smallint,
    now()
  from unnest(p_anime_ids) with ordinality as favorite(anime_id, ordinality)
  on conflict (user_id, anime_id) do update
  set
    position = excluded.position,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.save_my_profile_identity(jsonb, bigint[]) from public, anon;
grant execute on function public.save_my_profile_identity(jsonb, bigint[]) to authenticated, service_role;
