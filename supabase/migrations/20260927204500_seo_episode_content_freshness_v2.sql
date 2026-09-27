-- Patch 19.4.1 — SEO Growth Engine v2
-- Separate crawler-visible content freshness from routine provider verification.

alter table if exists public.seo_episode_index
  add column if not exists content_fingerprint text;

alter table if exists public.seo_episode_index
  add column if not exists last_content_change_at timestamptz;

update public.seo_episode_index
set
  content_fingerprint = coalesce(
    nullif(content_fingerprint, ''),
    md5(concat_ws(
      '|',
      anime_id::text,
      episode_number::text,
      coalesce(slug, ''),
      coalesce(thumbnail_url, ''),
      coalesce(provider, ''),
      coalesce(indexable::text, 'false')
    ))
  ),
  last_content_change_at = coalesce(
    last_content_change_at,
    first_available_at,
    last_confirmed_at,
    now()
  )
where
  content_fingerprint is null
  or content_fingerprint = ''
  or last_content_change_at is null;

alter table if exists public.seo_episode_index
  alter column last_content_change_at set default now();

create index if not exists seo_episode_index_content_change_idx
  on public.seo_episode_index(indexable, last_content_change_at desc);

comment on column public.seo_episode_index.last_confirmed_at is
  'Provider availability freshness. Routine confirmation must not be used as sitemap lastmod.';

comment on column public.seo_episode_index.last_content_change_at is
  'Crawler-facing freshness. Changes only when SEO-relevant episode content changes.';

comment on column public.seo_episode_index.content_fingerprint is
  'Hash of SEO-relevant episode fields used to keep sitemap lastmod stable across routine verification.';
