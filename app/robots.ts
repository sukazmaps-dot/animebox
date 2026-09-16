import type { MetadataRoute } from 'next';

const SITE_URL = 'https://youranimebox.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',

        /*
         * Всё, что не запрещено ниже, можно индексировать.
         *
         * То есть поисковикам автоматически доступны:
         *
         * /
         * /anime/...
         * /anime/.../episode/...
         * /schedule
         * /about
         * и другие публичные страницы.
         */
        allow: '/',

        /*
         * Служебные, персональные и технические страницы.
         *
         * Запись "/profile" также закроет:
         * /profile
         * /profile/...
         *
         * Поэтому отдельный "/" в конце не нужен.
         */
        disallow: [
          '/api',

          '/admin',

          '/profile',

          '/notifications',

          '/list',

          '/search',

          '/auth',
        ],
      },
    ],

    /*
     * Google и другие поисковики смогут автоматически
     * обнаружить карту сайта.
     */
    sitemap: `${SITE_URL}/sitemap.xml`,

    /*
     * Полезно в том числе для некоторых других поисковиков.
     * Google в основном ориентируется на canonical/sitemap.
     */
    host: SITE_URL,
  };
}