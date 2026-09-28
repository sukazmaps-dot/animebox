-- Patch 21 urgent hardening — Public username safety v1
--
-- Goals:
-- 1. reject high-confidence obscene/abusive usernames at the database boundary;
-- 2. survive direct Supabase writes that bypass React/API validation;
-- 3. neutralize already-public unsafe usernames and archived leaderboard snapshots;
-- 4. preserve the existing AnimeBox reserved-name anti-impersonation policy.

create or replace function public.animebox_username_moderation_key(p_username text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    translate(
      replace(
        lower(normalize(coalesce(p_username, ''), NFKC)),
        'ё',
        'е'
      ),
      'aeopcyxkmtb0346',
      'аеорсухкмтвозчб'
    ),
    '[^а-яa-z0-9]+',
    '',
    'g'
  );
$$;

create or replace function public.animebox_username_is_prohibited(p_username text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    public.animebox_username_moderation_key(coalesce(p_username, '')) ~
    '(хуесос|хуй|хуе|хуя|хую|хуи|пизд|ебан|ебат|ебал|ебло|ебуч|ебнут|заеб|уеб|наеб|выеб|проеб|подеб|бляд|блять|блят|пидор|пидар|педерас|гандон|мудак|мудила|мудозвон|шлюх|сучк|педофил|педофайл)';
$$;

create or replace function public.enforce_profile_username_policy()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.username is null then
    return new;
  end if;

  if public.animebox_username_is_reserved(new.username) then
    raise exception 'USERNAME_RESERVED'
      using errcode = '22023';
  end if;

  if public.animebox_username_is_prohibited(new.username) then
    raise exception 'USERNAME_PROHIBITED'
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

-- Existing public identities are immediately neutralized instead of waiting
-- for the owner to edit them. A hash keeps the fallback stable without
-- exposing a raw UUID fragment.
update public.profiles
set username = 'AnimeFan_' || substr(md5(id::text), 1, 12)
where username is not null
  and public.animebox_username_is_prohibited(username);

-- Hall-of-Fame rows intentionally snapshot historical usernames, so clean
-- those snapshots too; otherwise an old offensive name could remain public
-- after the profile itself was repaired.
update public.leaderboard_season_entries
set username_snapshot = 'AnimeFan_' || substr(md5(user_id::text), 1, 12)
where username_snapshot is not null
  and public.animebox_username_is_prohibited(username_snapshot);

comment on function public.animebox_username_moderation_key(text)
is 'Normalizes public usernames for high-confidence profanity and abuse checks, including separator/confusable evasion.';

comment on function public.animebox_username_is_prohibited(text)
is 'Returns true for high-confidence obscene or abusive public usernames.';

comment on function public.enforce_profile_username_policy()
is 'Rejects AnimeBox reserved identities and prohibited public usernames at the PostgreSQL boundary.';
