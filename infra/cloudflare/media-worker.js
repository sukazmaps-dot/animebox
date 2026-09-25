const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ORIGIN_PIPELINE_BUDGET_MS = 5_800;
const TRANSFORM_FETCH_TIMEOUT_MS = 2_200;
const RAW_FETCH_TIMEOUT_MS = 3_200;
const RAW_RETRY_TIMEOUT_MS = 1_200;
const RAW_RETRY_DELAY_MS = 100;
const NEGATIVE_CACHE_TTL_SECONDS = 15;
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
const BROWSER_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const TRANSFORM_FALLBACK_TTL_SECONDS = 60 * 60;

const ALLOWED_WIDTHS = new Set([
  96,
  144,
  240,
  360,
  540,
  720,
  1080,
  1440,
]);
const ALLOWED_QUALITIES = new Set([60, 70, 80]);
const ALLOWED_FORMATS = new Set(['auto', 'webp', 'avif']);
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

function resolveAutoFormat(request) {
  const accept = request.headers.get('accept') || '';

  if (/image\/avif/i.test(accept)) return 'avif';
  if (/image\/webp/i.test(accept)) return 'webp';

  return null;
}

function parseVariant(requestUrl, request) {
  const rawWidth = requestUrl.searchParams.get('w');
  const rawQuality = requestUrl.searchParams.get('q');
  const rawFormat = requestUrl.searchParams.get('f');

  if (!rawWidth && !rawQuality && !rawFormat) {
    return { variant: null, error: null };
  }

  if (!rawWidth) {
    return { variant: null, error: 'variant-width-required' };
  }

  const width = Number.parseInt(rawWidth, 10);
  const quality = rawQuality
    ? Number.parseInt(rawQuality, 10)
    : 70;
  const requestedFormat = rawFormat || 'webp';

  if (!ALLOWED_WIDTHS.has(width)) {
    return { variant: null, error: 'variant-width-invalid' };
  }

  if (!ALLOWED_QUALITIES.has(quality)) {
    return { variant: null, error: 'variant-quality-invalid' };
  }

  if (!ALLOWED_FORMATS.has(requestedFormat)) {
    return { variant: null, error: 'variant-format-invalid' };
  }

  const resolvedFormat =
    requestedFormat === 'auto'
      ? resolveAutoFormat(request)
      : requestedFormat;

  return {
    variant: {
      width,
      quality,
      requestedFormat,
      resolvedFormat,
      token:
        `w${width}-q${quality}-f${resolvedFormat || 'source'}`,
    },
    error: null,
  };
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
      'Mozilla/5.0 (compatible; AnimeBoxMedia/2.0; +https://youranimebox.com)',
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

function publicHeaders(contentType, source, cacheState, variant = null) {
  const headers = new Headers({
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

  if (variant) {
    headers.set('X-AnimeBox-Variant', variant.token);
    headers.set('X-AnimeBox-Width', String(variant.width));
    headers.set('X-AnimeBox-Quality', String(variant.quality));
    headers.set(
      'X-AnimeBox-Format',
      variant.resolvedFormat || 'source',
    );

    if (variant.requestedFormat === 'auto') {
      headers.set('Vary', 'Accept');
    }
  }

  return headers;
}

function transformFallbackHeaders(contentType, source, variant, reason) {
  const headers = new Headers({
    'Content-Type': contentType || 'image/jpeg',
    'Cache-Control':
      `public, max-age=300, s-maxage=${TRANSFORM_FALLBACK_TTL_SECONDS}, stale-while-revalidate=300`,
    'CDN-Cache-Control':
      `public, max-age=${TRANSFORM_FALLBACK_TTL_SECONDS}`,
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-AnimeBox-Media': 'transform-fallback',
    'X-AnimeBox-Origin': source.hostname,
    'X-AnimeBox-Variant': variant.token,
    'X-AnimeBox-Transform-Error': reason || 'unavailable',
  });

  if (variant.requestedFormat === 'auto') {
    headers.set('Vary', 'Accept');
  }

  return headers;
}

async function readR2(env, key, source, variant) {
  if (!env.MEDIA_BUCKET) return null;

  const object = await env.MEDIA_BUCKET.get(key);
  if (!object) return null;

  const headers = publicHeaders(
    object.httpMetadata?.contentType || 'image/jpeg',
    source,
    'r2-hit',
    variant,
  );
  if (object.httpEtag) headers.set('ETag', object.httpEtag);

  return new Response(object.body, { status: 200, headers });
}

async function readImageResponse(response) {
  if (!response.ok) {
    return {
      response: null,
      error: `origin-${response.status}`,
    };
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('image/')) {
    return { response: null, error: 'origin-not-image' };
  }

  const declaredLength = Number(
    response.headers.get('content-length') || '0',
  );
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
}

async function fetchRawOrigin(source, signal) {
  const response = await fetch(source, {
    headers: upstreamHeaders(source),
    redirect: 'follow',
    signal,
  });

  return readImageResponse(response);
}

async function fetchTransformedOrigin(source, variant, signal) {
  const image = {
    fit: 'scale-down',
    width: variant.width,
    quality: variant.quality,
  };

  if (variant.resolvedFormat) {
    image.format = variant.resolvedFormat;
  }

  const response = await fetch(source, {
    headers: upstreamHeaders(source),
    redirect: 'follow',
    signal,
    cf: {
      image,
    },
  });

  const resized = response.headers.get('cf-resized') || '';

  if (!response.ok) {
    return {
      response: null,
      error: resized || `transform-${response.status}`,
    };
  }

  // When Transformations are disabled, Cloudflare can return the source
  // response without applying cf.image. Never cache that oversized body under
  // a variant R2 key.
  if (!resized) {
    return {
      response: null,
      error: 'transform-not-applied',
    };
  }

  if (/err=/i.test(resized)) {
    return {
      response: null,
      error: resized,
    };
  }

  return readImageResponse(response);
}

async function runTimedOriginAttempt(fetcher, timeoutMs, failurePrefix) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetcher(controller.signal);
  } catch (error) {
    return {
      response: null,
      error:
        error?.name === 'AbortError'
          ? `${failurePrefix}-timeout`
          : `${failurePrefix}-fetch-failed`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isRetryableRawError(error) {
  if (!error) return false;

  if (error === 'origin-fetch-failed') {
    return true;
  }

  const status = Number.parseInt(
    String(error).replace(/^origin-/, ''),
    10,
  );

  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    (status >= 500 && status <= 599)
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function remainingOriginBudget(deadlineMs) {
  return Math.max(0, deadlineMs - Date.now());
}

async function fetchRawOriginWithRetry(source, deadlineMs) {
  const firstTimeout = Math.min(
    RAW_FETCH_TIMEOUT_MS,
    remainingOriginBudget(deadlineMs),
  );

  if (firstTimeout <= 0) {
    return {
      response: null,
      error: 'origin-pipeline-timeout',
      attempts: 0,
    };
  }

  const first = await runTimedOriginAttempt(
    (signal) => fetchRawOrigin(source, signal),
    firstTimeout,
    'origin',
  );

  if (first.response || !isRetryableRawError(first.error)) {
    return {
      ...first,
      attempts: 1,
    };
  }

  const beforeRetry = remainingOriginBudget(deadlineMs);
  if (beforeRetry <= RAW_RETRY_DELAY_MS + 250) {
    return {
      ...first,
      attempts: 1,
    };
  }

  await delay(RAW_RETRY_DELAY_MS);

  const retryTimeout = Math.min(
    RAW_RETRY_TIMEOUT_MS,
    remainingOriginBudget(deadlineMs),
  );

  if (retryTimeout <= 0) {
    return {
      ...first,
      attempts: 1,
    };
  }

  const second = await runTimedOriginAttempt(
    (signal) => fetchRawOrigin(source, signal),
    retryTimeout,
    'origin',
  );

  return {
    ...second,
    attempts: 2,
  };
}

async function fetchOrigin(source, variant) {
  const deadlineMs = Date.now() + ORIGIN_PIPELINE_BUDGET_MS;
  let transformError = null;

  if (variant) {
    const transformTimeout = Math.min(
      TRANSFORM_FETCH_TIMEOUT_MS,
      remainingOriginBudget(deadlineMs),
    );

    const transformed =
      transformTimeout > 0
        ? await runTimedOriginAttempt(
            (signal) => fetchTransformedOrigin(source, variant, signal),
            transformTimeout,
            'transform',
          )
        : {
            response: null,
            error: 'transform-pipeline-timeout',
          };

    if (transformed.response) {
      return {
        response: transformed.response,
        error: null,
        transformError: null,
        rawError: null,
        rawAttempts: 0,
        transformed: true,
      };
    }

    transformError = transformed.error || 'transform-unavailable';
  }

  const raw = await fetchRawOriginWithRetry(source, deadlineMs);

  return {
    response: raw.response,
    error:
      raw.response
        ? transformError
        : raw.error || transformError || 'origin-failed',
    transformError,
    rawError: raw.response ? null : raw.error,
    rawAttempts: raw.attempts,
    transformed: false,
  };
}

function mediaFailureHeaders(source, origin) {
  const headers = new Headers({
    'Cache-Control':
      `public, max-age=${NEGATIVE_CACHE_TTL_SECONDS}, s-maxage=${NEGATIVE_CACHE_TTL_SECONDS}`,
    'CDN-Cache-Control':
      `public, max-age=${NEGATIVE_CACHE_TTL_SECONDS}`,
    'Retry-After': String(NEGATIVE_CACHE_TTL_SECONDS),
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-AnimeBox-Media': 'origin-unavailable',
    'X-AnimeBox-Origin': source.hostname,
    'X-AnimeBox-Origin-Error':
      origin.error || 'origin-failed',
    'X-AnimeBox-Transform-Error':
      origin.transformError || 'none',
    'X-AnimeBox-Raw-Error':
      origin.rawError || 'none',
    'X-AnimeBox-Origin-Attempts':
      String(origin.rawAttempts || 0),
  });

  return headers;
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
        protocol: 'variants-v3',
        reliability: 'media-shield-v1',
        r2: Boolean(env.MEDIA_BUCKET),
        originPipelineBudgetMs: ORIGIN_PIPELINE_BUDGET_MS,
        transformTimeoutMs: TRANSFORM_FETCH_TIMEOUT_MS,
        rawTimeoutMs: RAW_FETCH_TIMEOUT_MS,
        rawRetryTimeoutMs: RAW_RETRY_TIMEOUT_MS,
        rawRetryLimit: 1,
        negativeCacheTtlSeconds: NEGATIVE_CACHE_TTL_SECONDS,
        widths: [...ALLOWED_WIDTHS],
        qualities: [...ALLOWED_QUALITIES],
        formats: [...ALLOWED_FORMATS],
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

    const parsedVariant = parseVariant(requestUrl, request);
    if (parsedVariant.error) {
      return new Response('Invalid image variant', {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
          'X-AnimeBox-Media': parsedVariant.error,
        },
      });
    }

    const variant = parsedVariant.variant;
    const hash = await sha256(source.toString());

    const key = variant
      ? `posters-v3/${hash.slice(0, 2)}/${hash}/${variant.token}`
      : `posters-v3-raw/${hash.slice(0, 2)}/${hash}`;

    const cache = caches.default;
    const cacheKey = new Request(
      variant
        ? `${requestUrl.origin}/cache/v3/${hash}/${variant.token}`
        : `${requestUrl.origin}/cache/v3-raw/${hash}`,
      { method: 'GET' },
    );

    const edgeHit = await cache.match(cacheKey);
    if (edgeHit) {
      const headers = new Headers(edgeHit.headers);
      headers.set(
        'X-AnimeBox-Media',
        edgeHit.ok ? 'edge-hit' : 'negative-edge-hit',
      );
      return new Response(
        request.method === 'HEAD' ? null : edgeHit.body,
        {
          status: edgeHit.status,
          headers,
        },
      );
    }

    const r2Hit = await readR2(
      env,
      key,
      source,
      variant,
    );
    if (r2Hit) {
      ctx.waitUntil(cache.put(cacheKey, r2Hit.clone()));
      return request.method === 'HEAD'
        ? new Response(null, {
            status: 200,
            headers: r2Hit.headers,
          })
        : r2Hit;
    }

    const inFlightKey = variant
      ? `${hash}:${variant.token}`
      : hash;

    let originPromise = inFlightOriginFetches.get(inFlightKey);
    if (!originPromise) {
      originPromise = fetchOrigin(source, variant).finally(() => {
        inFlightOriginFetches.delete(inFlightKey);
      });
      inFlightOriginFetches.set(inFlightKey, originPromise);
    }

    const origin = await originPromise;
    if (!origin.response) {
      const failureResponse = new Response('Image unavailable', {
        status: 502,
        headers: mediaFailureHeaders(source, origin),
      });

      ctx.waitUntil(
        cache.put(cacheKey, failureResponse.clone()),
      );

      return request.method === 'HEAD'
        ? new Response(null, {
            status: 502,
            headers: failureResponse.headers,
          })
        : failureResponse;
    }

    const { bytes, contentType, etag } = origin.response;

    if (variant && !origin.transformed) {
      const headers = transformFallbackHeaders(
        contentType,
        source,
        variant,
        origin.error,
      );
      if (etag) headers.set('ETag', etag);

      const fallbackResponse = new Response(bytes, {
        status: 200,
        headers,
      });

      ctx.waitUntil(
        cache.put(cacheKey, fallbackResponse.clone()),
      );

      return request.method === 'HEAD'
        ? new Response(null, { status: 200, headers })
        : fallbackResponse;
    }

    const headers = publicHeaders(
      contentType,
      source,
      variant ? 'variant-fill' : 'origin-fill',
      variant,
    );
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
            variant: variant?.token || 'original',
          },
        }),
      );
    }

    const response = new Response(bytes, {
      status: 200,
      headers,
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    return request.method === 'HEAD'
      ? new Response(null, { status: 200, headers })
      : response;
  },
};
