-- AnimeBox Patch 24.4 — Local Search Authority & Self-Healing Index
-- Rich local search cards, v3 lexical RPC and bounded catalog -> search repair.

alter table public.anime_search_documents
  add column if not exists studios text[] not null default '{}'::text[],
  add column if not exists format text,
  add column if not exists start_year integer,
  add column if not exists total_episodes integer,
  add column if not exists finished boolean,
  add column if not exists catalog_metadata_version smallint not null default 0,
  add column if not exists catalog_updated_at timestamptz;

create index if not exists anime_search_documents_catalog_sync_idx
  on public.anime_search_documents (
    catalog_metadata_version,
    catalog_updated_at
  );

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
    studios,
    format,
    start_year,
    total_episodes,
    finished,
    poster_url,
    catalog_metadata_version,
    catalog_updated_at,
    search_text,
    updated_at
  )
  values (
    new.id,
    new.slug,
    new.title,
    coalesce(new.genres, '{}'::text[]),
    coalesce(new.studios, '{}'::text[]),
    new.format,
    new.start_year,
    new.total_episodes,
    new.finished,
    new.poster_url,
    1,
    coalesce(new.updated_at, now()),
    public.animebox_normalize_search_text(
      concat_ws(
        ' ',
        new.title,
        new.slug,
        array_to_string(coalesce(new.genres, '{}'::text[]), ' '),
        array_to_string(coalesce(new.studios, '{}'::text[]), ' ')
      )
    ),
    now()
  )
  on conflict (anime_id) do update
  set
    slug = coalesce(excluded.slug, anime_search_documents.slug),
    title = excluded.title,
    genres = excluded.genres,
    studios = excluded.studios,
    format = excluded.format,
    start_year = excluded.start_year,
    total_episodes = excluded.total_episodes,
    finished = excluded.finished,
    poster_url = coalesce(
      excluded.poster_url,
      anime_search_documents.poster_url
    ),
    catalog_metadata_version = 1,
    catalog_updated_at = excluded.catalog_updated_at,
    search_text = public.animebox_normalize_search_text(
      concat_ws(
        ' ',
        anime_search_documents.search_text,
        excluded.title,
        excluded.slug,
        array_to_string(excluded.genres, ' '),
        array_to_string(excluded.studios, ' ')
      )
    ),
    updated_at = greatest(
      anime_search_documents.updated_at,
      excluded.updated_at
    );

  return new;
end;
$$;

drop trigger if exists anime_catalog_search_document_sync
  on public.anime_catalog;

create trigger anime_catalog_search_document_sync
after insert or update of
  title,
  genres,
  studios,
  format,
  start_year,
  total_episodes,
  finished,
  poster_url,
  slug,
  updated_at
on public.anime_catalog
for each row execute function public.sync_anime_catalog_search_document();

-- Full one-time backfill. Existing aliases/tags/description/search_text are
-- preserved and catalog fields are appended to the normalized search corpus.
insert into public.anime_search_documents (
  anime_id,
  slug,
  title,
  genres,
  studios,
  format,
  start_year,
  total_episodes,
  finished,
  poster_url,
  catalog_metadata_version,
  catalog_updated_at,
  search_text,
  updated_at
)
select
  c.id,
  c.slug,
  c.title,
  coalesce(c.genres, '{}'::text[]),
  coalesce(c.studios, '{}'::text[]),
  c.format,
  c.start_year,
  c.total_episodes,
  c.finished,
  c.poster_url,
  1,
  coalesce(c.updated_at, now()),
  public.animebox_normalize_search_text(
    concat_ws(
      ' ',
      c.title,
      c.slug,
      array_to_string(coalesce(c.genres, '{}'::text[]), ' '),
      array_to_string(coalesce(c.studios, '{}'::text[]), ' ')
    )
  ),
  now()
from public.anime_catalog c
on conflict (anime_id) do update
set
  slug = coalesce(excluded.slug, anime_search_documents.slug),
  title = excluded.title,
  genres = excluded.genres,
  studios = excluded.studios,
  format = excluded.format,
  start_year = excluded.start_year,
  total_episodes = excluded.total_episodes,
  finished = excluded.finished,
  poster_url = coalesce(
    excluded.poster_url,
    anime_search_documents.poster_url
  ),
  catalog_metadata_version = 1,
  catalog_updated_at = excluded.catalog_updated_at,
  search_text = public.animebox_normalize_search_text(
    concat_ws(
      ' ',
      anime_search_documents.search_text,
      excluded.title,
      excluded.slug,
      array_to_string(excluded.genres, ' '),
      array_to_string(excluded.studios, ' ')
    )
  ),
  updated_at = greatest(
    anime_search_documents.updated_at,
    excluded.updated_at
  );

create or replace function public.search_anime_hybrid_lexical_v3(
  query_text text,
  match_count integer default 20
)
returns table (
  anime_id bigint,
  title text,
  slug text,
  poster_url text,
  genres text[],
  studios text[],
  format text,
  start_year integer,
  total_episodes integer,
  finished boolean,
  catalog_metadata_version smallint,
  matched_text text,
  match_kind text,
  similarity_score double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with normalized as (
    select public.animebox_normalize_search_text(query_text) as q
  ),
  prepared as (
    select
      d.*,
      n.q,
      public.animebox_normalize_search_text(d.title) as title_norm,
      public.animebox_normalize_search_text(coalesce(d.slug, '')) as slug_norm,
      best_alias.alias as best_alias,
      public.animebox_normalize_search_text(
        coalesce(best_alias.alias, '')
      ) as alias_norm
    from public.anime_search_documents d
    cross join normalized n
    left join lateral (
      select alias
      from unnest(d.aliases) alias
      order by greatest(
        case
          when public.animebox_normalize_search_text(alias) = n.q
            then 1.0
          else 0.0
        end,
        case
          when public.animebox_normalize_search_text(alias)
            like n.q || '%'
            then 0.96
          else 0.0
        end,
        case
          when public.animebox_normalize_search_text(alias)
            like '%' || n.q || '%'
            then 0.88
          else 0.0
        end,
        case
          when char_length(n.q) >= 4
            then similarity(
              public.animebox_normalize_search_text(alias),
              n.q
            ) * 0.86
          else 0.0
        end,
        case
          when char_length(n.q) >= 4
            then word_similarity(
              n.q,
              public.animebox_normalize_search_text(alias)
            ) * 0.88
          else 0.0
        end
      ) desc
      limit 1
    ) best_alias on true
  ),
  scored_base as (
    select
      p.*,
      greatest(
        case when p.title_norm = p.q then 1.0 else 0.0 end,
        case when p.alias_norm = p.q then 0.995 else 0.0 end,
        case when p.title_norm like p.q || '%' then 0.97 else 0.0 end,
        case when p.alias_norm like p.q || '%' then 0.95 else 0.0 end,
        case when p.title_norm like '%' || p.q || '%' then 0.91 else 0.0 end,
        case when p.alias_norm like '%' || p.q || '%' then 0.90 else 0.0 end,
        case when p.slug_norm like '%' || p.q || '%' then 0.86 else 0.0 end,
        case
          when char_length(p.q) >= 4
            then similarity(p.title_norm, p.q) * 0.88
          else 0.0
        end,
        case
          when char_length(p.q) >= 4
            then word_similarity(p.q, p.title_norm) * 0.90
          else 0.0
        end,
        case
          when char_length(p.q) >= 4
            then similarity(p.alias_norm, p.q) * 0.84
          else 0.0
        end,
        case
          when char_length(p.q) >= 4
            then word_similarity(p.q, p.alias_norm) * 0.86
          else 0.0
        end,
        case
          when char_length(p.q) >= 4
            then word_similarity(p.q, p.search_text) * 0.72
          else 0.0
        end
      )::double precision as base_score,
      greatest(
        case
          when char_length(p.title_norm) > 0
            and char_length(p.q) > 0
          then 1.0 - (
            abs(
              char_length(p.title_norm) - char_length(p.q)
            )::double precision /
            greatest(
              char_length(p.title_norm),
              char_length(p.q),
              1
            )
          )
          else 0.0
        end,
        case
          when char_length(p.alias_norm) > 0
            and char_length(p.q) > 0
          then 1.0 - (
            abs(
              char_length(p.alias_norm) - char_length(p.q)
            )::double precision /
            greatest(
              char_length(p.alias_norm),
              char_length(p.q),
              1
            )
          )
          else 0.0
        end
      )::double precision as shape_closeness
    from prepared p
    where char_length(p.q) >= 2
  ),
  scored as (
    select
      b.*,
      least(
        1.0,
        b.base_score + b.shape_closeness * 0.07
      )::double precision as score
    from scored_base b
  )
  select
    s.anime_id,
    s.title,
    s.slug,
    s.poster_url,
    s.genres,
    s.studios,
    s.format,
    s.start_year,
    s.total_episodes,
    s.finished,
    s.catalog_metadata_version,
    case
      when s.alias_norm = s.q
        or s.alias_norm like s.q || '%'
        or s.alias_norm like '%' || s.q || '%'
      then s.best_alias
      else s.title
    end as matched_text,
    case
      when s.title_norm = s.q or s.alias_norm = s.q
        then 'exact'
      when s.title_norm like s.q || '%'
        or s.alias_norm like s.q || '%'
        then 'prefix'
      when s.title_norm like '%' || s.q || '%'
        or s.alias_norm like '%' || s.q || '%'
        then 'contains'
      when s.score >= 0.55
        then 'fuzzy'
      else 'weak'
    end as match_kind,
    s.score as similarity_score
  from scored s
  where s.score >= case
    when char_length(s.q) <= 3 then 0.55
    when char_length(s.q) <= 5 then 0.38
    else 0.28
  end
  order by
    s.score desc,
    abs(char_length(s.title_norm) - char_length(s.q)) asc,
    char_length(s.title_norm) asc,
    s.updated_at desc,
    s.anime_id asc
  limit least(greatest(match_count, 1), 50);
$$;

revoke all on function public.search_anime_hybrid_lexical_v3(text, integer)
  from public, anon, authenticated;
grant execute on function public.search_anime_hybrid_lexical_v3(text, integer)
  to service_role;

create or replace function public.repair_anime_search_documents_v1(
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 2000);
  v_processed integer := 0;
begin
  with candidates as (
    select c.*
    from public.anime_catalog c
    left join public.anime_search_documents d
      on d.anime_id = c.id
    where
      d.anime_id is null
      or d.catalog_metadata_version < 1
      or d.catalog_updated_at is null
      or (
        c.updated_at is not null
        and d.catalog_updated_at < c.updated_at
      )
      or d.title is distinct from c.title
      or d.slug is distinct from c.slug
      or d.genres is distinct from coalesce(c.genres, '{}'::text[])
      or d.studios is distinct from coalesce(c.studios, '{}'::text[])
      or d.format is distinct from c.format
      or d.start_year is distinct from c.start_year
      or d.total_episodes is distinct from c.total_episodes
      or d.finished is distinct from c.finished
      or d.poster_url is distinct from c.poster_url
    order by c.updated_at asc nulls first, c.id asc
    limit v_limit
  )
  insert into public.anime_search_documents (
    anime_id,
    slug,
    title,
    genres,
    studios,
    format,
    start_year,
    total_episodes,
    finished,
    poster_url,
    catalog_metadata_version,
    catalog_updated_at,
    search_text,
    updated_at
  )
  select
    c.id,
    c.slug,
    c.title,
    coalesce(c.genres, '{}'::text[]),
    coalesce(c.studios, '{}'::text[]),
    c.format,
    c.start_year,
    c.total_episodes,
    c.finished,
    c.poster_url,
    1,
    coalesce(c.updated_at, now()),
    public.animebox_normalize_search_text(
      concat_ws(
        ' ',
        c.title,
        c.slug,
        array_to_string(coalesce(c.genres, '{}'::text[]), ' '),
        array_to_string(coalesce(c.studios, '{}'::text[]), ' ')
      )
    ),
    now()
  from candidates c
  on conflict (anime_id) do update
  set
    slug = coalesce(excluded.slug, anime_search_documents.slug),
    title = excluded.title,
    genres = excluded.genres,
    studios = excluded.studios,
    format = excluded.format,
    start_year = excluded.start_year,
    total_episodes = excluded.total_episodes,
    finished = excluded.finished,
    poster_url = coalesce(
      excluded.poster_url,
      anime_search_documents.poster_url
    ),
    catalog_metadata_version = 1,
    catalog_updated_at = excluded.catalog_updated_at,
    search_text = public.animebox_normalize_search_text(
      concat_ws(
        ' ',
        anime_search_documents.search_text,
        excluded.title,
        excluded.slug,
        array_to_string(excluded.genres, ' '),
        array_to_string(excluded.studios, ' ')
      )
    ),
    updated_at = greatest(
      anime_search_documents.updated_at,
      excluded.updated_at
    );

  get diagnostics v_processed = row_count;
  return v_processed;
end;
$$;

revoke all on function public.repair_anime_search_documents_v1(integer)
  from public, anon, authenticated;
grant execute on function public.repair_anime_search_documents_v1(integer)
  to service_role;
