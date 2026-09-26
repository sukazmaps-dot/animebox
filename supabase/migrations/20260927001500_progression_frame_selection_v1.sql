-- AnimeBox 18.8.1 — progression clarity + one active avatar frame.
-- Keeps admin level corrections auditable and makes the cosmetic slot exclusive:
-- League and level frames can be unlocked together, but only one may be worn.

alter table public.user_progression
  add column if not exists admin_adjustment_xp bigint not null default 0;

alter table public.profile_cosmetic_preferences
  add column if not exists active_frame_key text;

update public.profile_cosmetic_preferences
set active_frame_key = season_frame_key
where active_frame_key is null
  and season_frame_key is not null;

comment on column public.user_progression.admin_adjustment_xp is
  'Signed owner/admin correction used to set an exact AnimeBox level without corrupting earned XP source counters.';

comment on column public.profile_cosmetic_preferences.active_frame_key is
  'The single equipped avatar frame. May reference a temporary League frame or a permanent level frame; null means no cosmetic frame selected.';
