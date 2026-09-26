alter table public.premium_profile_settings
  add column if not exists atmosphere_effect text not null default 'none',
  add column if not exists atmosphere_intensity integer not null default 45,
  add column if not exists motion_mode text not null default 'soft',
  add column if not exists entrance_effect text not null default 'fade',
  add column if not exists nickname_effect text not null default 'none',
  add column if not exists hero_style text not null default 'cinematic',
  add column if not exists surface_style text not null default 'glass';

alter table public.premium_profile_settings
  drop constraint if exists premium_profile_settings_atmosphere_effect_check,
  add constraint premium_profile_settings_atmosphere_effect_check
    check (atmosphere_effect in ('none','aurora','embers','sakura','stardust')),
  drop constraint if exists premium_profile_settings_atmosphere_intensity_check,
  add constraint premium_profile_settings_atmosphere_intensity_check
    check (atmosphere_intensity between 0 and 100),
  drop constraint if exists premium_profile_settings_motion_mode_check,
  add constraint premium_profile_settings_motion_mode_check
    check (motion_mode in ('off','soft','live')),
  drop constraint if exists premium_profile_settings_entrance_effect_check,
  add constraint premium_profile_settings_entrance_effect_check
    check (entrance_effect in ('none','fade','bloom','manga','glitch')),
  drop constraint if exists premium_profile_settings_nickname_effect_check,
  add constraint premium_profile_settings_nickname_effect_check
    check (nickname_effect in ('none','gradient','shimmer','glow')),
  drop constraint if exists premium_profile_settings_hero_style_check,
  add constraint premium_profile_settings_hero_style_check
    check (hero_style in ('cinematic','spotlight','clean')),
  drop constraint if exists premium_profile_settings_surface_style_check,
  add constraint premium_profile_settings_surface_style_check
    check (surface_style in ('glass','deep','ink'));

comment on column public.premium_profile_settings.atmosphere_effect is
  'Premium profile ambient effect. One effect can be active at a time.';
comment on column public.premium_profile_settings.motion_mode is
  'Global Premium motion intensity: off, soft, or live.';
