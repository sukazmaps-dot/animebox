/** Per-process cache for public data only. Byte accounting is a retained-size
 * estimate, not V8 heap measurement; binary callers provide an exact sizeOf. */
export function createPublicResultCache<T>(options: {
  ttlMs: number;
  maxEntries: number;
  maxBytes?: number;
  sizeOf?: (value: T) => number;
  staleIfErrorMs?: number;
  cacheWhen: (value: T) => boolean;
}) {
  const cache = new Map<string, {value: T; expiresAt: number; bytes: number}>();
  const pending = new Map<string, {promise: Promise<T>; controller: AbortController; waiters: number}>();
  const maxBytes = options.maxBytes ?? 8 * 1024 * 1024;
  let retainedBytes = 0;
  let nextSweep = 0;
  function remove(key: string) {
    const entry = cache.get(key);
    if (entry) retainedBytes -= entry.bytes;
    cache.delete(key);
  }
  function sweep(now: number) {
    if (now < nextSweep) return;
    nextSweep = now + 1000;
    for (const [key, entry] of cache) {
      if (entry.expiresAt + (options.staleIfErrorMs ?? 0) <= now) remove(key);
    }
  }
  function subscribe(entry: {promise: Promise<T>; controller: AbortController; waiters: number}, signal?: AbortSignal): Promise<T> {
    entry.waiters++;
    return new Promise<T>((resolve, reject) => {
      let done = false;
      const finish = (callback: () => void) => {
        if (done) return;
        done = true;
        signal?.removeEventListener('abort', abort);
        entry.waiters--;
        if (!entry.waiters) entry.controller.abort();
        callback();
      };
      const abort = () => finish(() => reject(signal?.reason ?? new Error('Request cancelled')));
      signal?.addEventListener('abort', abort, {once: true});
      entry.promise.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
      if (signal?.aborted) abort();
    });
  }
  const read = async (key: string, load: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> => {
    signal?.throwIfAborted();
    const now = Date.now();
    sweep(now);
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now) return hit.value;
    const inflight = pending.get(key);
    if (inflight && !inflight.controller.signal.aborted) return subscribe(inflight, signal);
    // Callers doing expensive work also use a bounded admission gate. Do not
    // retain unlimited pending keys here, or introduce a second cache layer.
    if (pending.size >= options.maxEntries) return load(signal ?? new AbortController().signal);
    const controller = new AbortController();
    const entry = {promise: null as unknown as Promise<T>, controller, waiters: 0};
    entry.promise = Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return load(controller.signal);
    }).then(value => {
      if (!controller.signal.aborted && options.cacheWhen(value)) {
        // JSON is measured once at admission, never on a hit. Two bytes per
        // serialized UTF-8 byte conservatively budget strings/object overhead.
        const bytes = (options.sizeOf ? options.sizeOf(value) : 2 * Buffer.byteLength(JSON.stringify(value) ?? ''))
          + 2 * Buffer.byteLength(key) + 128;
        if (Number.isFinite(bytes) && bytes >= 0 && bytes <= maxBytes) {
          remove(key);
          cache.set(key, {value, bytes, expiresAt: Date.now() + options.ttlMs});
          retainedBytes += bytes;
          while (cache.size > options.maxEntries || retainedBytes > maxBytes) remove(cache.keys().next().value!);
        }
      }
      return value;
    }).catch(error => {
      if (!controller.signal.aborted && hit && hit.expiresAt + (options.staleIfErrorMs ?? 0) > Date.now()) return hit.value;
      throw error;
    }).finally(() => {
      if (pending.get(key) === entry) pending.delete(key);
    });
    pending.set(key, entry);
    return subscribe(entry, signal);
  };
  return Object.assign(read, {
    // Local diagnostics only: no keys, values, URLs, identities or HTTP endpoint.
    stats: () => { sweep(Date.now()); return {entries: cache.size, retainedBytes, pending: pending.size, maxBytes}; },
  });
}
