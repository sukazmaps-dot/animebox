-- Patch 17.9 — Search Intelligence 2.0 foundation
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists vector with schema extensions;

create table if not exists public.anime_search_documents (
  anime_id bigint primary key check (anime_id > 0),
  slug text,
  title text not null,
  aliases text[] not null default '{}'::text[],
  description text,
  genres text[] not null default '{}'::text[],
  tags text[] not null default '{}'::text[],
  poster_url text,
  search_text text not null default '',
  embedding extensions.vector(384),
  updated_at timestamptz not null default now()
);

alter table public.anime_search_documents enable row level security;

create index if not exists anime_search_documents_search_trgm_idx
  on public.anime_search_documents
  using gin (search_text extensions.gin_trgm_ops);

create index if not exists anime_search_documents_title_trgm_idx
  on public.anime_search_documents
  using gin (title extensions.gin_trgm_ops);

create index if not exists anime_search_documents_updated_idx
  on public.anime_search_documents (updated_at desc);

create or replace function public.animebox_normalize_search_text(input text)
returns text
language sql
stable
set search_path = public, extensions
as $$
  select trim(
    regexp_replace(
      lower(unaccent(coalesce(input, ''))),
      '[^[:alnum:]а-яё]+',
      ' ',
      'gi'
    )
  );
$$;

create or replace function public.search_anime_lexical(
  query_text text,
  match_count integer default 20
)
returns table (
  anime_id bigint,
  title text,
  slug text,
  poster_url text,
  genres text[],
  similarity_score double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with normalized as (
    select public.animebox_normalize_search_text(query_text) as q
  )
  select
    d.anime_id,
    d.title,
    d.slug,
    d.poster_url,
    d.genres,
    greatest(
      case
        when public.animebox_normalize_search_text(d.title) = n.q then 1.0
        when public.animebox_normalize_search_text(d.title) like n.q || '%' then 0.96
        when d.search_text like n.q || '%' then 0.93
        when d.search_text like '% ' || n.q || '%' then 0.88
        when d.search_text like '%' || n.q || '%' then 0.82
        else 0.0
      end,
      case
        when char_length(n.q) >= 4
          then similarity(d.search_text, n.q) * 0.82
        else 0.0
      end,
      case
        when char_length(n.q) >= 4
          then word_similarity(n.q, d.search_text) * 0.84
        else 0.0
      end
    )::double precision as similarity_score
  from public.anime_search_documents d
  cross join normalized n
  where
    char_length(n.q) >= 2
    and (
      d.search_text like '%' || n.q || '%'
      or public.animebox_normalize_search_text(d.title) like n.q || '%'
      or (
        char_length(n.q) >= 4
        and greatest(
          similarity(d.search_text, n.q),
          word_similarity(n.q, d.search_text)
        ) >= case when char_length(n.q) <= 5 then 0.42 else 0.32 end
      )
    )
  order by similarity_score desc, d.updated_at desc, d.anime_id asc
  limit least(greatest(match_count, 1), 50);
$$;

create or replace function public.match_anime_semantic(
  query_embedding extensions.vector(384),
  match_threshold double precision default 0.62,
  match_count integer default 20
)
returns table (
  anime_id bigint,
  similarity_score double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    d.anime_id,
    (1 - (d.embedding <=> query_embedding))::double precision as similarity_score
  from public.anime_search_documents d
  where d.embedding is not null
    and (1 - (d.embedding <=> query_embedding)) >= match_threshold
  order by d.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 50);
$$;

revoke all on function public.search_anime_lexical(text, integer) from public;
revoke all on function public.match_anime_semantic(extensions.vector, double precision, integer) from public;
grant execute on function public.search_anime_lexical(text, integer) to service_role;
grant execute on function public.match_anime_semantic(extensions.vector, double precision, integer) to service_role;

create or replace function public.sync_anime_catalog_search_document()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into public.anime_search_documents (
    anime_id,
    slug,
    title,
    genres,
    poster_url,
    search_text,
    updated_at
  )
  values (
    new.id,
    new.slug,
    new.title,
    coalesce(new.genres, '{}'::text[]),
    new.poster_url,
    public.animebox_normalize_search_text(
      concat_ws(' ', new.title, array_to_string(coalesce(new.genres, '{}'::text[]), ' '))
    ),
    now()
  )
  on conflict (anime_id) do update
  set
    slug = coalesce(excluded.slug, anime_search_documents.slug),
    title = excluded.title,
    genres = excluded.genres,
    poster_url = coalesce(excluded.poster_url, anime_search_documents.poster_url),
    search_text = case
      when cardinality(anime_search_documents.aliases) > 0
        or coalesce(anime_search_documents.description, '') <> ''
        or cardinality(anime_search_documents.tags) > 0
      then anime_search_documents.search_text
      else excluded.search_text
    end,
    updated_at = greatest(anime_search_documents.updated_at, excluded.updated_at);

  return new;
end;
$$;

drop trigger if exists anime_catalog_search_document_sync on public.anime_catalog;
create trigger anime_catalog_search_document_sync
after insert or update of title, genres, poster_url, slug
on public.anime_catalog
for each row execute function public.sync_anime_catalog_search_document();

insert into public.anime_search_documents (
  anime_id,
  slug,
  title,
  genres,
  poster_url,
  search_text,
  updated_at
)
select
  c.id,
  c.slug,
  c.title,
  coalesce(c.genres, '{}'::text[]),
  c.poster_url,
  public.animebox_normalize_search_text(
    concat_ws(' ', c.title, array_to_string(coalesce(c.genres, '{}'::text[]), ' '))
  ),
  c.updated_at
from public.anime_catalog c
on conflict (anime_id) do nothing;
