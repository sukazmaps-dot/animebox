process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
function compile(file, imports = {}) {
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText)((name) => imports[name] ?? require(name), mod, mod.exports);
  return mod.exports;
}
let now = 0, sequence = 0;
const timers = new Map(), listeners = new Map();
const setTimer = (fn, delay) => { const id = ++sequence; timers.set(id, { fn, at: now + delay }); return id; };
const clearTimer = id => timers.delete(id);
const add = (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); };
const remove = (type, fn) => listeners.get(type)?.delete(fn);
async function event(type, data = {}) { await act(async () => { for (const fn of [...(listeners.get(type) ?? [])]) fn(data); }); }
async function advance(ms) {
  const until = now + ms;
  for (let n = 0; n < 1000; n++) {
    const next = [...timers].filter(([, t]) => t.at <= until).sort((a,b) => a[1].at - b[1].at)[0];
    if (!next) { now = until; return; }
    now = next[1].at; timers.delete(next[0]); await act(async () => next[1].fn());
  }
  throw new Error('Unbounded timer loop');
}
global.setTimeout = setTimer; global.clearTimeout = clearTimer;
global.requestAnimationFrame = fn => setTimer(fn, 0); global.cancelAnimationFrame = clearTimer;
global.innerHeight = 800; global.innerWidth = 1200;
global.window = { innerHeight, innerWidth, setTimeout: setTimer, clearTimeout: clearTimer, requestAnimationFrame, cancelAnimationFrame, addEventListener: add, removeEventListener: remove };
global.document = { body: {}, visibilityState: 'visible' };
Object.defineProperty(global, 'navigator', { value: { onLine: true }, configurable: true });
const observers = new Set();
global.ResizeObserver = class { observe() { observers.add(this); } disconnect() { observers.delete(this); } };

async function tooltip() {
  const Link = React.forwardRef((props, ref) => React.createElement('a', { ...props, ref }));
  const Tip = compile('components/ui/TooltipLink.tsx', {
    'next/link': { __esModule: true, default: Link },
    'react-dom': { createPortal: node => node },
    './TooltipLink.module.css': { __esModule: true, default: { tooltip: 'tooltip' } },
  }).default;
  let keyboard = false, outside = false, tree;
  const children = () => React.createElement('section', null, ['a','b'].map(name => React.createElement(Tip, { key: name, href: '/' + name, label: name }, name)));
  await act(async () => { tree = create(children(), {
    createNodeMock: el => el.type === 'a' ? { matches: () => keyboard, getBoundingClientRect: () => ({ top: outside ? 900 : 300, bottom: outside ? 950 : 350, left: 100, right: 250, width: 150 }) }
      : { getBoundingClientRect: () => ({ width: 320, height: 120 }) },
  }); });
  const anchor = index => tree.root.findAllByType('a')[index];
  const count = () => tree.root.findAllByProps({ role: 'tooltip' }).length;
  const subscriptions = () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
  assert.equal(subscriptions(), 0, 'idle links must not subscribe globally');
  await act(async () => anchor(0).props.onPointerEnter({ pointerType: 'mouse' }));
  assert.equal(subscriptions(), 3, 'pending owner cancels on scroll/resize/Escape');
  await advance(349); assert.equal(count(), 0);
  await advance(1); assert.equal(count(), 1);
  await act(async () => anchor(0).props.onPointerLeave());
  await advance(100);
  await act(async () => anchor(0).props.onPointerEnter({ pointerType: 'mouse' }));
  await advance(100);
  assert.equal(count(), 1, 'returning during close delay preserves visible tooltip');
  assert.equal(timers.size, 0, 'reentry must not schedule a second opening timer');
  assert.equal(tree.root.findByProps({ role: 'tooltip' }).props.onPointerEnter, undefined);
  await act(async () => anchor(1).props.onPointerEnter({ pointerType: 'mouse' }));
  assert.equal(count(), 0); await advance(350); assert.equal(count(), 1);
  assert.equal(subscriptions(), 3, 'switching owners must not multiply global listeners');
  await act(async () => anchor(1).props.onPointerLeave()); await advance(150); assert.equal(count(), 0);
  assert.equal(subscriptions(), 0, 'closed owner releases global listeners');
  await act(async () => anchor(0).props.onPointerEnter({ pointerType: 'touch' })); await advance(500); assert.equal(count(), 0);
  await act(async () => anchor(0).props.onPointerLeave());
  assert.equal(timers.size, 0, 'touch leave must not start an orphan close timer');
  keyboard = true; await act(async () => anchor(0).props.onFocus()); assert.equal(count(), 1);
  await event('keydown', { key: 'Escape' }); assert.equal(count(), 0);
  keyboard = false; await act(async () => anchor(0).props.onFocus()); assert.equal(count(), 0, 'mouse focus is not keyboard focus');
  await act(async () => anchor(0).props.onPointerEnter({ pointerType: 'mouse' }));
  await event('scroll'); await advance(400); assert.equal(count(), 0, 'scroll cancels pending open');
  keyboard = true; await act(async () => anchor(0).props.onFocus());
  await event('resize'); assert.equal(count(), 0);
  assert.equal(subscriptions(), 0); assert.equal(observers.size, 0);
  outside = true;
  await act(async () => anchor(0).props.onFocus()); await advance(1);
  assert.equal(count(), 0, 'offscreen anchor dismisses panel');
  assert.equal(subscriptions(), 0, 'offscreen anchor must release ownership subscriptions');
  outside = false; keyboard = false;
  for (const state of ['pending', 'open', 'leaving']) {
    await act(async () => anchor(0).props.onPointerEnter({ pointerType: 'mouse' }));
    if (state !== 'pending') await advance(350);
    if (state === 'leaving') await act(async () => anchor(0).props.onPointerLeave());
    await act(async () => tree.update(null));
    assert.equal(subscriptions(), 0, state + ' unmount listeners');
    assert.equal(timers.size, 0, state + ' unmount timers/RAF');
    assert.equal(observers.size, 0, state + ' unmount observer');
    await act(async () => tree.update(children()));
  }
  await act(async () => tree.unmount()); assert.equal(timers.size, 0);
  assert.match(fs.readFileSync('components/ui/TooltipLink.module.css', 'utf8'), /pointer-events:\s*none/);
}
async function images() {
  const sources = ['https://media.youranimebox.com/image?url=x', '/api/image?url=x&fallback=error', '/brand/brand-mark.webp'];
  let blocked = false, cooldown = 60000, outside = false, tree;
  const Image = compile('components/AnimeImage.tsx', {
    '@/lib/image-service': { getImageCandidates: image => image ? sources.slice(0, -1) : [], getImageMediaSrcSet: () => undefined },
    '@/lib/media-warmup-client': { observeNearViewportMedia: () => () => {} },
    '@/lib/media-edge-health-client': {
      getMediaEdgeRetryAfterMs: () => cooldown, getMediaEdgeHealthRevision: () => 0, getMediaEdgeHealthServerRevision: () => 0,
      isMediaEdgeBlocked: src => blocked && src.startsWith('https://media.'), isAnimeBoxMediaRequest: src => src.startsWith('https://media.'),
      reportMediaEdgeFailure() {}, reportMediaEdgeSuccess() {}, subscribeMediaEdgeHealth: () => () => {},
    },
  }).default;
  const mount = async image => { await act(async () => { tree = create(React.createElement(Image, { image, loading: 'lazy' }), { createNodeMock: el => el.type === 'img' ? { complete: false } : { getBoundingClientRect: () => ({ top: outside ? 1000 : 10, bottom: outside ? 1100 : 110, left: 10, right: 100 }) } }); }); };
  const host = () => tree.root.findByProps({ 'data-image-delivery': 'animebox-media' });
  const fail = async () => { await act(async () => tree.root.findByType('img').props.onError()); };
  const fall = async () => { for(let n=0; n<5 && host().props['data-image-state']!=='fallback'; n++) await fail(); assert.equal(host().props['data-image-state'],'fallback'); };
  await mount({ large: 'x' }); await fall(); blocked = true;
  assert.equal(host().props['data-image-last-failure-stage'], 'proxy');
  assert.equal(host().props['data-image-last-failure-reason'], 'network-or-decode');
  navigator.onLine = false; await advance(45000); assert.equal(host().props['data-image-retry-count'], 0);
  navigator.onLine = true; document.visibilityState = 'hidden'; await event('online'); await advance(6000); assert.equal(host().props['data-image-retry-count'], 0);
  document.visibilityState = 'visible'; outside = true; await advance(30000); assert.equal(host().props['data-image-retry-count'], 0);
  outside = false; await advance(30000);
  assert.equal(tree.root.findByType('img').props.src, sources[1], 'first retry bypasses Worker cooldown');
  assert.equal(host().props['data-image-retry-count'], 1);
  await fail(); await advance(65000); assert.equal(host().props['data-image-retry-count'], 1, 'second attempt waits for cooldown');
  cooldown = 0; blocked = false; await advance(65000);
  assert.equal(host().props['data-image-retry-count'], 2);
  await fall(); await advance(300000); assert.equal(host().props['data-image-retry-count'], 2);
  assert.equal(timers.size, 0, 'persistent failure stops retrying');
  await act(async () => tree.update(React.createElement(Image, { image: null, loading: 'lazy' })));
  assert.equal(host().props['data-image-retry-count'], 0); assert.equal(host().props['data-image-last-failure-stage'], undefined); assert.equal(timers.size, 0);
  await act(async () => tree.update(React.createElement(Image, { image: { large: 'x' }, loading: 'lazy' })));
  assert.equal(host().props['data-image-source-index'], 0, 'A -> B -> A starts a fresh load');
  assert.equal(host().props['data-image-retry-count'], 0);
  await act(async () => tree.unmount());
  await mount({ large: 'x' }); await fall(); await advance(45000);
  await act(async () => tree.root.findByType('img').props.onLoad({ currentTarget: { naturalWidth: 230, naturalHeight: 325 } }));
  assert.equal(host().props['data-image-state'], 'loaded'); assert.equal(timers.size, 0, 'success cancels recovery');
  await act(async () => tree.unmount()); assert.equal(timers.size, 0);
}
async function cache() {
  const policy = compile('lib/edge-cache-policy.ts');
  for (const method of ['GET','HEAD']) assert.equal(policy.isPublicCacheableApiRequest('/api/image', method), true);
  for (const [url, method] of [['/api/image','POST'],['/api/image-other','GET'],['/api/community/tracker','GET']]) assert.equal(policy.isPublicCacheableApiRequest(url, method), false);
  const { NextRequest, NextResponse } = require('next/server');
  const shield = compile('proxy.ts', { '@/lib/edge-cache-policy': policy, '@/lib/browser-request-origin': { isProductionDeployment: () => false, isAllowedBrowserOrigin: () => true } });
  const headers = shield.proxy(new NextRequest('https://youranimebox.com/api/image?url=x')).headers;
  assert.equal(headers.get('cache-control'), null, 'shield must leave image cache policy to handler');
  assert.equal(shield.proxy(new NextRequest('https://youranimebox.com/api/community/tracker')).headers.get('cache-control'), 'private, no-store');
  let limited = false;
  const route = compile('app/api/image/route.ts', {
    '@/lib/public-result-cache': compile('lib/public-result-cache.ts'),
    '@/lib/api-rate-limit': { enforceIpRateLimit: async () => limited ? new NextResponse(null, { status: 429 }) : null },
    '@/lib/edge-cache-policy': policy,
  });
  global.fetch = async () => new Response(Uint8Array.from([1,2,3]), { headers: { 'content-type': 'image/jpeg' } });
  const request = suffix => new NextRequest('https://youranimebox.com/api/image' + suffix);
  const good = await route.GET(request('?url=https://s4.anilist.co/test.jpg&fallback=error'));
  assert.equal(good.status, 200);
  assert.equal(good.headers.get('cache-control'), 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=2592000');
  assert.match(good.headers.get('cdn-cache-control'), /max-age=2592000/);
  const noStore = response => { for (const key of ['cache-control','cdn-cache-control','cloudflare-cdn-cache-control','vercel-cdn-cache-control']) assert.match(response.headers.get(key), /no-store/); };
  for (const suffix of ['', '?url=/api/foo', '?url=https://evil.test/x']) noStore(await route.GET(request(suffix)));
  global.fetch = async () => new Response(null, { status: 403 });
  const bad = await route.GET(request('?url=https://s4.anilist.co/missing.jpg&fallback=error'));
  assert.equal(bad.status,502); noStore(bad);
  limited = true; const rate = await route.GET(request('?url=x')); assert.equal(rate.status,429); noStore(rate);
}
(async () => { await tooltip(); await images(); await cache(); console.log('PASS: tooltip lifecycle; bounded independent poster recovery; actual image route and shield cache/error policies.'); })().catch(error => { console.error(error); process.exitCode = 1; });
