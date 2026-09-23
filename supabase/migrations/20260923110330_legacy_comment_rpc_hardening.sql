-- Patch 13.6 follow-up: legacy community comment RPC must enforce the
-- moderation boundary even when called directly through PostgREST.

create or replace function public.create_comment(
  p_anime bigint,
  p_body text,
  p_spoiler boolean,
  p_parent uuid,
  p_request uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  clean_body text := btrim(coalesce(p_body, ''));
  result uuid;
  parent_depth integer := -1;
  control_status text;
  control_expires timestamptz;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_anime is null or p_anime <= 0
     or clean_body = ''
     or char_length(clean_body) > 4000
     or p_spoiler is null
     or p_request is null then
    raise exception 'INVALID_INPUT';
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

  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  select id into result
  from public.comments
  where user_id = uid
    and request_id = p_request
  limit 1;

  if found then
    return result;
  end if;

  if exists (
    select 1
    from public.comments
    where user_id = uid
      and created_at > now() - interval '10 seconds'
  ) then
    raise exception 'RATE_LIMIT';
  end if;

  if p_parent is not null then
    select depth into parent_depth
    from public.comments
    where id = p_parent
      and anime_id = p_anime;

    if not found then
      raise exception 'INVALID_PARENT';
    end if;

    if parent_depth >= 8 then
      raise exception 'MAX_DEPTH';
    end if;
  end if;

  insert into public.comments(
    anime_id,
    user_id,
    parent_id,
    depth,
    body,
    is_spoiler,
    request_id
  )
  values(
    p_anime,
    uid,
    p_parent,
    parent_depth + 1,
    clean_body,
    p_spoiler,
    p_request
  )
  returning id into result;

  perform public.award_achievements(uid);

  return result;
end;
$$;

revoke all on function public.create_comment(bigint, text, boolean, uuid, uuid) from public;
grant execute on function public.create_comment(bigint, text, boolean, uuid, uuid) to authenticated;
