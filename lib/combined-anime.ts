import { registerAnime } from './anime-registry';
import {
  getAnimes as getAniListAnimes,
  getAnimeById as getAniListAnimeById,
  getAniListByMalId,
  getAnimesByMalIds,
  getAnimesByIds,
} from '@/lib/anilist';

import type { Anime } from '@/types/anime';
import { getAnimeFranchise, type AnimeFranchise } from '@/lib/anime-franchise';
import type { GetAnimesOptions } from '@/lib/anilist';

import { fetchWithRetry } from '@/lib/fetch-retry';
import { animeTaxonomyValueMatches, findAnimeGenre, findAnimeTag, toShikimoriGenreIds } from '@/lib/anime-taxonomy';

import {
  cleanShikimoriDescription,
} from '@/lib/shikimori-text';

type ShikimoriAnime = {
  genres?: { name?: string; russian?: string }[];
  id?: number;
  russian?: string | null;
  description?: string | null;
  episodes?: number | null;
  episodes_aired?: number | null;
};

/** Серверная локализация франшизы. Ссылки сохраняют AniList ID. */
export async function getAnimeFranchiseWithShikimori(
  id: number | string,
  options: { signal?: AbortSignal; maxRequests?: number } = {},
): Promise<AnimeFranchise | null> {
  const franchise = await getAnimeFranchise(id, options);
  if (!franchise) return null;

  const malIds = [...new Set(franchise.items.map((item) => item.idMal)
    .filter((value): value is number => Number.isSafeInteger(value) && Number(value) > 0))];
  const titles = new Map<number, string>();

  // Небольшие последовательные пачки: сбой одной не отменяет остальные.
  for (let offset = 0; offset < malIds.length; offset += 30) {
    options.signal?.throwIfAborted();
    const batch = malIds.slice(offset, offset + 30);
    const params = new URLSearchParams({ ids: batch.join(','), limit: String(batch.length) });
    try {
      const response = await fetchWithRetry(`${SHIKIMORI_API}/animes?${params}`, {
        headers: SHIKIMORI_HEADERS,
        signal: options.signal,
        next: { revalidate: 3600 },
      });
      if (!response.ok) throw new Error(`Shikimori franchise HTTP ${response.status}`);
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error('Invalid Shikimori franchise response');
      for (const item of data) {
        if (!item || typeof item !== 'object') continue;
        if (typeof item.id === 'number' && batch.includes(item.id) &&
            typeof item.russian === 'string' && item.russian.trim()) {
          const russian = item.russian.trim();
          titles.set(item.id, russian);
          rememberRussianTitle(item.id, russian);
        }
      }
    } catch (error) {
      options.signal?.throwIfAborted();
      if (error instanceof Error && error.name === 'AbortError') throw error;
      console.warn('Shikimori franchise localization failed:', error);
    }
  }
  options.signal?.throwIfAborted();

  const items = franchise.items.map((item) => ({
    ...item,
    title: {
      ...item.title,
      russian: (item.idMal ? titles.get(item.idMal) : undefined) || item.title.russian || null,
    },
  }));
  const groups: AnimeFranchise['groups'] = {
    series: [], movies: [], ova: [], specials: [], spinOffs: [], other: [],
  };
  for (const item of items) groups[item.category].push(item);
  return { ...franchise, items, groups };
}

const SHIKIMORI_API =
  'https://shikimori.one/api';

const SHIKIMORI_HEADERS = {
  'User-Agent': 'AnimeBoxApp',
  Accept: 'application/json',
};

const russianTitleCache = new Map<number, string>();
const RUSSIAN_TITLE_CACHE_LIMIT = 2500;

function rememberRussianTitle(id: number, title: string | null | undefined) {
  const normalized = title?.trim();
  if (!Number.isSafeInteger(id) || id <= 0 || !normalized) return;
  russianTitleCache.delete(id);
  russianTitleCache.set(id, normalized);
  while (russianTitleCache.size > RUSSIAN_TITLE_CACHE_LIMIT) {
    const oldest = russianTitleCache.keys().next().value as number | undefined;
    if (oldest == null) break;
    russianTitleCache.delete(oldest);
  }
}

async function fetchShikimoriListByIds(
  ids: number[],
  signal?: AbortSignal,
): Promise<Map<number, ShikimoriAnime>> {
  const result = new Map<number, ShikimoriAnime>();
  const chunks: number[][] = [];
  for (let index = 0; index < ids.length; index += 12) {
    chunks.push(ids.slice(index, index + 12));
  }

  const settled = await Promise.allSettled(
    chunks.map(async (chunk) => {
      const params = new URLSearchParams({
        ids: chunk.join(','),
        limit: String(chunk.length),
      });
      const response = await fetchWithRetry(`${SHIKIMORI_API}/animes?${params}`, {
        headers: SHIKIMORI_HEADERS,
        signal,
        next: { revalidate: 3600 },
      });
      if (!response.ok) throw new Error(`Shikimori HTTP ${response.status}`);
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error('Invalid Shikimori list response');
      return data as ShikimoriAnime[];
    }),
  );

  for (const batch of settled) {
    if (batch.status !== 'fulfilled') continue;
    for (const item of batch.value) {
      if (typeof item.id !== 'number' || item.id <= 0) continue;
      result.set(item.id, item);
      rememberRussianTitle(item.id, item.russian);
    }
  }

  for (const id of ids) {
    if (result.has(id)) continue;
    const cached = russianTitleCache.get(id);
    if (cached) result.set(id, { id, russian: cached });
  }

  if (settled.some((batch) => batch.status === 'rejected') && result.size === 0) {
    const rejected = settled.find((batch) => batch.status === 'rejected');
    if (rejected?.status === 'rejected') throw rejected.reason;
  }

  return result;
}


type ShikimoriSearchAnime = {
  id?: number;
  name?: string | null;
  russian?: string | null;
};

function containsCyrillic(
  value: string,
): boolean {
  return /[А-Яа-яЁё]/.test(value);
}

function russianSearchMatches(
  query: string,
  item: ShikimoriSearchAnime,
): boolean {
  const normalizedQuery = normalizeSearchText(query);
  const title = normalizeSearchText(
    `${item.russian ?? ''} ${item.name ?? ''}`,
  );
  const words = normalizedQuery.split(' ').filter((word) => word.length >= 2);
  return words.length > 0 && words.every((word) => title.includes(word));
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[‐‑–—-]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function searchRussianAnime(
  query: string,
  limit: number,
  signal?: AbortSignal,
  options: GetAnimesOptions = {},
): Promise<Anime[]> {
  const params = new URLSearchParams();

  params.set('search', query.normalize('NFKC').replace(/[‐‑–—-]/g, ' ').replace(/\s+/g, ' ').trim());
  params.set('page', String(Math.max(1, options.page ?? 1)));
  const requestedGenres = options.genres?.length
    ? options.genres
    : options.genre != null
      ? [options.genre]
      : [];
  const shikimoriGenreIds = toShikimoriGenreIds(requestedGenres);
  if (shikimoriGenreIds.length > 0) params.set('genre', shikimoriGenreIds.join(','));
  if (options.status === 'ongoing') params.set('status', 'ongoing');
  if (options.status === 'finished') params.set('status', 'released');
  if (options.status === 'upcoming') params.set('status', 'anons');

  const shikimoriKind = ({
    TV: 'tv',
    MOVIE: 'movie',
    OVA: 'ova',
    ONA: 'ona',
    SPECIAL: 'special',
  } as const)[options.format ?? 'TV'];
  if (options.format) params.set('kind', shikimoriKind);

  if (options.year != null && options.season) {
    params.set('season', `${options.season.toLowerCase()}_${options.year}`);
  } else if (options.year != null) {
    params.set('season', String(options.year));
  }
  params.set(
    'limit',
    String(
      Math.min(
        Math.max(limit, 1),
        30,
      ),
    ),
  );
  params.set('order', 'popularity');

  const response = await fetchWithRetry(
    `${SHIKIMORI_API}/animes?${params.toString()}`,
    {
      headers: SHIKIMORI_HEADERS,
      signal,
      next: {
        revalidate: 300,
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Shikimori search HTTP ${response.status}`,
    );
  }

  const data =
    (await response.json()) as ShikimoriSearchAnime[];

  if (!Array.isArray(data)) {
    throw new Error('Некорректный ответ русского поиска');
  }

  const candidates = data.filter(
    (item): item is ShikimoriSearchAnime & { id: number } =>
      item != null && typeof item.id === 'number' &&
      item.id > 0 && russianSearchMatches(query, item),
  );

  if (candidates.length === 0) {
    return [];
  }

  let aniListMatches: Anime[] = [];

  try {
    aniListMatches = await getAnimesByMalIds(
      candidates.map((item) => item.id),
      { signal },
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;

    // Batch-запрос может временно не сработать из-за лимита AniList.
    // Восстанавливаем результаты небольшими одиночными запросами,
    // чтобы русский поиск не превращался в пустой экран.
    const recovered: Anime[] = [];
    for (const item of candidates.slice(0, 12)) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const media = await getAniListByMalId(item.id);
      if (media && Number.isSafeInteger(Number(media.id))) {
        const mapped = await getAniListAnimeById(Number(media.id));
        if (mapped) recovered.push(mapped);
      }
    }
    aniListMatches = recovered;
  }

  if (aniListMatches.length === 0) {
    const recovered: Anime[] = [];
    for (const item of candidates.slice(0, 12)) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const media = await getAniListByMalId(item.id);
      if (media && Number.isSafeInteger(Number(media.id))) {
        const mapped = await getAniListAnimeById(Number(media.id));
        if (mapped) recovered.push(mapped);
      }
    }
    aniListMatches = recovered;
  }

  if (aniListMatches.length === 0) {
    throw new Error('Не удалось сопоставить результаты Shikimori с AniList');
  }

  if (requestedGenres.length > 0 || options.tags?.length || options.studioNames?.length) {
    const requestedGenreOptions = requestedGenres
      .map((value) => findAnimeGenre(value))
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
    const requestedTagOptions = (options.tags ?? [])
      .map((value) => findAnimeTag(value))
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
    const requestedStudios = new Set(
      (options.studioNames ?? []).map((value) => normalizeSearchText(value)),
    );

    aniListMatches = aniListMatches.filter((anime) => {
      const animeStudios = new Set(
        (Array.isArray(anime.studios) ? anime.studios : [])
          .map((studio: { name?: unknown }) => typeof studio?.name === 'string' ? normalizeSearchText(studio.name) : '')
          .filter(Boolean),
      );

      return (
        requestedGenreOptions.every((genre) => animeTaxonomyValueMatches(anime.genres, genre)) &&
        requestedTagOptions.every((tag) => animeTaxonomyValueMatches(anime.tags, tag)) &&
        [...requestedStudios].every((studio) => animeStudios.has(studio))
      );
    });
  }

  const byMalId = new Map(
    aniListMatches
      .filter(
        (anime) =>
          typeof anime.idMal === 'number',
      )
      .map((anime) => [
        anime.idMal as number,
        anime,
      ]),
  );

  const results: Anime[] = [];

  for (const item of candidates) {
    const anime = byMalId.get(item.id);

    if (!anime) {
      continue;
    }

    results.push({
      ...anime,
      title: {
        ...anime.title,
        russian:
          item.russian?.trim() ||
          anime.title.russian ||
          null,
      },
    });
  }

  return results.filter((anime) => anime.catalogEligible !== false);
}

async function loadAnimesWithShikimori(
  options: GetAnimesOptions = {},
  fetchOptions?: {
    signal?: AbortSignal;
    onPageInfo?: (pageInfo: { hasNextPage: boolean }) => void;
  },
): Promise<Anime[]> {
  const normalizedSearch =
    options.search?.trim() ?? '';

  /*
   * AniList практически не ищет русские локализованные названия.
   * Для кириллицы сначала ищем на Shikimori, получаем MAL ID,
   * затем одним GraphQL-запросом преобразуем их в AniList ID.
   */
  if (
    normalizedSearch &&
    containsCyrillic(normalizedSearch)
  ) {
    const localized = await searchRussianAnime(
      normalizedSearch, options.limit ?? 20, fetchOptions?.signal, options,
    );
    fetchOptions?.onPageInfo?.({
      hasNextPage: localized.length >= (options.limit ?? 20),
    });
    return localized;
  }

  const anilistAnimes =
    await getAniListAnimes(
      options,
      fetchOptions,
    );

  if (anilistAnimes.length === 0) {
    if (normalizedSearch) {
      try {
        const localized = await searchRussianAnime(
          normalizedSearch,
          options.limit ?? 20,
          fetchOptions?.signal,
        );
        fetchOptions?.onPageInfo?.({
          hasNextPage: localized.length >= (options.limit ?? 20),
        });
        return localized;
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === 'AbortError'
        ) {
          throw error;
        }
      }
    }

    return [];
  }

  /*
   * Собираем уникальные MAL ID.
   *
   * Shikimori использует эти ID
   * для сопоставления тайтлов.
   */
  const malIds = Array.from(
    new Set(
      anilistAnimes
        .map((anime) => anime.idMal)
        .filter(
          (id): id is number =>
            typeof id === 'number' &&
            id > 0,
        ),
    ),
  );

  if (malIds.length === 0) {
    return anilistAnimes;
  }

  try {
    /*
     * Локализацию грузим небольшими независимыми пачками. Если один запрос
     * Shikimori временно падает, главная больше не откатывается целиком на
     * английские AniList-title. Успешные русские названия сохраняются в
     * process-cache и используются как мягкий fallback при следующем сбое.
     */
    const shikiMap = await fetchShikimoriListByIds(malIds, fetchOptions?.signal);

    return anilistAnimes.map(
      (anime) => {
        const malId =
          anime.idMal;

        if (!malId) {
          return anime;
        }

        const shiki =
          shikiMap.get(malId);

        if (!shiki) {
          return anime;
        }

        const russianTitle =
          shiki.russian?.trim();

        return {
          ...anime,

          title: {
            ...anime.title,

            russian:
              russianTitle ||
              anime.title
                ?.russian ||
              null,
          },

          /*
           * У list endpoint Shikimori
           * description может отсутствовать.
           * Поэтому AniList description
           * остаётся fallback.
           */
          description:
            shiki.description
              ? cleanShikimoriDescription(
                  shiki.description,
                )
              : anime.description,
        };
      },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.name ===
        'AbortError'
    ) {
      throw error;
    }

    console.warn(
      'Shikimori list localization failed:',
      error,
    );

    return anilistAnimes;
  }
}

async function loadAnimeByIdWithShikimori(
  id: number,
): Promise<Anime | null> {
  const anime =
    await getAniListAnimeById(id, {
      throwOnError: true,
    });

  if (!anime) {
    return null;
  }

  const malId =
    anime.idMal;

  if (!malId) {
    return anime;
  }

  try {
    const response =
      await fetchWithRetry(
        `${SHIKIMORI_API}/animes/${malId}`,
        {
          headers:
            SHIKIMORI_HEADERS,

          next: {
            revalidate: 3600,
          },
        },
      );

    if (!response.ok) {
      return anime;
    }

    const shiki =
      (await response.json()) as
        ShikimoriAnime;

    const russianTitle =
      shiki.russian?.trim();

    if (malId && russianTitle) rememberRussianTitle(malId, russianTitle);

    return {
      ...anime,
      // Shounen is a demographic on many catalogs; AniList genres alone omit it.
      genres: [...new Set([...(anime.genres ?? []), ...(shiki.genres ?? []).flatMap(genre =>
        [genre.russian, genre.name].filter((name): name is string => typeof name === 'string' && name.length > 0))])],
      episodes: anime.episodes || shiki.episodes || null,
      episodesAired: Math.max(anime.episodesAired || 0, shiki.episodes_aired || 0) || null,

      title: {
        ...anime.title,

        russian:
          russianTitle ||
          anime.title
            ?.russian ||
          null,
      },

      description:
        shiki.description
          ? cleanShikimoriDescription(
              shiki.description,
            )
          : anime.description,
    };
  } catch (error) {
    console.error(
      `Shikimori localization failed for anime ${id}:`,
      error,
    );

    return anime;
  }
}

export async function getAnimesByIdsWithShikimori(
  ids: number[],
  options: { signal?: AbortSignal } = {},
): Promise<Anime[]> {
  const animes = await getAnimesByIds(ids, { signal: options.signal });
  const malIds = [...new Set(
    animes
      .map((anime) => anime.idMal)
      .filter((id): id is number => Number.isSafeInteger(id) && Number(id) > 0),
  )];

  if (!malIds.length) return animes.map(registerAnime);

  try {
    const shikimori = await fetchShikimoriListByIds(malIds, options.signal);
    return animes.map((anime) => {
      const localized = anime.idMal ? shikimori.get(anime.idMal) : null;
      const russian = localized?.russian?.trim();

      return registerAnime({
        ...anime,
        title: {
          ...anime.title,
          russian: russian || anime.title?.russian || null,
        },
        description: localized?.description
          ? cleanShikimoriDescription(localized.description)
          : anime.description,
      });
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    console.warn('Search index localization failed:', error);
    return animes.map(registerAnime);
  }
}

export async function getAnimesWithShikimori(...args: Parameters<typeof loadAnimesWithShikimori>) {
  return (await loadAnimesWithShikimori(...args)).map(registerAnime);
}
export async function getAnimeByIdWithShikimori(...args: Parameters<typeof loadAnimeByIdWithShikimori>) {
  const anime = await loadAnimeByIdWithShikimori(...args);
  return anime ? registerAnime(anime) : null;
}
