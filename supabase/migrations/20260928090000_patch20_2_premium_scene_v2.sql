-- AnimeBox Patch 20.2 — Premium 2.0 foundation
-- Identity / Status / Convenience without putting anime playback behind Premium.

alter table public.premium_profile_settings
  add column if not exists profile_layout text not null default 'classic',
  add column if not exists scene_version smallint not null default 2;

alter table public.premium_profile_settings
  drop constraint if exists premium_profile_settings_profile_layout_check,
  add constraint premium_profile_settings_profile_layout_check
    check (profile_layout in ('classic','cinema','collector','minimal')),
  drop constraint if exists premium_profile_settings_scene_version_check,
  add constraint premium_profile_settings_scene_version_check
    check (scene_version between 1 and 100);

comment on column public.premium_profile_settings.profile_layout is
  'Premium 2.0 predefined profile composition. No arbitrary user CSS.';
comment on column public.premium_profile_settings.scene_version is
  'Renderer contract version for backwards-compatible Premium Scene migrations.';

create table if not exists public.premium_cosmetics (
  id uuid primary key default gen_random_uuid(),
  cosmetic_key text not null unique,
  cosmetic_type text not null,
  name text not null,
  asset_path text,
  preview_path text,
  premium_required boolean not null default true,
  rarity text not null default 'signature',
  enabled boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint premium_cosmetics_key_check
    check (char_length(cosmetic_key) between 2 and 100),
  constraint premium_cosmetics_type_check
    check (cosmetic_type in ('avatar_frame','profile_theme','room_theme','reaction_pack','nickname_effect')),
  constraint premium_cosmetics_rarity_check
    check (rarity in ('common','signature','rare','seasonal','legacy')),
  constraint premium_cosmetics_name_check
    check (char_length(name) between 1 and 120),
  constraint premium_cosmetics_sort_order_check
    check (sort_order between -100000 and 100000)
);

alter table public.premium_cosmetics enable row level security;

drop policy if exists "premium cosmetics public read" on public.premium_cosmetics;
create policy "premium cosmetics public read"
  on public.premium_cosmetics
  for select
  using (enabled = true);

create table if not exists public.premium_profile_showcase_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_index smallint not null,
  module_type text not null,
  entity_id text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint premium_profile_showcase_slots_slot_check
    check (slot_index between 0 and 11),
  constraint premium_profile_showcase_slots_module_check
    check (module_type in (
      'favorite_anime',
      'achievement',
      'stats',
      'watch_streak',
      'recently_completed',
      'favorite_genres'
    )),
  constraint premium_profile_showcase_slots_entity_check
    check (entity_id is null or char_length(entity_id) <= 180),
  unique (user_id, slot_index)
);

create index if not exists premium_profile_showcase_slots_user_idx
  on public.premium_profile_showcase_slots(user_id, slot_index);

alter table public.premium_profile_showcase_slots enable row level security;

drop policy if exists "premium showcase public read" on public.premium_profile_showcase_slots;
create policy "premium showcase public read"
  on public.premium_profile_showcase_slots
  for select
  using (true);

drop policy if exists "premium showcase insert own" on public.premium_profile_showcase_slots;
create policy "premium showcase insert own"
  on public.premium_profile_showcase_slots
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "premium showcase update own" on public.premium_profile_showcase_slots;
create policy "premium showcase update own"
  on public.premium_profile_showcase_slots
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "premium showcase delete own" on public.premium_profile_showcase_slots;
create policy "premium showcase delete own"
  on public.premium_profile_showcase_slots
  for delete
  using (auth.uid() = user_id);

-- Seed only AnimeBox-owned catalog identities. Assets can be attached later
-- without changing entitlement or profile storage contracts.
insert into public.premium_cosmetics
  (cosmetic_key, cosmetic_type, name, premium_required, rarity, sort_order, metadata)
values
  ('scene_aurora', 'profile_theme', 'Aurora', true, 'signature', 10, '{"scene":"aurora"}'::jsonb),
  ('scene_sakura', 'profile_theme', 'Sakura', true, 'signature', 20, '{"scene":"sakura"}'::jsonb),
  ('scene_embers', 'profile_theme', 'Embers', true, 'signature', 30, '{"scene":"embers"}'::jsonb),
  ('scene_stardust', 'profile_theme', 'Stardust', true, 'signature', 40, '{"scene":"stardust"}'::jsonb),
  ('scene_midnight', 'profile_theme', 'Midnight', true, 'signature', 50, '{"scene":"midnight"}'::jsonb)
on conflict (cosmetic_key) do update
set
  name = excluded.name,
  cosmetic_type = excluded.cosmetic_type,
  premium_required = excluded.premium_required,
  rarity = excluded.rarity,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = now();


-- Existing live Premium subscriptions must receive the new capabilities on
-- migration day; otherwise a user would need to open /premium first to trigger
-- lifecycle reconciliation before Profile Scene / Stats become available.
insert into public.user_entitlements (
  user_id,
  entitlement,
  source,
  source_id,
  active,
  starts_at,
  expires_at,
  metadata,
  updated_at
)
select
  subscription.user_id,
  capability.entitlement,
  'premium',
  subscription.id::text,
  true,
  subscription.starts_at,
  subscription.ends_at,
  jsonb_build_object(
    'plan', subscription.plan,
    'subscription_source', subscription.source,
    'patch', '20.2'
  ),
  now()
from public.premium_subscriptions as subscription
cross join lateral unnest(array[
  'adFree',
  'premiumBadge',
  'profileStudio',
  'animatedAvatar',
  'animatedBanner',
  'extraShowcases',
  'premiumThemes',
  'profileScene',
  'nicknameEffects',
  'premiumFrames',
  'profileLayouts',
  'advancedStats',
  'extendedHistory',
  'watchPartyThemes',
  'watchPartyReactions',
  'earlyAccess'
]::text[]) as capability(entitlement)
where subscription.status in ('active', 'grace_period')
  and subscription.ends_at > now()
on conflict (user_id, entitlement, source, source_id)
do update set
  active = excluded.active,
  starts_at = excluded.starts_at,
  expires_at = excluded.expires_at,
  metadata = excluded.metadata,
  updated_at = excluded.updated_at;
