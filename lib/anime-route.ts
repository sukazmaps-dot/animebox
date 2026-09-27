import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { getAnimeById as getAniListAnimeById } from '@/lib/anilist';
import { localizeAnimeDetail } from '@/lib/anime-localization-server';
import {
  findAnimeRoute,
  findAnimeRouteById,
  getAnimeIdFromStableSlug,
  registerAnime,
} from './anime-registry';

const getCachedAnimeBase = unstable_cache(
  async (id: number) =>
    getAniListAnimeById(id, {
      throwOnError: true,
    }),
  ['animebox-anime-detail-base'],
  {
    revalidate: 60 * 30,
    tags: ['anime-detail-base'],
  },
);

export const resolveAnimeRoute = cache(async (slug: string) => {
  const id = /^\d+$/.test(slug)
    ? Number(slug)
    : findAnimeRoute(slug)?.id ?? getAnimeIdFromStableSlug(slug);

  if (!id || !Number.isSafeInteger(id) || id <= 0) return null;

  const baseAnime = await getCachedAnimeBase(id);
  if (!baseAnime) return null;

  // Provider failures must never poison the 30-minute detail cache. We cache
  // only stable AniList data and resolve/persist Russian localization after it.
  const anime = registerAnime(await localizeAnimeDetail(baseAnime));

  return {
    ...anime,
    providerSeason: findAnimeRouteById(id)?.provider_season || 1,
  };
});
