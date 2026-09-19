-- AnimeBox Community v1.1
-- Production moderation, reports, slow mode, pinned/system messages,
-- unread state and reply/mention notifications for Global Chat v1.

create extension if not exists pgcrypto;

alter table public.chat_messages
  add column if not exists kind text not null default 'user'
  check (kind in ('user', 'system'));

create table if not exists public.chat_settings (
  id smallint primary key default 1 check (id = 1),
  slow_mode_seconds integer not null default 0 check (slow_mode_seconds between 0 and 60),
  pinned_message_id uuid null references public.chat_messages(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.chat_settings (id, slow_mode_seconds)
values (1, 0)
on conflict (id) do nothing;

create table if not exists public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam', 'abuse', 'nsfw', 'spoiler', 'scam', 'other')),
  details text null check (details is null or char_length(details) <= 300),
  status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  resolved_by uuid null references auth.users(id) on delete set null,
  unique (message_id, reporter_id)
);

create index if not exists chat_reports_status_created_idx
  on public.chat_reports (status, created_at desc);

create table if not exists public.chat_read_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('mention', 'reply')),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz null,
  unique (user_id, type, message_id)
);

create index if not exists chat_notifications_user_unread_idx
  on public.chat_notifications (user_id, created_at desc)
  where read_at is null;

alter table public.chat_settings enable row level security;
alter table public.chat_reports enable row level security;
alter table public.chat_read_state enable row level security;
alter table public.chat_notifications enable row level security;

-- New v1.1 tables are intentionally server-routed. Do not expose direct writes.
revoke all on public.chat_settings from anon, authenticated;
revoke all on public.chat_reports from anon, authenticated;
revoke all on public.chat_read_state from anon, authenticated;
revoke all on public.chat_notifications from anon, authenticated;

-- Harden the existing DB-side send RPC. The API also validates messages,
-- but these checks make direct RPC calls obey the same product rules.
create or replace function public.create_chat_message(
  p_body text,
  p_reply uuid,
  p_request uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_existing uuid;
  v_last timestamptz;
  v_recent_count integer;
  v_status text;
  v_expires timestamptz;
  v_id uuid;
  v_slow_mode integer := 0;
  v_effective_slow integer := 2;
begin
  if v_user is null then
    raise exception 'CHAT_AUTH_REQUIRED';
  end if;

  if p_request is null then
    raise exception 'CHAT_INVALID_BODY';
  end if;

  select status, expires_at
    into v_status, v_expires
  from public.admin_user_controls
  where user_id = v_user;

  if v_status in ('muted', 'banned') then
    if v_expires is null or v_expires > now() then
      raise exception 'CHAT_RESTRICTED';
    end if;

    update public.admin_user_controls
    set status = 'active', expires_at = null, updated_at = now()
    where user_id = v_user;
  end if;

  select id into v_existing
  from public.chat_messages
  where user_id = v_user and request_id = p_request
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  if v_body = '' or char_length(v_body) > 500 or
     (length(v_body) - length(replace(v_body, E'\n', ''))) > 7 then
    raise exception 'CHAT_INVALID_BODY';
  end if;

  if (
    regexp_count(lower(v_body), 'https?://') +
    regexp_count(lower(v_body), 'www\.')
  ) > 2 then
    raise exception 'CHAT_TOO_MANY_LINKS';
  end if;

  if p_reply is not null and not exists (
    select 1
    from public.chat_messages
    where id = p_reply and deleted_at is null
  ) then
    raise exception 'CHAT_INVALID_REPLY';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user::text));

  select coalesce(slow_mode_seconds, 0)
    into v_slow_mode
  from public.chat_settings
  where id = 1;

  v_effective_slow := greatest(2, coalesce(v_slow_mode, 0));

  select max(created_at), count(*)
    into v_last, v_recent_count
  from public.chat_messages
  where user_id = v_user
    and kind = 'user'
    and created_at > now() - interval '20 seconds';

  if v_last is not null and v_last > now() - make_interval(secs => v_effective_slow) then
    raise exception 'CHAT_RATE_FAST';
  end if;

  if coalesce(v_recent_count, 0) >= 6 then
    raise exception 'CHAT_RATE_BURST';
  end if;

  if exists (
    select 1
    from public.chat_messages
    where user_id = v_user
      and kind = 'user'
      and deleted_at is null
      and lower(body) = lower(v_body)
      and created_at > now() - interval '45 seconds'
  ) then
    raise exception 'CHAT_DUPLICATE';
  end if;

  insert into public.chat_messages (user_id, body, reply_to, request_id, kind)
  values (v_user, v_body, p_reply, p_request, 'user')
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_chat_message(text, uuid, uuid) from public;
grant execute on function public.create_chat_message(text, uuid, uuid) to authenticated;


-- Reaction anti-spam and moderation-aware writes.
create or replace function public.toggle_chat_reaction(
  p_message uuid,
  p_reaction text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_status text;
  v_expires timestamptz;
  v_recent integer;
begin
  if v_user is null then raise exception 'CHAT_AUTH_REQUIRED'; end if;
  if p_reaction not in ('love', 'cry', 'fire', 'wow', 'dead', 'peak') then raise exception 'CHAT_INVALID_REACTION'; end if;

  select status, expires_at into v_status, v_expires
  from public.admin_user_controls where user_id = v_user;

  if v_status in ('muted', 'banned') and (v_expires is null or v_expires > now()) then
    raise exception 'CHAT_RESTRICTED';
  end if;

  if not exists (select 1 from public.chat_messages where id = p_message and deleted_at is null) then
    raise exception 'CHAT_NOT_FOUND';
  end if;

  if exists (
    select 1 from public.chat_reactions
    where message_id = p_message and user_id = v_user and reaction = p_reaction
  ) then
    delete from public.chat_reactions
    where message_id = p_message and user_id = v_user and reaction = p_reaction;
    return false;
  end if;

  select count(*) into v_recent
  from public.chat_reactions
  where user_id = v_user and created_at > now() - interval '10 seconds';

  if coalesce(v_recent, 0) >= 12 then raise exception 'CHAT_REACTION_RATE'; end if;

  insert into public.chat_reactions (message_id, user_id, reaction)
  values (p_message, v_user, p_reaction)
  on conflict do nothing;

  return true;
end;
$$;

revoke all on function public.toggle_chat_reaction(uuid, text) from public;
grant execute on function public.toggle_chat_reaction(uuid, text) to authenticated;
