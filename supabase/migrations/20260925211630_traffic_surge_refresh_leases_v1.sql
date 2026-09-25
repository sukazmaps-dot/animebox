-- AnimeBox Patch 18.5.5.3
-- Traffic Surge Shield: cross-instance refresh leases.
-- Internal coordination only; no anon/authenticated Data API surface.

create schema if not exists private;

create table if not exists private.runtime_refresh_leases (
  scope text not null,
  cache_key text not null,
  owner_token uuid not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (scope, cache_key),
  constraint runtime_refresh_leases_scope_len
    check (char_length(scope) between 1 and 64),
  constraint runtime_refresh_leases_cache_key_len
    check (char_length(cache_key) between 1 and 160)
);

alter table private.runtime_refresh_leases enable row level security;

revoke all on table private.runtime_refresh_leases from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on table private.runtime_refresh_leases to service_role;

create or replace function public.try_acquire_runtime_refresh_lease(
  p_scope text,
  p_cache_key text,
  p_owner_token uuid,
  p_ttl_seconds integer default 15
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, private
as $$
declare
  v_acquired boolean := false;
  v_scope text := left(trim(p_scope), 64);
  v_key text := left(trim(p_cache_key), 160);
  v_ttl integer := greatest(5, least(coalesce(p_ttl_seconds, 15), 60));
begin
  if v_scope = '' or v_key = '' or p_owner_token is null then
    return false;
  end if;

  insert into private.runtime_refresh_leases as leases (
    scope,
    cache_key,
    owner_token,
    expires_at,
    updated_at
  )
  values (
    v_scope,
    v_key,
    p_owner_token,
    now() + make_interval(secs => v_ttl),
    now()
  )
  on conflict (scope, cache_key) do update
    set owner_token = excluded.owner_token,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    where leases.expires_at <= now()
       or leases.owner_token = excluded.owner_token
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;

create or replace function public.release_runtime_refresh_lease(
  p_scope text,
  p_cache_key text,
  p_owner_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, private
as $$
declare
  v_deleted integer := 0;
begin
  delete from private.runtime_refresh_leases
  where scope = left(trim(p_scope), 64)
    and cache_key = left(trim(p_cache_key), 160)
    and owner_token = p_owner_token;

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke all on function public.try_acquire_runtime_refresh_lease(text, text, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.release_runtime_refresh_lease(text, text, uuid)
  from public, anon, authenticated;

grant execute on function public.try_acquire_runtime_refresh_lease(text, text, uuid, integer)
  to service_role;
grant execute on function public.release_runtime_refresh_lease(text, text, uuid)
  to service_role;
