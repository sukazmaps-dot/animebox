import type { Anime } from '@/types/anime';
import type { SmartDiscoveryIntent } from '@/lib/smart-discovery';

type DiscoverySeed = {
  id: number;
  slug?: string | null;
  title?: Anime['title'];
  russian?: string | null;
  episodes?: number | null;
  genres?: string[];
  startDate?: Anime['startDate'];
  coverImage?: Anime['coverImage'];
};

export type SmartDiscoveryResponse = {
  items: Anime[];
  intent?: SmartDiscoveryIntent;
  seed: DiscoverySeed | null;
  meta?: {
    relaxed?: boolean;
    resolvedBy?: string | null;
    candidateCount?: number;
    seedResolved?: boolean;
  };
};

type CacheEntry = {
  expiresAt: number;
  data: SmartDiscoveryResponse;
};

const CACHE_TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(query: string, limit: number) {
  return `${query.normalize('NFKC').trim().toLocaleLowerCase('ru-RU')}::${limit}`;
}

function readCache(key: string) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

function writeCache(key: string, data: SmartDiscoveryResponse) {
  cache.delete(key);
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, data });
  while (cache.size > 60) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
  return data;
}

export async function getSmartDiscovery(
  query: string,
  limit: number,
  signal?: AbortSignal,
): Promise<SmartDiscoveryResponse> {
  const key = cacheKey(query, limit);
  const cached = readCache(key);
  if (cached) return cached;

  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const response = await fetch(`/api/discovery?${params.toString()}`, {
    signal,
    cache: 'default',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) throw new Error(`Discovery HTTP ${response.status}`);
  const payload = (await response.json()) as Partial<SmartDiscoveryResponse>;
  const data: SmartDiscoveryResponse = {
    items: Array.isArray(payload.items) ? payload.items : [],
    seed: payload.seed ?? null,
    intent: payload.intent,
    meta: payload.meta,
  };
  return writeCache(key, data);
}
