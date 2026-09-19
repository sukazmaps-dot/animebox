-- AnimeBox Production Integrity Hotfix
-- Apply AFTER the new application code is deployed successfully.
-- Idempotent: safe to run again.

begin;

-- 1) Public profile media must contain only server-approved files.
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'profile-media',
  'profile-media',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'profile-media-quarantine',
  'profile-media-quarantine',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Remove the moderation bypass: browser clients can no longer publish new files
-- directly into the public bucket. Existing public read + own-delete policies stay.
drop policy if exists "Users upload own profile media" on storage.objects;
drop policy if exists "Users update own profile media" on storage.objects;

-- 2) Internal SECURITY DEFINER helpers must not be callable as public RPCs.
revoke all on function public.profile_media_is_approved(uuid, text) from public, anon, authenticated;
revoke all on function public.guard_profile_media_update() from public, anon, authenticated;
revoke all on function public.guard_premium_profile_media_write() from public, anon, authenticated;
grant execute on function public.profile_media_is_approved(uuid, text) to service_role;
grant execute on function public.guard_profile_media_update() to service_role;
grant execute on function public.guard_premium_profile_media_write() to service_role;

revoke all on function public.create_chat_message(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_chat_message(text, uuid, uuid) to authenticated;
revoke all on function public.delete_chat_message(uuid) from public, anon, authenticated;
grant execute on function public.delete_chat_message(uuid) to authenticated;
revoke all on function public.toggle_chat_reaction(uuid, text) from public, anon, authenticated;
grant execute on function public.toggle_chat_reaction(uuid, text) to authenticated;

revoke all on function public.broadcast_chat_message_change() from public, anon, authenticated;
revoke all on function public.broadcast_chat_reaction_change() from public, anon, authenticated;
grant execute on function public.broadcast_chat_message_change() to service_role;
grant execute on function public.broadcast_chat_reaction_change() to service_role;

-- 3) Cover foreign keys used by Community and Profile Media moderation.
create index if not exists chat_notifications_actor_id_idx on public.chat_notifications(actor_id);
create index if not exists chat_notifications_message_id_idx on public.chat_notifications(message_id);
create index if not exists chat_reactions_user_id_idx on public.chat_reactions(user_id);
create index if not exists chat_reports_reporter_id_idx on public.chat_reports(reporter_id);
create index if not exists chat_reports_resolved_by_idx on public.chat_reports(resolved_by) where resolved_by is not null;
create index if not exists chat_settings_pinned_message_id_idx on public.chat_settings(pinned_message_id) where pinned_message_id is not null;
create index if not exists chat_settings_updated_by_idx on public.chat_settings(updated_by) where updated_by is not null;
create index if not exists profile_media_moderation_reviewed_by_idx on public.profile_media_moderation(reviewed_by) where reviewed_by is not null;
create index if not exists profile_media_review_groups_reviewed_by_idx on public.profile_media_review_groups(reviewed_by) where reviewed_by is not null;

commit;
