-- AnimeBox Patch 16.3 — Player Source Control & Provider Independence

create table if not exists public.player_provider_settings (
  provider_key text primary key
    check (provider_key in ('direct', 'kodik', 'aniliberty')),
  display_name text not null,
  enabled boolean not null default true,
  priority smallint not null default 100
    check (priority between 0 and 999),
  failure_threshold smallint not null default 3
    check (failure_threshold between 1 and 20),
  cooldown_seconds integer not null default 180
    check (cooldown_seconds between 30 and 86400),
  notes text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.player_provider_runtime (
  provider_key text primary key
    references public.player_provider_settings(provider_key)
    on delete cascade,
  state text not null default 'unknown'
    check (state in ('healthy', 'degraded', 'unavailable', 'unknown')),
  consecutive_failures integer not null default 0
    check (consecutive_failures >= 0),
  consecutive_successes integer not null default 0
    check (consecutive_successes >= 0),
  last_latency_ms integer,
  last_error text,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  cooldown_until timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.player_provider_settings (
  provider_key,
  display_name,
  enabled,
  priority,
  failure_threshold,
  cooldown_seconds
)
values
  ('direct', 'AnimeBox Direct', true, 10, 3, 180),
  ('kodik', 'Kodik', true, 20, 3, 180),
  ('aniliberty', 'AniLiberty', true, 30, 3, 180)
on conflict (provider_key) do nothing;

insert into public.player_provider_runtime (provider_key, state)
select provider_key, 'unknown'
from public.player_provider_settings
on conflict (provider_key) do nothing;

create index if not exists player_provider_settings_priority_idx
  on public.player_provider_settings (enabled, priority);

create index if not exists player_provider_runtime_state_idx
  on public.player_provider_runtime (state, cooldown_until);

alter table public.player_provider_settings enable row level security;
alter table public.player_provider_runtime enable row level security;

revoke all on table public.player_provider_settings from anon, authenticated;
revoke all on table public.player_provider_runtime from anon, authenticated;

grant select, insert, update, delete on table public.player_provider_settings to service_role;
grant select, insert, update, delete on table public.player_provider_runtime to service_role;

comment on table public.player_provider_settings is
  'Server-controlled AnimeBox playback provider registry and priority order.';

comment on table public.player_provider_runtime is
  'Runtime provider health state used for cooldown and recovery probing.';
