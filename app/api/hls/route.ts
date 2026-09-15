import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_HOSTS = [
  'libria.fun',
  'anilibria.top',
  'anilibria.tv',
  'anilibria.app',
];

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return ALLOWED_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

function toProxyUrl(url: string): string {
  return `/api/hls?url=${encodeURIComponent(url)}`;
}

function rewritePlaylist(text: string, sourceUrl: string): string {
  const source = new URL(sourceUrl);

  const resolve = (value: string): string => {
    try {
      return new URL(value, source).toString();
    } catch {
      return value;
    }
  };

  let output = text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith('#EXT-X-STREAM-INF')) {
        return line;
      }

      if (!trimmed.startsWith('#')) {
        return toProxyUrl(resolve(trimmed));
      }

      return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => {
        return `URI="${toProxyUrl(resolve(uri))}"`;
      });
    })
    .join('\n');

  if (!output.endsWith('\n')) {
    output += '\n';
  }

  return output;
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url');

  if (!rawUrl) {
    return new NextResponse('Missing url', { status: 400 });
  }

  let target: URL;

  try {
    target = new URL(rawUrl);
  } catch {
    return new NextResponse('Invalid url', { status: 400 });
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    return new NextResponse('Unsupported protocol', { status: 400 });
  }

  if (!isAllowedHost(target.hostname)) {
    return new NextResponse('Host is not allowed', { status: 403 });
  }

  try {
    const range = request.headers.get('range');

    const upstream = await fetch(target.toString(), {
      redirect: 'follow',
      cache: 'no-store',
      headers: {
        Accept: '*/*',
        ...(range ? { Range: range } : {}),
      },
    });

    if (!upstream.ok) {
      return new NextResponse(`Upstream error: ${upstream.status}`, {
        status: upstream.status,
      });
    }

    const contentType = upstream.headers.get('content-type') ?? '';
    const isPlaylist =
      contentType.includes('mpegurl') ||
      contentType.includes('vnd.apple.mpegurl') ||
      /\.m3u8(?:$|\?)/i.test(target.pathname);

    if (isPlaylist) {
      const text = await upstream.text();
      const rewritten = rewritePlaylist(text, upstream.url || target.toString());

      return new NextResponse(rewritten, {
        status: upstream.status,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-store, max-age=0',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    const body = await upstream.arrayBuffer();

    const responseHeaders = new Headers();
    responseHeaders.set(
      'Content-Type',
      contentType || 'application/octet-stream',
    );
    responseHeaders.set('Cache-Control', 'public, max-age=60');
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    const contentLength = upstream.headers.get('content-length');
    const contentRange = upstream.headers.get('content-range');

    if (contentLength) {
      responseHeaders.set('Content-Length', contentLength);
    }

    if (contentRange) {
      responseHeaders.set('Content-Range', contentRange);
    }

    return new NextResponse(body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('HLS proxy error:', error);
    return new NextResponse('HLS proxy failed', { status: 502 });
  }
}
