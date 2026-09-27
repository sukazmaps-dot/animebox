import 'server-only';

import { adminClient } from '@/lib/community-server';
import { fetchWithRetry } from '@/lib/fetch-retry';
import { cleanShikimoriDescription } from '@/lib/shikimori-text';
import type { Anime } from '@/types/anime';

const SHIKIMORI_API = 'https://shikimori.one/api';
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

  const [documentResult, catalogResult] = await Promise.all([
    admin
      .from('anime_search_documents')
      .select('title,aliases,description,updated_at')
      .eq('anime_id', animeId)
      .maybeSingle(),
    admin
      .from('anime_catalog')
      .select('title,genres,total_episodes')
      .eq('id', animeId)
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

  return {
    document: (documentResult.data ?? null) as SearchLocalizationRow | null,
    catalog: (catalogResult.data ?? null) as CatalogLocalizationRow | null,
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

export async function localizeAnimeDetail(anime: Anime): Promise<Anime> {
  let local: Awaited<ReturnType<typeof readLocalLocalization>> = {
    document: null,
    catalog: null,
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
    anime,
    russianTitle: localRussianTitle,
    russianDescription: localRussianDescription,
    catalog: local.catalog,
  });

  // Once a Russian description has been persisted, the detail page is no
  // longer dependent on Shikimori availability.
  if (localRussianDescription) {
    return localFallback;
  }

  const malId = Number(anime.idMal ?? anime.mal_id ?? 0);
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
      anime,
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
