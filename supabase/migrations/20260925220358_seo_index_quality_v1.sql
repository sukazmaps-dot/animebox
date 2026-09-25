-- Patch 18.5.5.5 — SEO Index Quality & Crawl Intelligence
-- Service-role-only registry of canonical, quality-gated AnimeBox title URLs.
-- Sitemaps read this local registry and never call AniList directly.

create table if not exists public.seo_anime_index (
  anime_id bigint primary key check (anime_id > 0),
  slug text not null check (char_length(slug) between 3 and 180),
  title text not null check (char_length(title) between 1 and 300),
  image_url text,
  status text,
  source_shard smallint not null default -1
    check (source_shard between -1 and 69),
  sitemap_shard smallint not null
    check (sitemap_shard between 0 and 69),
  quality_score smallint not null default 0
    check (quality_score between 0 and 10),
  indexable boolean not null default false,
  content_fingerprint text not null
    check (char_length(content_fingerprint) between 16 and 128),
  last_content_change_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.seo_anime_index enable row level security;

revoke all on table public.seo_anime_index
  from public, anon, authenticated, service_role;

grant select, insert, update, delete
  on table public.seo_anime_index
  to service_role;

drop policy if exists seo_anime_index_service_role_only
  on public.seo_anime_index;

create policy seo_anime_index_service_role_only
  on public.seo_anime_index
  for all
  to service_role
  using (true)
  with check (true);

create index if not exists seo_anime_index_sitemap_idx
  on public.seo_anime_index(sitemap_shard, anime_id)
  where indexable = true;

create index if not exists seo_anime_index_freshness_idx
  on public.seo_anime_index(indexable, last_verified_at);

-- Seed the registry with already-known search documents so the new sitemap
-- does not start empty before the background AniList scan completes.
insert into public.seo_anime_index (
  anime_id,
  slug,
  title,
  image_url,
  status,
  source_shard,
  sitemap_shard,
  quality_score,
  indexable,
  content_fingerprint,
  last_content_change_at,
  last_verified_at,
  updated_at
)
select
  d.anime_id,
  d.slug,
  d.title,
  d.poster_url,
  null,
  -1,
  mod(d.anime_id, 70)::smallint,
  (
    case
      when char_length(btrim(coalesce(d.description, ''))) >= 80 then 2
      when char_length(btrim(coalesce(d.description, ''))) >= 20 then 1
      else 0
    end
    + case when cardinality(coalesce(d.genres, '{}'::text[])) > 0 then 1 else 0 end
    + case when nullif(btrim(coalesce(d.poster_url, '')), '') is not null then 1 else 0 end
  )::smallint as quality_score,
  (
    (
      case
        when char_length(btrim(coalesce(d.description, ''))) >= 80 then 2
        when char_length(btrim(coalesce(d.description, ''))) >= 20 then 1
        else 0
      end
      + case when cardinality(coalesce(d.genres, '{}'::text[])) > 0 then 1 else 0 end
      + case when nullif(btrim(coalesce(d.poster_url, '')), '') is not null then 1 else 0 end
    ) >= 2
  ) as indexable,
  md5(concat_ws(
    '|',
    d.anime_id::text,
    d.slug,
    d.title,
    coalesce(d.description, ''),
    array_to_string(coalesce(d.genres, '{}'::text[]), ','),
    coalesce(d.poster_url, '')
  )),
  d.updated_at,
  now(),
  now()
from public.anime_search_documents d
where
  d.anime_id > 0
  and nullif(btrim(coalesce(d.slug, '')), '') is not null
  and nullif(btrim(coalesce(d.title, '')), '') is not null
on conflict (anime_id) do nothing;

-- Fill any remaining locally known catalogue entries. These are conservative:
-- no indexability unless at least two independent quality signals exist.
insert into public.seo_anime_index (
  anime_id,
  slug,
  title,
  image_url,
  status,
  source_shard,
  sitemap_shard,
  quality_score,
  indexable,
  content_fingerprint,
  last_content_change_at,
  last_verified_at,
  updated_at
)
select
  c.id,
  c.slug,
  c.title,
  c.poster_url,
  case when c.finished then 'FINISHED' else null end,
  -1,
  mod(c.id, 70)::smallint,
  (
    case when cardinality(coalesce(c.genres, '{}'::text[])) > 0 then 1 else 0 end
    + case when c.total_episodes is not null and c.total_episodes > 0 then 1 else 0 end
    + case when nullif(btrim(coalesce(c.poster_url, '')), '') is not null then 1 else 0 end
  )::smallint,
  (
    case when cardinality(coalesce(c.genres, '{}'::text[])) > 0 then 1 else 0 end
    + case when c.total_episodes is not null and c.total_episodes > 0 then 1 else 0 end
    + case when nullif(btrim(coalesce(c.poster_url, '')), '') is not null then 1 else 0 end
  ) >= 2,
  md5(concat_ws(
    '|',
    c.id::text,
    c.slug,
    c.title,
    coalesce(c.total_episodes::text, ''),
    array_to_string(coalesce(c.genres, '{}'::text[]), ','),
    coalesce(c.poster_url, ''),
    c.finished::text
  )),
  c.updated_at,
  now(),
  now()
from public.anime_catalog c
where
  c.id > 0
  and nullif(btrim(coalesce(c.slug, '')), '') is not null
  and nullif(btrim(coalesce(c.title, '')), '') is not null
on conflict (anime_id) do nothing;

comment on table public.seo_anime_index is
  'Service-role-only canonical title registry used by AnimeBox sitemaps. last_content_change_at changes only when the SEO-relevant fingerprint changes.';
