import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import SearchCatalogClient from '@/components/SearchCatalogClient';
import { getAnimesWithShikimori } from '@/lib/combined-anime';
import { getSavedCatalogPage } from '@/lib/saved-catalog-server';
import { withCatalogProviderBudget } from '@/lib/catalog-provider-budget';
import type { Anime } from '@/types/anime';
import type { GetAnimesOptions } from '@/lib/anilist';
import { CATALOG_PAGE_SIZE } from '@/lib/catalog-pagination';
import {
  catalogFiltersToProviderOptions,
  parseCatalogFilters,
  type CatalogFiltersState,
} from '@/lib/catalog-filter-state';
import { getCurrentAnimeSeason } from '@/lib/catalog-season';
import {
  SEO_GENRE_LANDINGS,
  SEO_STUDIO_LANDINGS,
  seoCatalogYears,
  seoSeasonSlug,
} from '@/lib/search-seo';

export const revalidate = 900;

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  const params = await searchParams;
  const hasDynamicCatalogState = Object.values(params).some((value) =>
    Array.isArray(value)
      ? value.some((item) => item.trim().length > 0)
      : typeof value === 'string' && value.trim().length > 0,
  );

  // Only the clean catalogue URL is indexable. Arbitrary search text and
  // filter combinations remain useful to users/crawlers through follow links,
  // but cannot turn into an unbounded set of thin/duplicate index pages.
  const description =
    'Каталог аниме AnimeBox: поиск по названиям, жанрам, сезонам, годам и студиям. Открывай страницы тайтлов и находи, что посмотреть дальше.';

  return {
    title: 'Каталог аниме — жанры, сезоны и студии',
    description,
    robots: hasDynamicCatalogState
      ? { index: false, follow: true }
      : { index: true, follow: true },
    alternates: { canonical: '/search' },
    openGraph: {
      type: 'website',
      url: '/search',
      title: 'Каталог аниме — AnimeBox',
      description,
    },
  };
}

async function loadInitialCatalog(filters: CatalogFiltersState): Promise<{
  anime: Anime[]; source: 'saved' | 'provider'; hasNextPage: boolean;
}> {
  const providerFilters = catalogFiltersToProviderOptions(filters);
  const options: GetAnimesOptions = {
    page: 1,
    limit: CATALOG_PAGE_SIZE,
    order: providerFilters.order,
    genres: providerFilters.genres.length > 0 ? providerFilters.genres : undefined,
    tags: providerFilters.tags.length > 0 ? providerFilters.tags : undefined,
    status: providerFilters.status,
    format: providerFilters.format,
    season: providerFilters.season,
    year: providerFilters.year,
    studioNames: providerFilters.studioNames.length > 0 ? providerFilters.studioNames : undefined,
  };

  // Render an already-verified playable catalogue without an upstream round
  // trip. The client will refresh through /api/anime with the same filters.
  try {
    const saved = await getSavedCatalogPage(options);
    if (saved.anime.length > 0) return {anime: saved.anime, source: 'saved', hasNextPage: saved.hasNextPage};
  } catch (error) {
    console.warn('[Catalog SSR] saved snapshot unavailable:', error);
  }

  // The snapshot can be empty during first setup or an unusual filter.
  // Preserve the original provider path, but never block first paint for 8s.
  try {
    let hasNextPage = false;
    const anime = await withCatalogProviderBudget(
      signal => getAnimesWithShikimori(options, { signal, onPageInfo: info => {
        if (!signal.aborted) hasNextPage = info.hasNextPage;
      } }),
      2800,
    );
    return {anime, source: 'provider', hasNextPage};
  } catch (error) {
    console.warn('[Catalog SSR] provider unavailable:', error);
    return {anime: [], source: 'provider', hasNextPage: false};
  }
}

function CatalogDiscoveryLinks() {
  const currentSeason = getCurrentAnimeSeason();
  const currentSeasonSlug = seoSeasonSlug(currentSeason.season);
  const years = seoCatalogYears().filter(
    (year) => year <= new Date().getFullYear(),
  ).slice(0, 3);

  return (
    <div className="search-page">
      <section className="section" aria-labelledby="catalog-discovery-links-title">
        <div className="section-head">
          <h2 id="catalog-discovery-links-title" className="section-title">
            Популярные разделы каталога
          </h2>
        </div>

        <nav
          aria-label="Разделы каталога аниме"
          className="flex flex-wrap gap-x-4 gap-y-2 text-sm"
        >
          <Link href="/anime/ongoing" className="opacity-70 transition hover:opacity-100">
            Онгоинги
          </Link>
          <Link
            href={`/anime/season/${currentSeasonSlug}/${currentSeason.year}`}
            className="opacity-70 transition hover:opacity-100"
          >
            Текущий сезон
          </Link>
          {SEO_GENRE_LANDINGS.slice(0, 6).map((genre) => (
            <Link
              key={genre.slug}
              href={`/anime/genre/${genre.slug}`}
              className="opacity-70 transition hover:opacity-100"
            >
              {genre.label}
            </Link>
          ))}
          {SEO_STUDIO_LANDINGS.slice(0, 5).map((studio) => (
            <Link
              key={studio.slug}
              href={`/anime/studio/${studio.slug}`}
              className="opacity-70 transition hover:opacity-100"
            >
              {studio.label}
            </Link>
          ))}
          {years.map((year) => (
            <Link
              key={year}
              href={`/anime/year/${year}`}
              className="opacity-70 transition hover:opacity-100"
            >
              Аниме {year}
            </Link>
          ))}
        </nav>
      </section>
    </div>
  );
}

function CatalogFallback() {
  return (
    <div className="search-page">
      <div className="page-heading">
        <h1>Каталог аниме</h1>
        <p>Ищи тайтлы по названию или жанру</p>
      </div>
      <section className="section">
        <div className="loading-grid">
          {Array.from({ length: CATALOG_PAGE_SIZE }).map((_, index) => (
            <div key={index} className="skeleton skeleton--card" />
          ))}
        </div>
      </section>
    </div>
  );
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = typeof params.search === 'string' ? params.search.trim() : '';
  const initialView = params.view === 'saved' ? 'saved' : 'catalog';
  const initialFilters = parseCatalogFilters(params);
  // Search result URLs are client-driven and noindex. Do not block first paint
  // on an unrelated popular-catalog request when the user already supplied a
  // query; SearchCatalogClient will resolve it immediately.
  const initialCatalog = query || initialView === 'saved' ? null : await loadInitialCatalog(initialFilters);
  const initialResults = initialCatalog?.anime ?? [];

  return (
    <>
      <Suspense fallback={<CatalogFallback />}>
        <SearchCatalogClient
          initialResults={initialResults}
          initialQuery={query}
          initialView={initialView}
          initialFilters={initialFilters}
          initialSource={initialCatalog?.source}
          initialHasNextPage={initialCatalog?.hasNextPage}
        />
      </Suspense>
      <CatalogDiscoveryLinks />
    </>
  );
}
