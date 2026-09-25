-- Patch 18.5.5.5 — remove an index with no production read path.
drop index if exists public.seo_anime_index_changed_idx;
