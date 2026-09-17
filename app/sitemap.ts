import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/seo-config';

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
  return [
    { url: SITE_URL, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/search`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/schedule`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.5 },
  ];
}
