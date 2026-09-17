import type { MetadataRoute } from 'next';

import { slugify } from '@/lib/anime-url';
import { getSeoAnimeShard } from '@/lib/seo-anilist';
import { ANIME_SITEMAP_SHARDS, SITE_URL } from '@/lib/seo-config';

/**
 * Do not pre-render AniList-backed sitemap shards during `next build`.
 * They are generated when a crawler requests them and their data is cached in
 * lib/seo-anilist.ts for six hours.
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
    const items = await getSeoAnimeShard(shard);

    return items.map((anime) => {
      const title =
        anime.title.romaji ||
        anime.title.english ||
        anime.title.native ||
        `anime-${anime.id}`;

      return {
        url: `${SITE_URL}/anime/${slugify(title)}-${anime.id}`,
        lastModified: anime.updatedAt
          ? new Date(anime.updatedAt * 1000)
          : undefined,
        changeFrequency: anime.status === 'RELEASING' ? 'daily' : 'weekly',
        images: anime.image ? [anime.image] : undefined,
      } satisfies MetadataRoute.Sitemap[number];
    });
  } catch (error) {
    // A temporary provider outage must never break the site or deployment.
    console.warn(`Anime sitemap shard ${shard} failed:`, error);
    return [];
  }
}
