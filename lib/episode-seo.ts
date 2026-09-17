import 'server-only';

import { unstable_cache } from 'next/cache';

import { resolveAnimeRoute } from '@/lib/anime-route';
import { getEpisodeProviderAvailability } from '@/lib/episode-provider-availability';

export type EpisodeSeoAvailability = {
  status: 'available' | 'unavailable' | 'unknown';
  episodes: number[];
};

const getCachedEpisodeSeoAvailability = unstable_cache(
  async (animeId: number): Promise<EpisodeSeoAvailability> => {
    const anime = await resolveAnimeRoute(String(animeId));
    if (!anime) {
      return { status: 'unavailable', episodes: [] };
    }

    try {
      const availability = await getEpisodeProviderAvailability(anime, {
        signal: AbortSignal.timeout(1_800),
      });

      return {
        status: availability.status,
        episodes: availability.episodes,
      };
    } catch {
      // SEO must fail closed: an external provider outage should never create
      // an indexable episode page that may not actually be playable.
      return { status: 'unknown', episodes: [] };
    }
  },
  ['animebox-episode-seo-availability-v1'],
  { revalidate: 300 },
);

export async function isEpisodeIndexable(
  animeId: number,
  episode: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(episode) || episode < 1) return false;

  const availability = await getCachedEpisodeSeoAvailability(animeId);
  return (
    availability.status === 'available' &&
    availability.episodes.includes(episode)
  );
}
