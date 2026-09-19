-- AnimeBox Profile Media Safety v1
-- Run once in Supabase SQL Editor before deploying the code patch.

begin;

create table if not exists public.profile_media_review_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('base', 'premium')),
  kind text not null check (kind in ('avatar', 'banner')),
  status text not null default 'review' check (status in ('review', 'approved', 'rejected', 'stale')),
  apply_payload jsonb not null default '{}'::jsonb,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_media_moderation (
  id uuid primary key default gen_random_uuid(),
  review_group_id uuid references public.profile_media_review_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('base', 'premium')),
  kind text not null check (kind in ('avatar', 'banner')),
  variant text not null default 'original' check (variant in ('original', 'static')),
  public_path text not null,
  quarantine_path text,
  sha256 text,
  mime_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  animated boolean not null default false,
  status text not null check (status in ('approved', 'review', 'rejected')),
  reason text,
  provider text,
  provider_model text,
  categories jsonb not null default '{}'::jsonb,
  category_scores jsonb not null default '{}'::jsonb,
  moderation_result jsonb not null default '{}'::jsonb,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profile_media_review_groups enable row level security;
alter table public.profile_media_moderation enable row level security;

-- No browser policies on purpose. Only server/service-role code can read or
-- mutate moderation decisions and quarantined media metadata.

create index if not exists profile_media_review_groups_status_created_idx
  on public.profile_media_review_groups(status, created_at);

create index if not exists profile_media_review_groups_user_idx
  on public.profile_media_review_groups(user_id, created_at desc);

create index if not exists profile_media_moderation_group_idx
  on public.profile_media_moderation(review_group_id, status);

create index if not exists profile_media_moderation_hash_idx
  on public.profile_media_moderation(sha256, status)
  where sha256 is not null;

create index if not exists profile_media_moderation_user_path_idx
  on public.profile_media_moderation(user_id, public_path, status);

create index if not exists profile_media_moderation_reviewed_by_idx
  on public.profile_media_moderation(reviewed_by)
  where reviewed_by is not null;

create index if not exists profile_media_review_groups_reviewed_by_idx
  on public.profile_media_review_groups(reviewed_by)
  where reviewed_by is not null;

-- Private quarantine bucket. Browsers never receive direct upload permission.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-media-quarantine',
  'profile-media-quarantine',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


-- The public bucket contains only media that already passed moderation.
-- Browsers may read public files and delete their own obsolete files, but they
-- cannot INSERT/UPDATE here directly. New uploads must use the private signed
-- upload flow through profile-media-quarantine.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-media',
  'profile-media',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload own profile media" on storage.objects;
drop policy if exists "Users update own profile media" on storage.objects;

-- Existing user media predates the moderation system. Mark it as trusted
-- legacy content so the database guard does not break current profiles.
insert into public.profile_media_moderation (
  user_id, scope, kind, variant, public_path, status, reason, provider
)
select id, 'base', 'avatar', 'original', avatar_path, 'approved', 'legacy_pre_moderation', 'legacy'
from public.profiles
where avatar_path is not null and btrim(avatar_path) <> ''
  and not exists (
    select 1 from public.profile_media_moderation m
    where m.user_id = profiles.id
      and m.public_path = profiles.avatar_path
      and m.status = 'approved'
  );

insert into public.profile_media_moderation (
  user_id, scope, kind, variant, public_path, status, reason, provider
)
select id, 'base', 'banner', 'original', banner_path, 'approved', 'legacy_pre_moderation', 'legacy'
from public.profiles
where banner_path is not null and btrim(banner_path) <> ''
  and not exists (
    select 1 from public.profile_media_moderation m
    where m.user_id = profiles.id
      and m.public_path = profiles.banner_path
      and m.status = 'approved'
  );

insert into public.profile_media_moderation (
  user_id, scope, kind, variant, public_path, status, reason, provider
)
select user_id, 'premium', 'avatar', 'original', avatar_path, 'approved', 'legacy_pre_moderation', 'legacy'
from public.premium_profile_settings p
where avatar_path is not null and btrim(avatar_path) <> ''
  and not exists (
    select 1 from public.profile_media_moderation m
    where m.user_id = p.user_id
      and m.public_path = p.avatar_path
      and m.status = 'approved'
  );

insert into public.profile_media_moderation (
  user_id, scope, kind, variant, public_path, status, reason, provider
)
select user_id, 'premium', 'avatar', 'static', avatar_static_path, 'approved', 'legacy_pre_moderation', 'legacy'
from public.premium_profile_settings p
where avatar_static_path is not null and btrim(avatar_static_path) <> ''
  and not exists (
    select 1 from public.profile_media_moderation m
    where m.user_id = p.user_id
      and m.public_path = p.avatar_static_path
      and m.status = 'approved'
  );

insert into public.profile_media_moderation (
  user_id, scope, kind, variant, public_path, status, reason, provider
)
select user_id, 'premium', 'banner', 'original', banner_path, 'approved', 'legacy_pre_moderation', 'legacy'
from public.premium_profile_settings p
where banner_path is not null and btrim(banner_path) <> ''
  and not exists (
    select 1 from public.profile_media_moderation m
    where m.user_id = p.user_id
      and m.public_path = p.banner_path
      and m.status = 'approved'
  );

insert into public.profile_media_moderation (
  user_id, scope, kind, variant, public_path, status, reason, provider
)
select user_id, 'premium', 'banner', 'static', banner_static_path, 'approved', 'legacy_pre_moderation', 'legacy'
from public.premium_profile_settings p
where banner_static_path is not null and btrim(banner_static_path) <> ''
  and not exists (
    select 1 from public.profile_media_moderation m
    where m.user_id = p.user_id
      and m.public_path = p.banner_static_path
      and m.status = 'approved'
  );

create or replace function public.profile_media_is_approved(
  p_user_id uuid,
  p_path text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_path is null or exists (
    select 1
    from public.profile_media_moderation m
    where m.user_id = p_user_id
      and m.public_path = p_path
      and m.status = 'approved'
  );
$$;

revoke all on function public.profile_media_is_approved(uuid, text) from public, anon, authenticated;
grant execute on function public.profile_media_is_approved(uuid, text) to service_role;

create or replace function public.guard_profile_media_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.avatar_path is distinct from old.avatar_path
     and not public.profile_media_is_approved(new.id, new.avatar_path) then
    raise exception 'Avatar must pass AnimeBox media moderation first' using errcode = '42501';
  end if;

  if new.banner_path is distinct from old.banner_path
     and not public.profile_media_is_approved(new.id, new.banner_path) then
    raise exception 'Banner must pass AnimeBox media moderation first' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.guard_premium_profile_media_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_avatar text;
  old_avatar_static text;
  old_banner text;
  old_banner_static text;
begin
  old_avatar := case when tg_op = 'UPDATE' then old.avatar_path else null end;
  old_avatar_static := case when tg_op = 'UPDATE' then old.avatar_static_path else null end;
  old_banner := case when tg_op = 'UPDATE' then old.banner_path else null end;
  old_banner_static := case when tg_op = 'UPDATE' then old.banner_static_path else null end;

  if new.avatar_path is distinct from old_avatar
     and not public.profile_media_is_approved(new.user_id, new.avatar_path) then
    raise exception 'Premium avatar must pass AnimeBox media moderation first' using errcode = '42501';
  end if;

  if new.avatar_static_path is distinct from old_avatar_static
     and not public.profile_media_is_approved(new.user_id, new.avatar_static_path) then
    raise exception 'Premium avatar fallback must pass AnimeBox media moderation first' using errcode = '42501';
  end if;

  if new.banner_path is distinct from old_banner
     and not public.profile_media_is_approved(new.user_id, new.banner_path) then
    raise exception 'Premium banner must pass AnimeBox media moderation first' using errcode = '42501';
  end if;

  if new.banner_static_path is distinct from old_banner_static
     and not public.profile_media_is_approved(new.user_id, new.banner_static_path) then
    raise exception 'Premium banner fallback must pass AnimeBox media moderation first' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profile_media_update() from public, anon, authenticated;
revoke all on function public.guard_premium_profile_media_write() from public, anon, authenticated;
grant execute on function public.guard_profile_media_update() to service_role;
grant execute on function public.guard_premium_profile_media_write() to service_role;

drop trigger if exists profiles_media_moderation_guard on public.profiles;
create trigger profiles_media_moderation_guard
before update of avatar_path, banner_path on public.profiles
for each row execute function public.guard_profile_media_update();

drop trigger if exists premium_profile_media_moderation_guard on public.premium_profile_settings;
create trigger premium_profile_media_moderation_guard
before insert or update of avatar_path, avatar_static_path, banner_path, banner_static_path
on public.premium_profile_settings
for each row execute function public.guard_premium_profile_media_write();

commit;
