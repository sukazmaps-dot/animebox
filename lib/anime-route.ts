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
import { findPersistentAnimeRoute } from '@/lib/persistent-anime-route';
import { getSeoAnimeDetailFallback } from '@/lib/seo-anime-index-server';
import { scheduleAniListMetadataPersist } from '@/lib/anime-public-metadata-server';

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
  const localId = /^\d+$/.test(slug)
    ? Number(slug)
    : findAnimeRoute(slug)?.id ?? getAnimeIdFromStableSlug(slug);

  const persistedRoute = localId ? null : await findPersistentAnimeRoute(slug);
  const id = localId ?? persistedRoute?.id;
  if (!id || !Number.isSafeInteger(id) || id <= 0) return null;

  let baseAnime = null;
  let seoFallbackSlug: string | null = null;

  try {
    baseAnime = await getCachedAnimeBase(id);
  } catch (error) {
    console.warn(
      `[anime route] AniList detail unavailable for ${id}; using local catalog fallback`,
      error,
    );
  }

  if (baseAnime) {
    // Only an actual AniList result is authoritative. A local/Shikimori
    // fallback must never be saved as though it came from AniList.
    scheduleAniListMetadataPersist(baseAnime);
  }

  if (!baseAnime) {
    baseAnime = await getLocalAnimeDetailFallback(id);
  }

  if (!baseAnime) {
    baseAnime = await getSeoAnimeDetailFallback(id).catch((error) => {
      console.warn(`[anime route] SEO registry fallback failed for ${id}:`, error);
      return null;
    });
    seoFallbackSlug = baseAnime?.slug ?? null;
  }

  if (!baseAnime) return null;

  // Existing AnimeBox catalogue entries remain routable even if AniList is
  // temporarily unavailable or rejects the fresh detail object. External
  // metadata enriches the page; it no longer decides whether the page exists.
  const anime = registerAnime(await localizeAnimeDetail(baseAnime));

  return {
    ...anime,
    // A partial Russian title must not redirect a sitemap URL to a new slug.
    slug: persistedRoute?.slug || seoFallbackSlug || anime.slug,
    providerSeason: findAnimeRouteById(id)?.provider_season || 1,
  };
});
