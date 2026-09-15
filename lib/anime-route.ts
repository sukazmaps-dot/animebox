import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { getAnimeByIdWithShikimori } from './combined-anime';
import {
  findAnimeRoute,
  findAnimeRouteById,
  getAnimeIdFromStableSlug,
} from './anime-registry';

const getCachedAnime = unstable_cache(
  async (id: number) => getAnimeByIdWithShikimori(id),
  ['animebox-anime-detail'],
  {
    revalidate: 60 * 30,
    tags: ['anime-detail'],
  },
);

export const resolveAnimeRoute = cache(async (slug: string) => {
  const id = /^\d+$/.test(slug)
    ? Number(slug)
    : findAnimeRoute(slug)?.id ?? getAnimeIdFromStableSlug(slug);

  if (!id || !Number.isSafeInteger(id) || id <= 0) return null;

  const anime = await getCachedAnime(id);
  if (!anime) return null;

  return {
    ...anime,
    providerSeason: findAnimeRouteById(id)?.provider_season || 1,
  };
});
