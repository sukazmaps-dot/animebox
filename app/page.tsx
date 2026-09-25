import type { Metadata } from 'next';

import './patch17-6-home-recommendation-actions.css';

import HomePageClient from '@/components/HomePageClient';
import { SITE_URL } from '@/lib/seo-config';
import { BRAND_TITLE } from '@/lib/brand';
import { getHomeInitialFeed } from '@/lib/home-feed-server';

export const revalidate = 900;

const description =
  'Смотри аниме, сохраняй прогресс, собирай свою коллекцию и находи новые тайтлы с персональными рекомендациями.';

export const metadata: Metadata = {
  title: BRAND_TITLE,
  description,
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: SITE_URL,
    siteName: 'AnimeBox',
    title: BRAND_TITLE,
    description,
    images: [
      {
        url: `${SITE_URL}/og/animebox-share-v2.jpg`,
        width: 1200,
        height: 630,
        alt: BRAND_TITLE,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: BRAND_TITLE,
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
