-- AnimeBox recovery — restore full Premium nickname effect contract.
-- Profile Studio stores the effect in premium_profile_settings.nickname_effect.
-- Manga Cut / Glitch were previously available only as entrance effects; they
-- are now valid nickname effects for profile + chat identity surfaces.

alter table public.premium_profile_settings
  drop constraint if exists premium_profile_settings_nickname_effect_check;

alter table public.premium_profile_settings
  add constraint premium_profile_settings_nickname_effect_check
  check (nickname_effect in ('none','gradient','shimmer','glow','manga','glitch'));

comment on column public.premium_profile_settings.nickname_effect is
  'Premium username effect shared by profile and chat: none, gradient, shimmer, glow, manga, glitch.';
