import { createBoundedWork } from '@/lib/bounded-work';
import { fetchImageUpstream } from '@/lib/image-upstream-server';
import { NextRequest, NextResponse } from 'next/server';
import { createPublicResultCache } from '@/lib/public-result-cache';
import { enforcePublicIpRateLimit } from '@/lib/public-api-rate-limit';
import { privateNoStoreHeaders, publicApiCacheHeaders } from '@/lib/edge-cache-policy';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const runtime = 'nodejs';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 5;

const EXACT_ALLOWED_HOSTS = new Set([
  'shikimori.io',
  'www.shikimori.io',
  'shikimori.me',
  'www.shikimori.me',
  'shikimori.one',
  'www.shikimori.one',
  'wsrv.nl',
  'anilist.co',
  'www.anilist.co',
  'jikan.moe',
  'api.jikan.moe',
]);

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();

  return (
    EXACT_ALLOWED_HOSTS.has(host) ||
    host.endsWith('.shikimori.io') ||
    host.endsWith('.shikimori.me') ||
    host.endsWith('.shikimori.one') ||
    host.endsWith('.anilist.co') ||
    host.endsWith('.cdninstagram.com') ||
    host.endsWith('.myanimelist.net')
  );
}

function normalizeUrl(value: string): URL | null {
  let raw = value.trim();
  // searchParams already decoded once. Never decode a valid URL's query again.
  for (let step = 0; step < 2 && /^(?:https?%(?:25){0,2}3a|%(?:25){0,2}2f)/i.test(raw); step++) {
    try { raw = decodeURIComponent(raw); } catch { return null; }
  }
  if (!raw) return null;

  const normalized = raw.startsWith('//')
    ? `https:${raw}`
    : raw.startsWith('/')
      ? `https://shikimori.io${raw}`
      : raw;

  try {
    const url = new URL(normalized);

    if (url.protocol !== 'https:' || url.username || url.password || url.port) {
      return null;
    }

    if (!isAllowedHost(url.hostname)) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function buildUpstreamHeaders(url: URL): HeadersInit {
  const host = url.hostname.toLowerCase();
  const headers: Record<string, string> = {
    'Accept-Encoding': 'identity',
    Accept:
      'image/avif,image/webp,image/apng,image/svg+xml,image/*;q=0.9,*/*;q=0.5',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
  };

  // Some Shikimori media endpoints expect their own referrer. Sending that
  // referrer to AniList/MAL is unnecessary and can make otherwise valid CDN
  // requests look suspicious, so keep it host-scoped.
  if (
    host === 'shikimori.io' ||
    host.endsWith('.shikimori.io') ||
    host === 'shikimori.me' ||
    host.endsWith('.shikimori.me') ||
    host === 'shikimori.one' ||
    host.endsWith('.shikimori.one')
  ) {
    headers.Referer = host === 'shikimori.io' || host.endsWith('.shikimori.io')
      ? 'https://shikimori.io/' : 'https://shikimori.one/';
  }

  return headers;
}

type ImageFetchResult = {
  response: Response | null;
  error: string | null;
  attempts: number;
};

async function fetchImage(
  initialUrl: URL,
  signal: AbortSignal,
): Promise<ImageFetchResult> {
  let current = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    try {
      const response = await fetchImageUpstream(current, {
        headers: buildUpstreamHeaders(current),
        signal,
      });

      // Успешный ответ: это уже наша картинка.
      if (response.ok) {
        return {
          response,
          error: null,
          attempts: hop + 1,
        };
      }

      // Обрабатываем только redirect.
      if (
        response.status >= 300 &&
        response.status < 400
      ) {
        if (hop >= MAX_REDIRECTS) {
          await response.body?.cancel().catch(() => undefined);
          console.error(
            'Image redirect limit reached:',
            current.toString(),
          );

          return {
            response: null,
            error: 'redirect-limit',
            attempts: hop + 1,
          };
        }

        const location =
          response.headers.get('location');
        await response.body?.cancel().catch(() => undefined);

        if (!location) {
          console.error(
            'Image redirect without location:',
            current.toString(),
            response.status,
          );

          return {
            response: null,
            error: 'redirect-without-location',
            attempts: hop + 1,
          };
        }

        const nextUrl = new URL(
          location,
          current,
        );

        if (
          nextUrl.protocol !== 'https:' ||
          nextUrl.username || nextUrl.password || nextUrl.port ||
          !isAllowedHost(nextUrl.hostname)
        ) {
          console.error(
            'Image redirect target is not allowed:',
            nextUrl.toString(),
          );

          return {
            response: null,
            error: 'redirect-target-not-allowed',
            attempts: hop + 1,
          };
        }

        current = nextUrl;
        continue;
      }

      await response.body?.cancel().catch(() => undefined);
      console.error(
        'Image upstream returned error:',
        current.toString(),
        response.status,
        response.statusText,
      );

      return {
        response: null,
        error: `origin-${response.status}`,
        attempts: hop + 1,
      };
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'TimeoutError');

      console.error('Image fetch failed:', {
        url: current.toString(),
        error,
      });

      return {
        response: null,
        error: timedOut ? 'origin-timeout' : 'origin-fetch-failed',
        attempts: hop + 1,
      };
    }
  }

  return {
    response: null,
    error: 'redirect-limit',
    attempts: MAX_REDIRECTS + 1,
  };
}

let placeholderBody: Promise<Buffer> | null = null;
async function placeholder(error: string, attempts = 0, strict = false) {
  if (strict) {
    // HTTP 200 + SVG fires img.onload and prematurely stops the poster cascade.
    return new NextResponse(null, {
      status: 502,
      headers: {
        ...privateNoStoreHeaders(),
        'Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
        'Cloudflare-CDN-Cache-Control': 'no-store',
        'X-AnimeBox-Image-Delivery': 'proxy-v5-candidate-failed',
        'X-AnimeBox-Image-Error': error,
        'X-AnimeBox-Image-Attempts': String(attempts),
      },
    });
  }
  placeholderBody ??= readFile(join(process.cwd(), 'public', 'anime-placeholder.svg'));
  return new NextResponse(new Uint8Array(await placeholderBody), {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'CDN-Cache-Control': 'public, max-age=15',
      'Cache-Control': 'public, max-age=15, s-maxage=15',
      'Vercel-CDN-Cache-Control': 'public, max-age=15',
      'Cloudflare-CDN-Cache-Control': 'public, max-age=15',
      'Retry-After': '15',
      'X-AnimeBox-Image-Delivery': 'proxy-v4-placeholder',
      'X-AnimeBox-Image-Error': error,
      'X-AnimeBox-Image-Attempts': String(attempts),
    },
  });
}

async function readImageBody(response: Response, signal: AbortSignal) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('empty-image');
  const declared = Number(response.headers.get('content-length'));
  // Keep a single growing destination, no retained chunk list. Never trust
  // Content-Length for enforcement: actual streamed bytes remain authoritative.
  let bytes = new Uint8Array(Number.isSafeInteger(declared) && declared > 0
    ? Math.min(declared, MAX_IMAGE_SIZE) : 64 * 1024);
  let size = 0;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', abort, {once: true});
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) break;
      const needed = size + chunk.value.byteLength;
      if (needed > MAX_IMAGE_SIZE) throw new Error('origin-too-large');
      if (needed > bytes.byteLength) {
        const grown = new Uint8Array(Math.min(MAX_IMAGE_SIZE, Math.max(needed, bytes.byteLength * 2)));
        grown.set(bytes.subarray(0, size));
        bytes = grown;
      }
      bytes.set(chunk.value, size);
      size = needed;
    }
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (!size) throw new Error('empty-image');
  if (declared > 0 && declared !== size) throw new Error('origin-truncated');
  return bytes.subarray(0, size);
}

type BufferedImage = { bytes: Uint8Array; contentType: string; error: null; attempts: number }
  | { bytes: null; contentType: string; error: string; attempts: number };
// Bound both resident byte storage and simultaneous temporary image buffers.
// Buffering is intentional: reject oversize/truncated bodies before a 200,
// share a completed body between waiters, and preserve the poster fallback.
const imageWork = createBoundedWork(4, 32);
const bufferedImages = createPublicResultCache<BufferedImage>({
  ttlMs: 60_000, maxEntries: 64, maxBytes: 8 * 1024 * 1024,
  sizeOf: value => value.bytes?.buffer.byteLength ?? 0,
  cacheWhen: value => Boolean(value.bytes && value.bytes.byteLength <= 1024 * 1024),
});
async function loadBufferedImage(sourceUrl: URL, signal: AbortSignal): Promise<BufferedImage> {
  const result = await fetchImage(sourceUrl, signal);
  const upstream = result.response;
  const failed = async (error: string): Promise<BufferedImage> => {
    await upstream?.body?.cancel().catch(() => undefined);
    return { bytes: null, contentType: '', error, attempts: result.attempts };
  };
  if (!upstream) return failed(result.error ?? 'origin-failed');
  const contentType = upstream.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('image/')) return failed('origin-not-image');
  if (Number(upstream.headers.get('content-length') ?? '0') > MAX_IMAGE_SIZE) return failed('origin-too-large');
  if (upstream.headers.get('content-encoding') && upstream.headers.get('content-encoding') !== 'identity') return failed('origin-encoded-image');
  const bytes = await readImageBody(upstream, signal);
  return { bytes, contentType, error: null, attempts: result.attempts };
}

export async function GET(
  request: NextRequest,
) {
  const limited = enforcePublicIpRateLimit(request, {
    scope: 'image_proxy_ip', limit: 600, windowSeconds: 60,
  });
  if (limited) {
    for (const [key, value] of Object.entries(privateNoStoreHeaders())) limited.headers.set(key, value);
    return limited;
  }

  const rawUrl =
    request.nextUrl.searchParams.get('url');

  if (!rawUrl) {
    return new NextResponse(
      'Missing image URL',
      { status: 400, headers: privateNoStoreHeaders() },
    );
  }

  // Локальные URL не должны проходить через внешний прокси.
  if (
    rawUrl.startsWith('/api/') ||
    rawUrl.startsWith('/anime-placeholder')
  ) {
    return new NextResponse(
      'Local image URL is not proxyable',
      { status: 400, headers: privateNoStoreHeaders() },
    );
  }

  const sourceUrl = normalizeUrl(rawUrl);
  const strict = request.nextUrl.searchParams.get('fallback') === 'error';

  if (!sourceUrl) {
    return new NextResponse(
      'Image host is not allowed',
      { status: 403, headers: privateNoStoreHeaders() },
    );
  }

  try {
    const image = await bufferedImages(sourceUrl.toString(), signal => {
      // Deadline includes admission wait, DNS, redirects and the entire body.
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]);
      return imageWork.run(deadline, () => loadBufferedImage(sourceUrl, deadline));
    }, request.signal);
    if (!image.bytes) return placeholder(image.error, image.attempts, strict);
    const optimized = request.nextUrl.searchParams.get('optimize') === 'webp'
      ? await (await import('@/lib/image-relay-optimize')).optimizeRelayImage(
          sourceUrl.toString(), { bytes: image.bytes, contentType: image.contentType }, request.signal,
        )
      : { bytes: image.bytes, contentType: image.contentType };
    const buffer = optimized.bytes;
    const contentType = optimized.contentType;

    return new NextResponse(buffer as Uint8Array<ArrayBuffer>, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        ...publicApiCacheHeaders({
          browserSeconds: 604800,
          edgeSeconds: 2592000,
          staleWhileRevalidateSeconds: 2592000,
        }),
        'X-Image-Source':
          sourceUrl.hostname,
        'X-AnimeBox-Image-Delivery': 'proxy-v2',
      },
    });
  } catch (error) {
    if (request.signal?.aborted) return new NextResponse(null, {status: 499, headers: privateNoStoreHeaders()});
    if (error instanceof Error && error.message === 'origin-busy') return new NextResponse(null, {
      status: 503, headers: {...privateNoStoreHeaders(), 'Retry-After': '1'},
    });
    console.error(
      'Image proxy error:',
      error,
    );

    return placeholder('proxy-exception', 0, strict);
  }
}
