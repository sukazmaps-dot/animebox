import type { MetadataRoute } from 'next';

import { getSeoEpisodeShard } from '@/lib/seo-episodes';
import { EPISODE_SITEMAP_SHARDS, SITE_URL } from '@/lib/seo-config';
import {
  copyrightEpisodeKey,
  getCopyrightRestrictedEpisodeKeys,
} from '@/lib/copyright-seo-server';

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
    const restrictedKeys = await getCopyrightRestrictedEpisodeKeys(
      episodes.map((episode) => ({
        animeId: episode.animeId,
        episode: episode.episode,
      })),
    );

    return episodes
      .filter(
        (episode) =>
          !restrictedKeys.has(
            copyrightEpisodeKey(episode.animeId, episode.episode),
          ),
      )
      .map((episode) => {
        const changedAt = episode.updatedAt
          ? new Date(episode.updatedAt)
          : null;
        const recent =
          changedAt &&
          Number.isFinite(changedAt.getTime()) &&
          Date.now() - changedAt.getTime() <= 7 * 24 * 60 * 60 * 1000;

        return {
          url: `${SITE_URL}/anime/${encodeURIComponent(episode.slug)}/episode/${episode.episode}`,
          lastModified: changedAt ?? undefined,
          changeFrequency: recent ? 'daily' : 'weekly',
          priority: recent ? 0.78 : 0.72,
          images: episode.image ? [episode.image] : undefined,
        };
      });
  } catch (error) {
    console.warn(`Episode sitemap shard ${shard} failed:`, error);
    return [];
  }
}
