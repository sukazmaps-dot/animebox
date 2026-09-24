import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import SeoAnimeLanding from '@/components/SeoAnimeLanding';
import { getAnimesWithShikimori } from '@/lib/combined-anime';
import { getSeoGenre } from '@/lib/search-seo';

export const revalidate = 3600;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const genre = getSeoGenre(slug);

  if (!genre) {
    return { robots: { index: false, follow: false } };
  }

  const path = `/anime/genre/${genre.slug}`;
  return {
    title: `Аниме жанра «${genre.label}»`,
    description: `${genre.description} Смотри подборку AnimeBox и переходи к страницам тайтлов.`,
    alternates: { canonical: path },
    robots: { index: true, follow: true },
    openGraph: {
      title: `Аниме жанра «${genre.label}» — AnimeBox`,
      description: genre.description,
      url: path,
      type: 'website',
    },
  };
}

export default async function GenreLandingPage({ params }: Props) {
  const { slug } = await params;
  const genre = getSeoGenre(slug);
  if (!genre) notFound();

  let items = [];
  try {
    items = await getAnimesWithShikimori({
      page: 1,
      limit: 24,
      order: 'popularity',
      genres: [genre.value],
    });
  } catch (error) {
    console.warn('[SEO genre landing]', genre.value, error);
  }

  const path = `/anime/genre/${genre.slug}`;
  return (
    <SeoAnimeLanding
      title={`Аниме жанра «${genre.label}»`}
      description={genre.description}
      path={path}
      items={items}
      breadcrumbs={[
        { label: 'AnimeBox', path: '/' },
        { label: 'Каталог', path: '/search' },
        { label: genre.label, path },
      ]}
    />
  );
}
