import type { Metadata, Viewport } from 'next';
import Script from 'next/script';

import './globals.css';
import './visual-refresh.css';
import './community.css';
import './design-v5.css';
import './mobile-readability.css';
import './notifications.css';
import './telegram-logout.css';
import './home-rails.css';
import './card-layout.css';

import Navbar from '@/components/Navbar';
import TelegramMiniAppBridge from '@/components/TelegramMiniAppBridge';
import { AuthStateProvider } from '@/components/AuthStateProvider';

import { Analytics } from '@vercel/analytics/next';

import { SITE_URL } from '@/lib/seo-config';

const websiteStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'AnimeBox',
  alternateName: ['YourAnimeBox', 'youranimebox.com'],
  url: SITE_URL,
  inLanguage: 'ru-RU',
};

const organizationStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'AnimeBox',
  alternateName: 'YourAnimeBox',
  url: SITE_URL,
  logo: {
    '@type': 'ImageObject',
    url: `${SITE_URL}/brand/favicon.png`,
    contentUrl: `${SITE_URL}/brand/favicon.png`,
    width: 512,
    height: 512,
  },
  sameAs: ['https://t.me/YourAnimeBoxBot'],
};

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

  icons: {
    icon: [
      { url: '/brand/favicon.png', type: 'image/png', sizes: '512x512' },
      { url: '/favicon.ico', type: 'image/x-icon', sizes: '256x256' },
    ],
    shortcut: '/brand/favicon.png',
    apple: '/brand/favicon.png',
  },

  manifest: '/manifest.webmanifest',
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
    <html lang="ru" suppressHydrationWarning>
      <head>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>

      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteStructuredData).replace(/</g, '\\u003c'),
          }}
        />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationStructuredData).replace(/</g, '\\u003c'),
          }}
        />

        <AuthStateProvider>
          {/* Определяет, открыт AnimeBox внутри Telegram или в браузере */}
          <TelegramMiniAppBridge />

          <Navbar />

          <div className="app-shell">
            <main className="page-content">
              {children}
            </main>
          </div>

          <Analytics />
        </AuthStateProvider>
      </body>
    </html>
  );
}