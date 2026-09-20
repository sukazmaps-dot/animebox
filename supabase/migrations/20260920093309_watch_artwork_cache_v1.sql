alter table public.anime_catalog
  add column if not exists poster_url text,
  add column if not exists slug text;
