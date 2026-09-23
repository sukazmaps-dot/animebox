import 'server-only';

import type { Anime } from '@/types/anime';
import type {
  EpisodeAvailabilityProvider,
  EpisodeAvailabilityResponse,
} from '@/types/episode-availability';
import { searchKodikByShikimoriId } from '@/lib/kodik-episode-availability';
import {
  collectEpisodePages,
  episodeOrdinal,
  exactReleaseTitle,
  isRecord,
  pageItems,
} from '@/lib/provider-episodes';
import { findAnimeRouteById } from '@/lib/anime-registry';

const ANILIBERTY_BASES = [
  'https://aniliberty.top/api/v1',
  'https://anilibria.top/api/v1',
  'https://api.anilibria.app/api/v1',
];

function uniqueEpisodeNumbers(values: number[]): number[] {
  return [...new Set(values)]
    .filter((value) => Number.isSafeInteger(value) && value > 0 && value <= 10_000)
    .sort((a, b) => a - b);
}

function rangeTo(maxEpisode: number | null): number[] {
  if (!maxEpisode || maxEpisode <= 0 || maxEpisode > 10_000) return [];
  return Array.from({ length: maxEpisode }, (_, index) => index + 1);
}

function positiveInteger(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= 10_000
    ? number
    : null;
}

async function getKodikEpisodes(
  anime: Anime,
  signal?: AbortSignal,
): Promise<EpisodeAvailabilityProvider> {
  const shikimoriId = anime.idMal ?? anime.mal_id ?? null;
  if (!shikimoriId || !Number.isSafeInteger(Number(shikimoriId))) {
    return {
      name: 'kodik',
      status: 'unknown',
      episodes: [],
      reason: 'No Shikimori/MAL id.',
    };
  }

  try {
    const results = await searchKodikByShikimoriId(Number(shikimoriId), {
      signal,
    });

    if (!results.length) {
      return {
        name: 'kodik',
        status: 'unavailable',
        episodes: [],
        reason: 'No playable Kodik release.',
      };
    }

    // `episodes_count` can describe the planned/total episode count. For the
    // visible episode grid we only trust `last_episode`, which Kodik exposes
    // as the latest episode currently present in that playable release.
    const knownMax = results
      .map((item) => positiveInteger(item.last_episode))
      .filter((value): value is number => value !== null);

    if (!knownMax.length) {
      return {
        name: 'kodik',
        status: 'unknown',
        episodes: [],
        reason: 'Kodik player exists but episode range is unknown.',
      };
    }

    const maxEpisode = Math.max(...knownMax);
    return {
      name: 'kodik',
      status: 'available',
      episodes: rangeTo(maxEpisode),
      reason: '',
      playerUrl:
        typeof results[0]?.link === 'string' && results[0].link.trim()
          ? results[0].link.trim()
          : null,
    };
  } catch (error) {
    return {
      name: 'kodik',
      status: 'unknown',
      episodes: [],
      reason: error instanceof Error ? error.message : 'Kodik lookup failed.',
    };
  }
}

function animeTitles(anime: Anime): string[] {
  return [
    anime.title?.russian,
    anime.title?.romaji,
    anime.title?.english,
    anime.title?.native,
    anime.russian,
    anime.name,
  ].filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));
}

async function getAniLibertyEpisodes(
  anime: Anime,
  signal?: AbortSignal,
): Promise<EpisodeAvailabilityProvider> {
  const titles = animeTitles(anime);
  if (!titles.length) {
    return {
      name: 'aniliberty',
      status: 'unknown',
      episodes: [],
      reason: 'No title for provider lookup.',
    };
  }

  const routeRecord = findAnimeRouteById(anime.id);
  let hadTransientFailure = false;
  let hadAmbiguousMatch = false;

  for (const base of ANILIBERTY_BASES) {
    const fetchJson = async (url: string): Promise<unknown> => {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(4_000)])
          : AbortSignal.timeout(4_000),
        next: { revalidate: 300 },
        redirect: 'error',
      });

      if (response.status === 404) return null;
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`Provider HTTP ${response.status}`);
      }
      if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
      return response.json();
    };

    try {
      let alias = routeRecord?.provider_alias || null;

      if (!alias) {
        const matches = new Map<string, unknown>();

        for (const title of titles.slice(0, 4)) {
          const url = new URL(`${base}/app/search/releases`);
          url.searchParams.set('query', title);
          const candidates = pageItems(await fetchJson(url.href));

          for (const item of candidates) {
            if (!isRecord(item) || !exactReleaseTitle(item, titles)) continue;
            const key = item.alias;
            if (typeof key === 'string' && key) matches.set(key, item);
          }

          if (matches.size) break;
        }

        if (matches.size > 1) {
          hadAmbiguousMatch = true;
          continue;
        }

        alias = matches.keys().next().value || null;
      }

      if (!alias) continue;

      const endpoint = `${base}/anime/releases/${encodeURIComponent(alias)}`;
      const response = await fetchJson(endpoint);
      const root = isRecord(response) && isRecord(response.data) ? response.data : response;

      if (!isRecord(root)) continue;
      if (!routeRecord?.provider_alias && !exactReleaseTitle(root, titles)) {
        hadAmbiguousMatch = true;
        continue;
      }

      if (!Array.isArray(root.episodes) && !isRecord(root.episodes)) {
        hadTransientFailure = true;
        continue;
      }

      const all = await collectEpisodePages(root.episodes, endpoint, fetchJson);
      const episodes = uniqueEpisodeNumbers(
        all.map(episodeOrdinal).filter((number): number is number => number !== null),
      );

      return {
        name: 'aniliberty',
        status: episodes.length ? 'available' : 'unavailable',
        episodes,
        reason: episodes.length ? '' : 'Release has no playable episodes.',
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      hadTransientFailure = true;
    }
  }

  return {
    name: 'aniliberty',
    status: hadTransientFailure || hadAmbiguousMatch ? 'unknown' : 'unavailable',
    episodes: [],
    reason: hadAmbiguousMatch
      ? 'Release match is ambiguous.'
      : hadTransientFailure
        ? 'Provider temporarily unavailable.'
        : 'No matching release.',
  };
}

export async function getEpisodeProviderAvailability(
  anime: Anime,
  options: { signal?: AbortSignal } = {},
): Promise<EpisodeAvailabilityResponse> {
  // Kodik is AnimeBox's primary player. When it exposes a trustworthy
  // `last_episode`, we can answer immediately instead of blocking the episode
  // grid on several slower AniLiberty mirrors.
  const kodik = await getKodikEpisodes(anime, options.signal);
  if (kodik.status === 'available' && kodik.episodes.length) {
    return {
      animeId: anime.id,
      status: 'available',
      episodes: kodik.episodes,
      maxEpisode: kodik.episodes.at(-1) ?? null,
      providers: [kodik],
    };
  }

  const aniliberty = await getAniLibertyEpisodes(anime, options.signal);
  const providers = [kodik, aniliberty];
  const episodes = uniqueEpisodeNumbers(
    providers.flatMap((provider) =>
      provider.status === 'available' ? provider.episodes : [],
    ),
  );

  const status = episodes.length
    ? 'available'
    : providers.some((provider) => provider.status === 'unknown')
      ? 'unknown'
      : 'unavailable';

  return {
    animeId: anime.id,
    status,
    episodes,
    maxEpisode: episodes.at(-1) ?? null,
    providers,
  };
}
