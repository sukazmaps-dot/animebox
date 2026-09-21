-- Patch 11 cleanup: profile media no longer uses AI moderation.
-- Active flow is quarantine -> technical validation -> public publish -> profile DB write.
-- These legacy guards blocked avatar/banner writes unless profile_media_moderation
-- contained an approved row, which is no longer part of the active pipeline.

drop trigger if exists profiles_media_moderation_guard on public.profiles;
drop trigger if exists premium_profile_media_moderation_guard on public.premium_profile_settings;

drop function if exists public.guard_profile_media_update();
drop function if exists public.guard_premium_profile_media_write();
drop function if exists public.profile_media_is_approved(uuid, text);
