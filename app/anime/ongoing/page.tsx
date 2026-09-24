import type { Metadata } from 'next';

import SeoAnimeLanding from '@/components/SeoAnimeLanding';
import { getAnimesWithShikimori } from '@/lib/combined-anime';
import type { Anime } from '@/types/anime';

export const revalidate = 1800;

const path = '/anime/ongoing';
const description =
  'Актуальные онгоинг-аниме, которые продолжают выходить сейчас. Следи за новыми сериями в AnimeBox.';

export const metadata: Metadata = {
  title: 'Онгоинг аниме',
  description,
  alternates: { canonical: path },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Онгоинг аниме — AnimeBox',
    description,
    url: path,
    type: 'website',
  },
};

export default async function OngoingAnimePage() {
  let items: Anime[] = [];

  try {
    items = await getAnimesWithShikimori({
      page: 1,
      limit: 24,
      order: 'popularity',
      status: 'ongoing',
    });
  } catch (error) {
    console.warn('[SEO ongoing landing]', error);
  }

  return (
    <SeoAnimeLanding
      title="Онгоинг аниме"
      description={description}
      path={path}
      items={items}
      breadcrumbs={[
        { label: 'AnimeBox', path: '/' },
        { label: 'Каталог', path: '/search' },
        { label: 'Онгоинги', path },
      ]}
    />
  );
}
