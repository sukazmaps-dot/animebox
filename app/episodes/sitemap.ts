import type { MetadataRoute } from 'next';

import { getSeoEpisodeShard } from '@/lib/seo-episodes';
import { EPISODE_SITEMAP_SHARDS, SITE_URL } from '@/lib/seo-config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function generateSitemaps() {
  return Array.from({ length: EPISODE_SITEMAP_SHARDS }, (_, id) => ({ id }));
}

export default async function sitemap({
  id,
}: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const shard = Number(await id);

  try {
    const episodes = await getSeoEpisodeShard(shard);

    return episodes.map((episode) => ({
      url: `${SITE_URL}/anime/${encodeURIComponent(episode.slug)}/episode/${episode.episode}`,
      lastModified: episode.updatedAt
        ? new Date(episode.updatedAt)
        : undefined,
      changeFrequency: 'weekly',
      priority: 0.72,
      images: episode.image ? [episode.image] : undefined,
    }));
  } catch (error) {
    console.warn(`Episode sitemap shard ${shard} failed:`, error);
    return [];
  }
}
