import type { Metadata } from 'next';

import { SITE_URL } from '@/lib/seo-config';

type StaticPageSeoOptions = {
  title: string;
  description: string;
  path: string;
  index?: boolean;
};

export function buildStaticPageMetadata({
  title,
  description,
  path,
  index = true,
}: StaticPageSeoOptions): Metadata {
  const canonical = new URL(path, SITE_URL).toString();
  const socialTitle = `${title} | AnimeBox`;

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      type: 'website',
      locale: 'ru_RU',
      url: canonical,
      siteName: 'AnimeBox',
      title: socialTitle,
      description,
      images: [
        {
          url: `${SITE_URL}/og/animebox-share-v2.jpg`,
          width: 1200,
          height: 630,
          alt: socialTitle,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description,
      images: [`${SITE_URL}/og/animebox-share-v2.jpg`],
    },
    robots: {
      index,
      follow: true,
      googleBot: {
        index,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
  };
}
