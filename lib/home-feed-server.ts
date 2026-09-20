import 'server-only';

import { unstable_cache } from 'next/cache';

import { getAnimesWithShikimori } from '@/lib/combined-anime';
import type { Anime } from '@/types/anime';

type HomeInitialFeed = {
  popular: Anime[];
  ongoing: Anime[];
};

const loadHomeInitialFeed = unstable_cache(
  async (): Promise<HomeInitialFeed> => {
    const [popularResult, ongoingResult] = await Promise.allSettled([
      getAnimesWithShikimori({
        limit: 20,
        page: 1,
        order: 'ranked',
      }),
      getAnimesWithShikimori({
        limit: 20,
        page: 1,
        order: 'popularity',
        status: 'ongoing',
      }),
    ]);

    return {
      popular: popularResult.status === 'fulfilled' ? popularResult.value : [],
      ongoing: ongoingResult.status === 'fulfilled' ? ongoingResult.value : [],
    };
  },
  ['animebox-home-initial-feed-v2-russian-first'],
  {
    revalidate: 300,
    tags: ['animebox-home-feed'],
  },
);

export async function getHomeInitialFeed(): Promise<HomeInitialFeed> {
  try {
    return await loadHomeInitialFeed();
  } catch (error) {
    console.warn('[Home] initial server feed unavailable:', error);
    return { popular: [], ongoing: [] };
  }
}
