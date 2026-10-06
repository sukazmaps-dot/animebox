/** Synchronous lock shared by the load-more button and intersection observer. */
export function createCatalogPageGate() {
  let blocked = false;
  return {
    block() { blocked = true; },
    release() { blocked = false; },
    claim(state: {
      loading: boolean;
      hasNextPage: boolean;
      failed: boolean;
      query: string;
      liveQuery: string;
    }) {
      if (blocked || state.loading || state.failed || !state.hasNextPage ||
          state.query !== state.liveQuery) return false;
      blocked = true;
      return true;
    },
  };
}

/** Recheck ownership after the optional preview settles, including rejection. */
export async function waitForCurrentPreview<T>(
  preview: Promise<T>,
  isCurrent: () => boolean,
): Promise<{ current: false } | { current: true; preview: T | null }> {
  const result = await preview.catch(() => null);
  return isCurrent() ? { current: true, preview: result } : { current: false };
}
