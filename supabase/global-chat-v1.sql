-- AnimeBox Global Chat v1
-- Public readable chat, authenticated writes, DB-enforced anti-spam,
-- soft deletion, reactions and Supabase Realtime Broadcast.

create extension if not exists pgcrypto;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  reply_to uuid null references public.chat_messages(id) on delete set null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz null,
  deleted_at timestamptz null,
  constraint chat_messages_body_length check (char_length(body) between 1 and 500),
  constraint chat_messages_user_request_unique unique (user_id, request_id)
);

create index if not exists chat_messages_created_at_idx
  on public.chat_messages (created_at desc, id desc);
create index if not exists chat_messages_user_created_at_idx
  on public.chat_messages (user_id, created_at desc);
create index if not exists chat_messages_reply_to_idx
  on public.chat_messages (reply_to)
  where reply_to is not null;

create table if not exists public.chat_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, reaction),
  constraint chat_reactions_allowed check (
    reaction in ('love', 'cry', 'fire', 'wow', 'dead', 'peak')
  )
);

create index if not exists chat_reactions_message_idx
  on public.chat_reactions (message_id);

alter table public.chat_messages enable row level security;
alter table public.chat_reactions enable row level security;

-- Reading is public. Writing is intentionally not granted through table RLS:
-- all writes go through the SECURITY DEFINER RPCs below.
drop policy if exists "chat_messages_public_read" on public.chat_messages;
create policy "chat_messages_public_read"
  on public.chat_messages
  for select
  to anon, authenticated
  using (true);

drop policy if exists "chat_reactions_public_read" on public.chat_reactions;
create policy "chat_reactions_public_read"
  on public.chat_reactions
  for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on public.chat_messages from anon, authenticated;
revoke insert, update, delete on public.chat_reactions from anon, authenticated;
grant select on public.chat_messages to anon, authenticated;
grant select on public.chat_reactions to anon, authenticated;

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

  if p_reply is not null and not exists (
    select 1
    from public.chat_messages
    where id = p_reply and deleted_at is null
  ) then
    raise exception 'CHAT_INVALID_REPLY';
  end if;

  -- Serialize writes per user so concurrent tabs cannot bypass the limiter.
  perform pg_advisory_xact_lock(hashtext(v_user::text));

  select max(created_at), count(*)
    into v_last, v_recent_count
  from public.chat_messages
  where user_id = v_user
    and created_at > now() - interval '20 seconds';

  if v_last is not null and v_last > now() - interval '2 seconds' then
    raise exception 'CHAT_RATE_FAST';
  end if;

  if coalesce(v_recent_count, 0) >= 6 then
    raise exception 'CHAT_RATE_BURST';
  end if;

  if exists (
    select 1
    from public.chat_messages
    where user_id = v_user
      and deleted_at is null
      and body = v_body
      and created_at > now() - interval '30 seconds'
  ) then
    raise exception 'CHAT_DUPLICATE';
  end if;

  insert into public.chat_messages (user_id, body, reply_to, request_id)
  values (v_user, v_body, p_reply, p_request)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.delete_chat_message(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
begin
  if v_user is null then
    raise exception 'CHAT_AUTH_REQUIRED';
  end if;

  select user_id into v_owner
  from public.chat_messages
  where id = p_id;

  if v_owner is null then
    raise exception 'CHAT_NOT_FOUND';
  end if;

  if v_owner <> v_user then
    raise exception 'CHAT_NOT_OWNER';
  end if;

  update public.chat_messages
  set body = 'Сообщение удалено.', deleted_at = coalesce(deleted_at, now())
  where id = p_id;

  return true;
end;
$$;

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
begin
  if v_user is null then
    raise exception 'CHAT_AUTH_REQUIRED';
  end if;

  if p_reaction not in ('love', 'cry', 'fire', 'wow', 'dead', 'peak') then
    raise exception 'CHAT_INVALID_REACTION';
  end if;

  if not exists (
    select 1 from public.chat_messages
    where id = p_message and deleted_at is null
  ) then
    raise exception 'CHAT_NOT_FOUND';
  end if;

  if exists (
    select 1 from public.chat_reactions
    where message_id = p_message
      and user_id = v_user
      and reaction = p_reaction
  ) then
    delete from public.chat_reactions
    where message_id = p_message
      and user_id = v_user
      and reaction = p_reaction;
    return false;
  end if;

  insert into public.chat_reactions (message_id, user_id, reaction)
  values (p_message, v_user, p_reaction)
  on conflict do nothing;

  return true;
end;
$$;

revoke all on function public.create_chat_message(text, uuid, uuid) from public;
revoke all on function public.delete_chat_message(uuid) from public;
revoke all on function public.toggle_chat_reaction(uuid, text) from public;
grant execute on function public.create_chat_message(text, uuid, uuid) to authenticated;
grant execute on function public.delete_chat_message(uuid) to authenticated;
grant execute on function public.toggle_chat_reaction(uuid, text) to authenticated;

-- Public database broadcasts: guests can read the live chat without auth.
-- The payload is intentionally only the changed row; profile decoration stays
-- in the cached/batched HTTP lookup and never goes through Vercel fan-out.
create or replace function public.broadcast_chat_message_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
begin
  perform realtime.send(
    case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end,
    tg_op,
    'chat:global',
    false
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.broadcast_chat_reaction_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
begin
  perform realtime.send(
    case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end,
    'REACTION_' || tg_op,
    'chat:global',
    false
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists chat_messages_realtime_broadcast on public.chat_messages;
create trigger chat_messages_realtime_broadcast
after insert or update on public.chat_messages
for each row execute function public.broadcast_chat_message_change();

drop trigger if exists chat_reactions_realtime_broadcast on public.chat_reactions;
create trigger chat_reactions_realtime_broadcast
after insert or delete on public.chat_reactions
for each row execute function public.broadcast_chat_reaction_change();
