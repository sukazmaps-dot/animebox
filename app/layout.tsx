import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import './user-preferences.css';
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
import './performance-v2.css';
import './tma-mobile-ux-v21.css';
import './patch11-growth.css';
import './patch11-3.css';
import './patch11-4.css';
import './patch11-4-4.css';
import './patch11-4-5.css';
import './patch12-1-home-identity.css';
import './patch12-2-visual-consistency.css';
import './patch12-3-home-retention.css';
import './patch12-3-1-mobile-cwv.css';
import './patch12-3-2-mobile-rhythm.css';
import './patch12-3-3-mood-density.css';
import './patch12-3-4-premium-profile-theme.css';
import './patch12-4-1-mobile-anime-flow.css';
import './patch12-4-2-visual-scale.css';
import './patch12-4-5-identity-foundation.css';
import './patch12-5-player-identity.css';
import './patch12-5-6-mobile-chrome-player-spacing.css';
import './mobile-simplification.css';
import './home-editorial-hero.css';
import './patch12-6-mobile-home-final.css';
import './patch12-6-1-mobile-hero.css';
import './patch12-6-2-home-rails-typography.css';
import './patch12-6-3-mobile-nav-home-cleanup.css';
import './patch12-6-4-anime-detail-mobile-cleanup.css';
import './patch12-6-5-mobile-hero-media.css';
import './patch12-6-6-profile-banner-pipeline.css';
import './patch12-6-7-hero-reliability.css';
import './patch12-6-8-profile-banner-cropper.css';
import './patch12-6-9-mobile-schedule-v2.css';
import './patch14-1-visual-foundation.css';
import './patch14-1-1-anti-ai-design.css';
import './patch14-2-mobile-shell.css';
import './patch14-3-home-discovery.css';
import './patch14-3-2-catalog-taxonomy-top-fix.css';
import './patch14-4-1-top-anime-architecture.css';
import './patch14-5-episode-identity.css';
import './patch15-title-accent.css';
import './animebox-identity.css';
import './patch16-quiet-interactions.css';
import './animebox-visual-language-v1.css';
import './patch16-4-readability-theme.css';

import TelegramMiniAppBridge from '@/components/TelegramMiniAppBridge';
import TelegramSubscriptionGate from '@/components/TelegramSubscriptionGate';
import { AuthStateProvider } from '@/components/AuthStateProvider';
import { AuthModalProvider } from '@/components/AuthModalProvider';
import AppChrome from '@/components/AppChrome';
import CssRecoveryBridge from '@/components/CssRecoveryBridge';
import UserPreferencesBridge from '@/components/UserPreferencesBridge';
import ProductAnalyticsTracker from '@/components/analytics/ProductAnalyticsTracker';
import DeferredYandexMetrika from '@/components/analytics/DeferredYandexMetrika';
import ProgressionCelebration from '@/components/ProgressionCelebration';
import TelegramWelcomePromo from '@/components/TelegramWelcomePromo';

import { Analytics } from '@vercel/analytics/next';

import { SITE_URL } from '@/lib/seo-config';
import { BRAND_SLOGAN, BRAND_TITLE } from '@/lib/brand';
import { SUPPORT_EMAIL } from '@/lib/contact';
import { TELEGRAM_BOT_URL, TELEGRAM_CHANNEL_URL } from '@/lib/telegram-links';
import { USER_PREFERENCES_KEY } from '@/lib/user-preferences';

const themeBootstrapScript = `
(() => {
  try {
    const raw = window.localStorage.getItem(${JSON.stringify(USER_PREFERENCES_KEY)});
    const parsed = raw ? JSON.parse(raw) : null;
    const preference =
      parsed?.theme === 'light' || parsed?.theme === 'system' || parsed?.theme === 'dark'
        ? parsed.theme
        : 'dark';
    const theme =
      preference === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : preference;
    const root = document.documentElement;
    root.dataset.animeboxThemePreference = preference;
    root.dataset.animeboxTheme = theme;
    root.style.colorScheme = theme;
  } catch {
    document.documentElement.dataset.animeboxThemePreference = 'dark';
    document.documentElement.dataset.animeboxTheme = 'dark';
    document.documentElement.style.colorScheme = 'dark';
  }
})();
`;

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
    BRAND_SLOGAN,

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
      BRAND_TITLE,

    template:
      '%s | AnimeBox',
  },

  description:
    'Смотри аниме, отмечай серии, следи за онгоингами и заходи в комнаты совместного просмотра.',

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
      BRAND_TITLE,

    description:
      'Смотри аниме, отмечай серии, следи за онгоингами и заходи в комнаты совместного просмотра.',

    images: [
      {
        url: `${SITE_URL}/og/animebox-share-v2.jpg`,

        width: 1200,
        height: 630,

        alt:
          BRAND_TITLE,
      },
    ],
  },

  /* =======================================================
     Twitter / X
     ======================================================= */

  twitter: {
    card: 'summary_large_image',

    title:
      BRAND_TITLE,

    description:
      'Смотри аниме, отмечай серии и держи свой список в порядке.',

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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f3ee' },
    { media: '(prefers-color-scheme: dark)', color: '#080912' },
  ],
  colorScheme: 'dark light',
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
        <Script
          id="animebox-theme-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeBootstrapScript }}
        />
      </head>

      <body>
        <CssRecoveryBridge />
        <UserPreferencesBridge />

        {/* Yandex.Metrika loads after first interaction or idle timeout. */}
        <DeferredYandexMetrika />


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
