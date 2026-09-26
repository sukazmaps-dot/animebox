-- Patch 17.9 — enrich the legacy corpus with stable route aliases
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
      concat_ws(
        ' ',
        new.title,
        new.slug,
        array_to_string(coalesce(new.genres, '{}'::text[]), ' ')
      )
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
      then public.animebox_normalize_search_text(
        concat_ws(' ', anime_search_documents.search_text, excluded.slug)
      )
      else excluded.search_text
    end,
    updated_at = greatest(anime_search_documents.updated_at, excluded.updated_at);

  return new;
end;
$$;

update public.anime_search_documents
set search_text = public.animebox_normalize_search_text(
  concat_ws(' ', search_text, slug)
)
where slug is not null and btrim(slug) <> '';

drop policy if exists anime_search_documents_no_client_access
  on public.anime_search_documents;
create policy anime_search_documents_no_client_access
on public.anime_search_documents
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

revoke all on table public.anime_search_documents from anon, authenticated;
revoke all on function public.sync_anime_catalog_search_document()
  from public, anon, authenticated;
