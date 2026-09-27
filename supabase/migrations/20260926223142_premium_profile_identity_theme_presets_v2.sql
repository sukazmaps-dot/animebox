alter table public.premium_profile_settings
  drop constraint if exists premium_profile_settings_theme_check,
  add constraint premium_profile_settings_theme_check
    check (theme in ('default','violet','midnight','sakura','crimson','ocean','gold'));
