-- AnimeBox Patch 6 · Notification Center v2
-- Already applied to production. Kept idempotent for reproducible environments.

alter table public.notification_deliveries
  add column if not exists read_at timestamptz null;

create index if not exists notification_deliveries_user_created_idx
  on public.notification_deliveries (user_id, created_at desc);
