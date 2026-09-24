import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/seo-config';
import { SEO_GENRE_LANDINGS, seoCatalogYears } from '@/lib/search-seo';

/**
 * Root sitemap intentionally contains only stable, local pages.
 *
 * Anime URLs are exposed through /anime/sitemap/{id}.xml shards and are also
 * listed from robots.txt. Keeping AniList out of this root metadata route is
 * important because Next.js may evaluate sitemap.ts while collecting page data
 * during `next build`, which used to create a burst of AniList requests and
 * trigger HTTP 429 rate limits.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const discoveryLandings: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/anime/ongoing`, changeFrequency: 'daily', priority: 0.85 },
    ...SEO_GENRE_LANDINGS.map((genre) => ({
      url: `${SITE_URL}/anime/genre/${genre.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.72,
    })),
    ...seoCatalogYears().map((year) => ({
      url: `${SITE_URL}/anime/year/${year}`,
      changeFrequency: 'weekly' as const,
      priority: year >= new Date().getFullYear() - 1 ? 0.76 : 0.62,
    })),
  ];

  return [
    { url: SITE_URL, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/search`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/schedule`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/watch-together`, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/premium`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/support`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'monthly', priority: 0.2 },
    ...discoveryLandings,
  ];
}
