import 'server-only';

import { unstable_cache } from 'next/cache';
import { after } from 'next/server';

import { getAnimesWithShikimori } from '@/lib/combined-anime';
import type { Anime } from '@/types/anime';
import {
  filterAnimeByAvailability,
  refreshCatalogAvailabilityBatch,
} from '@/lib/catalog-availability-server';

type HomeInitialFeed = {
  popular: Anime[];
  ongoing: Anime[];
};

const loadHomeInitialFeed = unstable_cache(
  async (): Promise<HomeInitialFeed> => {
    const [popularResult, ongoingResult] = await Promise.allSettled([
      getAnimesWithShikimori({
        limit: 12,
        page: 1,
        order: 'ranked',
      }),
      getAnimesWithShikimori({
        limit: 12,
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
  ['animebox-home-initial-feed-v3-mobile-budget'],
  {
    revalidate: 300,
    tags: ['animebox-home-feed'],
  },
);

export async function getHomeInitialFeed(): Promise<HomeInitialFeed> {
  try {
    const raw = await loadHomeInitialFeed();
    const combined = [...raw.popular, ...raw.ongoing];
    const availability = await filterAnimeByAvailability(
      combined,
      'catalog',
    );
    const allowed = new Set(availability.items.map((anime) => anime.id));

    if (availability.refreshTargets.length > 0) {
      after(async () => {
        await refreshCatalogAvailabilityBatch(
          availability.refreshTargets,
          { limit: 6 },
        );
      });
    }

    return {
      popular: raw.popular.filter((anime) => allowed.has(anime.id)),
      ongoing: raw.ongoing.filter((anime) => allowed.has(anime.id)),
    };
  } catch (error) {
    console.warn('[Home] initial server feed unavailable:', error);
    return { popular: [], ongoing: [] };
  }
}
