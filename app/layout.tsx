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
import './smart-home.css';
import './monetization.css';

import Navbar from '@/components/Navbar';
import TelegramMiniAppBridge from '@/components/TelegramMiniAppBridge';
import TelegramSubscriptionGate from '@/components/TelegramSubscriptionGate';
import { AuthStateProvider } from '@/components/AuthStateProvider';

import { Analytics } from '@vercel/analytics/next';

import { SITE_URL } from '@/lib/seo-config';

/* =========================================================
   SEO / Structured Data
   ========================================================= */

const websiteStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',

  name: 'AnimeBox',

  alternateName: [
    'YourAnimeBox',
    'youranimebox.com',
  ],

  url: SITE_URL,

  description:
    'AnimeBox — платформа для просмотра и отслеживания аниме с персональными рекомендациями.',

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

  sameAs: [
    'https://t.me/YourAnimeBoxBot',
  ],
};

/* =========================================================
   Metadata
   ========================================================= */

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),

  title: {
    default:
      'AnimeBox — Смотри. Отслеживай. Живи.',

    template:
      '%s | AnimeBox',
  },

  description:
    'Смотри аниме, сохраняй прогресс, собирай свою коллекцию и находи новые тайтлы с персональными рекомендациями.',

  applicationName: 'AnimeBox',

  creator: 'AnimeBox',
  publisher: 'AnimeBox',

  keywords: [
    'AnimeBox',
    'аниме',
    'аниме онлайн',
    'смотреть аниме',
    'аниме трекер',
    'трекер аниме',
    'каталог аниме',
    'новые серии аниме',
    'рекомендации аниме',
    'расписание аниме',
  ],

  alternates: {
    canonical: SITE_URL,
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

  /* =======================================================
     Open Graph
     Telegram / Discord / VK / соцсети
     ======================================================= */

  openGraph: {
    type: 'website',

    locale: 'ru_RU',

    url: SITE_URL,

    siteName: 'AnimeBox',

    title:
      'AnimeBox — Смотри. Отслеживай. Живи.',

    description:
      'Смотри аниме, сохраняй прогресс, собирай свою коллекцию и находи новые тайтлы с персональными рекомендациями.',

    images: [
      {
        url: `${SITE_URL}/og/animebox-share-v2.jpg`,

        width: 1200,
        height: 630,

        alt:
          'AnimeBox — Смотри. Отслеживай. Живи.',
      },
    ],
  },

  /* =======================================================
     Twitter / X
     ======================================================= */

  twitter: {
    card: 'summary_large_image',

    title:
      'AnimeBox — Смотри. Отслеживай. Живи.',

    description:
      'Смотри аниме, сохраняй прогресс и находи новые тайтлы с персональными рекомендациями.',

    images: [
      `${SITE_URL}/og/animebox-share-v2.jpg`,
    ],
  },

  /* =======================================================
     Icons
     ======================================================= */

  icons: {
    icon: [
      {
        url: '/brand/favicon.png',
        type: 'image/png',
        sizes: '512x512',
      },

      {
        url: '/favicon.ico',
        type: 'image/x-icon',
        sizes: '256x256',
      },
    ],

    shortcut: '/brand/favicon.png',

    apple: '/brand/favicon.png',
  },

  manifest: '/manifest.webmanifest',
};

/* =========================================================
   Viewport
   ========================================================= */

export const viewport: Viewport = {
  themeColor: '#080912',
  colorScheme: 'dark',
};

/* =========================================================
   Root layout
   ========================================================= */

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      suppressHydrationWarning
    >
      <head>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>

      <body>
        {/* Website structured data */}

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              websiteStructuredData,
            ).replace(
              /</g,
              '\\u003c',
            ),
          }}
        />

        {/* Organization structured data */}

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              organizationStructuredData,
            ).replace(
              /</g,
              '\\u003c',
            ),
          }}
        />

        <AuthStateProvider>
          {/* Определяет, открыт AnimeBox
              внутри Telegram или браузера */}

          <TelegramMiniAppBridge />

          <TelegramSubscriptionGate>
            <Navbar />

            <div className="app-shell">
              <main className="page-content">
                {children}
              </main>
            </div>

            <Analytics />
          </TelegramSubscriptionGate>
        </AuthStateProvider>
      </body>
    </html>
  );
}