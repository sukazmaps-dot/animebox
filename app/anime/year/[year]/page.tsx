import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import SeoAnimeLanding from '@/components/SeoAnimeLanding';
import { getAnimesWithShikimori } from '@/lib/combined-anime';
import type { Anime } from '@/types/anime';
import { isSeoCatalogYear } from '@/lib/search-seo';

export const revalidate = 3600;

type Props = {
  params: Promise<{ year: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year: rawYear } = await params;
  const year = Number(rawYear);

  if (!isSeoCatalogYear(year)) {
    return { robots: { index: false, follow: false } };
  }

  const path = `/anime/year/${year}`;
  return {
    title: `Аниме ${year} года`,
    description: `Популярные и заметные аниме ${year} года в каталоге AnimeBox: сериалы, фильмы и онгоинги.`,
    alternates: { canonical: path },
    robots: { index: true, follow: true },
    openGraph: {
      title: `Аниме ${year} года — AnimeBox`,
      description: `Подборка аниме ${year} года в AnimeBox.`,
      url: path,
      type: 'website',
    },
  };
}

export default async function YearLandingPage({ params }: Props) {
  const { year: rawYear } = await params;
  const year = Number(rawYear);
  if (!isSeoCatalogYear(year)) notFound();

  let items: Anime[] = [];
  try {
    items = await getAnimesWithShikimori({
      page: 1,
      limit: 24,
      order: 'popularity',
      year,
    });
  } catch (error) {
    console.warn('[SEO year landing]', year, error);
  }

  const path = `/anime/year/${year}`;
  return (
    <SeoAnimeLanding
      title={`Аниме ${year} года`}
      description={`Популярные аниме, вышедшие в ${year} году.`}
      path={path}
      items={items}
      breadcrumbs={[
        { label: 'AnimeBox', path: '/' },
        { label: 'Каталог', path: '/search' },
        { label: String(year), path },
      ]}
    />
  );
}
