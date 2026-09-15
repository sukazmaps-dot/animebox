import type { Anime } from '@/types/anime';
import {
  extractHlsVideos,
  getEpisodeFromList,
  getExternalPlayer,
  type AniLibriaVideo,
} from '@/lib/anilibria';
import {
  animeSearchTitles,
  normalizeReleaseTitle,
} from '@/lib/release-match';

export type SourceAvailabilityStatus =
  | 'available'
  | 'unavailable'
  | 'unknown';

export type SourceAvailability = {
  status: SourceAvailabilityStatus;
  hls: AniLibriaVideo[];
  externalPlayer: string | null;
  provider: 'anilibria-v3' | 'anilibria-v1' | null;
  reason: string;
};

type SourcePayload = {
  hls: AniLibriaVideo[];
  externalPlayer: string | null;
};

type ResolveResult = {
  result: SourcePayload | null;
  uncertain: boolean;
};

class UnknownProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownProviderError';
  }
}

const CURRENT_API_BASE = 'https://anilibria.top/api/v1';
const LEGACY_API_BASE = 'https://api.anilibria.tv/v3';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function makeAbortError(): Error {
  const error = new Error('Source lookup aborted');
  error.name = 'AbortError';
  return error;
}

function cleanQuery(value: string): string {
  return value
    .replace(/[()[\]{}"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCandidates(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];

  for (const key of ['data', 'list', 'releases', 'items']) {
    if (Array.isArray(value[key])) {
      return value[key];
    }
  }

  if (isRecord(value.data)) {
    return getCandidates(value.data);
  }

  return [];
}

function getAlias(value: unknown): string | null {
  if (!isRecord(value)) return null;

  const name = isRecord(value.name) ? value.name : null;
  const alias = value.alias ?? value.code ?? name?.alias;

  return typeof alias === 'string' && alias.trim()
    ? alias.trim()
    : null;
}

function getTitleValues(value: unknown): string[] {
  if (!isRecord(value)) return [];

  const values: string[] = [];
  const add = (candidate: unknown) => {
    if (typeof candidate === 'string' && candidate.trim()) {
      values.push(candidate.trim());
    }
  };

  for (const key of [
    'title',
    'russian',
    'english',
    'romaji',
    'native',
    'main',
  ]) {
    add(value[key]);
  }

  for (const key of ['name', 'names']) {
    const nested = value[key];
    if (typeof nested === 'string') {
      add(nested);
      continue;
    }

    if (!isRecord(nested)) continue;

    for (const nestedKey of [
      'main',
      'russian',
      'english',
      'romaji',
      'native',
      'ru',
      'en',
      'jp',
    ]) {
      add(nested[nestedKey]);
    }
  }

  return values;
}

function titleLooksRelated(value: unknown, query: string): boolean {
  const normalizedQuery = normalizeReleaseTitle(query);
  if (!normalizedQuery) return false;

  return getTitleValues(value).some((title) => {
    const normalizedTitle = normalizeReleaseTitle(title);
    return (
      normalizedTitle === normalizedQuery ||
      normalizedTitle.includes(normalizedQuery) ||
      normalizedQuery.includes(normalizedTitle)
    );
  });
}

function getLegacyPlayerHost(value: unknown): unknown {
  if (!isRecord(value)) return undefined;
  return isRecord(value.player) ? value.player.host : value.host;
}

function getLegacyPlayerList(value: unknown): unknown {
  if (!isRecord(value)) return undefined;

  if (isRecord(value.player)) {
    return value.player.list ?? value.player.episodes;
  }

  return value.list ?? value.episodes;
}

function getCurrentReleaseRoot(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return isRecord(value.data) ? value.data : value;
}

function getCurrentEpisodes(value: unknown): unknown {
  const root = getCurrentReleaseRoot(value);
  if (root.episodes !== undefined) return root.episodes;
  if (isRecord(root.player)) {
    return root.player.list ?? root.player.episodes;
  }
  return root.list;
}

function getCurrentEpisode(
  release: unknown,
  episodeNumber: number,
): unknown {
  return getEpisodeFromList(
    getCurrentEpisodes(release),
    episodeNumber,
  );
}

function normalizeStreamUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  const url = value.trim();
  if (url.startsWith('//')) return `https:${url}`;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `https://anilibria.top${url}`;
  return url;
}

function getCurrentExternalPlayer(value: unknown): string | null {
  const root = getCurrentReleaseRoot(value);
  const candidate =
    root.external_player ??
    root.externalPlayer ??
    root.iframe ??
    root.embed;

  const url = normalizeStreamUrl(candidate);
  return url || getExternalPlayer(value);
}

function buildLegacySource(
  release: unknown,
  episodeNumber: number,
): SourcePayload {
  const episode = getEpisodeFromList(
    getLegacyPlayerList(release),
    episodeNumber,
  );

  if (!episode) {
    return {
      hls: [],
      externalPlayer: null,
    };
  }

  return {
    hls: extractHlsVideos(
      episode,
      getLegacyPlayerHost(release),
    ),
    externalPlayer:
      getExternalPlayer(episode) ||
      getExternalPlayer(release),
  };
}

function buildCurrentSource(
  release: unknown,
  episodeNumber: number,
): SourcePayload {
  const episode = getCurrentEpisode(release, episodeNumber);

  if (!episode) {
    return {
      hls: [],
      externalPlayer: getCurrentExternalPlayer(release),
    };
  }

  const root = getCurrentReleaseRoot(release);
  const host = isRecord(root.player) ? root.player.host : root.host;

  return {
    hls: extractHlsVideos(episode, host),
    externalPlayer:
      getCurrentExternalPlayer(episode) ||
      getCurrentExternalPlayer(release),
  };
}

async function fetchJson(
  url: string,
  parentSignal?: AbortSignal,
  timeoutMs = 3500,
): Promise<unknown | null> {
  if (parentSignal?.aborted) throw makeAbortError();

  const controller = new AbortController();
  const abortFromParent = () => controller.abort();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  parentSignal?.addEventListener('abort', abortFromParent, { once: true });

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'AnimeBox/1.0',
      },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (response.status === 404) return null;

    if (response.status === 429 || response.status >= 500) {
      throw new UnknownProviderError(`Provider HTTP ${response.status}`);
    }

    if (!response.ok) {
      throw new UnknownProviderError(`Provider HTTP ${response.status}`);
    }

    try {
      return await response.json();
    } catch {
      throw new UnknownProviderError('Provider returned invalid JSON');
    }
  } catch (error) {
    if (parentSignal?.aborted) throw makeAbortError();
    if (error instanceof UnknownProviderError) throw error;

    if (error instanceof Error && error.name === 'AbortError') {
      throw new UnknownProviderError('Provider request timed out');
    }

    throw new UnknownProviderError('Provider request failed');
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
}

async function resolveLegacySource(
  query: string,
  episodeNumber: number,
  signal?: AbortSignal,
): Promise<ResolveResult> {
  const url = new URL(`${LEGACY_API_BASE}/title/search`);
  url.searchParams.set('search', query);
  url.searchParams.set('limit', '5');

  const data = await fetchJson(url.toString(), signal);
  const candidates = getCandidates(data).slice(0, 5);

  if (candidates.length === 0) {
    return { result: null, uncertain: false };
  }

  let uncertain = false;

  for (const candidate of candidates) {
    if (!titleLooksRelated(candidate, query)) {
      uncertain = true;
      continue;
    }

    const source = buildLegacySource(candidate, episodeNumber);
    if (source.hls.length > 0 || source.externalPlayer) {
      return { result: source, uncertain: false };
    }

    // Релиз найден, но структура ответа не позволяет подтвердить серию.
    uncertain = true;
  }

  return { result: null, uncertain };
}

async function resolveCurrentSource(
  query: string,
  episodeNumber: number,
  signal?: AbortSignal,
): Promise<ResolveResult> {
  const searchUrl = new URL(`${CURRENT_API_BASE}/app/search/releases`);
  searchUrl.searchParams.set('query', query);

  const searchData = await fetchJson(searchUrl.toString(), signal);
  const candidates = getCandidates(searchData).slice(0, 3);

  if (candidates.length === 0) {
    return { result: null, uncertain: false };
  }

  let uncertain = false;

  for (const candidate of candidates) {
    const alias = getAlias(candidate);

    if (!alias || !titleLooksRelated(candidate, query)) {
      uncertain = true;
      continue;
    }

    let release: unknown | null;
    try {
      release = await fetchJson(
        `${CURRENT_API_BASE}/anime/releases/${encodeURIComponent(alias)}`,
        signal,
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      uncertain = true;
      continue;
    }

    if (!release) {
      uncertain = true;
      continue;
    }

    if (!titleLooksRelated(release, query)) {
      uncertain = true;
      continue;
    }

    const source = buildCurrentSource(release, episodeNumber);
    if (source.hls.length > 0 || source.externalPlayer) {
      return { result: source, uncertain: false };
    }

    uncertain = true;
  }

  return { result: null, uncertain };
}

function emptyResult(
  status: SourceAvailabilityStatus,
  reason: string,
): SourceAvailability {
  return {
    status,
    hls: [],
    externalPlayer: null,
    provider: null,
    reason,
  };
}

export async function checkAnimeSourceAvailability(
  anime: Anime,
  episodeNumber: number,
  options: { signal?: AbortSignal } = {},
): Promise<SourceAvailability> {
  if (!Number.isInteger(episodeNumber) || episodeNumber < 1) {
    return emptyResult('unknown', 'Некорректный номер серии.');
  }

  const queries = Array.from(
    new Set(
      animeSearchTitles(anime)
        .map(cleanQuery)
        .filter(Boolean),
    ),
  ).slice(0, 3);

  if (queries.length === 0) {
    return emptyResult('unknown', 'У аниме нет названия для поиска.');
  }

  let hadProviderResponse = false;
  let hadUncertainResult = false;
  const lookupController = new AbortController();
  const abortFromParent = () => lookupController.abort();
  const lookupTimeout = setTimeout(
    () => lookupController.abort(),
    12000,
  );

  if (options.signal?.aborted) {
    throw makeAbortError();
  }

  options.signal?.addEventListener('abort', abortFromParent, { once: true });

  try {
    for (const query of queries) {
      for (const [provider, resolver] of [
        ['anilibria-v3', resolveLegacySource],
        ['anilibria-v1', resolveCurrentSource],
      ] as const) {
        try {
          const attempt = await resolver(
            query,
            episodeNumber,
            lookupController.signal,
          );
          hadProviderResponse = true;
          hadUncertainResult ||= attempt.uncertain;

          if (attempt.result) {
            return {
              status: 'available',
              hls: attempt.result.hls,
              externalPlayer: attempt.result.externalPlayer,
              provider,
              reason: '',
            };
          }
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            throw error;
          }

          hadUncertainResult = true;
        }
      }
    }

    if (hadUncertainResult || !hadProviderResponse) {
      return emptyResult(
        'unknown',
        'Проверка видеоисточника временно не удалась.',
      );
    }

    return emptyResult(
      'unavailable',
      'Источник этой серии не найден.',
    );
  } finally {
    clearTimeout(lookupTimeout);
    options.signal?.removeEventListener('abort', abortFromParent);
  }
}


/*
 * Лёгкая проверка для каталогов/карточек.
 *
 * ВАЖНО:
 * - available   -> источник подтверждён, карточку показываем;
 * - unavailable -> провайдеры корректно ответили и релиз не найден, карточку скрываем;
 * - unknown     -> timeout/429/ошибка/неоднозначность, карточку НЕ скрываем.
 *
 * Кэш здесь нужен, чтобы главная и поиск не били видеопровайдеров
 * повторно при каждом рендере. На serverless холодный старт очистит Map,
 * поэтому HTTP-кэш endpoint'а всё равно остаётся вторым уровнем защиты.
 */
type CatalogAvailabilityCacheEntry = {
  result: SourceAvailability;
  expiresAt: number;
};

const catalogAvailabilityCache = new Map<
  string,
  CatalogAvailabilityCacheEntry
>();

function getCatalogAvailabilityKey(anime: Anime): string {
  const stableId =
    typeof anime.idMal === 'number' && anime.idMal > 0
      ? `mal:${anime.idMal}`
      : `anilist:${anime.id}`;

  const titles = animeSearchTitles(anime)
    .map(normalizeReleaseTitle)
    .filter(Boolean)
    .slice(0, 3)
    .join('|');

  return `${stableId}:${titles}`;
}

export async function checkAnimeCatalogAvailability(
  anime: Anime,
  options: { signal?: AbortSignal } = {},
): Promise<SourceAvailability> {
  const key = getCatalogAvailabilityKey(anime);
  const now = Date.now();
  const cached = catalogAvailabilityCache.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  // Для каталога достаточно проверить первую серию.
  // Если релиз существует, но серия не подтверждена, основной алгоритм
  // вернёт unknown, а не unavailable — такую карточку мы не скрываем.
  const checked = await checkAnimeSourceAvailability(anime, 1, options);

  const result: SourceAvailability = {
    status: checked.status,
    hls: [],
    externalPlayer: null,
    provider: checked.provider,
    reason: checked.reason,
  };

  const ttlMs =
    result.status === 'unknown'
      ? 90_000
      : 6 * 60 * 60 * 1000;

  catalogAvailabilityCache.set(key, {
    result,
    expiresAt: now + ttlMs,
  });

  return result;
}
