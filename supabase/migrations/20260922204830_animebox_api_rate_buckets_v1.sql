-- Shared atomic rate counters across Vercel instances. Deploy before API code.
create table if not exists public.api_rate_buckets (
  scope text not null,
  key_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 1,
  primary key (scope, key_hash, window_start),
  constraint api_rate_buckets_count_positive check (request_count > 0)
);

create index if not exists api_rate_buckets_window_start_idx
  on public.api_rate_buckets (window_start);

alter table public.api_rate_buckets enable row level security;
revoke all on public.api_rate_buckets from public, anon, authenticated;
grant select, insert, update, delete on public.api_rate_buckets to service_role;

create or replace function public.consume_api_rate_bucket(
  p_scope text, p_key_hash text, p_window_seconds integer, p_max_requests integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_count integer;
  bucket_start timestamptz;
begin
  if p_scope !~ '^[a-z_]{1,40}$'
     or p_key_hash !~ '^[a-f0-9]{64}$'
     or p_window_seconds < 1 or p_window_seconds > 3600
     or p_max_requests < 1 or p_max_requests > 1000 then
    raise exception 'Invalid rate limit policy';
  end if;

  bucket_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into public.api_rate_buckets (scope, key_hash, window_start, request_count)
  values (p_scope, p_key_hash, bucket_start, 1)
  on conflict (scope, key_hash, window_start)
  do update set request_count = public.api_rate_buckets.request_count + 1
    where public.api_rate_buckets.request_count < p_max_requests
  returning request_count into current_count;

  return current_count is not null;
end;
$$;

revoke execute on function public.consume_api_rate_bucket(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_bucket(text, text, integer, integer)
  to service_role;
