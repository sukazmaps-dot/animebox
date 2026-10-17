const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { setTimeout: delay } = require('node:timers/promises');
function load(file, imports = {}) {
  const mod = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', js)(name => name === 'server-only' ? {} : imports[name] ?? require(name), mod, mod.exports);
  return mod.exports;
}
const publicCache = load('lib/public-result-cache.ts');
async function caches() {
  let calls = 0, release;
  const cached = publicCache.createPublicResultCache({ ttlMs: 100, staleIfErrorMs: 200, maxEntries: 2, cacheWhen: Boolean });
  const pending = new Promise(done => { release = done; });
  const requests = Array.from({ length: 20 }, () => cached('title', () => { calls++; return pending; }));
  await Promise.resolve(); assert.equal(calls, 1); release('full data');
  assert.deepEqual(await Promise.all(requests), Array(20).fill('full data'));
  const originalNow = Date.now, start = Date.now();
  try {
    Date.now = () => start + 150;
    assert.deepEqual(await Promise.all(Array.from({ length: 20 }, () => cached('title', async () => { throw Error('offline'); }))), Array(20).fill('full data'));
    Date.now = () => start + 500;
    await assert.rejects(cached('title', async () => { throw Error('offline'); }), /offline/);
  } finally { Date.now = originalNow; }
  let misses = 0;
  await cached('empty', async () => { misses++; return null; });
  await cached('empty', async () => { misses++; return null; });
  assert.equal(misses, 2, 'missing titles are not positive cache entries');
  await assert.rejects(cached('retry', async () => { throw Error('once'); }));
  assert.equal(await cached('retry', async () => 'recovered'), 'recovered', 'rejected promise must be removed');
  const bounded = publicCache.createPublicResultCache({ ttlMs: 1000, maxEntries: 1, cacheWhen: Boolean });
  await bounded('a', async () => 'a'); await bounded('b', async () => 'b');
  let reloaded = false; await bounded('a', async () => { reloaded = true; return 'a'; }); assert(reloaded);
}
async function retries() {
  const retry = load('lib/fetch-retry.ts', { '@/lib/upstream-resilience-server': {
    upstreamKeyForUrl: () => null, isUpstreamPressureError: () => false,
  } }).fetchWithRetry;
  const originalFetch = global.fetch, originalTimeout = AbortSignal.timeout;
  let calls = 0;
  try {
    global.fetch = async () => { calls++; return new Response('ok'); };
    const aborted = AbortSignal.abort(new Error('navigation cancelled'));
    await assert.rejects(retry('https://example.test', { signal: aborted }), /navigation cancelled/); assert.equal(calls, 0);
    global.fetch = async () => { calls++; throw new DOMException('timed out', 'TimeoutError'); };
    await assert.rejects(retry('https://example.test'), /timed out/); assert.equal(calls, 1);
    calls = 0; let cancelled = false;
    global.fetch = async () => { calls++; return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 503 }); };
    const controller = new AbortController();
    const waiting = retry('https://example.test', { signal: controller.signal }, 3, 1000);
    await delay(5); controller.abort(new Error('stop during backoff'));
    await assert.rejects(waiting, /stop during backoff/); assert.equal(calls, 1); assert(cancelled);
    let requested;
    AbortSignal.timeout = ms => { requested = ms; return originalTimeout.call(AbortSignal, 10); };
    calls = 0;
    global.fetch = async (_, init) => { calls++; return new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    }); };
    await assert.rejects(retry('https://example.test'), error => error.name === 'TimeoutError');
    assert.equal(requested, 8000); assert.equal(calls, 1);
    AbortSignal.timeout = originalTimeout;
    calls = 0;
    global.fetch = async () => { calls++; return new Response('body', { status: calls === 1 ? 503 : 200 }); };
    assert.equal((await retry('https://example.test', undefined, 2, 50)).status, 200); assert.equal(calls, 2);
  } finally { global.fetch = originalFetch; AbortSignal.timeout = originalTimeout; }
}
async function limiter() {
  let result = true, signal, calls = 0;
  const guard = load('lib/api-rate-limit.ts', {
    'node:crypto': { createHmac: () => ({ update: () => ({ digest: () => 'hash' }) }) },
    '@/lib/env/server': { optionalServerSecret: () => 'test-only' },
    '@/lib/community-server': { adminClient: () => ({ rpc: () => ({ abortSignal(s) {
      signal = s; calls++; return Promise.resolve({ data: result, error: result === null ? { message: 'unavailable' } : null });
    } }) }) },
  });
  const req = new Request('https://example.test', { headers: { 'x-forwarded-for': '203.0.113.1' } });
  const policy = { scope: 'image_proxy_ip', limit: 600, windowSeconds: 60 };
  assert.equal(await guard.enforceIpRateLimit(req, policy), null); assert(signal instanceof AbortSignal);
  result = false; assert.equal((await guard.enforceIpRateLimit(req, policy)).status, 429);
  result = null; const failed = await guard.enforceIpRateLimit(req, policy);
  assert.equal(failed.status, 503); assert.equal(failed.headers.get('cache-control'), 'private, no-store'); assert.equal(calls, 3);
}
async function sdkAbort() {
  // Exercise installed Supabase/PostgREST, not just a chain-shaped mock.
  const { createClient } = require('@supabase/supabase-js');
  let received;
  const client = createClient('https://example.test', 'test-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (_, init) => {
    received = init.signal;
    return new Promise((_, reject) => {
      if(init.signal.aborted) reject(init.signal.reason);
      else init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    });
  } } });
  const signal = AbortSignal.timeout(10);
  const result = await client.rpc('consume_api_rate_bucket', {}).abortSignal(signal);
  assert.equal(received, signal); assert(signal.aborted); assert(result.error, 'SDK must return failure when RPC deadline expires');
}
async function localization() {
  let calls = 0, partial = false; const signals = [];
  const local = load('lib/anime-localization-server.ts', {
    '@/lib/public-result-cache': publicCache,
    '@/lib/shikimori-metadata-server': { readShikimoriMetadata: async () => new Map(), mergeShikimoriMetadata: x => x },
    '@/lib/shikimori-text': { cleanShikimoriDescription: x => x },
    '@/lib/fetch-retry': { fetchWithRetry: async () => { throw Error('provider should not be called'); } },
    '@/lib/community-server': { adminClient: () => ({ from(table) {
      const q = { select() { return q; }, eq() { return q; }, abortSignal(s) { signals.push(s); return q; },
        async maybeSingle() { calls++; await delay(2); return { data: table === 'anime_search_documents' ? { title: 'Тайтл', description: 'Описание на русском', aliases: [] } : null, error: partial && table === 'anime_catalog' ? { message: 'timeout' } : null }; } };
      return q;
    } }) },
  });
  const anime = { id: 1, title: {}, description: null, genres: [] };
  const results = await Promise.all(Array.from({ length: 20 }, () => local.localizeAnimeDetail(anime)));
  assert.equal(calls, 3); assert(results.every(x => x.description === 'Описание на русском'));
  assert.equal(new Set(signals).size, 1, 'three reads share one deadline');
  await local.localizeAnimeDetail(anime); assert.equal(calls, 3);
  partial = true; await local.localizeAnimeDetail({ ...anime, id: 2 });
  partial = false; await local.localizeAnimeDetail({ ...anime, id: 2 }); assert.equal(calls, 9, 'partial failure is not cached');
}
async function images() {
  const originalFetch = global.fetch;
  let calls = 0, guards = 0;
  const route = load('app/api/image/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/public-result-cache': publicCache,
    '@/lib/edge-cache-policy': load('lib/edge-cache-policy.ts'),
    '@/lib/api-rate-limit': { enforceIpRateLimit: async () => { guards++; return null; } },
  });
  const req = name => ({ nextUrl: new URL('https://example.test/api/image?url=https://s4.anilist.co/' + name) });
  try {
    global.fetch = async () => { calls++; await delay(5); return new Response('complete image bytes', { headers: { 'content-type': 'image/jpeg' } }); };
    const responses = await Promise.all(Array.from({ length: 20 }, () => route.GET(req('same.jpg'))));
    assert.equal(calls, 1); assert.equal(guards, 20, 'cache does not bypass protection');
    assert.deepEqual(await Promise.all(responses.map(r => r.text())), Array(20).fill('complete image bytes'));
    await route.GET(req('same.jpg')); assert.equal(calls, 1);
    global.fetch = async () => { calls++; return new Response(null, { status: 404 }); };
    const strict = req('failed.jpg'); strict.nextUrl.searchParams.set('fallback', 'error');
    assert.equal((await route.GET(strict)).status, 502); assert.equal((await route.GET(strict)).status, 502);
    assert.equal(calls, 3, 'errors not cached as successes');
    global.fetch = async () => { calls++; return new Response(new Uint8Array(1024 * 1024 + 1), { headers: { 'content-type': 'image/jpeg' } }); };
    await route.GET(req('large.jpg')); await route.GET(req('large.jpg')); assert.equal(calls, 5, 'large images work without retained memory cache');
  } finally { global.fetch = originalFetch; }
}
const keepAlive = setInterval(() => {}, 1000);
(async () => {
  await caches(); await retries(); await limiter(); await sdkAbort(); await localization(); await images();
  console.log('PASS loading budgets: concurrent cache, stale expiry, deadline/backoff cancellation, fail-closed limiter, bounded shared localization, full image bytes and cache guard.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearInterval(keepAlive));
