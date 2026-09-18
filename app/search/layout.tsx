import type { Metadata } from 'next';

import { SITE_URL } from '@/lib/seo-config';
import { buildStaticPageMetadata } from '@/lib/static-page-seo';

const description =
  'Каталог AnimeBox: находи аниме по названию, жанру и статусу, открывай страницы тайтлов и добавляй их в свой трекер.';

export const metadata: Metadata = buildStaticPageMetadata({
  title: 'Каталог аниме',
  description,
  path: '/search',
});

const catalogStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  '@id': `${SITE_URL}/search#page`,
  name: 'Каталог аниме AnimeBox',
  description,
  url: `${SITE_URL}/search`,
  inLanguage: 'ru-RU',
  isPartOf: {
    '@id': `${SITE_URL}#website`,
  },
};

export default function SearchLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(catalogStructuredData).replace(/</g, '\\u003c'),
        }}
      />
      {children}
    </>
  );
}
