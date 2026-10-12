import type { MetadataRoute } from 'next';

import { getSeoAnimeIndexShard } from '@/lib/seo-anime-index-server';
import { ANIME_SITEMAP_SHARDS, SITE_URL } from '@/lib/seo-config';

/**
 * Anime sitemaps are registry-backed.
 *
 * Crawlers never trigger AniList/Shikimori work here. The background SEO
 * indexer verifies and quality-gates canonical title URLs first; sitemap
 * requests then become a bounded local Supabase read.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function generateSitemaps() {
  return Array.from({ length: ANIME_SITEMAP_SHARDS }, (_, id) => ({ id }));
}

export default async function sitemap({
  id,
}: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const shard = Number(await id);

  try {
    const items = await getSeoAnimeIndexShard(shard);

    return items.map((anime) => ({
      url: `${SITE_URL}/anime/${encodeURIComponent(anime.slug)}`,
      lastModified: new Date(anime.lastContentChangeAt),
      changeFrequency:
        anime.status === 'RELEASING' ? 'daily' : 'weekly',
      images: anime.imageUrl ? [anime.imageUrl] : undefined,
    }));
  } catch (error) {
    // Never return HTTP 200 with an empty sitemap on an actual DB outage.
    // A failed response is retryable; a fake empty shard can be indexed.
    console.error(`Anime sitemap registry shard ${shard} failed:`, error);
    throw error;
  }
}
