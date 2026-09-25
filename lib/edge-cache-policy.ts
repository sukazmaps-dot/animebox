export type PublicApiCacheProfile = {
  browserSeconds: number;
  edgeSeconds: number;
  staleWhileRevalidateSeconds: number;
};

const PUBLIC_CACHEABLE_API_PATHS = new Set([
  '/api/anime',
  '/api/recommendations',
  '/api/schedule',
  '/api/watch-party/rooms',
]);

export function isPublicCacheableApiRequest(pathname: string, method: string) {
  const normalizedMethod = method.toUpperCase();
  return (
    (normalizedMethod === 'GET' || normalizedMethod === 'HEAD') &&
    PUBLIC_CACHEABLE_API_PATHS.has(pathname)
  );
}

export function publicApiCacheHeaders(
  profile: PublicApiCacheProfile,
): Record<string, string> {
  const browser = Math.max(0, Math.floor(profile.browserSeconds));
  const edge = Math.max(browser, Math.floor(profile.edgeSeconds));
  const swr = Math.max(0, Math.floor(profile.staleWhileRevalidateSeconds));
  const edgeValue = `public, max-age=${edge}, stale-while-revalidate=${swr}`;

  return {
    'Cache-Control': `public, max-age=${browser}, s-maxage=${edge}, stale-while-revalidate=${swr}`,
    'CDN-Cache-Control': edgeValue,
    'Vercel-CDN-Cache-Control': edgeValue,
    'Cloudflare-CDN-Cache-Control': edgeValue,
  };
}

export function privateNoStoreHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'private, no-store',
    'CDN-Cache-Control': 'no-store',
    'Vercel-CDN-Cache-Control': 'no-store',
    'Cloudflare-CDN-Cache-Control': 'no-store',
  };
}
