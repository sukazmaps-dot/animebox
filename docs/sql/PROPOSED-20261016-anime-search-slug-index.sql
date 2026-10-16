-- Proposal, not applied. Requires separate approval.
-- Observed Seq Scan on public.anime_search_documents WHERE slug = $1.
-- Baseline EXPLAIN cost 476.46; query 3900 calls, mean 82.42 ms.
EXPLAIN SELECT anime_id, slug FROM public.anime_search_documents WHERE slug = 'audit-no-match' LIMIT 21;

-- Manual DDL: execute outside transaction only after approval.
CREATE INDEX CONCURRENTLY IF NOT EXISTS anime_search_documents_slug_lookup_idx
ON public.anime_search_documents (slug text_pattern_ops) INCLUDE (anime_id);

EXPLAIN SELECT anime_id, slug FROM public.anime_search_documents WHERE slug = 'audit-no-match' LIMIT 21;
