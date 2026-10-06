/** Small per-process cache for public, non-personalised lookup results only. */
export function createPublicResultCache<T>(options: {
  ttlMs: number;
  maxEntries: number;
  cacheWhen: (value: T) => boolean;
}) {
  const cache = new Map<string, {value: T; expiresAt: number}>();
  const pending = new Map<string, Promise<T>>();
  return async (key: string, load: () => Promise<T>): Promise<T> => {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
    cache.delete(key);
    const inflight = pending.get(key);
    if (inflight) return inflight;
    if (pending.size >= options.maxEntries) return load();
    const request = Promise.resolve().then(load);
    pending.set(key, request);
    try {
      const value = await request;
      if (options.cacheWhen(value)) {
        cache.set(key, {value, expiresAt: Date.now() + options.ttlMs});
        while (cache.size > options.maxEntries) cache.delete(cache.keys().next().value!);
      }
      return value;
    } finally {
      if (pending.get(key) === request) pending.delete(key);
    }
  };
}
