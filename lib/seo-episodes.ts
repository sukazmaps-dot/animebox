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
  image: string | null;
};

async function loadSeoEpisodeShard(shard: number): Promise<SeoEpisodeEntry[]> {
  const admin = adminClient();
  const from = shard * EPISODE_HISTORY_ROWS_PER_SITEMAP;
  const to = from + EPISODE_HISTORY_ROWS_PER_SITEMAP - 1;

  const { data: history, error: historyError } = await admin
    .from('episodes_history')
    .select('anime_id,episode_number,completed_at')
    .eq('completed', true)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .range(from, to);

  if (historyError) throw historyError;

  const episodes = new Map<
    string,
    { animeId: number; episode: number; updatedAt: string | null }
  >();

  for (const row of history ?? []) {
    const animeId = Number(row.anime_id);
    const episode = Number(row.episode_number);
    if (
      !Number.isSafeInteger(animeId) ||
      animeId <= 0 ||
      !Number.isSafeInteger(episode) ||
      episode <= 0
    ) {
      continue;
    }

    const key = `${animeId}:${episode}`;
    const current = episodes.get(key);
    const completedAt =
      typeof row.completed_at === 'string' ? row.completed_at : null;

    if (
      !current ||
      (completedAt &&
        (!current.updatedAt ||
          new Date(completedAt).getTime() > new Date(current.updatedAt).getTime()))
    ) {
      episodes.set(key, {
        animeId,
        episode,
        updatedAt: completedAt,
      });
    }
  }

  if (episodes.size === 0) return [];

  const animeIds = [...new Set([...episodes.values()].map((entry) => entry.animeId))];
  const { data: catalog, error: catalogError } = await admin
    .from('anime_catalog')
    .select('id,slug,poster_url,updated_at')
    .in('id', animeIds);

  if (catalogError) throw catalogError;

  const animeById = new Map<
    number,
    { slug: string; image: string | null; updatedAt: string | null }
  >();

  for (const row of catalog ?? []) {
    const id = Number(row.id);
    const slug = typeof row.slug === 'string' ? row.slug.trim() : '';
    if (!Number.isSafeInteger(id) || id <= 0 || !slug) continue;

    animeById.set(id, {
      slug,
      image: typeof row.poster_url === 'string' ? row.poster_url : null,
      updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
    });
  }

  return [...episodes.values()].flatMap((entry) => {
    const anime = animeById.get(entry.animeId);
    if (!anime) return [];

    return [{
      animeId: entry.animeId,
      slug: anime.slug,
      episode: entry.episode,
      updatedAt: entry.updatedAt ?? anime.updatedAt,
      image: anime.image,
    }];
  });
}

const getCachedSeoEpisodeShard = unstable_cache(
  async (shard: number) => loadSeoEpisodeShard(shard),
  ['animebox-seo-episode-history-v1'],
  { revalidate: 60 * 60 * 6 },
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
