import type { MetadataRoute } from 'next';

const SITE_URL = 'https://youranimebox.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',

        /*
         * robots.txt управляет СКАНИРОВАНИЕМ, а не надёжным удалением
         * HTML-страницы из поиска. Поэтому страницы аккаунта/трекера
         * не блокируем здесь: на них стоит meta robots=noindex, и робот
         * должен иметь возможность прочитать эту директиву.
         *
         * Здесь закрываем только технические URL, которые поисковику
         * вообще не нужно обходить.
         */
        disallow: [
          '/api/',
          '/admin/',
          '/supabase-test/',
        ],
      },
    ],

    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
