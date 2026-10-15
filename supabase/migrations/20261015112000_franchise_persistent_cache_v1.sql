-- AnimeBox Patch 30.2: shared franchise snapshot across Vercel/Railway instances.
-- This migration is additive. Application code works without the table.
-- Public callers cannot access this server-only cache directly.
create table if not exists public.anime_franchise_cache (
  anime_id bigint primary key check (anime_id > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  expires_at timestamptz not null,
  stale_until timestamptz not null,
  refresh_lease_until timestamptz not null default '1970-01-01 00:00:00+00',
  updated_at timestamptz not null default now(),
  constraint anime_franchise_cache_stale_window check (stale_until >= expires_at)
);

create index if not exists anime_franchise_cache_stale_until_idx
  on public.anime_franchise_cache (stale_until);

alter table public.anime_franchise_cache enable row level security;

-- No RLS policies for anon/authenticated; service-role only.
revoke all on public.anime_franchise_cache from public, anon, authenticated;
grant select, insert, update, delete on public.anime_franchise_cache to service_role;

comment on table public.anime_franchise_cache is
  'Shared AniList/Shikimori franchise snapshots. Service role only. Bounded stale-while-revalidate TTL and refresh leases.';
