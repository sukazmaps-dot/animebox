import '../schedule-width-fix-v20.css';
import type { Metadata } from 'next';

import { SITE_URL } from '@/lib/seo-config';
import { buildStaticPageMetadata } from '@/lib/static-page-seo';

const description =
  'Расписание новых эпизодов аниме на AnimeBox: узнай, какие серии выходят сегодня и в ближайшие дни.';

export const metadata: Metadata = buildStaticPageMetadata({
  title: 'Расписание выхода аниме',
  description,
  path: '/schedule',
});

const scheduleStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  '@id': `${SITE_URL}/schedule#page`,
  name: 'Расписание выхода аниме',
  description,
  url: `${SITE_URL}/schedule`,
  inLanguage: 'ru-RU',
  isPartOf: {
    '@id': `${SITE_URL}#website`,
  },
};

export default function ScheduleLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(scheduleStructuredData).replace(/</g, '\\u003c'),
        }}
      />
      {children}
    </>
  );
}
