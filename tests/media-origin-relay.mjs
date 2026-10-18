import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
const code = await readFile('infra/cloudflare/media-worker.js', 'utf8');
const worker = await import('data:text/javascript;base64,' + Buffer.from(code + '\nexport {fetchOrigin,fetchOriginCoalesced,fetchCanonicalRelay,rasterMatchesMime};').toString('base64'));
const saved = { fetch: globalThis.fetch, caches: globalThis.caches };
const png = await sharp({ create: { width: 40, height: 60, channels: 3, background: '#663399' } }).png().toBuffer();
const image = () => new Response(png, { headers: { 'Content-Type': 'image/png' } });
const source = new URL('https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/sample-123.jpg?v=a%2Fb');
const variant = { width: 360, quality: 70, requestedFormat: 'webp', resolvedFormat: 'webp', token: 'w360-q70-fwebp' };
const env = { MEDIA_ORIGIN_RELAY_ENABLED: 'true' };
let calls = [];
try {
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (new URL(url).hostname === 'youranimebox.com') {
      assert.equal(new URL(url).pathname, '/api/image');
      assert.equal(new URL(url).searchParams.get('url'), source.href);
      assert.equal(new URL(url).searchParams.get('optimize'), 'webp', 'rescue uses one source-level compressed derivative');
      assert.equal(options.redirect, 'manual');
      assert.ok(options.signal);
      assert.deepEqual(Object.keys(options.headers), ['Accept']);
      return image();
    }
    return new Response('blocked', { status: 403 });
  };
  let result = await worker.fetchOrigin(source, variant, {});
  assert.equal(result.response, null); assert.equal(calls.length, 2, 'default does not add Railway traffic');
  calls = [];
  result = await worker.fetchOrigin(source, variant, env);
  assert.equal(result.relayUsed, true); assert.equal(result.transformed, false); assert.equal(calls.length, 3);
  assert.ok(worker.rasterMatchesMime(result.response.bytes, result.response.contentType));
  assert.ok(!worker.rasterMatchesMime(new Uint8Array([1,2,3]).buffer, 'image/jpeg'));
  let rawStatus = 404; calls = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); return new Response('missing', { status: rawStatus }); };
  result = await worker.fetchOrigin(source, variant, env);
  assert.equal(calls.length, 2); assert.equal(result.relayUsed, undefined);
  calls = [];
  globalThis.fetch = async (url, options) => { calls.push(String(url)); return options.cf ? new Response('', { status: 403 }) : image(); };
  result = await worker.fetchOrigin(source, variant, env);
  assert.equal(calls.length, 2); assert.ok(result.response); assert.equal(result.relayUsed, undefined);
  for (const response of [new Response(null, { status: 204 }), new Response(null, { status: 302, headers: { Location: 'https://evil.example' } }),
    new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } }),
    new Response('html', { headers: { 'Content-Type': 'image/png' } }),
    new Response(new Uint8Array(10 * 1024 * 1024 + 1), { headers: { 'Content-Type': 'image/jpeg' } })]) {
    globalThis.fetch = async () => response;
    try { result = await worker.fetchCanonicalRelay(source, new AbortController().signal); assert.equal(result.response, null); }
    catch (error) { assert.match(error.message, /too-large/); }
  }
  let forbiddenCalls = 0;
  globalThis.fetch = async () => { forbiddenCalls++; return image(); };
  for (const url of ['http://shikimori.io/a.jpg','https://127.0.0.1/a','https://shikimori.io.evil.test/a','https://u:p@shikimori.io/a','https://youranimebox.com/api/image']) {
    assert.equal((await worker.fetchCanonicalRelay(new URL(url), new AbortController().signal)).response, null);
  }
  assert.equal(forbiddenCalls, 0);
  const actualNow = Date.now;
  const actualTimeout = globalThis.setTimeout;
  let clock = 10000; const timeouts = [];
  try {
    Date.now = () => clock;
    globalThis.setTimeout = (fn, ms, ...args) => { timeouts.push(ms); return actualTimeout(fn, ms, ...args); };
    let steps = 0;
    globalThis.fetch = async url => {
      if (new URL(url).hostname === 'youranimebox.com') return image();
      clock += ++steps === 1 ? 2200 : 3500;
      return new Response('blocked', { status: 403 });
    };
    const tight = await worker.fetchOrigin(source, variant, env);
    assert.equal(tight.relayUsed, true); assert.equal(timeouts.at(-1), 100, 'relay gets only remaining shared budget');
    clock = 20000; calls = [];
    globalThis.fetch = async url => { calls.push(String(url)); clock += 5800; return new Response('blocked', { status: 403 }); };
    const exhausted = await worker.fetchOrigin(source, null, env);
    assert.equal(exhausted.relayError, 'relay-budget-exhausted'); assert.equal(calls.length, 1);
  } finally { Date.now = actualNow; globalThis.setTimeout = actualTimeout; }
  let releases; const blocked = new Promise(resolve => { releases = resolve; }); calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (new URL(url).hostname === 'youranimebox.com') return image();
    await blocked; return new Response('blocked', { status: 403 });
  };
  const pending = Array.from({ length: 12 }, (_, i) => worker.fetchOriginCoalesced(source, { ...variant, token: 'width-' + i }, 'coalesced-source', env));
  releases(); const recovered = await Promise.all(pending);
  assert.ok(recovered.every(item => item.relayUsed)); assert.equal(calls.length, 3, '12 widths use one shared relay request');
  const entries = new Map(); let puts = 0; let now = 0;
  globalThis.caches = { default: {
    match: async request => { const item = entries.get(request.url); return item && item.expires > now ? item.response.clone() : undefined; },
    put: async (request, response) => { const ttl = /s-maxage=(\d+)/.exec(response.headers.get('cache-control'))?.[1] ?? '15'; entries.set(request.url, { response: response.clone(), expires: now + Number(ttl) }); },
  } };
  const waits = [];
  const context = { waitUntil: promise => waits.push(promise) };
  const bucket = { get: async () => null, put: async () => { puts++; } };
  calls = []; globalThis.fetch = async (url) => { calls.push(String(url)); return new URL(url).hostname === 'youranimebox.com' ? image() : new Response('blocked', { status: 403 }); };
  const request = (width = 360, method = 'GET') => new Request('https://media.youranimebox.com/image?' + new URLSearchParams({ url: source.href, w: String(width), q: '70', f: 'webp' }), { method });
  let response = await worker.default.fetch(request(), { ...env, MEDIA_BUCKET: bucket }, context);
  assert.equal(response.status, 200); assert.equal(response.headers.get('x-animebox-media'), 'origin-relay-fill');
  await Promise.all(waits.splice(0)); assert.equal(puts, 0, 'relay never enters an R2 variant key');
  const count = calls.length;
  response = await worker.default.fetch(request(720, 'HEAD'), { ...env, MEDIA_BUCKET: bucket }, context);
  assert.equal(response.status, 200); assert.equal(await response.text(), ''); assert.equal(response.headers.get('x-animebox-media'), 'origin-relay-hit');
  assert.equal(calls.length, count, 'raw source cache is shared across requested widths');
  now = 601;
  await worker.default.fetch(request(540), { ...env, MEDIA_BUCKET: bucket }, context);
  assert.ok(calls.length > count, 'relay source cache expires');
  await Promise.all(waits.splice(0));
  console.log('Media relay: opt-in, 403-only rescue, validation, fixed target, source coalescing, cache expiry, HEAD and R2 variant isolation passed.');
} finally { globalThis.fetch = saved.fetch; globalThis.caches = saved.caches; }
