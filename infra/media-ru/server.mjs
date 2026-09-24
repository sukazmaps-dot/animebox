import http from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PORT = Number(process.env.PORT || 8788);
const CACHE_DIR = process.env.CACHE_DIR || '/data/posters';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8_000;

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

function keyFor(source) {
  return createHash('sha256').update(source.toString()).digest('hex');
}

function pathsFor(hash) {
  const dir = path.join(CACHE_DIR, hash.slice(0, 2));
  return {
    dir,
    body: path.join(dir, hash + '.bin'),
    meta: path.join(dir, hash + '.json'),
  };
}

async function readCached(hash) {
  const files = pathsFor(hash);
  try {
    const [body, metaRaw] = await Promise.all([
      readFile(files.body),
      readFile(files.meta, 'utf8'),
    ]);
    const meta = JSON.parse(metaRaw);
    return {
      body,
      contentType:
        typeof meta.contentType === 'string' ? meta.contentType : 'image/jpeg',
    };
  } catch {
    return null;
  }
}

async function writeCached(hash, body, contentType) {
  const files = pathsFor(hash);
  await mkdir(files.dir, { recursive: true });
  const tmpBody = files.body + '.tmp-' + process.pid;
  const tmpMeta = files.meta + '.tmp-' + process.pid;

  await Promise.all([
    writeFile(tmpBody, body),
    writeFile(tmpMeta, JSON.stringify({ contentType, cachedAt: Date.now() })),
  ]);
  await Promise.all([
    rename(tmpBody, files.body),
    rename(tmpMeta, files.meta),
  ]);
}

function upstreamHeaders(source) {
  const headers = {
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.6',
    'User-Agent':
      'Mozilla/5.0 (compatible; AnimeBoxMediaRU/1.0; +https://youranimebox.com)',
  };
  const host = source.hostname.toLowerCase();

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

async function fetchOrigin(source) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(source, {
      headers: upstreamHeaders(source),
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) return null;

    const declaredLength = Number(response.headers.get('content-length') || '0');
    if (declaredLength > MAX_IMAGE_BYTES) return null;

    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer.byteLength || arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
      return null;
    }

    return {
      body: Buffer.from(arrayBuffer),
      contentType,
    };
  } finally {
    clearTimeout(timer);
  }
}

const inflight = new Map();

function sendImage(res, payload, cacheState) {
  res.writeHead(200, {
    'Content-Type': payload.contentType,
    'Content-Length': String(payload.body.byteLength),
    'Cache-Control':
      'public, max-age=86400, stale-while-revalidate=604800',
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-AnimeBox-Media': cacheState,
  });
  res.end(payload.body);
}

await mkdir(CACHE_DIR, { recursive: true });

http
  .createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      if (requestUrl.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, service: 'animebox-media-ru' }));
        return;
      }

      if (req.method !== 'GET' || requestUrl.pathname !== '/image') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const source = parseSource(requestUrl);
      if (!source) {
        res.writeHead(400, { 'Cache-Control': 'no-store' });
        res.end('Invalid image source');
        return;
      }

      const hash = keyFor(source);
      const cached = await readCached(hash);
      if (cached) {
        sendImage(res, cached, 'disk-hit');
        return;
      }

      let promise = inflight.get(hash);
      if (!promise) {
        promise = fetchOrigin(source).finally(() => inflight.delete(hash));
        inflight.set(hash, promise);
      }

      const origin = await promise;
      if (!origin) {
        res.writeHead(502, { 'Cache-Control': 'public, max-age=30' });
        res.end('Image unavailable');
        return;
      }

      await writeCached(hash, origin.body, origin.contentType).catch(() => undefined);
      sendImage(res, origin, 'origin-fill');
    } catch (error) {
      console.error('[animebox-media-ru]', error);
      res.writeHead(500, { 'Cache-Control': 'no-store' });
      res.end('Internal error');
    }
  })
  .listen(PORT, '0.0.0.0', () => {
    console.log(`AnimeBox RU media origin listening on :${PORT}`);
  });
