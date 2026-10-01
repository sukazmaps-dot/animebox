import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import SeoAnimeLanding from '@/components/SeoAnimeLanding';
import { getAnimesWithShikimori } from '@/lib/combined-anime';
import { getSeoStudio } from '@/lib/search-seo';
import type { Anime } from '@/types/anime';

export const revalidate = 3600;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const studio = getSeoStudio(slug);

  if (!studio) {
    return { robots: { index: false, follow: false } };
  }

  const path = `/anime/studio/${studio.slug}`;
  const description =
    `${studio.description} Смотри подборку, открывай страницы тайтлов и находи похожие аниме.`;

  return {
    title: `Аниме студии ${studio.label}`,
    description,
    alternates: { canonical: path },
    robots: { index: true, follow: true },
    openGraph: {
      title: `Аниме студии ${studio.label} — AnimeBox`,
      description,
      url: path,
      type: 'website',
    },
  };
}

export default async function StudioLandingPage({ params }: Props) {
  const { slug } = await params;
  const studio = getSeoStudio(slug);
  if (!studio) notFound();

  let items: Anime[] = [];
  try {
    items = await getAnimesWithShikimori({
      page: 1,
      limit: 24,
      order: 'popularity',
      studioNames: [studio.providerName],
    });
  } catch (error) {
    console.warn('[SEO studio landing]', studio.providerName, error);
  }

  const path = `/anime/studio/${studio.slug}`;

  return (
    <SeoAnimeLanding
      title={`Аниме студии ${studio.label}`}
      description={studio.description}
      path={path}
      items={items}
      breadcrumbs={[
        { label: 'AnimeBox', path: '/' },
        { label: 'Каталог', path: '/search' },
        { label: studio.label, path },
      ]}
    />
  );
}
