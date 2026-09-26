-- Patch 17.7 — Social & Community 2.0
-- Friends-only presence/activity, richer social notifications and comment reports.

alter table public.social_notifications
  drop constraint if exists social_notifications_type_check;

alter table public.social_notifications
  add constraint social_notifications_type_check
  check (
    type = any (
      array[
        'friend_request'::text,
        'friend_accepted'::text,
        'watch_party_invite'::text,
        'ranking_overtaken'::text,
        'ranking_entered_top10'::text,
        'comment_reply'::text,
        'comment_mention'::text
      ]
    )
  );

create table if not exists public.social_presence (
  user_id uuid primary key
    references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  surface text not null default 'site'
    check (surface in ('site', 'player', 'watch_together', 'chat')),
  updated_at timestamptz not null default now()
);

alter table public.social_presence enable row level security;

create index if not exists social_presence_last_seen_idx
  on public.social_presence(last_seen_at desc);

create table if not exists public.social_privacy (
  user_id uuid primary key
    references public.profiles(id) on delete cascade,
  show_online_to_friends boolean not null default true,
  show_activity_to_friends boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.social_privacy enable row level security;

create table if not exists public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null
    references public.comments(id) on delete cascade,
  reporter_id uuid not null
    references public.profiles(id) on delete cascade,
  reason text not null
    check (reason in ('spam', 'abuse', 'spoiler', 'scam', 'other')),
  details text,
  status text not null default 'open'
    check (status in ('open', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  unique (comment_id, reporter_id),
  check (details is null or char_length(details) <= 300)
);

alter table public.comment_reports enable row level security;

create index if not exists comment_reports_status_created_idx
  on public.comment_reports(status, created_at asc);

create index if not exists comment_reports_comment_idx
  on public.comment_reports(comment_id);

revoke all on table public.social_presence
  from public, anon, authenticated;
revoke all on table public.social_privacy
  from public, anon, authenticated;
revoke all on table public.comment_reports
  from public, anon, authenticated;

grant select, insert, update, delete on table public.social_presence
  to service_role;
grant select, insert, update, delete on table public.social_privacy
  to service_role;
grant select, insert, update, delete on table public.comment_reports
  to service_role;

comment on table public.social_presence is
  'Server-managed coarse AnimeBox presence. No location/device identifiers.';
comment on table public.social_privacy is
  'Friends-only online/activity visibility preferences.';
comment on table public.comment_reports is
  'Moderation queue for episode/title comments.';
