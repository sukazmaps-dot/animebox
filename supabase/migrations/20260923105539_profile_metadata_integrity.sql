-- Patch 13.6 follow-up: keep account timestamps server-owned for browser roles.

create or replace function public.enforce_profile_server_managed_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  request_role text := coalesce(auth.role(), '');
begin
  if request_role in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.telegram_id is not null
        or new.avatar_path is not null
        or new.banner_path is not null
        or new.avatar_url is not null
        or new.banner_url is not null
      then
        raise exception 'PROFILE_SERVER_MANAGED_FIELD'
          using errcode = '42501';
      end if;

      new.created_at := now();
      new.updated_at := now();
    elsif tg_op = 'UPDATE' then
      if new.telegram_id is distinct from old.telegram_id
        or new.avatar_path is distinct from old.avatar_path
        or new.banner_path is distinct from old.banner_path
        or new.avatar_url is distinct from old.avatar_url
        or new.banner_url is distinct from old.banner_url
        or new.created_at is distinct from old.created_at
      then
        raise exception 'PROFILE_SERVER_MANAGED_FIELD'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;
