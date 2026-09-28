-- Patch 22 Phase D — Taste Graph 7 metadata foundation
-- Persist bounded recommendation metadata in anime_catalog so Taste Graph can
-- learn studio / format / era preferences without provider N+1 calls.

alter table public.anime_catalog
  add column if not exists studios text[] not null default array[]::text[],
  add column if not exists format text,
  add column if not exists start_year smallint;

alter table public.anime_catalog
  drop constraint if exists anime_catalog_format_length_check;
alter table public.anime_catalog
  add constraint anime_catalog_format_length_check
  check (format is null or char_length(format) between 1 and 32);

alter table public.anime_catalog
  drop constraint if exists anime_catalog_start_year_check;
alter table public.anime_catalog
  add constraint anime_catalog_start_year_check
  check (start_year is null or start_year between 1940 and 2200);

comment on column public.anime_catalog.studios is
  'Bounded canonical studio names used by Taste Graph 7 and recommendation explanations.';
comment on column public.anime_catalog.format is
  'Canonical anime format (TV, MOVIE, OVA, ONA, SPECIAL, etc.) used by Taste Graph 7.';
comment on column public.anime_catalog.start_year is
  'Release year used only as a coarse recommendation-era preference signal.';
