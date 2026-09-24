-- Patch 18.2 — Catalog Integrity / Playback Availability Registry
-- Server-only registry. Public clients never write or read this table directly.

create table if not exists public.anime_availability (
  anime_id bigint primary key,
  mal_id bigint null,

  availability_status text not null default 'unknown'
    check (availability_status in ('playable', 'unknown', 'unavailable')),

  kodik_status text not null default 'unknown'
    check (kodik_status in ('available', 'unknown', 'unavailable')),
  aniliberty_status text not null default 'unknown'
    check (aniliberty_status in ('available', 'unknown', 'unavailable')),
  direct_status text not null default 'unknown'
    check (direct_status in ('available', 'unknown', 'unavailable')),

  max_episode integer null check (max_episode is null or max_episode > 0),
  consecutive_misses integer not null default 0 check (consecutive_misses >= 0),

  last_checked_at timestamptz null,
  next_check_at timestamptz null,
  last_success_at timestamptz null,
  last_failure_at timestamptz null,
  last_reason text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists anime_availability_status_idx
  on public.anime_availability (availability_status);

create index if not exists anime_availability_next_check_idx
  on public.anime_availability (next_check_at);

create index if not exists anime_availability_mal_id_idx
  on public.anime_availability (mal_id)
  where mal_id is not null;

alter table public.anime_availability enable row level security;

comment on table public.anime_availability is
  'AnimeBox server-side playback availability registry. Service-role only; RLS intentionally exposes no public policies.';
