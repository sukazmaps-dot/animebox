-- Patch 21.1 — Public username moderation / profanity shield
-- Keeps indexable public identity surfaces free from explicit obscene or abusive
-- usernames. New/changed usernames are rejected at the database boundary and
-- existing high-confidence matches are deterministically reset once.

create or replace function public.animebox_username_moderation_key(p_username text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select regexp_replace(
    translate(
      replace(lower(normalize(p_username, NFKC)), 'ё', 'е'),
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
language plpgsql
immutable
set search_path = ''
as $$
declare
  moderation_key text := public.animebox_username_moderation_key(
    coalesce(p_username, '')
  );
begin
  if moderation_key = '' then
    return false;
  end if;

  return moderation_key ~
    '(хуесос|хуй|хуе|хуя|хую|хуи|пизд|ебан|ебат|ебал|ебло|ебуч|ебнут|заеб|уеб|наеб|выеб|проеб|подеб|бляд|блять|блят|пидор|пидар|педерас|гандон|мудак|мудила|мудозвон|шлюх|сучк|педофил|педофайл)';
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

  if new.username is not null
     and public.animebox_username_is_prohibited(new.username) then
    raise exception 'USERNAME_PROHIBITED'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

-- One-time cleanup for legacy public identities that predate moderation.
-- A deterministic UUID-derived suffix keeps the replacement unique without
-- exposing email, Telegram username or other private account metadata.
update public.profiles
set username =
  ('AnimeFan_' || substr(replace(id::text, '-', ''), 1, 12))::text
where username is not null
  and public.animebox_username_is_prohibited(username);

comment on function public.animebox_username_is_prohibited(text)
is 'High-confidence public username profanity/abuse policy used by the profile username trigger.';

comment on function public.animebox_username_moderation_key(text)
is 'NFKC/confusable normalization for username moderation. Separators and common Latin/digit substitutions are collapsed.';

comment on function public.enforce_profile_username_policy()
is 'Rejects reserved AnimeBox identities and explicit prohibited usernames at the database boundary.';
