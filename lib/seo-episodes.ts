import 'server-only';

import { unstable_cache } from 'next/cache';

import { adminClient } from '@/lib/community-server';
import {
  EPISODE_HISTORY_ROWS_PER_SITEMAP,
  EPISODE_SITEMAP_SHARDS,
} from '@/lib/seo-config';

export type SeoEpisodeEntry = {
  animeId: number;
  slug: string;
  episode: number;
  updatedAt: string | null;
  publishedAt: string | null;
  image: string | null;
};

async function loadSeoEpisodeShard(shard: number): Promise<SeoEpisodeEntry[]> {
  const from = shard * EPISODE_HISTORY_ROWS_PER_SITEMAP;
  const to = from + EPISODE_HISTORY_ROWS_PER_SITEMAP - 1;

  const { data, error } = await adminClient()
    .from('seo_episode_index')
    .select(
      'anime_id,episode_number,slug,first_available_at,last_confirmed_at,thumbnail_url',
    )
    .eq('indexable', true)
    .order('last_confirmed_at', { ascending: false })
    .range(from, to);

  if (error) throw error;

  return (data ?? []).flatMap((row) => {
    const animeId = Number(row.anime_id);
    const episode = Number(row.episode_number);
    const slug = typeof row.slug === 'string' ? row.slug.trim() : '';

    if (
      !Number.isSafeInteger(animeId) ||
      animeId <= 0 ||
      !Number.isSafeInteger(episode) ||
      episode <= 0 ||
      !slug
    ) {
      return [];
    }

    return [{
      animeId,
      slug,
      episode,
      updatedAt:
        typeof row.last_confirmed_at === 'string'
          ? row.last_confirmed_at
          : null,
      publishedAt:
        typeof row.first_available_at === 'string'
          ? row.first_available_at
          : null,
      image:
        typeof row.thumbnail_url === 'string'
          ? row.thumbnail_url
          : null,
    }];
  });
}

const getCachedSeoEpisodeShard = unstable_cache(
  async (shard: number) => loadSeoEpisodeShard(shard),
  ['animebox-seo-fresh-episode-index-v2'],
  { revalidate: 60 * 15 },
);

export async function getSeoEpisodeShard(
  shard: number,
): Promise<SeoEpisodeEntry[]> {
  if (
    !Number.isInteger(shard) ||
    shard < 0 ||
    shard >= EPISODE_SITEMAP_SHARDS
  ) {
    return [];
  }

  return getCachedSeoEpisodeShard(shard);
}
