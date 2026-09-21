import 'server-only';

import { unstable_cache } from 'next/cache';

import { getAnimeSeoIdentity } from '@/lib/anime-seo';
import { resolveAnimeRoute } from '@/lib/anime-route';
import { getEpisodeProviderAvailability } from '@/lib/episode-provider-availability';
import { syncSeoEpisodeIndex } from '@/lib/seo-episode-index';
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

      if (availability.status === 'available' && availability.episodes.length) {
        try {
          await syncSeoEpisodeIndex(anime, availability);
        } catch (indexError) {
          console.warn('[episode-seo] fresh index sync failed:', indexError);
        }
      }

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
 * Schema.org graph for a confirmed playable episode.
 *
 * TVEpisode carries the episode semantics (episodeNumber / season / series),
 * while VideoObject describes the playable media. We intentionally do not
 * invent uploadDate, contentUrl or embedUrl values because provider
 * availability does not give us a trustworthy first-party publication time
 * or a stable public media URL.
 */
export function buildEpisodeVideoStructuredData(
  anime: Anime,
  episode: number,
  canonicalUrl: string,
  options: { uploadDate?: string | null } = {},
) {
  const identity = getAnimeSeoIdentity(anime);
  const name = `${identity.pageHeading} — ${episode} серия`;
  const thumbnail = episodeThumbnail(anime);
  const description = buildEpisodeSeoDescription(anime, episode, true);
  const duration = isoDuration(anime.duration);
  const animeUrl = canonicalUrl.split('/episode/')[0];

  const seriesId = `${animeUrl}#series`;
  const seasonId = `${animeUrl}#season`;
  const episodeId = `${canonicalUrl}#episode`;
  const videoId = `${canonicalUrl}#video`;

  const series = {
    '@type': 'TVSeries',
    '@id': seriesId,
    name: identity.baseTitle || identity.title,
    url: animeUrl,
  };

  const season = identity.seasonNumber
    ? {
        '@type': 'TVSeason',
        '@id': seasonId,
        name: identity.pageHeading,
        url: animeUrl,
        seasonNumber: identity.seasonNumber,
        partOfSeries: { '@id': seriesId },
      }
    : null;

  const tvEpisode = {
    '@type': 'TVEpisode',
    '@id': episodeId,
    name,
    description,
    url: canonicalUrl,
    episodeNumber: episode,
    image: thumbnail,
    inLanguage: 'ru-RU',
    ...(options.uploadDate ? { datePublished: options.uploadDate } : {}),
    ...(season
      ? { partOfSeason: { '@id': seasonId } }
      : { partOfSeries: { '@id': seriesId } }),
    video: { '@id': videoId },
  };

  const video = {
    '@type': 'VideoObject',
    '@id': videoId,
    name,
    description,
    url: canonicalUrl,
    thumbnailUrl: thumbnail,
    duration,
    inLanguage: 'ru-RU',
    ...(options.uploadDate ? { uploadDate: options.uploadDate } : {}),
    isPartOf: { '@id': episodeId },
    potentialAction: {
      '@type': 'WatchAction',
      target: canonicalUrl,
    },
  };

  return {
    '@context': 'https://schema.org',
    '@graph': [series, ...(season ? [season] : []), tvEpisode, video],
  };
}
