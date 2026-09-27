import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { getAnimeById as getAniListAnimeById } from '@/lib/anilist';
import {
  getLocalAnimeDetailFallback,
  localizeAnimeDetail,
} from '@/lib/anime-localization-server';
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

  let baseAnime = null;

  try {
    baseAnime = await getCachedAnimeBase(id);
  } catch (error) {
    console.warn(
      `[anime route] AniList detail unavailable for ${id}; using local catalog fallback`,
      error,
    );
  }

  if (!baseAnime) {
    baseAnime = await getLocalAnimeDetailFallback(id);
  }

  if (!baseAnime) return null;

  // Existing AnimeBox catalogue entries remain routable even if AniList is
  // temporarily unavailable or rejects the fresh detail object. External
  // metadata enriches the page; it no longer decides whether the page exists.
  const anime = registerAnime(await localizeAnimeDetail(baseAnime));

  return {
    ...anime,
    providerSeason: findAnimeRouteById(id)?.provider_season || 1,
  };
});
