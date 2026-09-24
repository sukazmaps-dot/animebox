-- Patch 16.6.9 — Auth Security: reserved system identities
-- New/renamed public usernames cannot impersonate AnimeBox staff/brand names.
-- Existing rows are intentionally left untouched for moderation review.

create or replace function public.animebox_username_policy_key(p_username text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select regexp_replace(
    translate(
      lower(normalize(p_username, NFKC)),
      'аеорсхуктвнміј',
      'aeopcxyktbhmij'
    ),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

create or replace function public.animebox_username_is_reserved(p_username text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  raw_name text := lower(btrim(normalize(coalesce(p_username, ''), NFKC)));
  policy_key text := public.animebox_username_policy_key(coalesce(p_username, ''));
begin
  if raw_name = '' then
    return false;
  end if;

  if raw_name = any(array[
    'админ',
    'администратор',
    'владелец',
    'модератор',
    'поддержка',
    'саппорт',
    'система',
    'анимебокс'
  ]) then
    return true;
  end if;

  if position('animebox' in policy_key) > 0 then
    return true;
  end if;

  if policy_key = any(array[
    'admin',
    'administrator',
    'owner',
    'moderator',
    'mod',
    'support',
    'staff',
    'system',
    'root',
    'official',
    'youranimebox'
  ]) then
    return true;
  end if;

  return policy_key ~ '^(admin|administrator|owner|moderator|mod|support|staff|system|root|official)[0-9]*$';
end;
$$;

create or replace function public.enforce_profile_username_policy()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.username is not null
     and public.animebox_username_is_reserved(new.username) then
    raise exception 'USERNAME_RESERVED'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_username_policy on public.profiles;

create trigger profiles_username_policy
before insert or update of username
on public.profiles
for each row
execute function public.enforce_profile_username_policy();

comment on function public.animebox_username_is_reserved(text)
is 'Server-side reserved username policy for AnimeBox brand/staff impersonation prevention.';

comment on function public.enforce_profile_username_policy()
is 'Rejects new or changed profile usernames that impersonate AnimeBox system/staff identities.';
