import type {
  Anime,
  AnimeImage,
  AnimeListItem,
} from '@/types/anime';

export const ANIME_LIST_STORAGE_KEY = 'anime_list';
export const ANIME_PROGRESS_STORAGE_KEY = 'anime_progress';
export const ANIME_HISTORY_STORAGE_KEY = 'anime_watch_history';
export const ANIME_FAVORITES_STORAGE_KEY = 'anime_favorites';

type LegacyAnimeListItem = {
  id?: unknown;
  mal_id?: unknown;
  idMal?: unknown;

  title?: unknown;
  title_original?: unknown;

  name?: unknown;
  russian?: unknown;

  score?: unknown;
  episodes?: unknown;
  episodes_aired?: unknown;
  episodesAired?: unknown;

  duration?: unknown;

  status?: unknown;
  kind?: unknown;
  format?: unknown;

  description?: unknown;

  genres?: unknown;
  studios?: unknown;

  startDate?: unknown;
  endDate?: unknown;

  image?: {
    original?: unknown;
    preview?: unknown;
    extraLarge?: unknown;
    large?: unknown;
    medium?: unknown;
    color?: unknown;
    mal_id?: unknown;
  };

  coverImage?: Partial<AnimeImage>;
  bannerImage?: unknown;
};

export type AnimeHistoryEntry = AnimeListItem & {
  lastViewedAt: number;
  viewCount: number;
};

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function toNullableNumber(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function toNullableString(
  value: unknown,
): string | null {
  return typeof value === 'string' &&
    value.trim()
    ? value.trim()
    : null;
}

function toStringArray(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === 'string') {
        return item.trim();
      }

      if (isObject(item)) {
        const russian = toNullableString(
          item.russian,
        );

        const name = toNullableString(
          item.name,
        );

        return russian || name || '';
      }

      return '';
    })
    .filter(Boolean);
}

function toStudioArray(
  value: unknown,
): Array<{ name: string }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((studio) => {
      if (!isObject(studio)) {
        return null;
      }

      const name = toNullableString(
        studio.name,
      );

      return name ? { name } : null;
    })
    .filter(
      (
        studio,
      ): studio is { name: string } =>
        studio !== null,
    );
}

function toAnimeDate(
  value: unknown,
): {
  year: number | null;
  month: number | null;
  day: number | null;
} | null {
  if (!isObject(value)) {
    return null;
  }

  return {
    year: toNullableNumber(value.year),
    month: toNullableNumber(value.month),
    day: toNullableNumber(value.day),
  };
}

function getAnimeTitle(
  item: LegacyAnimeListItem,
): Anime['title'] {
  if (isObject(item.title)) {
    return {
      russian: toNullableString(item.title.russian) ?? toNullableString(item.russian),
      romaji:
        toNullableString(item.title.romaji) ??
        null,
      english:
        toNullableString(item.title.english) ??
        null,
      native:
        toNullableString(item.title.native) ??
        null,
    };
  }

  const legacyTitle =
    toNullableString(item.title);

  const english =
    toNullableString(item.name);

  const russian =
    toNullableString(item.russian);

  return {
    russian,
    romaji: legacyTitle ?? russian,
    english,
    native: russian,
  };
}

function getCoverImage(
  item: LegacyAnimeListItem,
): Anime['coverImage'] {
  const cover = isObject(item.coverImage) ? item.coverImage : {};
  const legacy = isObject(item.image) ? item.image : {};
  const first = (...values: unknown[]) => values.map(toNullableString).find(Boolean) ?? null;
  const imageUrl = (...values: unknown[]) => {
    const value = first(...values);
    return value && /^\/(system|assets)\//.test(value) ? `https://shikimori.one${value}` : value;
  };
  return {
    extraLarge: imageUrl(cover.extraLarge, cover.large, cover.original, legacy.extraLarge, legacy.original, legacy.large),
    large: imageUrl(cover.large, cover.extraLarge, cover.preview, legacy.large, legacy.preview, legacy.original),
    medium: imageUrl(cover.medium, cover.large, cover.extraLarge, legacy.medium, legacy.preview, legacy.original),
    color: first(cover.color, legacy.color),
  };
}

function normalizeStoredItem(
  value: unknown,
): AnimeListItem | null {
  if (!isObject(value)) {
    return null;
  }

  const item =
    value as LegacyAnimeListItem;

  const id = Number(item.id);

  if (!Number.isFinite(id)) {
    return null;
  }

  const title = getAnimeTitle(item);

  const description =
    toNullableString(item.description) ??
    '';

  const score =
    toNullableNumber(item.score);

  const episodes =
    toNullableNumber(item.episodes);

  const duration =
    toNullableNumber(item.duration);

  const format =
    toNullableString(item.format) ??
    toNullableString(item.kind);

  const status =
    toNullableString(item.status);

  const bannerImage =
    toNullableString(item.bannerImage);

  return {
    id,

    idMal: toNullableNumber(item.idMal) ?? toNullableNumber(item.mal_id),
    mal_id: toNullableNumber(item.mal_id) ?? toNullableNumber(item.idMal),
    episodesAired: toNullableNumber(item.episodesAired) ?? toNullableNumber(item.episodes_aired),

    title,

    description,

    score,

    episodes,

    duration,

    status,

    format,

    genres: toStringArray(
      item.genres,
    ),

    studios: toStudioArray(
      item.studios,
    ),

    startDate:
      toAnimeDate(item.startDate),

    endDate:
      toAnimeDate(item.endDate),

    coverImage:
      getCoverImage(item),

    bannerImage,
  };
}

type StorageCache<T> = {
  raw: string | null;
  value: T;
};

const listCache: StorageCache<AnimeListItem[]> = {
  raw: null,
  value: [],
};

const favoritesCache: StorageCache<AnimeListItem[]> = {
  raw: null,
  value: [],
};

const progressCache: StorageCache<Record<string, number>> = {
  raw: null,
  value: {},
};

const historyCache: StorageCache<AnimeHistoryEntry[]> = {
  raw: null,
  value: [],
};

function readStoredAnimeArray(
  key: string,
  cache: StorageCache<AnimeListItem[]>,
  errorLabel: string,
): AnimeListItem[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const rawString = localStorage.getItem(key) || '[]';

  if (cache.raw === rawString) {
    return cache.value;
  }

  try {
    const raw: unknown = JSON.parse(rawString);

    if (!Array.isArray(raw)) {
      cache.raw = rawString;
      cache.value = [];
      return cache.value;
    }

    cache.raw = rawString;
    cache.value = raw
      .map(normalizeStoredItem)
      .filter(
        (item): item is AnimeListItem =>
          item !== null,
      );

    return cache.value;
  } catch (error) {
    console.error(errorLabel, error);
    cache.raw = rawString;
    cache.value = [];
    return cache.value;
  }
}

export function readAnimeList(): AnimeListItem[] {
  return readStoredAnimeArray(
    ANIME_LIST_STORAGE_KEY,
    listCache,
    'Не удалось прочитать список аниме:',
  );
}

export function writeAnimeList(
  list: AnimeListItem[],
): void {
  if (typeof window === 'undefined') {
    return;
  }

  const raw = JSON.stringify(list);

  localStorage.setItem(
    ANIME_LIST_STORAGE_KEY,
    raw,
  );

  listCache.raw = raw;
  listCache.value = list;
}

export function readAnimeFavorites(): AnimeListItem[] {
  return readStoredAnimeArray(
    ANIME_FAVORITES_STORAGE_KEY,
    favoritesCache,
    'Не удалось прочитать избранное:',
  );
}

export function isAnimeFavorite(
  animeId: string | number,
): boolean {
  return readAnimeFavorites().some(
    (anime) =>
      anime.id === Number(animeId),
  );
}

export function toggleAnimeFavorite(
  anime: AnimeListItem,
): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const favorites = readAnimeFavorites();

  const exists = favorites.some(
    (item) => item.id === anime.id,
  );

  const next = exists
    ? favorites.filter(
        (item) => item.id !== anime.id,
      )
    : [anime, ...favorites];

  const raw = JSON.stringify(next);

  localStorage.setItem(
    ANIME_FAVORITES_STORAGE_KEY,
    raw,
  );

  favoritesCache.raw = raw;
  favoritesCache.value = next;

  window.dispatchEvent(
    new Event('anime-favorites-changed'),
  );

  return !exists;
}

export function addAnimeToList(
  anime: AnimeListItem,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  const list = readAnimeList();

  const next = [
    anime,
    ...list.filter(
      (item) => item.id !== anime.id,
    ),
  ];

  writeAnimeList(next);

  window.dispatchEvent(
    new Event('anime-list-changed'),
  );
}

export function removeAnimeFromList(
  animeId: string | number,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  const next = readAnimeList().filter(
    (item) => item.id !== Number(animeId),
  );

  writeAnimeList(next);

  window.dispatchEvent(
    new Event('anime-list-changed'),
  );
}

function readProgressMap(): Record<string, number> {
  if (typeof window === 'undefined') {
    return {};
  }

  const rawString =
    localStorage.getItem(
      ANIME_PROGRESS_STORAGE_KEY,
    ) || '{}';

  if (progressCache.raw === rawString) {
    return progressCache.value;
  }

  try {
    const raw: unknown = JSON.parse(rawString);

    if (!isObject(raw)) {
      progressCache.raw = rawString;
      progressCache.value = {};
      return progressCache.value;
    }

    const map: Record<string, number> = {};

    for (const [key, value] of Object.entries(raw)) {
      const episode = toNullableNumber(value);

      if (episode !== null && episode > 0) {
        map[key] = episode;
      }
    }

    progressCache.raw = rawString;
    progressCache.value = map;

    return map;
  } catch (error) {
    console.error(
      'Не удалось прочитать прогресс просмотра:',
      error,
    );

    progressCache.raw = rawString;
    progressCache.value = {};
    return progressCache.value;
  }
}

/**
 * Один снимок прогресса для списков/трекера.
 * Позволяет не JSON.parse localStorage по несколько раз на каждую карточку.
 */
export function readAnimeProgressMap(): Readonly<Record<string, number>> {
  return readProgressMap();
}

export function getAnimeProgress(
  animeId: string | number,
): number {
  return readProgressMap()[String(animeId)] ?? 0;
}

export function setAnimeProgress(
  animeId: string | number,
  episode: number,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  const map = {
    ...readProgressMap(),
  };

  map[String(animeId)] = Math.max(
    0,
    Math.floor(episode),
  );

  const raw = JSON.stringify(map);

  localStorage.setItem(
    ANIME_PROGRESS_STORAGE_KEY,
    raw,
  );

  progressCache.raw = raw;
  progressCache.value = map;

  window.dispatchEvent(
    new Event('anime-progress-changed'),
  );
}

export function readWatchHistory(): AnimeHistoryEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const rawString =
    localStorage.getItem(
      ANIME_HISTORY_STORAGE_KEY,
    ) || '[]';

  if (historyCache.raw === rawString) {
    return historyCache.value;
  }

  try {
    const raw: unknown = JSON.parse(rawString);

    if (!Array.isArray(raw)) {
      historyCache.raw = rawString;
      historyCache.value = [];
      return historyCache.value;
    }

    historyCache.raw = rawString;
    historyCache.value = raw
      .map((entry) => {
        if (!isObject(entry)) {
          return null;
        }

        const item = normalizeStoredItem(entry);

        if (!item) {
          return null;
        }

        return {
          ...item,
          lastViewedAt:
            toNullableNumber(
              entry.lastViewedAt,
            ) ?? 0,
          viewCount: Math.max(
            1,
            toNullableNumber(
              entry.viewCount,
            ) ?? 1,
          ),
        } satisfies AnimeHistoryEntry;
      })
      .filter(
        (entry): entry is AnimeHistoryEntry =>
          entry !== null,
      )
      .sort(
        (a, b) =>
          b.lastViewedAt - a.lastViewedAt,
      );

    return historyCache.value;
  } catch (error) {
    console.error(
      'Не удалось прочитать историю просмотра:',
      error,
    );

    historyCache.raw = rawString;
    historyCache.value = [];
    return historyCache.value;
  }
}

export function recordAnimeView(
  anime: AnimeListItem,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  const history = readWatchHistory();
  const now = Date.now();

  const existing = history.find(
    (item) => item.id === anime.id,
  );

  const nextEntry: AnimeHistoryEntry = {
    ...anime,
    lastViewedAt: now,
    viewCount: (existing?.viewCount ?? 0) + 1,
  };

  const next = [
    nextEntry,
    ...history.filter(
      (item) => item.id !== anime.id,
    ),
  ].slice(0, 40);

  const raw = JSON.stringify(next);

  localStorage.setItem(
    ANIME_HISTORY_STORAGE_KEY,
    raw,
  );

  historyCache.raw = raw;
  historyCache.value = next;

  window.dispatchEvent(
    new Event('anime-history-changed'),
  );
}

export function getWatchingStateFromProgress(
  item: Pick<AnimeListItem, 'id' | 'status' | 'episodes'>,
  progress: number,
): 'all' | 'watching' | 'watched' {
  if (progress <= 0) {
    return 'all';
  }

  const availableEpisodes =
    item.episodes && item.episodes > 0
      ? item.episodes
      : null;

  if (
    ['FINISHED', 'released', 'Вышло'].includes(item.status ?? '') &&
    availableEpisodes &&
    progress >= availableEpisodes
  ) {
    return 'watched';
  }

  return 'watching';
}

export function getWatchingState(
  item: Pick<AnimeListItem, 'id' | 'status' | 'episodes'>,
): 'all' | 'watching' | 'watched' {
  return getWatchingStateFromProgress(
    item,
    getAnimeProgress(item.id),
  );
}
