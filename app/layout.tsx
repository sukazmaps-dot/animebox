import type { Metadata, Viewport } from 'next';

import './globals.css';
import './visual-refresh.css';
import './community.css';
import './design-v5.css';

import { Analytics } from "@vercel/analytics/next"

import Navbar from '@/components/Navbar';

const SITE_URL = 'https://youranimebox.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default: 'AnimeBox — Смотри. Отслеживай. Живи.',
    template: '%s | AnimeBox',
  },

  description:
    'AnimeBox — сервис для просмотра и отслеживания аниме. Сохраняй тайтлы, отмечай серии, следи за расписанием и обсуждай эпизоды.',

  applicationName: 'AnimeBox',
  creator: 'AnimeBox',
  publisher: 'AnimeBox',

  keywords: [
    'аниме',
    'аниме онлайн',
    'смотреть аниме онлайн',
    'аниме бесплатно',
    'аниме трекер',
    'AnimeBox',
    'каталог аниме',
    'расписание аниме',
    'новые серии аниме',
    'отслеживание аниме',
  ],

  /*
   * ВАЖНО:
   * canonical здесь НЕ ставим.
   *
   * Его будем задавать отдельно:
   * /anime/[slug]
   * /anime/[slug]/episode/[episode]
   *
   * Иначе Google может считать главную canonical-страницей
   * для всего сайта.
   */

  openGraph: {
    type: 'website',

    locale: 'ru_RU',

    url: SITE_URL,

    siteName: 'AnimeBox',

    title: 'AnimeBox — Смотри. Отслеживай. Живи.',

    description:
      'Смотри аниме, отслеживай просмотренные серии, собирай свою коллекцию и обсуждай эпизоды на AnimeBox.',

    images: [
      {
        /*
         * Лучше позже создать:
         * public/og/default.webp
         *
         * размером 1200x630.
         *
         * Пока можно оставить существующий background.
         */
        url: '/backgrounds/hero-fallback.webp',

        width: 2244,
        height: 701,

        alt: 'AnimeBox — аниме, трекер и новые серии',
      },
    ],
  },

  twitter: {
    card: 'summary_large_image',

    title: 'AnimeBox — Смотри. Отслеживай. Живи.',

    description:
      'Смотри аниме, отслеживай серии, собирай свою коллекцию и следи за новыми эпизодами.',

    images: ['/backgrounds/hero-fallback.webp'],
  },

  robots: {
    index: true,
    follow: true,

    googleBot: {
      index: true,
      follow: true,

      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },

  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
  },
};

export const viewport: Viewport = {
  themeColor: '#080912',
  colorScheme: 'dark',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        <Navbar />

        <div className="app-shell">
          <main className="page-content">
            {children}
          </main>
        </div>

        import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AnimeBox',
  description: 'AnimeBox',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        {children}

        <Analytics />
      </body>
    </html>
  );
}
      </body>
    </html>
  );
}