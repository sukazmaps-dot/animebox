-- Patch 30.4: server-only AniList metadata canonical snapshots.
-- Additive migration: the website remains usable if this table/RPC is absent.
create table if not exists public.anime_public_metadata_cache (
  anime_id bigint primary key check (anime_id > 0),
  score_10 numeric(3,1) check (score_10 > 0 and score_10 <= 10),
  episodes_total integer check (episodes_total > 0),
  episodes_aired integer check (episodes_aired >= 0),
  status text check (char_length(status) <= 64),
  source text not null default 'anilist' check (source = 'anilist'),
  fetched_at timestamptz not null,
  expires_at timestamptz not null,
  constraint anime_public_metadata_cache_ttl check (expires_at > fetched_at)
);

create index if not exists anime_public_metadata_cache_expiry_idx
  on public.anime_public_metadata_cache (expires_at);

alter table public.anime_public_metadata_cache enable row level security;
revoke all on public.anime_public_metadata_cache from public, anon, authenticated;
grant select, insert, update on public.anime_public_metadata_cache to service_role;

-- A batch update must never overwrite a newer snapshot with an older fetch.
-- SECURITY INVOKER plus restricted RPC execute & table grants keeps this
-- unreachable by browsers or authenticated public clients.
create or replace function public.merge_anilist_metadata_batch(rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected integer := 0;
begin
  if rows is null or jsonb_typeof(rows) <> 'array' or
     jsonb_array_length(rows) > 30 then
    raise exception 'invalid metadata batch' using errcode = '22023';
  end if;

  insert into public.anime_public_metadata_cache
    (anime_id, score_10, episodes_total, episodes_aired,
     status, source, fetched_at, expires_at)
  select
    incoming.anime_id,
    incoming.score_10,
    incoming.episodes_total,
    incoming.episodes_aired,
    incoming.status,
    'anilist',
    incoming.fetched_at,
    incoming.expires_at
  from jsonb_to_recordset(rows) as incoming(
    anime_id bigint,
    score_10 numeric,
    episodes_total integer,
    episodes_aired integer,
    status text,
    fetched_at timestamptz,
    expires_at timestamptz
  )
  where incoming.anime_id > 0
    and incoming.fetched_at is not null
    and incoming.expires_at > incoming.fetched_at
  on conflict (anime_id) do update set
    score_10 = excluded.score_10,
    episodes_total = excluded.episodes_total,
    episodes_aired = excluded.episodes_aired,
    status = excluded.status,
    source = excluded.source,
    fetched_at = excluded.fetched_at,
    expires_at = excluded.expires_at
  where public.anime_public_metadata_cache.fetched_at <= excluded.fetched_at;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.merge_anilist_metadata_batch(jsonb) from public, anon, authenticated;
grant execute on function public.merge_anilist_metadata_batch(jsonb) to service_role;

comment on table public.anime_public_metadata_cache is
  'Public AniList numeric score and episode metadata, queried by server service role only. No user data.';
