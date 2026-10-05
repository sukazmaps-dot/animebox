import {readShikimoriMetadata,mergeShikimoriMetadata} from '@/lib/shikimori-metadata-server';
import 'server-only';

import { adminClient } from '@/lib/community-server';
import { fetchWithRetry } from '@/lib/fetch-retry';
import { cleanShikimoriDescription } from '@/lib/shikimori-text';
import type { Anime } from '@/types/anime';

const SHIKIMORI_API = 'https://shikimori.io/api';
const SHIKIMORI_HEADERS = {
  'User-Agent': 'AnimeBoxApp',
  Accept: 'application/json',
};

const NEGATIVE_CACHE_MS = 90_000;
const EMPTY_PROVIDER_CACHE_MS = 30 * 60_000;
const MAX_NEGATIVE_CACHE = 2_500;

const providerRetryAfter = new Map<number, number>();

type SearchLocalizationRow = {
  title: string;
  aliases: string[] | null;
  description: string | null;
  updated_at: string;
};

type CatalogLocalizationRow = {
  title: string;
  genres: string[] | null;
  total_episodes: number | null;
  finished?: boolean | null;
  poster_url?: string | null;
};

type ShikimoriDetail = {
  russian?: string | null;
  description?: string | null;
  genres?: Array<{ name?: string | null; russian?: string | null }>;
  episodes?: number | null;
  episodes_aired?: number | null;
};

function containsCyrillic(value: string | null | undefined) {
  return Boolean(value && /[А-Яа-яЁё]/.test(value));
}

function cleanText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

function firstRussianTitle(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = cleanText(value);
    if (normalized && containsCyrillic(normalized)) return normalized;
  }
  return null;
}

function rememberProviderRetry(id: number, delayMs: number) {
  providerRetryAfter.delete(id);
  providerRetryAfter.set(id, Date.now() + delayMs);

  while (providerRetryAfter.size > MAX_NEGATIVE_CACHE) {
    const oldest = providerRetryAfter.keys().next().value as number | undefined;
    if (oldest == null) break;
    providerRetryAfter.delete(oldest);
  }
}

function providerRetryBlocked(id: number) {
  const retryAfter = providerRetryAfter.get(id);
  if (!retryAfter) return false;
  if (retryAfter <= Date.now()) {
    providerRetryAfter.delete(id);
    return false;
  }
  return true;
}

async function readLocalLocalization(animeId: number) {
  const admin = adminClient();

  const [documentResult, catalogResult, mappingResult] = await Promise.all([
    admin
      .from('anime_search_documents')
      .select('title,aliases,description,updated_at')
      .eq('anime_id', animeId)
      .maybeSingle(),
    admin
      .from('anime_catalog')
      .select('title,genres,total_episodes,finished,poster_url')
      .eq('id', animeId)
      .maybeSingle(),
    admin
      .from('anime_availability')
      .select('mal_id')
      .eq('anime_id', animeId)
      .maybeSingle(),
  ]);

  if (documentResult.error) {
    console.warn(
      '[anime localization] search document lookup failed:',
      documentResult.error.message,
    );
  }

  if (catalogResult.error) {
    console.warn(
      '[anime localization] catalog lookup failed:',
      catalogResult.error.message,
    );
  }

  if (mappingResult.error) {
    console.warn('[anime localization] provider mapping lookup failed:', mappingResult.error.message);
  }

  const malId = Number(mappingResult.data?.mal_id);

  return {
    document: (documentResult.data ?? null) as SearchLocalizationRow | null,
    catalog: (catalogResult.data ?? null) as CatalogLocalizationRow | null,
    malId: Number.isSafeInteger(malId) && malId > 0 ? malId : null,
  };
}

async function persistRussianLocalization(input: {
  animeId: number;
  title: string | null;
  description: string | null;
}) {
  if (!input.description && !input.title) return;

  try {
    const admin = adminClient();
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (input.description) patch.description = input.description;

    // Most search documents already have a curated RU title. Only repair a
    // title when the provider gives us a Russian value and the current row did
    // not have one; the caller already decides that fallback order.
    if (input.title) patch.title = input.title;

    const { error } = await admin
      .from('anime_search_documents')
      .update(patch)
      .eq('anime_id', input.animeId);

    if (error) {
      console.warn(
        '[anime localization] persistence failed:',
        error.message,
      );
    }
  } catch (error) {
    console.warn('[anime localization] persistence unavailable:', error);
  }
}

function mergeAnime(input: {
  anime: Anime;
  russianTitle: string | null;
  russianDescription: string | null;
  catalog: CatalogLocalizationRow | null;
  shikimori?: ShikimoriDetail | null;
}) {
  const shikiGenres = (input.shikimori?.genres ?? []).flatMap((genre) =>
    [genre.russian, genre.name].filter(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0,
    ),
  );

  const genres = [
    ...(input.anime.genres ?? []),
    ...(input.catalog?.genres ?? []),
    ...shikiGenres,
  ];

  return {
    ...input.anime,
    title: {
      ...input.anime.title,
      russian:
        input.russianTitle ||
        input.anime.title?.russian ||
        null,
    },
    description:
      input.russianDescription ||
      input.anime.description ||
      null,
    genres: [...new Set(genres)],
    episodes:
      input.anime.episodes ||
      input.catalog?.total_episodes ||
      input.shikimori?.episodes ||
      null,
    episodesAired:
      Math.max(
        Number(input.anime.episodesAired ?? 0),
        Number(input.shikimori?.episodes_aired ?? 0),
      ) || null,
  } satisfies Anime;
}

export async function getLocalAnimeDetailFallback(
  animeId: number,
): Promise<Anime | null> {
  if (!Number.isSafeInteger(animeId) || animeId <= 0) return null;

  let local: Awaited<ReturnType<typeof readLocalLocalization>>;
  try {
    local = await readLocalLocalization(animeId);
  } catch (error) {
    console.warn(
      `[anime localization] local detail fallback failed for ${animeId}:`,
      error,
    );
    return null;
  }

  if (!local.document && !local.catalog) return null;

  const aliases = Array.isArray(local.document?.aliases)
    ? local.document.aliases
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    : [];

  const russianTitle =
    firstRussianTitle(
      local.document?.title,
      local.catalog?.title,
      ...aliases,
    ) ||
    cleanText(local.document?.title) ||
    cleanText(local.catalog?.title) ||
    'Аниме';

  const latinAliases = aliases.filter(
    (value) => /[A-Za-z]/.test(value) && !containsCyrillic(value),
  );
  const romaji =
    latinAliases.find((value) => /\bna\b|\bno\b|\bto\b|\bwa\b/i.test(value)) ||
    latinAliases[0] ||
    null;
  const english =
    latinAliases.find((value) => value !== romaji) ||
    latinAliases[0] ||
    null;
  const native =
    aliases.find((value) => /[\u3040-\u30ff\u3400-\u9fff]/.test(value)) ||
    null;

  const description = cleanText(local.document?.description);
  const totalEpisodes = Number(local.catalog?.total_episodes ?? 0);
  const poster = cleanText((local.catalog as CatalogLocalizationRow & {
    poster_url?: string | null;
  } | null)?.poster_url);

  const anime:Anime = {
    id: animeId,
    idMal: local.malId,
    catalogEligible: true,
    title: {
      russian: russianTitle,
      romaji,
      english,
      native,
    },
    synonyms: aliases,
    description,
    score: null,
    episodes:
      Number.isSafeInteger(totalEpisodes) && totalEpisodes > 0
        ? totalEpisodes
        : null,
    episodesAired:
      local.catalog?.finished &&
      Number.isSafeInteger(totalEpisodes) &&
      totalEpisodes > 0
        ? totalEpisodes
        : null,
    duration: null,
    status: local.catalog?.finished ? 'Вышло' : null,
    format: null,
    genres: local.catalog?.genres ?? [],
    studios: [],
    coverImage: poster
      ? {
          extraLarge: poster,
          large: poster,
        }
      : null,
    bannerImage: null,
  };
  const metadata=await readShikimoriMetadata(local.malId?[local.malId]:[]);
  return mergeShikimoriMetadata(anime,local.malId?metadata.get(local.malId):undefined);
}

export async function localizeAnimeDetail(anime: Anime): Promise<Anime> {
  let local: Awaited<ReturnType<typeof readLocalLocalization>> = {
    document: null,
    catalog: null,
    malId: null,
  };

  try {
    local = await readLocalLocalization(anime.id);
  } catch (error) {
    // Detail pages must stay available even when the localization cache is
    // temporarily unavailable.
    console.warn('[anime localization] local fallback unavailable:', error);
  }

  const aliases = Array.isArray(local.document?.aliases)
    ? local.document.aliases
    : [];

  const localRussianTitle = firstRussianTitle(
    local.document?.title,
    local.catalog?.title,
    ...aliases,
    anime.title?.russian,
  );

  const storedDescription = cleanText(local.document?.description);
  const localRussianDescription =
    storedDescription && containsCyrillic(storedDescription)
      ? storedDescription
      : null;

  const localFallback = mergeAnime({
    anime: { ...anime, idMal: anime.idMal ?? anime.mal_id ?? local.malId },
    russianTitle: localRussianTitle,
    russianDescription: localRussianDescription,
    catalog: local.catalog,
  });

  // Once a Russian description has been persisted, the detail page is no
  // longer dependent on Shikimori availability.
  if (localRussianDescription || (localFallback.description && containsCyrillic(localFallback.description))) {
    return localFallback;
  }

  const malId = Number(localFallback.idMal ?? 0);
  if (!Number.isSafeInteger(malId) || malId <= 0 || providerRetryBlocked(anime.id)) {
    return localFallback;
  }

  try {
    const response = await fetchWithRetry(
      `${SHIKIMORI_API}/animes/${malId}`,
      {
        headers: SHIKIMORI_HEADERS,
        cache: 'no-store',
        signal: AbortSignal.timeout(4_000),
      },
    );

    if (!response.ok) {
      rememberProviderRetry(anime.id, NEGATIVE_CACHE_MS);
      return localFallback;
    }

    const shikimori = (await response.json()) as ShikimoriDetail;
    const providerTitle = firstRussianTitle(shikimori.russian);
    const providerDescriptionRaw = cleanText(shikimori.description);
    const providerDescription = providerDescriptionRaw
      ? cleanShikimoriDescription(providerDescriptionRaw)
      : null;
    const russianDescription =
      providerDescription && containsCyrillic(providerDescription)
        ? providerDescription
        : null;

    const russianTitle = localRussianTitle || providerTitle;

    if (!russianDescription) {
      rememberProviderRetry(anime.id, EMPTY_PROVIDER_CACHE_MS);
    } else {
      providerRetryAfter.delete(anime.id);
      void persistRussianLocalization({
        animeId: anime.id,
        title: localRussianTitle ? null : providerTitle,
        description: russianDescription,
      });
    }

    return mergeAnime({
      anime: localFallback,
      russianTitle,
      russianDescription,
      catalog: local.catalog,
      shikimori,
    });
  } catch (error) {
    rememberProviderRetry(anime.id, NEGATIVE_CACHE_MS);
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn(
        `[anime localization] Shikimori timeout for anime ${anime.id}`,
      );
    } else {
      console.warn(
        `[anime localization] Shikimori failed for anime ${anime.id}:`,
        error,
      );
    }
    return localFallback;
  }
}
