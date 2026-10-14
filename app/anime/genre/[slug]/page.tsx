import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import SeoAnimeLanding from '@/components/SeoAnimeLanding';
import { getGenreLandingCollection } from '@/lib/genre-landing-server';
import { getSeoGenre } from '@/lib/search-seo';

export const dynamic = 'force-dynamic';

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

  const collection = await getGenreLandingCollection(genre.value, genre.label);

  const path = `/anime/genre/${genre.slug}`;
  return (
    <SeoAnimeLanding
      title={`Аниме жанра «${genre.label}»`}
      description={genre.description}
      path={path}
      items={collection.items}
      collectionStatus={collection.status}
      catalogHref={`/search?tags=${encodeURIComponent(genre.slug)}`}
      breadcrumbs={[
        { label: 'AnimeBox', path: '/' },
        { label: 'Каталог', path: '/search' },
        { label: genre.label, path },
      ]}
    />
  );
}
