-- AnimeBox profile/tracker performance v1
-- Supports the lightweight tracker endpoint ordered by recently updated titles.
create index if not exists anime_library_user_updated_idx
  on public.anime_library (user_id, updated_at desc);
