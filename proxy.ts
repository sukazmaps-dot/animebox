import { NextRequest, NextResponse } from 'next/server';

const CANONICAL_HOSTS = new Set([
  'youranimebox.com',
  'www.youranimebox.com',
]);

const UNSAFE_METHODS = new Set([
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
]);

const FORBIDDEN_METHODS = new Set([
  'TRACE',
  'TRACK',
  'CONNECT',
]);

const MAX_API_URL_LENGTH = 4096;
const MAX_API_CONTENT_LENGTH = 512 * 1024;
const EDGE_SECRET_HEADER = 'x-animebox-edge-verify';

function hostname(value: string | null) {
  return (value ?? '')
    .split(':')[0]
    ?.trim()
    .toLowerCase();
}

function canonicalHost(value: string | null) {
  return CANONICAL_HOSTS.has(hostname(value));
}

function productionRequest() {
  return process.env.VERCEL_ENV === 'production';
}

function cronRequest(pathname: string) {
  return pathname.startsWith('/api/cron/');
}

function apiRequest(pathname: string) {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function allowedBrowserOrigin(request: NextRequest, origin: string) {
  try {
    const parsed = new URL(origin);

    if (productionRequest()) {
      return parsed.protocol === 'https:' && CANONICAL_HOSTS.has(parsed.hostname.toLowerCase());
    }

    return parsed.origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

function withShieldHeaders(response: NextResponse, requestId: string, isApi: boolean) {
  response.headers.set('X-AnimeBox-Request-Id', requestId);
  response.headers.set('X-AnimeBox-Shield', 'edge-v1');

  if (isApi) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    response.headers.set('Cache-Control', 'private, no-store');
  }

  return response;
}

function jsonError(
  requestId: string,
  status: number,
  error: string,
  extraHeaders: Record<string, string> = {},
) {
  const response = NextResponse.json(
    { error, requestId },
    {
      status,
      headers: {
        'Cache-Control': 'private, no-store',
        ...extraHeaders,
      },
    },
  );

  return withShieldHeaders(response, requestId, true);
}

function validContentLength(value: string | null) {
  if (!value) return null;
  if (!/^\d+$/.test(value)) return Number.NaN;
  return Number(value);
}

export function proxy(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();
  const isApi = apiRequest(pathname);

  if (FORBIDDEN_METHODS.has(method)) {
    return jsonError(requestId, 405, 'Метод запроса запрещён.', {
      Allow: 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
    });
  }

  /*
   * Production origin lock.
   *
   * A direct *.vercel.app request must not be an alternate route around
   * Cloudflare/canonical-domain policy. Vercel Cron remains exempt because
   * the platform may invoke cron paths on a deployment hostname.
   */
  if (
    productionRequest() &&
    !canonicalHost(request.headers.get('host')) &&
    !cronRequest(pathname)
  ) {
    if (!isApi && (method === 'GET' || method === 'HEAD')) {
      const target = request.nextUrl.clone();
      target.protocol = 'https:';
      target.host = 'youranimebox.com';

      return withShieldHeaders(
        NextResponse.redirect(target, 308),
        requestId,
        false,
      );
    }

    return jsonError(
      requestId,
      403,
      'Этот origin AnimeBox не принимает прямые запросы.',
    );
  }

  /*
   * Optional Cloudflare -> Vercel origin authentication.
   *
   * It becomes active only after ANIMEBOX_EDGE_ORIGIN_SECRET is configured
   * in Vercel. Cloudflare must overwrite x-animebox-edge-verify with the same
   * secret before forwarding the request. This prevents an attacker from
   * bypassing Cloudflare while still using Host: youranimebox.com.
   */
  const edgeSecret = process.env.ANIMEBOX_EDGE_ORIGIN_SECRET?.trim();

  if (
    productionRequest() &&
    edgeSecret &&
    !cronRequest(pathname) &&
    request.headers.get(EDGE_SECRET_HEADER) !== edgeSecret
  ) {
    return jsonError(
      requestId,
      403,
      'Origin verification failed.',
    );
  }

  if (isApi) {
    if (request.url.length > MAX_API_URL_LENGTH) {
      return jsonError(requestId, 414, 'URL запроса слишком длинный.');
    }

    const contentLength = validContentLength(
      request.headers.get('content-length'),
    );

    if (
      contentLength !== null &&
      (!Number.isFinite(contentLength) ||
        contentLength < 0 ||
        contentLength > MAX_API_CONTENT_LENGTH)
    ) {
      return jsonError(requestId, 413, 'Тело запроса слишком большое.');
    }

    /*
     * Browser CSRF/cross-site guard.
     * Server-to-server webhooks normally have no Origin/Sec-Fetch-Site and
     * continue to be authenticated by their own signatures/secrets.
     */
    if (UNSAFE_METHODS.has(method)) {
      const origin = request.headers.get('origin');

      if (origin && !allowedBrowserOrigin(request, origin)) {
        return jsonError(requestId, 403, 'Cross-origin запрос отклонён.');
      }

      if (request.headers.get('sec-fetch-site') === 'cross-site') {
        return jsonError(requestId, 403, 'Cross-site запрос отклонён.');
      }
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-animebox-request-id', requestId);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  return withShieldHeaders(response, requestId, isApi);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
