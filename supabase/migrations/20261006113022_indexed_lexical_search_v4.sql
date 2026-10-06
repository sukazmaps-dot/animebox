-- Initialize extension GUCs before CREATE FUNCTION in a fresh backend.
select extensions.similarity('animebox', 'animebox');
-- Indexed candidate retrieval; same ranking contract as v2.1. No table rewrite.
create or replace function public.search_anime_hybrid_lexical_v4(
  query_text text,
  match_count integer default 20
)
returns table (
  anime_id bigint,
  title text,
  slug text,
  poster_url text,
  genres text[],
  matched_text text,
  match_kind text,
  similarity_score double precision
)
language sql
stable
security invoker
set search_path = public, extensions
set pg_trgm.similarity_threshold = 0.22
set pg_trgm.word_similarity_threshold = 0.22
as $$
  with normalized as materialized (
    select public.animebox_normalize_search_text(query_text) as q
  ),
  candidates as materialized (
    select d.*
    from public.anime_search_documents d
    cross join normalized n
    where char_length(n.q) >= 2 and (
      d.search_text like '%' || n.q || '%'
      or (char_length(n.q) >= 4 and (
        d.search_text % n.q
        or n.q <% d.search_text
      ))
    )
  ),
  prepared as materialized (
    select
      d.*,
      n.q,
      public.animebox_normalize_search_text(d.title) as title_norm,
      public.animebox_normalize_search_text(coalesce(d.slug, '')) as slug_norm,
      best_alias.alias as best_alias,
      coalesce(best_alias.norm, '') as alias_norm
    from candidates d
    cross join normalized n
    left join lateral (
      with alias_values as materialized (
        select alias, public.animebox_normalize_search_text(alias) as norm
        from unnest(d.aliases) alias
      )
      select alias, norm
      from alias_values
      order by greatest(
        case when norm = n.q then 1.0 else 0.0 end,
        case when norm like n.q || '%' then 0.96 else 0.0 end,
        case when norm like '%' || n.q || '%' then 0.88 else 0.0 end,
        case when char_length(n.q) >= 4 then similarity(norm, n.q) * 0.86 else 0.0 end,
        case when char_length(n.q) >= 4 then word_similarity(n.q, norm) * 0.88 else 0.0 end
      ) desc
      limit 1
    ) best_alias on true
  ),
  scored_base as materialized (
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
        case when char_length(p.q) >= 4 then similarity(p.title_norm, p.q) * 0.88 else 0.0 end,
        case when char_length(p.q) >= 4 then word_similarity(p.q, p.title_norm) * 0.90 else 0.0 end,
        case when char_length(p.q) >= 4 then similarity(p.alias_norm, p.q) * 0.84 else 0.0 end,
        case when char_length(p.q) >= 4 then word_similarity(p.q, p.alias_norm) * 0.86 else 0.0 end,
        case when char_length(p.q) >= 4 then word_similarity(p.q, p.search_text) * 0.72 else 0.0 end
      )::double precision as base_score,
      greatest(
        case
          when char_length(p.title_norm) > 0 and char_length(p.q) > 0
          then 1.0 - (
            abs(char_length(p.title_norm) - char_length(p.q))::double precision /
            greatest(char_length(p.title_norm), char_length(p.q), 1)
          )
          else 0.0
        end,
        case
          when char_length(p.alias_norm) > 0 and char_length(p.q) > 0
          then 1.0 - (
            abs(char_length(p.alias_norm) - char_length(p.q))::double precision /
            greatest(char_length(p.alias_norm), char_length(p.q), 1)
          )
          else 0.0
        end
      )::double precision as shape_closeness
    from prepared p
    where char_length(p.q) >= 2
  ),
  scored as materialized (
    select
      b.*,
      least(1.0, b.base_score + b.shape_closeness * 0.07)::double precision as score
    from scored_base b
  )
  select
    s.anime_id,
    s.title,
    s.slug,
    s.poster_url,
    s.genres,
    case
      when s.alias_norm = s.q
        or s.alias_norm like s.q || '%'
        or s.alias_norm like '%' || s.q || '%'
      then s.best_alias
      else s.title
    end as matched_text,
    case
      when s.title_norm = s.q or s.alias_norm = s.q then 'exact'
      when s.title_norm like s.q || '%' or s.alias_norm like s.q || '%' then 'prefix'
      when s.title_norm like '%' || s.q || '%' or s.alias_norm like '%' || s.q || '%' then 'contains'
      when s.score >= 0.55 then 'fuzzy'
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

revoke all on function public.search_anime_hybrid_lexical_v4(text, integer)
  from public, anon, authenticated;
grant execute on function public.search_anime_hybrid_lexical_v4(text, integer)
  to service_role;
