-- AnimeBox Premium media crop v4
-- Non-destructive browser framing for animated/static avatars and banners.
-- Safe additive migration. Run once in Supabase SQL Editor.

alter table public.premium_profile_settings
  add column if not exists avatar_position_x real not null default 50,
  add column if not exists avatar_position_y real not null default 50,
  add column if not exists avatar_zoom real not null default 1,
  add column if not exists banner_position_x real not null default 50,
  add column if not exists banner_position_y real not null default 50,
  add column if not exists banner_zoom real not null default 1;

comment on column public.premium_profile_settings.avatar_position_x is
  'Avatar focal position X in percent (0..100).';
comment on column public.premium_profile_settings.avatar_position_y is
  'Avatar focal position Y in percent (0..100).';
comment on column public.premium_profile_settings.avatar_zoom is
  'Avatar visual zoom multiplier (1..3).';
comment on column public.premium_profile_settings.banner_position_x is
  'Banner focal position X in percent (0..100).';
comment on column public.premium_profile_settings.banner_position_y is
  'Banner focal position Y in percent (0..100).';
comment on column public.premium_profile_settings.banner_zoom is
  'Banner visual zoom multiplier (1..3).';
