const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8_000;
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
const BROWSER_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const inFlightOriginFetches = new Map();

const EXACT_ALLOWED_HOSTS = new Set([
  'shikimori.me',
  'www.shikimori.me',
  'shikimori.one',
  'www.shikimori.one',
  'anilist.co',
  'www.anilist.co',
  'jikan.moe',
  'api.jikan.moe',
  'cdn.myanimelist.net',
]);

function isAllowedHost(hostname) {
  const host = hostname.toLowerCase();
  return (
    EXACT_ALLOWED_HOSTS.has(host) ||
    host.endsWith('.shikimori.me') ||
    host.endsWith('.shikimori.one') ||
    host.endsWith('.anilist.co') ||
    host.endsWith('.myanimelist.net')
  );
}

function parseSource(requestUrl) {
  const raw = requestUrl.searchParams.get('url')?.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw.startsWith('//') ? `https:${raw}` : raw);
    if (url.protocol !== 'https:' || !isAllowedHost(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function upstreamHeaders(source) {
  const headers = new Headers({
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.6',
    'User-Agent':
      'Mozilla/5.0 (compatible; AnimeBoxMedia/1.0; +https://youranimebox.com)',
  });

  const host = source.hostname.toLowerCase();
  if (
    host === 'shikimori.me' ||
    host.endsWith('.shikimori.me') ||
    host === 'shikimori.one' ||
    host.endsWith('.shikimori.one')
  ) {
    headers.set('Referer', 'https://shikimori.one/');
  }

  return headers;
}

function publicHeaders(contentType, source, cacheState) {
  return new Headers({
    'Content-Type': contentType || 'image/jpeg',
    'Cache-Control':
      `public, max-age=${BROWSER_CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=${CACHE_TTL_SECONDS}`,
    'CDN-Cache-Control':
      `public, max-age=${CACHE_TTL_SECONDS}, stale-while-revalidate=604800`,
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-AnimeBox-Media': cacheState,
    'X-AnimeBox-Origin': source.hostname,
  });
}

async function readR2(env, key, source) {
  if (!env.MEDIA_BUCKET) return null;

  const object = await env.MEDIA_BUCKET.get(key);
  if (!object) return null;

  const headers = publicHeaders(
    object.httpMetadata?.contentType || 'image/jpeg',
    source,
    'r2-hit',
  );
  if (object.httpEtag) headers.set('ETag', object.httpEtag);

  return new Response(object.body, { status: 200, headers });
}

async function fetchOrigin(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(source, {
      headers: upstreamHeaders(source),
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) {
      return { response: null, error: `origin-${response.status}` };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return { response: null, error: 'origin-not-image' };
    }

    const declaredLength = Number(response.headers.get('content-length') || '0');
    if (declaredLength > MAX_IMAGE_BYTES) {
      return { response: null, error: 'origin-too-large' };
    }

    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) {
      return { response: null, error: 'origin-invalid-size' };
    }

    return {
      response: {
        bytes,
        contentType,
        etag: response.headers.get('etag') || undefined,
      },
      error: null,
    };
  } catch (error) {
    return {
      response: null,
      error: error?.name === 'AbortError' ? 'origin-timeout' : 'origin-fetch-failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
          'Access-Control-Allow-Headers': 'Accept',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    const requestUrl = new URL(request.url);
    if (requestUrl.pathname === '/health') {
      return Response.json({
        ok: true,
        service: 'animebox-media',
        r2: Boolean(env.MEDIA_BUCKET),
      });
    }

    if (requestUrl.pathname !== '/image') {
      return new Response('Not found', { status: 404 });
    }

    const source = parseSource(requestUrl);
    if (!source) {
      return new Response('Invalid image source', {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const hash = await sha256(source.toString());
    const key = `posters/${hash.slice(0, 2)}/${hash}`;
    const cache = caches.default;
    const cacheKey = new Request(
      `${requestUrl.origin}/cache/${hash}`,
      { method: 'GET' },
    );

    const edgeHit = await cache.match(cacheKey);
    if (edgeHit) {
      const headers = new Headers(edgeHit.headers);
      headers.set('X-AnimeBox-Media', 'edge-hit');
      return new Response(request.method === 'HEAD' ? null : edgeHit.body, {
        status: edgeHit.status,
        headers,
      });
    }

    const r2Hit = await readR2(env, key, source);
    if (r2Hit) {
      ctx.waitUntil(cache.put(cacheKey, r2Hit.clone()));
      return request.method === 'HEAD'
        ? new Response(null, { status: 200, headers: r2Hit.headers })
        : r2Hit;
    }

    let originPromise = inFlightOriginFetches.get(hash);
    if (!originPromise) {
      originPromise = fetchOrigin(source).finally(() => {
        inFlightOriginFetches.delete(hash);
      });
      inFlightOriginFetches.set(hash, originPromise);
    }

    const origin = await originPromise;
    if (!origin.response) {
      return new Response('Image unavailable', {
        status: 502,
        headers: {
          'Cache-Control': 'public, max-age=30',
          'X-AnimeBox-Media': origin.error || 'origin-failed',
        },
      });
    }

    const { bytes, contentType, etag } = origin.response;
    const headers = publicHeaders(contentType, source, 'origin-fill');
    if (etag) headers.set('ETag', etag);

    if (env.MEDIA_BUCKET) {
      ctx.waitUntil(
        env.MEDIA_BUCKET.put(key, bytes, {
          httpMetadata: {
            contentType,
            cacheControl:
              `public, max-age=${BROWSER_CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}`,
          },
          customMetadata: {
            source: source.toString(),
          },
        }),
      );
    }

    const response = new Response(bytes, { status: 200, headers });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    return request.method === 'HEAD'
      ? new Response(null, { status: 200, headers })
      : response;
  },
};
