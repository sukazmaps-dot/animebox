-- Patch 11.3 · fresh episode SEO index
-- Server-owned index of episodes that AnimeBox has actually confirmed as playable.

create table if not exists public.seo_episode_index (
  anime_id bigint not null,
  episode_number integer not null check (episode_number > 0),
  slug text not null,
  first_available_at timestamptz not null default now(),
  last_confirmed_at timestamptz not null default now(),
  thumbnail_url text,
  provider text not null default 'unknown',
  indexable boolean not null default true,
  primary key (anime_id, episode_number)
);

alter table public.seo_episode_index enable row level security;

create index if not exists seo_episode_index_fresh_idx
  on public.seo_episode_index (indexable, last_confirmed_at desc);

create index if not exists seo_episode_index_slug_idx
  on public.seo_episode_index (slug, episode_number);

-- Preserve current SEO coverage while moving away from "someone completed it"
-- as the condition for an episode to appear in the sitemap.
insert into public.seo_episode_index (
  anime_id,
  episode_number,
  slug,
  first_available_at,
  last_confirmed_at,
  thumbnail_url,
  provider,
  indexable
)
select
  h.anime_id,
  h.episode_number,
  c.slug,
  min(h.completed_at) as first_available_at,
  max(h.completed_at) as last_confirmed_at,
  max(c.poster_url) as thumbnail_url,
  'history' as provider,
  true as indexable
from public.episodes_history h
join public.anime_catalog c on c.id = h.anime_id
where h.completed = true
  and h.completed_at is not null
  and h.episode_number > 0
  and nullif(trim(c.slug), '') is not null
group by h.anime_id, h.episode_number, c.slug
on conflict (anime_id, episode_number) do update
set
  slug = excluded.slug,
  first_available_at = least(
    public.seo_episode_index.first_available_at,
    excluded.first_available_at
  ),
  last_confirmed_at = greatest(
    public.seo_episode_index.last_confirmed_at,
    excluded.last_confirmed_at
  ),
  thumbnail_url = coalesce(
    excluded.thumbnail_url,
    public.seo_episode_index.thumbnail_url
  ),
  indexable = true;
