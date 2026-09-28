-- AnimeBox Patch 20.3.14 — Premium Banner Director
-- Safe, bounded presentation controls. No arbitrary CSS is stored.

alter table public.premium_profile_settings
  add column if not exists banner_height_mode text not null default 'standard',
  add column if not exists banner_saturation smallint not null default 100,
  add column if not exists banner_contrast smallint not null default 100,
  add column if not exists banner_brightness smallint not null default 100,
  add column if not exists banner_shade smallint not null default 62;

alter table public.premium_profile_settings
  drop constraint if exists premium_profile_settings_banner_height_mode_check,
  add constraint premium_profile_settings_banner_height_mode_check
    check (banner_height_mode in ('compact','standard','cinema','immersive')),
  drop constraint if exists premium_profile_settings_banner_saturation_check,
  add constraint premium_profile_settings_banner_saturation_check
    check (banner_saturation between 70 and 140),
  drop constraint if exists premium_profile_settings_banner_contrast_check,
  add constraint premium_profile_settings_banner_contrast_check
    check (banner_contrast between 85 and 125),
  drop constraint if exists premium_profile_settings_banner_brightness_check,
  add constraint premium_profile_settings_banner_brightness_check
    check (banner_brightness between 80 and 120),
  drop constraint if exists premium_profile_settings_banner_shade_check,
  add constraint premium_profile_settings_banner_shade_check
    check (banner_shade between 20 and 90);

comment on column public.premium_profile_settings.banner_height_mode is
  'Premium Banner Director height preset. Rendered by AnimeBox-owned CSS only.';
comment on column public.premium_profile_settings.banner_saturation is
  'Bounded banner saturation percentage, 70..140.';
comment on column public.premium_profile_settings.banner_contrast is
  'Bounded banner contrast percentage, 85..125.';
comment on column public.premium_profile_settings.banner_brightness is
  'Bounded banner brightness percentage, 80..120.';
comment on column public.premium_profile_settings.banner_shade is
  'Bottom readability shade strength, 20..90.';
