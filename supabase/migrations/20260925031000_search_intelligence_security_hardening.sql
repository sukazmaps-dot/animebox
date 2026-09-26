-- Patch 17.9 — Search Intelligence RPC privilege hardening
revoke all on table public.anime_search_documents from anon, authenticated;
revoke all on function public.search_anime_lexical(text, integer)
  from public, anon, authenticated;
revoke all on function public.match_anime_semantic(extensions.vector, double precision, integer)
  from public, anon, authenticated;
revoke all on function public.sync_anime_catalog_search_document()
  from public, anon, authenticated;

grant execute on function public.search_anime_lexical(text, integer)
  to service_role;
grant execute on function public.match_anime_semantic(extensions.vector, double precision, integer)
  to service_role;
