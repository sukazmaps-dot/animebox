/* AnimeBox public/offline cache.
 * Never caches HTML, auth, profile, watch progress or private API responses.
 */
const VERSION = 'animebox-mobile-v1';
const STATIC_CACHE = `${VERSION}-static`;
const IMAGE_CACHE = `${VERSION}-images`;
const DATA_CACHE = `${VERSION}-public-data`;

const PRECACHE = [
  '/anime-placeholder.svg',
  '/brand/brand-mark.webp',
  '/brand/favicon.png',
  '/manifest.webmanifest',
];

const PUBLIC_DATA_PATHS = new Set([
  '/api/anime',
  '/api/schedule',
]);

async function putBounded(cacheName, request, response, maxEntries) {
  if (!response || !response.ok) return;

  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());

  const keys = await cache.keys();
  const overflow = keys.length - maxEntries;

  if (overflow > 0) {
    await Promise.all(keys.slice(0, overflow).map((key) => cache.delete(key)));
  }
}

async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    void putBounded(cacheName, request, response, maxEntries);
  }

  return response;
}

async function staleWhileRevalidate(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) {
        void putBounded(cacheName, request, response, maxEntries);
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    void network;
    return cached;
  }

  const response = await network;
  if (response) return response;

  return new Response('', { status: 504, statusText: 'Offline' });
}

async function networkFirst(request, cacheName, maxEntries) {
  try {
    const response = await fetch(request);

    if (response.ok) {
      void putBounded(cacheName, request, response, maxEntries);
    }

    return response;
  } catch {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    if (cached) return cached;

    return new Response(
      JSON.stringify({ error: 'offline', cached: false }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      },
    );
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.allSettled(
      PRECACHE.map(async (url) => {
        const request = new Request(url, { cache: 'reload' });
        const response = await fetch(request);

        if (response.ok) {
          await putBounded(STATIC_CACHE, request, response, 80);
        }
      }),
    ).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                name.startsWith('animebox-mobile-') &&
                ![STATIC_CACHE, IMAGE_CACHE, DATA_CACHE].includes(name),
            )
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  const accept = request.headers.get('accept') || '';

  // Never cache document/navigation responses. They can contain session-aware
  // chrome and must always follow the normal Next.js auth/cache contract.
  if (
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    accept.includes('text/html')
  ) {
    return;
  }

  if (PUBLIC_DATA_PATHS.has(url.pathname)) {
    event.respondWith(networkFirst(request, DATA_CACHE, 36));
    return;
  }

  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/brand/') ||
    url.pathname.startsWith('/ui/') ||
    url.pathname === '/anime-placeholder.svg' ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE, 120));
    return;
  }

  if (
    url.pathname.startsWith('/_next/image') ||
    url.pathname === '/api/image'
  ) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE, 140));
  }
});
