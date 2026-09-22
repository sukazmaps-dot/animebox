import type { Metadata } from 'next';
import { Suspense } from 'react';

import SearchCatalogClient from '@/components/SearchCatalogClient';
import { getAnimesWithShikimori } from '@/lib/combined-anime';
import type { Anime } from '@/types/anime';
import { CATALOG_PAGE_SIZE } from '@/lib/catalog-pagination';

export const revalidate = 900;

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  const params = await searchParams;
  const query = typeof params.search === 'string' ? params.search.trim() : '';

  if (!query) {
    return {
      robots: { index: true, follow: true },
      alternates: { canonical: '/search' },
    };
  }

  // Internal search result URLs can create effectively unlimited duplicates.
  return {
    robots: { index: false, follow: true },
    alternates: { canonical: '/search' },
  };
}

async function loadInitialCatalog(): Promise<Anime[]> {
  try {
    return await getAnimesWithShikimori({
      page: 1,
      limit: CATALOG_PAGE_SIZE,
      order: 'ranked',
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
  // Search result URLs are client-driven and noindex. Do not block first paint
  // on an unrelated popular-catalog request when the user already supplied a
  // query; SearchCatalogClient will resolve it immediately.
  const initialResults = query || initialView === 'saved' ? [] : await loadInitialCatalog();

  return (
    <Suspense fallback={<CatalogFallback />}>
      <SearchCatalogClient
        initialResults={initialResults}
        initialQuery={query}
        initialView={initialView}
      />
    </Suspense>
  );
}
