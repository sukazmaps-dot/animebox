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
    // First-screen cards come from the persisted verified catalogue. Avoid
    // blocking a cold navigation on multiple external metadata providers.
    const loadGroup = async (order: 'ranked' | 'popularity', ongoing: boolean) => {
      const options = {limit: 12, page: 1, order, ...(ongoing ? {status: 'ongoing' as const} : {})};
      try {
        const saved = await getSavedCatalogPage(options);
        if (saved.anime.length > 0) return saved.anime;
      } catch (error) {
        console.warn('[Home] saved first screen unavailable:', error);
      }
      return getAnimesWithShikimori(options);
    };
    const [popular, ongoing] = await Promise.all([
      loadGroup('ranked', false), loadGroup('popularity', true),
    ]);
    const combined = [...popular, ...ongoing];
    const availability = combined.every(item => item.metadataSource === 'saved')
      ? {items: combined, refreshTargets: [], registryHealthy: true}
      : await filterAnimeByAvailability(combined, 'catalog');
    // Do not turn a temporary registry outage into a cached empty home page.
    if (!availability.registryHealthy) throw new Error('Home availability registry unavailable');
    const allowed = new Set(availability.items.map(anime => anime.id));
    if (availability.refreshTargets.length > 0) {
      after(async () => {
        await refreshCatalogAvailabilityBatch(availability.refreshTargets, { limit: 6 });
      });
    }
    return {
      popular: popular.filter(anime => allowed.has(anime.id)),
      ongoing: ongoing.filter(anime => allowed.has(anime.id)),
    };
  },
  ['animebox-home-initial-feed-v7-saved-first-screen'],
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
    // A failed group must not erase cards already persisted for the other one.
    // Keep this recovery outside unstable_cache so an outage is not cached.
    const recover = async (order: 'ranked' | 'popularity', ongoing: boolean) => {
      try {
        return (await getSavedCatalogPage({limit: 12, page: 1, order, ...(ongoing ? {status: 'ongoing' as const} : {})})).anime;
      } catch {
        return [];
      }
    };
    const [popular, ongoing] = await Promise.all([recover('ranked', false), recover('popularity', true)]);
    return {popular, ongoing};
  }
}
