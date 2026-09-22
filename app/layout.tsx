import type { Metadata, Viewport } from 'next';
import Script from 'next/script';

import './globals.css';
import './visual-refresh.css';
import './design-v5.css';
import './telegram-logout.css';
import './home-rails.css';
import './card-layout.css';
import './smart-home.css';
import './monetization.css';
import './asset-pack-v1.css';
import './mobile-layout-fix.css';
import './mobile-readability.css';
import './typography-polish.css';
import './performance.css';
import './hierarchy-pass.css';
import './feedback-v1.css';
import './mobile-moderate-v4.css';
import './hero-controls-v5.css';
import './hero-teaser-v6.css';
import './hero-swipe-v7.css';
import './ad-layout-v8.css';
import './mobile-home-ending-v11.css';
import './premium-shell.css';
import './design-v2-content-first.css';
import './auth-modal-v2.css';
import './activation-v2.css';
import './anime-page-v3.css';
import './performance-v2.css';
import './tma-mobile-ux-v21.css';
import './patch11-growth.css';
import './patch11-3.css';
import './patch11-4.css';
import './patch11-4-4.css';
import './patch11-4-5.css';

import TelegramMiniAppBridge from '@/components/TelegramMiniAppBridge';
import TelegramSubscriptionGate from '@/components/TelegramSubscriptionGate';
import { AuthStateProvider } from '@/components/AuthStateProvider';
import { AuthModalProvider } from '@/components/AuthModalProvider';
import AppChrome from '@/components/AppChrome';
import CssRecoveryBridge from '@/components/CssRecoveryBridge';
import ProductAnalyticsTracker from '@/components/analytics/ProductAnalyticsTracker';
import ProgressionCelebration from '@/components/ProgressionCelebration';
import TelegramWelcomePromo from '@/components/TelegramWelcomePromo';

import { Analytics } from '@vercel/analytics/next';

import { SITE_URL } from '@/lib/seo-config';
import { SUPPORT_EMAIL } from '@/lib/contact';
import { TELEGRAM_BOT_URL, TELEGRAM_CHANNEL_URL } from '@/lib/telegram-links';

/* =========================================================
   SEO / Structured Data
   ========================================================= */

const websiteStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE_URL}#website`,

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
  '@id': `${SITE_URL}#organization`,

  name: 'AnimeBox',
  alternateName: 'YourAnimeBox',

  url: SITE_URL,

  logo: {
    '@type': 'ImageObject',

    url: `${SITE_URL}/brand/favicon.png`,
    contentUrl: `${SITE_URL}/brand/favicon.png`,

    width: 192,
    height: 192,
  },

  sameAs: [
    TELEGRAM_CHANNEL_URL,
    TELEGRAM_BOT_URL,
  ],

  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: SUPPORT_EMAIL,
    availableLanguage: ['Russian', 'English'],
  },
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
        sizes: '192x192',
      },

      {
        url: '/favicon.ico',
        type: 'image/x-icon',
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
        <link rel="dns-prefetch" href="//shikimori.one" />
      </head>

      <body>
        <CssRecoveryBridge />

        {/* Yandex.Metrika counter 112789274 */}
        <Script
          id="yandex-metrika"
          strategy="lazyOnload"
          dangerouslySetInnerHTML={{
            __html: `
              (function(m,e,t,r,i,k,a){
                m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
                m[i].l=1*new Date();
                for (var j = 0; j < document.scripts.length; j++) {
                  if (document.scripts[j].src === r) { return; }
                }
                k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
              })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=112789274', 'ym');

              ym(112789274, 'init', {
                ssr: true,
                webvisor: true,
                clickmap: true,
                ecommerce: "dataLayer",
                referrer: document.referrer,
                url: location.href,
                accurateTrackBounce: true,
                trackLinks: true
              });
            `,
          }}
        />


        <noscript>
          <div>
            <img
              src="https://mc.yandex.ru/watch/112789274"
              style={{ position: 'absolute', left: '-9999px' }}
              alt=""
              aria-hidden="true"
            />
          </div>
        </noscript>

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
          <AuthModalProvider>
            {/* Определяет, открыт AnimeBox
                внутри Telegram или браузера */}

            <TelegramMiniAppBridge />
            <ProductAnalyticsTracker />
            <ProgressionCelebration />
            <TelegramWelcomePromo />

            <TelegramSubscriptionGate>
              <AppChrome>{children}</AppChrome>
              <Analytics />
            </TelegramSubscriptionGate>
          </AuthModalProvider>
        </AuthStateProvider>
      </body>
    </html>
  );
}
