import type { Anime } from '@/types/anime';
import type {
  GetAnimesOptions,
} from '@/lib/anilist';
import type { CatalogMood } from '@/lib/catalog-moods';

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

/*
 * Клиентский memory-cache.
 *
 * Он не заменяет HTTP/server cache, а убирает повторные запросы при
 * переходах Главная → Тайтл → Назад, переключении страниц и возврате
 * к недавно открытому каталогу.
 */
const listCache = new Map<string, CacheEntry<Anime[]>>();
const detailCache = new Map<number, CacheEntry<Anime | null>>();

const LIST_CACHE_TTL = 5 * 60 * 1000;
const SEARCH_CACHE_TTL = 60 * 1000;
const DETAIL_CACHE_TTL = 10 * 60 * 1000;

function readCache<T>(
  cache: Map<string | number, CacheEntry<T>>,
  key: string | number,
): T | undefined {
  const entry = cache.get(key);

  if (!entry) {
    return undefined;
  }

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }

  return entry.data;
}

function writeCache<T>(
  cache: Map<string | number, CacheEntry<T>>,
  key: string | number,
  data: T,
  ttl: number,
): T {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttl,
  });

  return data;
}

export type ClientAnimeListOptions = GetAnimesOptions & {
  mood?: CatalogMood;
};

export async function getAnimes(
  options: ClientAnimeListOptions = {},
  fetchOptions?: {
    signal?: AbortSignal;
  },
): Promise<Anime[]> {
  const params = new URLSearchParams();

  if (options.limit != null) {
    params.set('limit', String(options.limit));
  }

  if (options.page != null) {
    params.set('page', String(options.page));
  }

  if (options.order) {
    params.set('order', options.order);
  }

  if (options.status) {
    params.set('status', options.status);
  }

  if (options.search?.trim()) {
    params.set('search', options.search.trim());
  }

  if (options.genre != null) {
    params.set('genre', String(options.genre));
  }

  if (options.mood && options.mood !== 'any') {
    params.set('mood', options.mood);
  }

  const queryString = params.toString();
  const cacheKey = queryString || '__default__';
  const cached = readCache(listCache, cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const response = await fetch(
    `/api/anime${queryString ? `?${queryString}` : ''}`,
    {
      signal: fetchOptions?.signal,

      /*
       * Сервер сам задаёт Cache-Control.
       * В том числе короткий cache для поиска, чтобы back/forward и
       * повторный запрос не запускали AniList + Shikimori заново.
       */
      cache: 'default',
    },
  );

  if (!response.ok) {
    throw new Error(
      `Anime API HTTP ${response.status}`,
    );
  }

  const data = (await response.json()) as {
    anime?: Anime[];
    error?: string;
  };

  if (!Array.isArray(data.anime)) {
    throw new Error(
      data.error || 'Некорректный ответ Anime API',
    );
  }

  const ttl = options.search?.trim()
    ? SEARCH_CACHE_TTL
    : LIST_CACHE_TTL;

  return writeCache(
    listCache,
    cacheKey,
    data.anime,
    ttl,
  );
}

export async function getAnimeById(
  id: number | string,
  fetchOptions?: {
    signal?: AbortSignal;
  },
): Promise<Anime | null> {
  const numericId = Number(id);

  if (
    !Number.isInteger(numericId) ||
    numericId <= 0
  ) {
    return null;
  }

  const cached = readCache(detailCache, numericId);

  if (cached !== undefined) {
    return cached;
  }

  const response = await fetch(
    `/api/anime/${numericId}`,
    {
      signal: fetchOptions?.signal,
      cache: 'default',
    },
  );

  if (response.status === 404) {
    return writeCache(
      detailCache,
      numericId,
      null,
      60 * 1000,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Anime API HTTP ${response.status}`,
    );
  }

  const data = (await response.json()) as {
    anime?: Anime | null;
    error?: string;
  };

  return writeCache(
    detailCache,
    numericId,
    data.anime ?? null,
    DETAIL_CACHE_TTL,
  );
}

export function isAbortError(
  error: unknown,
): boolean {
  return (
    error instanceof Error &&
    error.name === 'AbortError'
  );
}

/**
 * Старый availability-фильтр оставлен только для совместимости.
 * Не используем его в каталоге/трекере: проверка каждого тайтла через
 * видеопровайдера делала страницы зависимыми от медленного внешнего API.
 */
export async function filterAnimeWithSources(
  animeList: Anime[],
): Promise<Anime[]> {
  return animeList;
}
