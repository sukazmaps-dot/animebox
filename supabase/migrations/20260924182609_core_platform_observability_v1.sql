-- Patch 17.5 — Core Platform & Reliability
-- Persistent service observability for cron jobs and production incidents.

create table if not exists public.system_job_runs (
  id bigint generated always as identity primary key,
  job_key text not null check (
    char_length(job_key) between 2 and 80
    and job_key = lower(job_key)
  ),
  status text not null check (status in ('succeeded', 'degraded', 'failed', 'skipped')),
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  error_code text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.system_job_runs enable row level security;

create index if not exists system_job_runs_job_finished_idx
  on public.system_job_runs(job_key, finished_at desc);

create index if not exists system_job_runs_failed_finished_idx
  on public.system_job_runs(finished_at desc)
  where status = 'failed';

create table if not exists public.system_incidents (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique check (char_length(fingerprint) between 3 and 160),
  service text not null check (char_length(service) between 2 and 80),
  severity text not null check (severity in ('warning', 'critical')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  title text not null check (char_length(title) between 2 and 180),
  last_message text,
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.system_incidents enable row level security;

create index if not exists system_incidents_open_last_seen_idx
  on public.system_incidents(status, last_seen_at desc);

create index if not exists system_incidents_service_last_seen_idx
  on public.system_incidents(service, last_seen_at desc);

create or replace function public.report_system_incident(
  p_fingerprint text,
  p_service text,
  p_severity text,
  p_title text,
  p_message text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  incident_id uuid;
begin
  if p_severity not in ('warning', 'critical') then
    raise exception 'INVALID_INCIDENT_SEVERITY';
  end if;

  insert into public.system_incidents(
    fingerprint,
    service,
    severity,
    status,
    title,
    last_message,
    occurrence_count,
    first_seen_at,
    last_seen_at,
    resolved_at,
    metadata,
    updated_at
  )
  values (
    left(btrim(p_fingerprint), 160),
    left(btrim(p_service), 80),
    p_severity,
    'open',
    left(btrim(p_title), 180),
    nullif(left(coalesce(p_message, ''), 1000), ''),
    1,
    now(),
    now(),
    null,
    coalesce(p_metadata, '{}'::jsonb),
    now()
  )
  on conflict (fingerprint) do update
  set
    service = excluded.service,
    severity = excluded.severity,
    status = 'open',
    title = excluded.title,
    last_message = excluded.last_message,
    occurrence_count = public.system_incidents.occurrence_count + 1,
    last_seen_at = now(),
    resolved_at = null,
    metadata = excluded.metadata,
    updated_at = now()
  returning id into incident_id;

  return incident_id;
end;
$function$;

create or replace function public.resolve_system_incident(
  p_fingerprint text
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  affected integer;
begin
  update public.system_incidents
  set
    status = 'resolved',
    resolved_at = now(),
    updated_at = now()
  where fingerprint = p_fingerprint
    and status = 'open';

  get diagnostics affected = row_count;
  return affected > 0;
end;
$function$;

revoke all on table public.system_job_runs from public, anon, authenticated;
revoke all on table public.system_incidents from public, anon, authenticated;

grant select, insert, update, delete on table public.system_job_runs to service_role;
grant select, insert, update, delete on table public.system_incidents to service_role;
grant usage, select on sequence public.system_job_runs_id_seq to service_role;

revoke execute on function public.report_system_incident(text, text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.resolve_system_incident(text)
  from public, anon, authenticated;

grant execute on function public.report_system_incident(text, text, text, text, text, jsonb)
  to service_role;
grant execute on function public.resolve_system_incident(text)
  to service_role;

comment on table public.system_job_runs is
  'Service-role-only execution journal for AnimeBox maintenance jobs and external sync workers.';

comment on table public.system_incidents is
  'Service-role-only deduplicated incident registry for AnimeBox production health.';
