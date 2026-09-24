-- AnimeBox Patch 16.2 — Rights Holder Center & takedown controls
-- Public intake goes through server APIs only. Direct table access is closed.

create table if not exists public.copyright_cases (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique,
  claimant_name text not null,
  claimant_company text,
  claimant_email text not null,
  claimant_role text not null
    check (claimant_role in ('rights_holder', 'authorized_agent', 'other')),
  work_title text not null,
  rights_description text not null,
  authority_statement text not null,
  signature text not null,
  status text not null default 'received'
    check (status in (
      'received',
      'needs_information',
      'under_review',
      'action_taken',
      'rejected',
      'closed'
    )),
  reviewed_by uuid,
  reviewed_at timestamptz,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.copyright_case_urls (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.copyright_cases(id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.copyright_restrictions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.copyright_cases(id) on delete cascade,
  scope text not null check (scope in ('title', 'season', 'episode', 'provider')),
  anime_id bigint not null check (anime_id > 0),
  season integer check (season is null or season > 0),
  episode integer check (episode is null or episode > 0),
  provider text,
  reason text,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  lifted_by uuid,
  lifted_at timestamptz,
  constraint copyright_restriction_shape check (
    (scope = 'title')
    or (scope = 'season' and season is not null)
    or (scope = 'episode' and episode is not null)
    or (scope = 'provider' and provider is not null and length(trim(provider)) > 0)
  )
);

create table if not exists public.copyright_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.copyright_cases(id) on delete cascade,
  action text not null,
  actor_id uuid,
  actor_role text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists copyright_cases_status_created_idx
  on public.copyright_cases (status, created_at desc);

create index if not exists copyright_case_urls_case_idx
  on public.copyright_case_urls (case_id);

create index if not exists copyright_restrictions_lookup_idx
  on public.copyright_restrictions (anime_id, active, scope, season, episode, provider);

create index if not exists copyright_restrictions_case_idx
  on public.copyright_restrictions (case_id, created_at desc);

create index if not exists copyright_actions_case_created_idx
  on public.copyright_actions (case_id, created_at desc);

alter table public.copyright_cases enable row level security;
alter table public.copyright_case_urls enable row level security;
alter table public.copyright_restrictions enable row level security;
alter table public.copyright_actions enable row level security;

revoke all on table public.copyright_cases from anon, authenticated;
revoke all on table public.copyright_case_urls from anon, authenticated;
revoke all on table public.copyright_restrictions from anon, authenticated;
revoke all on table public.copyright_actions from anon, authenticated;

grant select, insert, update, delete on table public.copyright_cases to service_role;
grant select, insert, update, delete on table public.copyright_case_urls to service_role;
grant select, insert, update, delete on table public.copyright_restrictions to service_role;
grant select, insert, update, delete on table public.copyright_actions to service_role;

comment on table public.copyright_cases is
  'Rights-holder notices received by AnimeBox. Server/service-role access only.';

comment on table public.copyright_restrictions is
  'Active playback restrictions created from reviewed copyright cases.';
