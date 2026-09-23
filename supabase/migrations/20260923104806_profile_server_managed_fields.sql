-- Patch 13.6: protect profile fields that must only be changed by trusted server flows.
--
-- RLS limits a user to their own profile row, but row ownership alone does not
-- protect individual columns. Without this trigger an authenticated client could
-- bypass Telegram verification or the media quarantine flow by updating
-- telegram_id / avatar_path / banner_path directly through PostgREST.

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
    elsif tg_op = 'UPDATE' then
      if new.telegram_id is distinct from old.telegram_id
        or new.avatar_path is distinct from old.avatar_path
        or new.banner_path is distinct from old.banner_path
        or new.avatar_url is distinct from old.avatar_url
        or new.banner_url is distinct from old.banner_url
      then
        raise exception 'PROFILE_SERVER_MANAGED_FIELD'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_server_managed_fields on public.profiles;
create trigger profiles_protect_server_managed_fields
before insert or update on public.profiles
for each row
execute function public.enforce_profile_server_managed_fields();

alter table public.profiles
  drop constraint if exists profiles_avatar_path_owned,
  add constraint profiles_avatar_path_owned
  check (
    avatar_path is null
    or (
      avatar_path like id::text || '/%'
      and avatar_path !~* '^https?://'
      and position('..' in avatar_path) = 0
      and position(E'\\' in avatar_path) = 0
    )
  ) not valid;

alter table public.profiles
  validate constraint profiles_avatar_path_owned;

alter table public.profiles
  drop constraint if exists profiles_banner_path_owned,
  add constraint profiles_banner_path_owned
  check (
    banner_path is null
    or (
      banner_path like id::text || '/%'
      and banner_path !~* '^https?://'
      and position('..' in banner_path) = 0
      and position(E'\\' in banner_path) = 0
    )
  ) not valid;

alter table public.profiles
  validate constraint profiles_banner_path_owned;

comment on function public.enforce_profile_server_managed_fields() is
  'Blocks browser roles from bypassing Telegram verification and profile-media quarantine by directly changing server-managed profile fields.';
