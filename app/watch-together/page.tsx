import type { Metadata } from 'next';

import WatchTogetherHub from '@/components/watch-party/WatchTogetherHub';
import { SITE_URL } from '@/lib/seo-config';

const watchTogetherUrl = SITE_URL + '/watch-together';
const watchTogetherDescription =
  'Смотрите аниме вместе с друзьями онлайн в AnimeBox. Создайте комнату, отправьте ссылку другу и смотрите серии синхронно, даже находясь на расстоянии.';

export const metadata: Metadata = {
  title: {
    absolute: 'Смотреть аниме вместе с другом онлайн — Watch Together | AnimeBox',
  },
  description: watchTogetherDescription,
  alternates: {
    canonical: watchTogetherUrl,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: watchTogetherUrl,
    siteName: 'AnimeBox',
    title: 'Смотреть аниме вместе с другом онлайн | AnimeBox',
    description: watchTogetherDescription,
    images: [
      {
        url: SITE_URL + '/og/animebox-share-v2.jpg',
        width: 1200,
        height: 630,
        alt: 'AnimeBox Watch Together — совместный просмотр аниме',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Смотреть аниме вместе с другом онлайн | AnimeBox',
    description: watchTogetherDescription,
    images: [SITE_URL + '/og/animebox-share-v2.jpg'],
  },
};

const watchTogetherStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  '@id': watchTogetherUrl + '#webpage',
  url: watchTogetherUrl,
  name: 'Смотреть аниме вместе с другом онлайн — Watch Together | AnimeBox',
  description: watchTogetherDescription,
  inLanguage: 'ru-RU',
  isPartOf: {
    '@id': SITE_URL + '#website',
  },
};

const faqStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Как смотреть аниме вместе с другом онлайн?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Откройте Watch Together, выберите аниме и серию, создайте приватную комнату и отправьте другу invite-ссылку.',
      },
    },
    {
      '@type': 'Question',
      name: 'Можно ли смотреть аниме вместе на расстоянии?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Да. Комната работает через интернет, поэтому участники могут смотреть одну серию вместе, находясь в разных местах.',
      },
    },
    {
      '@type': 'Question',
      name: 'Синхронизируются ли пауза и перемотка?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Watch Together синхронизирует управление просмотром между участниками комнаты: воспроизведение, паузу и перемотку.',
      },
    },
    {
      '@type': 'Question',
      name: 'Сколько человек может смотреть вместе?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Одна комната AnimeBox Watch Together рассчитана максимум на 8 участников.',
      },
    },
    {
      '@type': 'Question',
      name: 'Нужен ли отдельный сервис, чтобы смотреть видео вместе с другом?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Для аниме из каталога AnimeBox отдельный сервис не нужен: выберите тайтл в Watch Together и создайте комнату.',
      },
    },
  ],
};

export default function WatchTogetherPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(watchTogetherStructuredData).replace(/</g, '\\u003c'),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqStructuredData).replace(/</g, '\\u003c'),
        }}
      />
      <WatchTogetherHub />
    </>
  );
}
