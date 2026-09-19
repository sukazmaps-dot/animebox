import type { Metadata } from 'next';

import HomePageClient from '@/components/HomePageClient';
import { SITE_URL } from '@/lib/seo-config';
import { getHomeInitialFeed } from '@/lib/home-feed-server';

export const revalidate = 900;

const description =
  'Смотри аниме, сохраняй прогресс, собирай свою коллекцию и находи новые тайтлы с персональными рекомендациями.';

export const metadata: Metadata = {
  title: 'AnimeBox — Смотри. Отслеживай. Живи.',
  description,
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: SITE_URL,
    siteName: 'AnimeBox',
    title: 'AnimeBox — Смотри. Отслеживай. Живи.',
    description,
    images: [
      {
        url: `${SITE_URL}/og/animebox-share-v2.jpg`,
        width: 1200,
        height: 630,
        alt: 'AnimeBox — Смотри. Отслеживай. Живи.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AnimeBox — Смотри. Отслеживай. Живи.',
    description,
    images: [`${SITE_URL}/og/animebox-share-v2.jpg`],
  },
};

export default async function HomePage() {
  const initialFeed = await getHomeInitialFeed();

  return (
    <HomePageClient
      initialPopular={initialFeed.popular}
      initialOngoing={initialFeed.ongoing}
    />
  );
}
