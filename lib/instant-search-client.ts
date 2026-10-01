import type { Anime } from '@/types/anime';

export type InstantSearchPayload = {
  items: Anime[];
  query: string;
  source: 'local-index-v2';
  tookMs?: number;
  clientElapsedMs?: number;
  clientCacheStatus?: 'memory' | 'network';
  matches?: Array<{
    animeId: number;
    score: number;
    matchKind: string | null;
    matchedText: string | null;
  }>;
};

type CacheEntry = {
  expiresAt: number;
  payload: InstantSearchPayload;
};

const CACHE_TTL_MS = 3 * 60 * 1000;
const MAX_CACHE_ENTRIES = 80;
const cache = new Map<string, CacheEntry>();

function normalizeKey(query: string, limit: number) {
  return `${query.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е')}:${limit}`;
}

function readCache(key: string) {
  const entry = cache.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  cache.delete(key);
  cache.set(key, entry);
  return entry.payload;
}

function writeCache(key: string, payload: InstantSearchPayload) {
  cache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  });

  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }

  return payload;
}

export async function getInstantAnimeSearch(
  query: string,
  limit = 18,
  signal?: AbortSignal,
): Promise<InstantSearchPayload> {
  const clean = query.trim();
  const safeLimit = Math.min(30, Math.max(4, Math.trunc(limit)));
  const key = normalizeKey(clean, safeLimit);
  const cached = readCache(key);

  if (cached) {
    return {
      ...cached,
      clientElapsedMs: 0,
      clientCacheStatus: 'memory',
    };
  }

  const params = new URLSearchParams({
    q: clean,
    limit: String(safeLimit),
  });

  const startedAt =
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  const response = await fetch(
    `/api/search/instant?${params.toString()}`,
    {
      signal,
      cache: 'default',
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Instant search HTTP ${response.status}`);
  }

  const payload = (await response.json()) as InstantSearchPayload;
  const finishedAt =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  const enriched = {
    ...payload,
    items: Array.isArray(payload.items) ? payload.items : [],
    clientElapsedMs: Math.max(0, Math.round(finishedAt - startedAt)),
    clientCacheStatus: 'network' as const,
  };

  writeCache(key, enriched);
  return enriched;
}
