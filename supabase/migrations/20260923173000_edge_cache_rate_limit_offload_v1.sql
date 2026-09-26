-- AnimeBox Patch 14.4.5 — edge cache & rate-limit offload
-- Public catalog GETs no longer spend a Postgres write per request.
-- Keep the remaining shared rate buckets bounded for state-changing/private APIs.

create or replace function public.cleanup_api_rate_buckets(
  p_retention_hours integer default 4
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_rows bigint := 0;
begin
  if p_retention_hours < 1 or p_retention_hours > 48 then
    raise exception 'rate bucket retention out of range';
  end if;

  delete from public.api_rate_buckets
  where window_start < now() - make_interval(hours => p_retention_hours);

  get diagnostics deleted_rows = row_count;
  return deleted_rows;
end;
$$;

revoke execute on function public.cleanup_api_rate_buckets(integer)
  from public, anon, authenticated;
grant execute on function public.cleanup_api_rate_buckets(integer)
  to service_role;

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'animebox-api-rate-bucket-cleanup'
  ) then
    perform cron.unschedule('animebox-api-rate-bucket-cleanup');
  end if;

  perform cron.schedule(
    'animebox-api-rate-bucket-cleanup',
    '17 * * * *',
    'select public.cleanup_api_rate_buckets(4);'
  );
end;
$$;
