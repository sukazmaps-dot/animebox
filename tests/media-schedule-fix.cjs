const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function compile(file, imports = {}) {
  const mod = { exports: {} };
  new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(name => imports[name] || require(name), mod, mod.exports);
  return mod.exports;
}
const originalFetch = global.fetch;
const originalError = console.error;
const { GET } = compile('app/api/image/route.ts', {
  'next/server': { NextResponse: Response }, '@/lib/api-rate-limit': { enforceIpRateLimit: async () => null },
});
const source = 'https://shikimori.io/system/animes/preview/18.jpg?token=a%2Fb&v=1';
const request = url => ({ nextUrl: new URL('https://youranimebox.com/api/image?' + new URLSearchParams({ url })) });
async function main() {
  console.error = () => {};
  let calls = 0;
  global.fetch = async (url, options) => {
    calls++;
    assert.equal(String(url), source);
    assert.equal(options.headers.Referer, 'https://shikimori.io/');
    assert.ok(options.headers['User-Agent']);
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal);
    return new Response('poster bytes', { headers: { 'Content-Type': 'image/jpeg' } });
  };
  for (const value of [source, encodeURIComponent(source), encodeURIComponent(encodeURIComponent(source))]) {
    assert.equal((await GET(request(value))).status, 200);
  }
  assert.equal(calls, 3);
  for (const value of ['https://127.0.0.1/a.png', 'https://localhost/a.png', 'https://shikimori.io.evil.test/a.png',
    'https://user:password@shikimori.io/a.png', 'https://shikimori.io:8443/a.png', 'http://shikimori.io/a.png']) {
    assert.equal((await GET(request(value))).status, 403);
  }
  assert.equal(calls, 3, 'forbidden inputs cannot cause upstream traffic');
  const placeholder = async () => {
    const response = await GET(request(source));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/svg+xml');
    assert.match(response.headers.get('cache-control'), /max-age=15/);
    assert.match(await response.text(), /<svg/);
  };
  for (const status of [403, 404, 500]) { global.fetch = async () => new Response('blocked', { status }); await placeholder(); }
  global.fetch = async () => { throw new Error('ECONNRESET'); }; await placeholder();
  global.fetch = async () => new Response('<html>not a poster</html>', { headers: { 'Content-Type': 'text/html' } }); await placeholder();
  global.fetch = async () => new Response('body', { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '10485761' } }); await placeholder();
  global.fetch = async () => new Response(new Uint8Array(10485761), { headers: { 'Content-Type': 'image/jpeg' } }); await placeholder();
  let redirects = 0;
  global.fetch = async () => { redirects++; return new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/secret' } }); };
  await placeholder(); assert.equal(redirects, 1);
  const delivery = compile('lib/media-delivery.ts');
  const service = compile('lib/image-service.ts', { '@/lib/media-delivery': delivery });
  const chain = service.buildImageCandidateChain([source], { preset: 'tiny' });
  assert.ok(chain.some(url => url.startsWith('/api/image?')));
  assert.ok(!chain.includes(source), 'Shikimori must never be a direct browser fallback');
  const workerSource = fs.readFileSync('infra/cloudflare/media-worker.js','utf8');
  // No cache/R2 test is needed to inspect validated source + headers.
  const helpers = await import('data:text/javascript;base64,' + Buffer.from(workerSource + '\nexport {parseSource,upstreamHeaders,fetchAllowedOrigin,readLimitedImage};').toString('base64'));
  assert.equal(helpers.parseSource(request(source).nextUrl).href, source);
  assert.equal(helpers.parseSource(request(encodeURIComponent(source)).nextUrl).href, source);
  assert.equal(helpers.upstreamHeaders(new URL(source)).get('Referer'), 'https://shikimori.io/');
  assert.equal(helpers.parseSource(request('https://user:pass@shikimori.io/a.png').nextUrl), null);
  let workerRequests = 0;
  global.fetch = async () => { workerRequests++; return new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/private' } }); };
  await assert.rejects(() => helpers.fetchAllowedOrigin(new URL(source), {}), /redirect-forbidden/);
  assert.equal(workerRequests, 1);
  await assert.rejects(() => helpers.readLimitedImage(new Response(new Uint8Array(10485761))), /too-large/);
  assert.equal((await helpers.readLimitedImage(new Response('poster'))).byteLength, 6);
  assert.ok(helpers.default);
  console.log('PASS: image URL decoding, io headers, SSRF/redirect rejection, bounded real SVG fallback and server-side Shikimori delivery');
}
main().catch(error => { console.error = originalError; console.error(error); process.exitCode = 1; })
  .finally(() => { global.fetch = originalFetch; console.error = originalError; });
