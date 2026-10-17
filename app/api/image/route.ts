import { NextRequest, NextResponse } from 'next/server';
import { createPublicResultCache } from '@/lib/public-result-cache';
import { enforceIpRateLimit } from '@/lib/api-rate-limit';
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
): Promise<ImageFetchResult> {
  let current = initialUrl;
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    try {
      const response = await fetch(current, {
        headers: buildUpstreamHeaders(current),
        redirect: 'manual',
        cache: 'force-cache',
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

async function readImageBody(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('empty-image');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_IMAGE_SIZE) throw new Error('origin-too-large');
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  if (!size) throw new Error('empty-image');
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

type BufferedImage = { bytes: Uint8Array; contentType: string; error: null; attempts: number }
  | { bytes: null; contentType: string; error: string; attempts: number };
// At most 32 MiB retained; large images still work but are not kept in memory.
const bufferedImages = createPublicResultCache<BufferedImage>({
  ttlMs: 60_000, maxEntries: 32,
  cacheWhen: value => Boolean(value.bytes && value.bytes.byteLength <= 1024 * 1024),
});
async function loadBufferedImage(sourceUrl: URL): Promise<BufferedImage> {
  const result = await fetchImage(sourceUrl);
  const upstream = result.response;
  const failed = async (error: string): Promise<BufferedImage> => {
    await upstream?.body?.cancel().catch(() => undefined);
    return { bytes: null, contentType: '', error, attempts: result.attempts };
  };
  if (!upstream) return failed(result.error ?? 'origin-failed');
  const contentType = upstream.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('image/')) return failed('origin-not-image');
  if (Number(upstream.headers.get('content-length') ?? '0') > MAX_IMAGE_SIZE) return failed('origin-too-large');
  const bytes = await readImageBody(upstream);
  return { bytes, contentType, error: null, attempts: result.attempts };
}

export async function GET(
  request: NextRequest,
) {
  const limited = await enforceIpRateLimit(request, {
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
    const image = await bufferedImages(sourceUrl.toString(), () => loadBufferedImage(sourceUrl));
    if (!image.bytes) return placeholder(image.error, image.attempts, strict);
    const buffer = image.bytes;
    const contentType = image.contentType;

    return new NextResponse(new Uint8Array(buffer), {
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
    console.error(
      'Image proxy error:',
      error,
    );

    return placeholder('proxy-exception', 0, strict);
  }
}
