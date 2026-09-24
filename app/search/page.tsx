import type { Metadata } from 'next';
import { Suspense } from 'react';

import SearchCatalogClient from '@/components/SearchCatalogClient';
import { getAnimesWithShikimori } from '@/lib/combined-anime';
import type { Anime } from '@/types/anime';
import { CATALOG_PAGE_SIZE } from '@/lib/catalog-pagination';
import {
  catalogFiltersToProviderOptions,
  parseCatalogFilters,
  type CatalogFiltersState,
} from '@/lib/catalog-filter-state';

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
  return {
    robots: hasDynamicCatalogState
      ? { index: false, follow: true }
      : { index: true, follow: true },
    alternates: { canonical: '/search' },
  };
}

async function loadInitialCatalog(filters: CatalogFiltersState): Promise<Anime[]> {
  try {
    const providerFilters = catalogFiltersToProviderOptions(filters);
    return await getAnimesWithShikimori({
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
    });
  } catch (error) {
    console.warn('SSR catalog load failed:', error);
    return [];
  }
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
  const initialResults = query || initialView === 'saved' ? [] : await loadInitialCatalog(initialFilters);

  return (
    <Suspense fallback={<CatalogFallback />}>
      <SearchCatalogClient
        initialResults={initialResults}
        initialQuery={query}
        initialView={initialView}
        initialFilters={initialFilters}
      />
    </Suspense>
  );
}
