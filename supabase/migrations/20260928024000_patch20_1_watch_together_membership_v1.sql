-- AnimeBox Patch 20.1 — Watch Together authoritative room membership.
-- The browser transport (P2P/Realtime) stays ephemeral; Postgres stores only
-- short-lived presence required for capacity, lobby counts and host authority.

alter table public.watch_party_rooms
  add column if not exists host_epoch bigint not null default 0;

create table if not exists public.watch_party_room_members (
  room_id text not null references public.watch_party_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'guest'
    check (role in ('host', 'guest')),
  transport text not null default 'unknown'
    check (transport in ('p2p', 'turn', 'server', 'unknown')),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (room_id, user_id)
);

create index if not exists watch_party_room_members_live_idx
  on public.watch_party_room_members(room_id, last_seen_at desc)
  where left_at is null;

create index if not exists watch_party_room_members_user_idx
  on public.watch_party_room_members(user_id, last_seen_at desc);

alter table public.watch_party_room_members enable row level security;
revoke all on table public.watch_party_room_members from public, anon, authenticated;
grant select, insert, update, delete on table public.watch_party_room_members to service_role;

create or replace function public.watch_party_sync_member(
  p_room_id text,
  p_user_id uuid,
  p_join_secret text,
  p_display_name text,
  p_transport text default 'unknown',
  p_leave boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  room_host uuid;
  room_status text;
  room_secret text;
  room_expires timestamptz;
  room_max integer;
  room_episode integer;
  room_epoch bigint;
  room_code_value text;
  room_visibility text;
  live_count integer := 0;
  already_live boolean := false;
  safe_name text;
  safe_transport text;
begin
  if p_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_room_id is null or p_room_id !~ '^[a-f0-9]{24}$' then
    raise exception 'ROOM_INVALID';
  end if;

  if p_join_secret is null or p_join_secret !~ '^[a-f0-9]{32}$' then
    raise exception 'ROOM_SECRET_INVALID';
  end if;

  safe_name := left(
    nullif(
      btrim(regexp_replace(coalesce(p_display_name, ''), '[[:cntrl:]]', '', 'g')),
      ''
    ),
    32
  );
  if safe_name is null then
    safe_name := 'Гость';
  end if;

  safe_transport := case
    when p_transport in ('p2p', 'turn', 'server') then p_transport
    else 'unknown'
  end;

  perform pg_advisory_xact_lock(hashtextextended(p_room_id, 2010));

  select
    r.host_user_id,
    r.status,
    r.join_secret,
    r.expires_at,
    r.max_participants,
    r.episode,
    r.host_epoch,
    r.room_code,
    r.visibility
  into
    room_host,
    room_status,
    room_secret,
    room_expires,
    room_max,
    room_episode,
    room_epoch,
    room_code_value,
    room_visibility
  from public.watch_party_rooms r
  where r.id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if room_secret <> p_join_secret then
    raise exception 'ROOM_SECRET_INVALID';
  end if;

  if room_status = 'ended' or room_expires <= now() then
    raise exception 'ROOM_ENDED';
  end if;

  update public.watch_party_room_members m
  set left_at = coalesce(m.left_at, now())
  where m.room_id = p_room_id
    and m.left_at is null
    and m.last_seen_at < now() - interval '75 seconds';

  if p_leave then
    if p_user_id = room_host then
      raise exception 'HOST_MUST_TRANSFER_OR_END';
    end if;

    update public.watch_party_room_members
    set left_at = now(),
        last_seen_at = now()
    where room_id = p_room_id
      and user_id = p_user_id
      and left_at is null;
  else
    select exists (
      select 1
      from public.watch_party_room_members m
      where m.room_id = p_room_id
        and m.user_id = p_user_id
        and m.left_at is null
        and m.last_seen_at >= now() - interval '75 seconds'
    )
    into already_live;

    select count(*)::integer
    into live_count
    from public.watch_party_room_members m
    where m.room_id = p_room_id
      and m.left_at is null
      and m.last_seen_at >= now() - interval '75 seconds';

    if not already_live and live_count >= room_max then
      raise exception 'ROOM_FULL';
    end if;

    insert into public.watch_party_room_members(
      room_id,
      user_id,
      display_name,
      role,
      transport,
      joined_at,
      last_seen_at,
      left_at
    )
    values (
      p_room_id,
      p_user_id,
      safe_name,
      case when p_user_id = room_host then 'host' else 'guest' end,
      safe_transport,
      now(),
      now(),
      null
    )
    on conflict (room_id, user_id) do update set
      display_name = excluded.display_name,
      role = case
        when excluded.user_id = room_host then 'host'
        else 'guest'
      end,
      transport = excluded.transport,
      joined_at = case
        when public.watch_party_room_members.left_at is null
          then public.watch_party_room_members.joined_at
        else now()
      end,
      last_seen_at = now(),
      left_at = null;
  end if;

  select count(*)::integer
  into live_count
  from public.watch_party_room_members m
  where m.room_id = p_room_id
    and m.left_at is null
    and m.last_seen_at >= now() - interval '75 seconds';

  update public.watch_party_rooms
  set participant_count = greatest(
        case when room_status = 'ended' then 0 else 1 end,
        live_count
      ),
      updated_at = now()
  where id = p_room_id;

  return jsonb_build_object(
    'room_id', p_room_id,
    'host_user_id', room_host,
    'host_epoch', room_epoch,
    'participant_count', live_count,
    'max_participants', room_max,
    'episode', room_episode,
    'status', room_status,
    'room_code', room_code_value,
    'visibility', room_visibility,
    'role', case when p_user_id = room_host then 'host' else 'guest' end
  );
end;
$$;

revoke all on function public.watch_party_sync_member(
  text, uuid, text, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.watch_party_sync_member(
  text, uuid, text, text, text, boolean
) to service_role;

create or replace function public.watch_party_transfer_host_atomic(
  p_room_id text,
  p_current_host uuid,
  p_target_user uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  room_host uuid;
  room_status text;
  next_epoch bigint;
  target_live boolean := false;
begin
  if p_current_host is null or p_target_user is null or p_current_host = p_target_user then
    raise exception 'HOST_TRANSFER_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_room_id, 2011));

  select r.host_user_id, r.status, r.host_epoch
  into room_host, room_status, next_epoch
  from public.watch_party_rooms r
  where r.id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if room_status = 'ended' then
    raise exception 'ROOM_ENDED';
  end if;
  if room_host <> p_current_host then
    raise exception 'HOST_CHANGED';
  end if;

  update public.watch_party_room_members m
  set left_at = coalesce(m.left_at, now())
  where m.room_id = p_room_id
    and m.left_at is null
    and m.last_seen_at < now() - interval '75 seconds';

  select exists (
    select 1
    from public.watch_party_room_members m
    where m.room_id = p_room_id
      and m.user_id = p_target_user
      and m.left_at is null
      and m.last_seen_at >= now() - interval '75 seconds'
  )
  into target_live;

  if not target_live then
    raise exception 'TARGET_NOT_PRESENT';
  end if;

  next_epoch := next_epoch + 1;

  update public.watch_party_rooms
  set host_user_id = p_target_user,
      host_epoch = next_epoch,
      last_heartbeat_at = now(),
      updated_at = now()
  where id = p_room_id;

  update public.watch_party_room_members
  set role = case
        when user_id = p_target_user then 'host'
        else 'guest'
      end,
      last_seen_at = case
        when user_id = p_target_user then now()
        else last_seen_at
      end
  where room_id = p_room_id
    and user_id in (p_current_host, p_target_user)
    and left_at is null;

  return jsonb_build_object(
    'room_id', p_room_id,
    'host_user_id', p_target_user,
    'host_epoch', next_epoch
  );
end;
$$;

revoke all on function public.watch_party_transfer_host_atomic(
  text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.watch_party_transfer_host_atomic(
  text, uuid, uuid
) to service_role;

comment on table public.watch_party_room_members is
  'Short-lived authoritative Watch Together presence used for capacity, lobby counts and safe host transfer.';
comment on function public.watch_party_sync_member(text, uuid, text, text, text, boolean) is
  'Atomically validates an invite, refreshes/ends membership and recalculates room occupancy.';
comment on function public.watch_party_transfer_host_atomic(text, uuid, uuid) is
  'Atomically transfers Watch Together host authority only to a live room member.';


create or replace function public.watch_party_claim_stale_host(
  p_room_id text,
  p_candidate_user uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  room_host uuid;
  room_status text;
  room_epoch bigint;
  host_last_seen timestamptz;
  elected_user uuid;
begin
  if p_candidate_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_room_id is null or p_room_id !~ '^[a-f0-9]{24}$' then
    raise exception 'ROOM_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_room_id, 2012));

  select r.host_user_id, r.status, r.host_epoch
  into room_host, room_status, room_epoch
  from public.watch_party_rooms r
  where r.id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if room_status = 'ended' then
    raise exception 'ROOM_ENDED';
  end if;

  select m.last_seen_at
  into host_last_seen
  from public.watch_party_room_members m
  where m.room_id = p_room_id
    and m.user_id = room_host
    and m.left_at is null;

  if host_last_seen is not null
     and host_last_seen >= now() - interval '75 seconds' then
    return jsonb_build_object(
      'claimed', false,
      'reason', 'host_alive',
      'host_user_id', room_host,
      'host_epoch', room_epoch
    );
  end if;

  update public.watch_party_room_members m
  set left_at = coalesce(m.left_at, now())
  where m.room_id = p_room_id
    and m.left_at is null
    and m.last_seen_at < now() - interval '75 seconds';

  select m.user_id
  into elected_user
  from public.watch_party_room_members m
  where m.room_id = p_room_id
    and m.left_at is null
    and m.last_seen_at >= now() - interval '75 seconds'
    and m.user_id <> room_host
  order by m.joined_at asc, m.user_id asc
  limit 1;

  if elected_user is null then
    return jsonb_build_object(
      'claimed', false,
      'reason', 'no_successor',
      'host_user_id', room_host,
      'host_epoch', room_epoch
    );
  end if;

  if elected_user <> p_candidate_user then
    return jsonb_build_object(
      'claimed', false,
      'reason', 'not_elected',
      'host_user_id', room_host,
      'host_epoch', room_epoch,
      'elected_user_id', elected_user
    );
  end if;

  room_epoch := room_epoch + 1;

  update public.watch_party_rooms
  set host_user_id = elected_user,
      host_epoch = room_epoch,
      last_heartbeat_at = now(),
      updated_at = now()
  where id = p_room_id;

  update public.watch_party_room_members
  set role = case
        when user_id = elected_user then 'host'
        else 'guest'
      end,
      last_seen_at = case
        when user_id = elected_user then now()
        else last_seen_at
      end
  where room_id = p_room_id
    and left_at is null;

  return jsonb_build_object(
    'claimed', true,
    'reason', 'host_stale',
    'host_user_id', elected_user,
    'host_epoch', room_epoch
  );
end;
$$;

revoke all on function public.watch_party_claim_stale_host(text, uuid)
  from public, anon, authenticated;
grant execute on function public.watch_party_claim_stale_host(text, uuid)
  to service_role;

comment on function public.watch_party_claim_stale_host(text, uuid) is
  'Elects the oldest live guest as host after the previous host presence has expired. Advisory locking prevents split-brain host claims.';
