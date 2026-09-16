import type { MetadataRoute } from 'next';

import { slugify } from '@/lib/anime-url';
import { getSeoAnimeShard } from '@/lib/seo-anilist';
import { ANIME_SITEMAP_SHARDS, SITE_URL } from '@/lib/seo-config';

export const revalidate = 60 * 60 * 6;

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
    // A temporary provider outage must not break the whole application's build.
    console.warn(`Anime sitemap shard ${shard} failed:`, error);
    return [];
  }
}
