-- Server-only persistent provider metadata. IDs are MAL/Shikimori IDs.
create table if not exists public.anime_shikimori_metadata (
  mal_id bigint primary key check (mal_id > 0),
  title_ru text, title_romaji text, description text, poster_url text,
  format text, status text,
  start_year integer check(start_year between 1900 and 2200),
  start_month integer check(start_month between 1 and 12),
  episodes integer check(episodes > 0), episodes_aired integer check(episodes_aired >= 0),
  score numeric check(score > 0 and score <= 10),
  genres text[] not null default '{}', studios text[] not null default '{}',
  fetched_at timestamptz not null default now(), detail_fetched_at timestamptz
);
alter table public.anime_shikimori_metadata enable row level security;
revoke all on public.anime_shikimori_metadata from public, anon, authenticated;
grant select, insert, update on public.anime_shikimori_metadata to service_role;

create or replace view public.anime_saved_playable_catalog with (security_invoker=true) as
select d.anime_id,d.slug,
  case when d.title ~ '[А-Яа-яЁё]' then d.title else coalesce(nullif(m.title_ru,''),d.title) end as title,
  d.aliases,coalesce(nullif(d.description,''),m.description) as description,
  case when cardinality(d.genres)>0 then d.genres else coalesce(m.genres,'{}') end as genres,
  d.tags,coalesce(nullif(btrim(d.poster_url),''),m.poster_url) as poster_url,
  d.search_text,d.embedding,d.updated_at,
  case when cardinality(d.studios)>0 then d.studios else coalesce(m.studios,'{}') end as studios,
  coalesce(d.format,m.format) as format,coalesce(d.start_year,m.start_year) as start_year,
  coalesce(nullif(d.total_episodes,0),m.episodes) as total_episodes,
  coalesce(d.finished,case when m.status='released' then true when m.status is not null then false end) as finished,
  d.catalog_metadata_version,d.catalog_updated_at,a.mal_id,a.last_success_at,
  m.status as provider_status,m.start_month,m.score as provider_score,m.episodes_aired,
  m.title_romaji as provider_romaji
from public.anime_search_documents d
join public.anime_availability a on a.anime_id=d.anime_id
left join public.anime_shikimori_metadata m on m.mal_id=a.mal_id
where a.availability_status='playable' and a.max_episode>0
  and nullif(btrim(coalesce(nullif(btrim(d.poster_url),''),m.poster_url)),'') is not null;
revoke all on public.anime_saved_playable_catalog from public,anon,authenticated;
grant select on public.anime_saved_playable_catalog to service_role;
