import type { Metadata, Viewport } from 'next';
import Script from 'next/script';

import './globals.css';
import './visual-refresh.css';
import './community.css';
import './design-v5.css';
import './notifications.css';
import './telegram-logout.css';
import './home-rails.css';
import './card-layout.css';
import './smart-home.css';
import './monetization.css';
import './boosty-support.css';
import './premium.css';
import './donatepay-claim.css';
import './sponsor-v2.css';
import './monetization-v3.css';
import './asset-pack-v1.css';
import './engagement-v1.css';
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
import './monetization-reliability-v10.css';
import './mobile-home-ending-v11.css';
import './premium-studio-v12.css';
import './profile-editor-v13.css';
import './premium-profile-v14.css';
import './boosty-premium-v18.css';

import Navbar from '@/components/Navbar';
import TelegramMiniAppBridge from '@/components/TelegramMiniAppBridge';
import TelegramSubscriptionGate from '@/components/TelegramSubscriptionGate';
import { AuthStateProvider } from '@/components/AuthStateProvider';
import SiteFooter from '@/components/SiteFooter';

import { Analytics } from '@vercel/analytics/next';

import { SITE_URL } from '@/lib/seo-config';
import { SUPPORT_EMAIL } from '@/lib/contact';

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

    width: 512,
    height: 512,
  },

  sameAs: [
    'https://t.me/YourAnimeBox',
    'https://t.me/YourAnimeBoxBot',
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
        <link rel="preconnect" href="https://cdn.anilist.co" crossOrigin="" />
        <link rel="dns-prefetch" href="//cdn.anilist.co" />
        <link rel="dns-prefetch" href="//shikimori.one" />
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />

        <script
          id="animebox-css-recovery"
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var key = 'animebox:css-recovery:v1';

                function cssIsReady() {
                  try {
                    return getComputedStyle(document.documentElement)
                      .getPropertyValue('--animebox-css-ready')
                      .trim() === '1';
                  } catch (_) {
                    return true;
                  }
                }

                function recover() {
                  if (cssIsReady()) {
                    try { sessionStorage.removeItem(key); } catch (_) {}
                    return;
                  }

                  try {
                    if (sessionStorage.getItem(key) === '1') return;
                    sessionStorage.setItem(key, '1');
                  } catch (_) {}

                  var url = new URL(window.location.href);
                  url.searchParams.set('__abx_css_recover', String(Date.now()));
                  window.location.replace(url.toString());
                }

                window.addEventListener('load', function () {
                  window.setTimeout(recover, 120);
                }, { once: true });
              })();
            `,
          }}
        />

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
      </head>

      <body>
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
          {/* Определяет, открыт AnimeBox
              внутри Telegram или браузера */}

          <TelegramMiniAppBridge />

          <TelegramSubscriptionGate>
            <Navbar />

            <div className="app-shell">
              <main className="page-content">
                {children}
              </main>

              <SiteFooter />
            </div>

            <Analytics />
          </TelegramSubscriptionGate>
        </AuthStateProvider>
      </body>
    </html>
  );
}
