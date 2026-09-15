import { cache } from 'react';
import { getAnimeByIdWithShikimori } from './combined-anime';
import {
  findAnimeRoute,
  findAnimeRouteById,
  getAnimeIdFromStableSlug,
} from './anime-registry';

export const resolveAnimeRoute = cache(async (slug: string) => {
  const id = /^\d+$/.test(slug)
    ? Number(slug)
    : findAnimeRoute(slug)?.id ?? getAnimeIdFromStableSlug(slug);

  if (!id || !Number.isSafeInteger(id) || id <= 0) return null;

  const anime = await getAnimeByIdWithShikimori(id);
  if (!anime) return null;

  return {
    ...anime,
    providerSeason: findAnimeRouteById(id)?.provider_season || 1,
  };
});
