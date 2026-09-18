-- AnimeBox Ad System v1
-- Run once in Supabase SQL Editor.

create table if not exists public.ad_settings (
  id text primary key,
  enabled boolean not null default true,
  max_ads_per_session integer not null default 3,
  min_seconds_between_ads integer not null default 120,
  placements jsonb not null default '{
    "home-after-smart-feed": true,
    "catalog-after-results": true,
    "anime-detail-before-related": true,
    "watch-below-engagement": true
  }'::jsonb,
  updated_by uuid null,
  updated_at timestamptz not null default now(),
  constraint ad_settings_singleton check (id = 'global'),
  constraint ad_settings_max_ads_check check (max_ads_per_session between 1 and 10),
  constraint ad_settings_cooldown_check check (min_seconds_between_ads between 0 and 1800)
);

alter table public.ad_settings enable row level security;

-- No client policies on purpose. The public app reads a sanitized config via
-- /api/ads/config and the admin panel writes through the service-role server.
revoke all on table public.ad_settings from anon, authenticated;

insert into public.ad_settings (
  id,
  enabled,
  max_ads_per_session,
  min_seconds_between_ads,
  placements
)
values (
  'global',
  true,
  3,
  120,
  '{
    "home-after-smart-feed": true,
    "catalog-after-results": true,
    "anime-detail-before-related": true,
    "watch-below-engagement": true
  }'::jsonb
)
on conflict (id) do nothing;
