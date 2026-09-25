import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/seo-config';

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

    // One sitemap index is the crawler entry point. It expands to the
    // stable root, anime, episode and video sitemap sets.
    sitemap: `${SITE_URL}/sitemap-index.xml`,
  };
}
