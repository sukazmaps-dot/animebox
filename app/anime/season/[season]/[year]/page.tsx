import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import SeoAnimeLanding from '@/components/SeoAnimeLanding';
import { getAnimesWithShikimori } from '@/lib/combined-anime';
import {
  getSeoSeason,
  isSeoSeasonYear,
  seoSeasonLabel,
} from '@/lib/search-seo';
import type { Anime } from '@/types/anime';

export const revalidate = 1800;

type Props = {
  params: Promise<{ season: string; year: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { season: rawSeason, year: rawYear } = await params;
  const season = getSeoSeason(rawSeason);
  const year = Number(rawYear);

  if (!season || !isSeoSeasonYear(year)) {
    return { robots: { index: false, follow: false } };
  }

  const label = seoSeasonLabel(season, year);
  const path = `/anime/season/${rawSeason}/${year}`;
  const description =
    `Аниме сезона «${label}»: популярные сериалы, фильмы и онгоинги в каталоге AnimeBox.`;

  return {
    title: `Аниме сезона «${label}»`,
    description,
    alternates: { canonical: path },
    robots: { index: true, follow: true },
    openGraph: {
      title: `Аниме сезона «${label}» — AnimeBox`,
      description,
      url: path,
      type: 'website',
    },
  };
}

export default async function SeasonLandingPage({ params }: Props) {
  const { season: rawSeason, year: rawYear } = await params;
  const season = getSeoSeason(rawSeason);
  const year = Number(rawYear);

  if (!season || !isSeoSeasonYear(year)) notFound();

  let items: Anime[] = [];
  try {
    items = await getAnimesWithShikimori({
      page: 1,
      limit: 24,
      order: 'popularity',
      season,
      year,
    });
  } catch (error) {
    console.warn('[SEO season landing]', season, year, error);
  }

  const label = seoSeasonLabel(season, year);
  const path = `/anime/season/${rawSeason}/${year}`;

  return (
    <SeoAnimeLanding
      title={`Аниме сезона «${label}»`}
      description={`Популярные аниме, выходившие в сезон «${label}».`}
      path={path}
      items={items}
      breadcrumbs={[
        { label: 'AnimeBox', path: '/' },
        { label: 'Каталог', path: '/search' },
        { label, path },
      ]}
    />
  );
}
