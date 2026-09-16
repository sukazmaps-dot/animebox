import type { MetadataRoute } from 'next';

import { ANIME_SITEMAP_SHARDS, SITE_URL } from '@/lib/seo-config';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Personal HTML pages use meta noindex so crawlers can read it.
        // Only technical endpoints are blocked from crawling here.
        disallow: ['/api/', '/admin/', '/supabase-test/'],
      },
    ],

    // Keep the already-submitted root sitemap and expose scalable anime shards.
    sitemap: [
      `${SITE_URL}/sitemap.xml`,
      ...Array.from(
        { length: ANIME_SITEMAP_SHARDS },
        (_, id) => `${SITE_URL}/anime/sitemap/${id}.xml`,
      ),
    ],
  };
}
