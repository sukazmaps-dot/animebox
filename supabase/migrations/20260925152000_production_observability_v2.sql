-- Patch 18.5.3 — Production Observability & Incident Shield
-- Bounded 5-minute API telemetry buckets for production diagnostics.
-- Success traffic is sampled in the application layer; failures, 429s and slow requests are always recorded.

create table if not exists public.system_request_metrics (
  bucket_start timestamptz not null,
  route_key text not null check (char_length(route_key) between 2 and 120),
  method text not null check (method in ('GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS')),
  samples integer not null default 0 check (samples >= 0),
  estimated_requests bigint not null default 0 check (estimated_requests >= 0),
  server_errors bigint not null default 0 check (server_errors >= 0),
  rate_limited bigint not null default 0 check (rate_limited >= 0),
  slow_requests bigint not null default 0 check (slow_requests >= 0),
  duration_sum_ms bigint not null default 0 check (duration_sum_ms >= 0),
  max_duration_ms integer not null default 0 check (max_duration_ms >= 0),
  latency_0_250 bigint not null default 0 check (latency_0_250 >= 0),
  latency_250_500 bigint not null default 0 check (latency_250_500 >= 0),
  latency_500_1000 bigint not null default 0 check (latency_500_1000 >= 0),
  latency_1000_2500 bigint not null default 0 check (latency_1000_2500 >= 0),
  latency_2500_plus bigint not null default 0 check (latency_2500_plus >= 0),
  updated_at timestamptz not null default now(),
  primary key (bucket_start, route_key, method)
);

alter table public.system_request_metrics enable row level security;

create index if not exists system_request_metrics_route_bucket_idx
  on public.system_request_metrics(route_key, bucket_start desc);

create index if not exists system_request_metrics_bucket_idx
  on public.system_request_metrics(bucket_start desc);

create or replace function public.record_system_request_metric(
  p_route_key text,
  p_method text,
  p_weight integer,
  p_status_code integer,
  p_duration_ms integer
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_route_key text;
  v_method text;
  v_weight integer;
  v_status integer;
  v_duration integer;
  v_bucket timestamptz;
begin
  v_route_key := left(btrim(coalesce(p_route_key, '')), 120);
  v_method := upper(left(btrim(coalesce(p_method, '')), 12));
  v_weight := greatest(1, least(coalesce(p_weight, 1), 64));
  v_status := greatest(100, least(coalesce(p_status_code, 500), 599));
  v_duration := greatest(0, least(coalesce(p_duration_ms, 0), 120000));

  if char_length(v_route_key) < 2 then
    raise exception 'INVALID_ROUTE_KEY';
  end if;

  if v_method not in ('GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS') then
    raise exception 'INVALID_REQUEST_METHOD';
  end if;

  v_bucket :=
    date_trunc('hour', now()) +
    make_interval(mins => ((extract(minute from now())::integer / 5) * 5));

  insert into public.system_request_metrics (
    bucket_start,
    route_key,
    method,
    samples,
    estimated_requests,
    server_errors,
    rate_limited,
    slow_requests,
    duration_sum_ms,
    max_duration_ms,
    latency_0_250,
    latency_250_500,
    latency_500_1000,
    latency_1000_2500,
    latency_2500_plus,
    updated_at
  )
  values (
    v_bucket,
    v_route_key,
    v_method,
    1,
    v_weight,
    case when v_status >= 500 then v_weight else 0 end,
    case when v_status = 429 then v_weight else 0 end,
    case when v_duration >= 1500 then v_weight else 0 end,
    (v_duration::bigint * v_weight::bigint),
    v_duration,
    case when v_duration < 250 then v_weight else 0 end,
    case when v_duration >= 250 and v_duration < 500 then v_weight else 0 end,
    case when v_duration >= 500 and v_duration < 1000 then v_weight else 0 end,
    case when v_duration >= 1000 and v_duration < 2500 then v_weight else 0 end,
    case when v_duration >= 2500 then v_weight else 0 end,
    now()
  )
  on conflict (bucket_start, route_key, method) do update
  set
    samples = public.system_request_metrics.samples + 1,
    estimated_requests =
      public.system_request_metrics.estimated_requests + excluded.estimated_requests,
    server_errors =
      public.system_request_metrics.server_errors + excluded.server_errors,
    rate_limited =
      public.system_request_metrics.rate_limited + excluded.rate_limited,
    slow_requests =
      public.system_request_metrics.slow_requests + excluded.slow_requests,
    duration_sum_ms =
      public.system_request_metrics.duration_sum_ms + excluded.duration_sum_ms,
    max_duration_ms =
      greatest(public.system_request_metrics.max_duration_ms, excluded.max_duration_ms),
    latency_0_250 =
      public.system_request_metrics.latency_0_250 + excluded.latency_0_250,
    latency_250_500 =
      public.system_request_metrics.latency_250_500 + excluded.latency_250_500,
    latency_500_1000 =
      public.system_request_metrics.latency_500_1000 + excluded.latency_500_1000,
    latency_1000_2500 =
      public.system_request_metrics.latency_1000_2500 + excluded.latency_1000_2500,
    latency_2500_plus =
      public.system_request_metrics.latency_2500_plus + excluded.latency_2500_plus,
    updated_at = now();
end;
$function$;

create or replace function public.prune_system_request_metrics(
  p_retention_days integer default 30
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_days integer;
  affected integer;
begin
  v_days := greatest(7, least(coalesce(p_retention_days, 30), 90));

  delete from public.system_request_metrics
  where bucket_start < now() - make_interval(days => v_days);

  get diagnostics affected = row_count;
  return affected;
end;
$function$;

revoke all on table public.system_request_metrics from public, anon, authenticated;
grant select, insert, update, delete on table public.system_request_metrics to service_role;

revoke execute on function public.record_system_request_metric(text, text, integer, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.prune_system_request_metrics(integer)
  from public, anon, authenticated;

grant execute on function public.record_system_request_metric(text, text, integer, integer, integer)
  to service_role;
grant execute on function public.prune_system_request_metrics(integer)
  to service_role;

comment on table public.system_request_metrics is
  'Service-role-only, five-minute weighted API telemetry buckets. No IPs, query strings, user ids or request bodies are stored.';

comment on function public.record_system_request_metric(text, text, integer, integer, integer) is
  'Atomically records one sampled request into a bounded five-minute telemetry bucket.';
