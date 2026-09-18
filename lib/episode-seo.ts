import 'server-only';

import { unstable_cache } from 'next/cache';

import { getAnimeSeoIdentity } from '@/lib/anime-seo';
import { resolveAnimeRoute } from '@/lib/anime-route';
import { getEpisodeProviderAvailability } from '@/lib/episode-provider-availability';
import { truncateSeoText } from '@/lib/seo-text';
import type { Anime } from '@/types/anime';

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

export function buildEpisodeSeoTitle(anime: Anime, episode: number): string {
  const identity = getAnimeSeoIdentity(anime);
  return truncateSeoText(
    `${identity.pageHeading} — ${episode} серия смотреть онлайн`,
    68,
  );
}

export function buildEpisodeSeoDescription(
  anime: Anime,
  episode: number,
  indexable: boolean,
): string {
  const identity = getAnimeSeoIdentity(anime);

  if (!indexable) {
    return truncateSeoText(
      `${identity.pageHeading} — ${episode} серия на AnimeBox.`,
      158,
    );
  }

  const facts: string[] = [];
  if (anime.startDate?.year) facts.push(String(anime.startDate.year));
  if (anime.genres?.length) facts.push(anime.genres.slice(0, 2).join(', '));

  return truncateSeoText(
    `Смотреть ${episode} серию аниме «${identity.pageHeading}» онлайн на AnimeBox.${
      facts.length ? ` ${facts.join(' · ')}.` : ''
    } Сохраняйте прогресс просмотра и обсуждайте серию.`,
    158,
  );
}

function episodeThumbnail(anime: Anime): string | undefined {
  return (
    anime.bannerImage ||
    anime.coverImage?.extraLarge ||
    anime.coverImage?.large ||
    anime.coverImage?.medium ||
    undefined
  );
}

function isoDuration(minutes?: number | null): string | undefined {
  if (!minutes || !Number.isFinite(minutes) || minutes <= 0) return undefined;
  return `PT${Math.max(1, Math.round(minutes))}M`;
}

/**
 * Schema.org object for a confirmed playable episode. We deliberately avoid
 * inventing uploadDate/contentUrl values: provider availability proves that
 * the episode exists, but it does not give AnimeBox a trustworthy publication
 * timestamp or a stable first-party media URL.
 */
export function buildEpisodeVideoStructuredData(
  anime: Anime,
  episode: number,
  canonicalUrl: string,
) {
  const identity = getAnimeSeoIdentity(anime);
  const name = `${identity.pageHeading} — ${episode} серия`;
  const thumbnail = episodeThumbnail(anime);
  const description = buildEpisodeSeoDescription(anime, episode, true);
  const duration = isoDuration(anime.duration);

  const partOfSeries = {
    '@type': 'TVSeries',
    name: identity.baseTitle || identity.title,
    url: canonicalUrl.split('/episode/')[0],
  };

  const isPartOf = identity.seasonNumber
    ? {
        '@type': 'TVSeason',
        name: identity.pageHeading,
        seasonNumber: identity.seasonNumber,
        partOfSeries,
      }
    : partOfSeries;

  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name,
    description,
    url: canonicalUrl,
    thumbnailUrl: thumbnail,
    duration,
    inLanguage: 'ru-RU',
    episodeNumber: episode,
    isPartOf,
    potentialAction: {
      '@type': 'WatchAction',
      target: canonicalUrl,
    },
  };
}
