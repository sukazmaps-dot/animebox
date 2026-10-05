import {getSavedCatalogPage} from '@/lib/saved-catalog-server';
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

    const [popular,ongoing]=await Promise.all([
      popularResult.status === 'fulfilled' ? Promise.resolve(popularResult.value) : getSavedCatalogPage({limit:30,order:'ranked'}).then(page=>page.anime),
      ongoingResult.status === 'fulfilled' ? Promise.resolve(ongoingResult.value) : getSavedCatalogPage({limit:30,status:'ongoing'}).then(page=>page.anime),
    ]);
    return {popular,ongoing};
  },
  ['animebox-home-initial-feed-v5-saved-metadata'],
  {
    revalidate: 300,
    tags: ['animebox-home-feed'],
  },
);

export async function getHomeInitialFeed(): Promise<HomeInitialFeed> {
  try {
    const raw = await loadHomeInitialFeed();
    const combined = [...raw.popular, ...raw.ongoing];
    const availability = combined.every(item=>item.metadataSource==='saved')
      ? {items:combined,refreshTargets:[]}
      : await filterAnimeByAvailability(combined,'catalog');
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
