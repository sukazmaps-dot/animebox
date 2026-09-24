-- AnimeBox 18.0.1 — lexical ranker v2.1 tie-break refinement
-- Preserve exact/alias dominance, then prefer the candidate whose title/alias
-- shape is closest to the user's query. This keeps franchise specials from
-- tying the main title on fuzzy prefix-like misspellings.

create or replace function public.search_anime_hybrid_lexical_v2(
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
      public.animebox_normalize_search_text(coalesce(best_alias.alias, '')) as alias_norm
    from public.anime_search_documents d
    cross join normalized n
    left join lateral (
      select alias
      from unnest(d.aliases) alias
      order by greatest(
        case when public.animebox_normalize_search_text(alias) = n.q then 1.0 else 0.0 end,
        case when public.animebox_normalize_search_text(alias) like n.q || '%' then 0.96 else 0.0 end,
        case when public.animebox_normalize_search_text(alias) like '%' || n.q || '%' then 0.88 else 0.0 end,
        case when char_length(n.q) >= 4 then similarity(public.animebox_normalize_search_text(alias), n.q) * 0.86 else 0.0 end,
        case when char_length(n.q) >= 4 then word_similarity(n.q, public.animebox_normalize_search_text(alias)) * 0.88 else 0.0 end
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
  scored as (
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

revoke all on function public.search_anime_hybrid_lexical_v2(text, integer)
  from public, anon, authenticated;
grant execute on function public.search_anime_hybrid_lexical_v2(text, integer)
  to service_role;
