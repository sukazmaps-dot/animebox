-- Patch 11.2.2a · Friends System index hardening
-- Covers foreign keys used by request/notification maintenance paths.

create index if not exists friendships_requested_by_idx
  on public.friendships(requested_by);

create index if not exists social_notifications_actor_id_idx
  on public.social_notifications(actor_id)
  where actor_id is not null;
