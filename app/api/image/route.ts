import { NextRequest, NextResponse } from 'next/server';
import { enforceIpRateLimit } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 5;

const EXACT_ALLOWED_HOSTS = new Set([
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
    host.endsWith('.shikimori.me') ||
    host.endsWith('.shikimori.one') ||
    host.endsWith('.anilist.co') ||
    host.endsWith('.cdninstagram.com') ||
    host.endsWith('.myanimelist.net')
  );
}

function normalizeUrl(value: string): URL | null {
  const raw = value.trim();
  if (!raw) return null;

  const normalized = raw.startsWith('//')
    ? `https:${raw}`
    : raw.startsWith('/')
      ? `https://shikimori.me${raw}`
      : raw;

  try {
    const url = new URL(normalized);

    if (url.protocol !== 'https:') {
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
    host === 'shikimori.me' ||
    host.endsWith('.shikimori.me') ||
    host === 'shikimori.one' ||
    host.endsWith('.shikimori.one')
  ) {
    headers.Referer = 'https://shikimori.one/';
  }

  return headers;
}

async function fetchImage(
  initialUrl: URL,
): Promise<Response | null> {
  let current = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(current, {
        headers: buildUpstreamHeaders(current),
        redirect: 'manual',
        cache: 'force-cache',
        signal: controller.signal,
      });

      // Успешный ответ: это уже наша картинка.
      if (response.ok) {
        return response;
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

          return null;
        }

        const location =
          response.headers.get('location');

        if (!location) {
          console.error(
            'Image redirect without location:',
            current.toString(),
            response.status,
          );

          return null;
        }

        const nextUrl = new URL(
          location,
          current,
        );

        if (
          nextUrl.protocol !== 'https:' ||
          !isAllowedHost(nextUrl.hostname)
        ) {
          console.error(
            'Image redirect target is not allowed:',
            nextUrl.toString(),
          );

          return null;
        }

        current = nextUrl;
        continue;
      }

      console.error(
        'Image upstream returned error:',
        current.toString(),
        response.status,
        response.statusText,
      );

      return null;
    } catch (error) {
      console.error('Image fetch failed:', {
        url: current.toString(),
        error,
      });

      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

export async function GET(
  request: NextRequest,
) {
  const limited = await enforceIpRateLimit(request, {
    scope: 'image_proxy_ip', limit: 600, windowSeconds: 60,
  });
  if (limited) return limited;

  const rawUrl =
    request.nextUrl.searchParams.get('url');

  if (!rawUrl) {
    return new NextResponse(
      'Missing image URL',
      { status: 400 },
    );
  }

  // Локальные URL не должны проходить через внешний прокси.
  if (
    rawUrl.startsWith('/api/') ||
    rawUrl.startsWith('/anime-placeholder')
  ) {
    return new NextResponse(
      'Local image URL is not proxyable',
      { status: 400 },
    );
  }

  const sourceUrl = normalizeUrl(rawUrl);

  if (!sourceUrl) {
    return new NextResponse(
      'Image host is not allowed',
      { status: 403 },
    );
  }

  try {
    const upstream =
      await fetchImage(sourceUrl);

    if (!upstream) {
      return new NextResponse(
        'Image unavailable',
        { status: 502 },
      );
    }

    const contentType =
      upstream.headers.get(
        'content-type',
      ) ?? '';

    if (
      !contentType
        .toLowerCase()
        .startsWith('image/')
    ) {
      return new NextResponse(
        `Upstream is not an image: ${contentType || 'unknown'}`,
        { status: 415 },
      );
    }

    const contentLength = Number(
      upstream.headers.get(
        'content-length',
      ) ?? '0',
    );

    if (
      contentLength > MAX_IMAGE_SIZE
    ) {
      return new NextResponse(
        'Image is too large',
        { status: 413 },
      );
    }

    const buffer =
      await upstream.arrayBuffer();

    if (
      buffer.byteLength > MAX_IMAGE_SIZE
    ) {
      return new NextResponse(
        'Image is too large',
        { status: 413 },
      );
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control':
          'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000',
        'Vercel-CDN-Cache-Control':
          'public, max-age=2592000, stale-while-revalidate=604800',
        'Cloudflare-CDN-Cache-Control':
          'public, max-age=2592000, stale-while-revalidate=604800',
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

    return new NextResponse(
      'Image proxy failed',
      { status: 502 },
    );
  }
}