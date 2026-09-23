-- Patch 13.6: make the authenticated SECURITY DEFINER comment RPC enforce
-- the same moderation boundary as the HTTP API. Direct PostgREST RPC calls
-- must not bypass mute/ban or race the anti-spam check.

create or replace function public.create_episode_comment(
  p_anime bigint,
  p_episode integer,
  p_body text,
  p_spoiler boolean default false,
  p_parent uuid default null,
  p_request uuid default gen_random_uuid()
)
returns public.comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  clean_body text := btrim(coalesce(p_body, ''));
  parent_comment public.comments;
  new_depth integer := 0;
  created_comment public.comments;
  control_status text;
  control_expires timestamptz;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_anime is null or p_anime <= 0 then
    raise exception 'INVALID_ANIME';
  end if;

  if p_episode is null or p_episode <= 0 then
    raise exception 'INVALID_EPISODE';
  end if;

  if p_request is null then
    raise exception 'INVALID_REQUEST';
  end if;

  if clean_body = '' then
    raise exception 'EMPTY_COMMENT';
  end if;

  if char_length(clean_body) > 4000 then
    raise exception 'COMMENT_TOO_LONG';
  end if;

  select status, expires_at
    into control_status, control_expires
  from public.admin_user_controls
  where user_id = uid;

  if control_status is not null and control_status <> 'active' then
    if control_expires is null or control_expires > now() then
      raise exception 'COMMENT_RESTRICTED';
    end if;

    update public.admin_user_controls
    set status = 'active',
        expires_at = null,
        updated_at = now()
    where user_id = uid;
  end if;

  -- Serialize writes per user so parallel tabs/direct RPC calls cannot race
  -- through the 5-second anti-spam check.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  select *
    into created_comment
  from public.comments
  where user_id = uid
    and request_id = p_request
  limit 1;

  if found then
    return created_comment;
  end if;

  if exists (
    select 1
    from public.comments
    where user_id = uid
      and created_at > now() - interval '5 seconds'
  ) then
    raise exception 'RATE_LIMIT';
  end if;

  if p_parent is not null then
    select *
      into parent_comment
    from public.comments
    where id = p_parent;

    if parent_comment.id is null then
      raise exception 'PARENT_NOT_FOUND';
    end if;

    if parent_comment.anime_id <> p_anime
       or parent_comment.episode_number <> p_episode then
      raise exception 'INVALID_PARENT_EPISODE';
    end if;

    new_depth := parent_comment.depth + 1;

    if new_depth > 5 then
      raise exception 'MAX_DEPTH';
    end if;
  end if;

  insert into public.comments (
    anime_id,
    episode_number,
    user_id,
    parent_id,
    depth,
    body,
    is_spoiler,
    request_id
  )
  values (
    p_anime,
    p_episode,
    uid,
    p_parent,
    new_depth,
    clean_body,
    coalesce(p_spoiler, false),
    p_request
  )
  returning * into created_comment;

  return created_comment;
end;
$$;

revoke all on function public.create_episode_comment(bigint, integer, text, boolean, uuid, uuid) from public;
grant execute on function public.create_episode_comment(bigint, integer, text, boolean, uuid, uuid) to authenticated;
