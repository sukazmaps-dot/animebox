const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const {EventEmitter} = require('node:events');
const {setTimeout: delay} = require('node:timers/promises');
const modules = new Map();
function load(file, imports = {}, source) {
  const mod = {exports: {}};
  const js = ts.transpileModule(source ?? fs.readFileSync(file, 'utf8'), {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  }}).outputText;
  new Function('require', 'module', 'exports', js)(name => {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (name === 'server-only') return {};
    if (name.startsWith('@/')) {
      const path = name.slice(2) + '.ts';
      if (!modules.has(path)) modules.set(path, load(path));
      return modules.get(path);
    }
    return require(name);
  }, mod, mod.exports);
  return mod.exports;
}
const {createPublicResultCache} = load('lib/public-result-cache.ts');
const {createBoundedWork} = load('lib/bounded-work.ts');
async function cacheChecks() {
  const cache = createPublicResultCache({ttlMs: 10, maxEntries: 1000, maxBytes: 4096, cacheWhen: Boolean});
  for (let i = 0; i < 5000; i++) await cache(String(i), async () => ({body: 'x'.repeat(i % 500)}));
  assert(cache.stats().retainedBytes <= 4096); assert(cache.stats().entries < 1000);
  const now = Date.now; const start = now();
  try { Date.now = () => start + 5000; assert.equal(cache.stats().retainedBytes, 0); } finally {Date.now = now;}
  const big = createPublicResultCache({ttlMs: 10000, maxEntries: 10, maxBytes: 1024, cacheWhen: Boolean});
  let calls = 0;
  for (let i = 0; i < 2; i++) await big('big', async () => {calls++; return 'x'.repeat(2000);});
  assert.equal(calls, 2); assert.equal(big.stats().entries, 0);
  const shared = createPublicResultCache({ttlMs: 10000, maxEntries: 10, cacheWhen: Boolean});
  let release, upstreamSignal;
  const a = new AbortController(), b = new AbortController();
  const loader = signal => {upstreamSignal = signal; return new Promise(resolve => {release = resolve;});};
  const first = shared('same', loader, a.signal), second = shared('same', loader, b.signal);
  await delay(1); a.abort(); await assert.rejects(first); assert(!upstreamSignal.aborted);
  release('ok'); assert.equal(await second, 'ok'); assert.equal(shared.stats().pending, 0);
  const cancelled = new AbortController();
  const abandoned = shared('cancelled', signal => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), {once: true});
  }), cancelled.signal);
  await delay(1); cancelled.abort(); await assert.rejects(abandoned); await delay(1);
  assert.equal(shared.stats().pending, 0);
  for (let i = 0; i < 2; i++) await assert.rejects(shared('outage', async () => {throw Error('unavailable');}));
  assert.equal(shared.stats().pending, 0);
}
async function gateChecks() {
  const gate = createBoundedWork(1, 1), ac = new AbortController();
  let release;
  const active = gate.run(new AbortController().signal, () => new Promise(resolve => {release = resolve;}));
  await delay(1);
  const queued = gate.run(ac.signal, async () => 'never');
  await assert.rejects(gate.run(new AbortController().signal, async () => {}), /origin-busy/);
  ac.abort(); await assert.rejects(queued); assert.equal(gate.stats().queued, 0);
  release(); await active; assert.equal(gate.stats().active, 0);
  await assert.rejects(gate.run(new AbortController().signal, async () => {throw Error('offline');}));
  assert.equal(gate.stats().active, 0);
}
function imageRoute(transport = (url, init) => fetch(url, {...init, redirect: 'manual'}), source) {
  return load('app/api/image/route.ts', {
    'next/server': {NextResponse: Response},
    '@/lib/public-api-rate-limit': {enforcePublicIpRateLimit: () => null},
    '@/lib/image-upstream-server': {fetchImageUpstream: transport},
  }, source);
}
const req = (name, signal) => ({nextUrl: new URL('https://example.test/api/image?' + new URLSearchParams({
  url: name.startsWith('http') ? name : 'https://s4.anilist.co/' + name, fallback: 'error',
})), signal});
async function imageChecks() {
  let calls = 0, active = 0, peak = 0;
  const route = imageRoute(async (_, init) => {
    assert(init.signal); calls++; active++; peak = Math.max(peak, active);
    await delay(2); active--;
    return new Response('image', {headers: {'content-type': 'image/webp', 'content-length': '5'}});
  });
  for (const n of [1,5,10,20]) {
    const before = calls;
    const responses = await Promise.all(Array.from({length:n}, (_,i) => route.GET(req(`parallel-${n}-${i}`))));
    assert(responses.every(r => r.status === 200)); assert.equal(calls - before, n);
    for (const r of responses) assert.equal(await r.text(), 'image');
  }
  assert(peak <= 4, `active image work ${peak}`);
  const before = calls;
  await Promise.all(Array.from({length:20}, () => route.GET(req('one-shared')))); assert.equal(calls - before, 1);
  for (const url of ['https://127.0.0.1/a','https://evil.test/a','http://s4.anilist.co/a','https://u:p@s4.anilist.co/a','https://s4.anilist.co:444/a']) assert.equal((await route.GET(req(url))).status, 403);
  assert.equal(calls - before, 1);
  let redirects = 0;
  const redirect = imageRoute(async () => {redirects++; return new Response(null, {status:302, headers:{location:'https://127.0.0.1/secret'}});});
  assert.equal((await redirect.GET(req('redirect'))).status, 502); assert.equal(redirects, 1);
  for (const response of [
    () => new Response('html', {headers:{'content-type':'text/html'}}),
    () => new Response(null, {status:404}),
    () => new Response('x', {headers:{'content-type':'image/jpeg','content-length':String(10*1024*1024+1)}}),
    () => new Response(new Uint8Array(10*1024*1024+1), {headers:{'content-type':'image/jpeg'}}),
    () => new Response('bad', {headers:{'content-type':'image/jpeg','content-length':'100'}}),
  ]) {
    const failed = await imageRoute(async () => response()).GET(req('bad'));
    assert.equal(failed.status, 502); assert.match(failed.headers.get('cache-control'), /no-store/);
  }
  const timeout = imageRoute(async () => {throw new DOMException('origin timeout','TimeoutError');});
  assert.equal((await timeout.GET(req('timeout'))).status, 502);
  let bodyCancelled = false;
  const cancelRoute = imageRoute(async () => new Response(new ReadableStream({
    pull() {return new Promise(() => {});}, cancel() {bodyCancelled = true;},
  }), {headers:{'content-type':'image/jpeg'}}));
  const controller = new AbortController();
  const pending = cancelRoute.GET(req('cancel', controller.signal));
  await delay(5); controller.abort(); assert.equal((await pending).status, 499);
  await delay(5); assert(bodyCancelled, 'last disconnected waiter cancels body');
}
async function dnsChecks() {
  let addresses, options, host;
  const transport = load('lib/image-upstream-server.ts', {
    'node:https': {request(url, opts) {host = url.hostname; options = opts; const emitter = new EventEmitter(); emitter.end = () => {}; return emitter;}},
    'node:dns': {lookup(name, opts, cb) {assert.equal(name,host); cb(null, addresses);}},
  });
  for (const ip of ['127.0.0.1','10.1.1.1','169.254.169.254','172.16.0.1','192.168.0.1','100.64.0.1','0.0.0.0','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::']) assert(!transport.isPublicImageAddress(ip), ip);
  for (const ip of ['1.1.1.1','8.8.8.8','2606:4700:4700::1111']) assert(transport.isPublicImageAddress(ip), ip);
  void transport.fetchImageUpstream(new URL('https://s4.anilist.co/a'), {headers:{}, signal: new AbortController().signal});
  addresses = [{address:'1.1.1.1',family:4}];
  options.lookup(host, {all:true}, (err, result) => {assert.ifError(err); assert.deepEqual(result,addresses);});
  addresses = [{address:'1.1.1.1',family:4},{address:'127.0.0.1',family:4}];
  options.lookup(host, {}, error => assert(error, 'reject mixed public/private DNS answers'));
}
async function jikanChecks() {
  const originalFetch = global.fetch; let calls = 0;
  const route = load('app/api/jikan/anime/route.ts', {'next/server': {NextResponse: Response}});
  const request = id => ({nextUrl:new URL('https://example.test/api/jikan/anime?malId='+id)});
  try {
    global.fetch = async () => {calls++; await delay(1); return Response.json({data:{images:{webp:{image_url:'https://cdn.myanimelist.net/poster.webp'}}}});};
    await Promise.all(Array.from({length:20}, () => route.GET(request('1')))); assert.equal(calls,1);
    global.fetch = async () => {calls++; return new Response(null,{status:503});};
    for(let i=0;i<2;i++) {const r=await route.GET(request('2')); assert.equal(r.status,503); assert.match(r.headers.get('cache-control'),/no-store/);}
    assert.equal(calls,3);
    assert.equal((await route.GET(request('0'))).status,400);
  } finally {global.fetch = originalFetch;}
}
if (require.main === module) {
  // Never call production, payment, notification or user write endpoints.
  const keepAlive = setInterval(() => {},1000);
  (async () => {await cacheChecks(); await gateChecks(); await imageChecks(); await dnsChecks(); await jikanChecks(); console.log('PASS Railway cost: byte budgets, expiry, dedupe, admission, cancellation, image failures/redirects, socket DNS pinning, Jikan outage');})()
    .catch(error => {console.error(error); process.exitCode=1;}).finally(() => clearInterval(keepAlive));
}
module.exports = {load, imageRoute, req};
