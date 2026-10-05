/** Coalesce concurrent public upstream requests within one server instance.
 * Never use this helper for authenticated or personalised requests.
 * Completed responses remain owned by Next's fetch cache, not this map.
 */
export function createSharedPublicFetch(maxPending = 64) {
  const pending = new Map<string, Promise<Response>>();
  return async (key: string, load: () => Promise<Response>): Promise<Response> => {
    const existing = pending.get(key);
    if (existing) return (await existing).clone();
    // Bound cardinality without evicting work another caller is awaiting.
    if (pending.size >= maxPending) return load();
    const request = Promise.resolve().then(load);
    pending.set(key, request);
    try {
      return (await request).clone();
    } finally {
      if (pending.get(key) === request) pending.delete(key);
    }
  };
}
