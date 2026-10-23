/* Behavioural coverage: real image candidates, responsive endpoints, mounted
 * components and the shared warmup observer. No outbound image requests. */
process.env.NODE_ENV = 'test';
process.env.NEXT_PUBLIC_MEDIA_ORIGIN = 'https://media.youranimebox.com';
process.env.NEXT_PUBLIC_MEDIA_RU_ORIGIN = 'https://ru-media.test';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const modules = new Map();
function load(file, mocks = {}) {
  if (modules.has(file) && !Object.keys(mocks).length) return modules.get(file);
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
    return require(name);
  }, mod, mod.exports);
  if (!Object.keys(mocks).length) modules.set(file, mod.exports);
  return mod.exports;
}
const delivery = load('lib/media-delivery.ts');
const service = load('lib/image-service.ts');
const poster = { extraLarge: 'https://s4.anilist.co/extra-large.jpg',
  large: 'https://s4.anilist.co/large.jpg', medium: 'https://s4.anilist.co/medium.jpg',
  fallbackUrls: ['https://shikimori.io/system/animes/original/20.jpg'] };
const parseSet = value => value.split(', ').map(entry => {
  const [raw, width] = entry.split(' ');
  return { url: new URL(raw), width };
});
const candidates = service.getImageCandidates(poster, 'compact', { preset: 'card', quality: 70 });
assert.equal(new URL(candidates[0]).searchParams.get('url'), poster.extraLarge);
assert.equal(new URL(candidates[1]).origin, 'https://ru-media.test');
const cardSet = parseSet(service.getImageMediaSrcSet(poster, 'compact', 'card', 70));
assert.deepEqual(cardSet.map(x => x.width), ['240w', '360w', '540w', '720w']);
assert.ok(cardSet.every(x => x.url.searchParams.get('url') === poster.extraLarge && x.url.searchParams.get('q') === '70'));
const tiny = service.getImageCandidates(poster, 'compact', { preset: 'tiny' });
assert.equal(new URL(tiny[0]).searchParams.get('url'), poster.large, 'tiny origins retain their budget');
assert.equal(new URL(tiny[0]).searchParams.get('w'), '144');
for (const format of ['webp', 'avif', 'auto']) {
  const set = parseSet(service.getImageCandidateMediaSrcSet(candidates[1], 'card', 70, format));
  assert.ok(set.every(x => x.url.origin === 'https://ru-media.test' &&
    x.url.searchParams.get('url') === poster.extraLarge && x.url.searchParams.get('f') === format));
}
for (const invalid of [poster.extraLarge, '/api/image?url=x', '/anime-placeholder.svg',
  'https://unrelated.test/image?url=' + encodeURIComponent(poster.extraLarge),
  'https://media.youranimebox.com/not-image?url=' + encodeURIComponent(poster.extraLarge),
  'https://media.youranimebox.com/image?url=javascript:alert(1)',
  'https://media.youranimebox.com/image?url=' + encodeURIComponent(candidates[0])]) {
  assert.equal(delivery.buildMediaCandidateSrcSet(invalid, 'card'), undefined,
    'direct/local/unconfigured/recursive paths must not inherit the failed primary srcset');
}
assert.ok(candidates.length <= 9, 'independent sources remain bounded with two configured media origins');
assert.equal(candidates.length, new Set(candidates).size);
const mislabeled = {
  extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/small/known.jpg',
  large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/known.jpg',
  original: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/known.jpg',
};
const repaired = service.getImageCandidates(mislabeled, 'compact', { preset: 'card' });
assert.equal(new URL(repaired[0]).searchParams.get('url'), mislabeled.original,
  'a field named extraLarge cannot promote a known thumbnail above an available original');
assert.equal(new URL(repaired[2], 'https://youranimebox.com').searchParams.get('url'), mislabeled.original);
assert.equal(new URL(repaired[2], 'https://youranimebox.com').searchParams.get('optimize'), 'webp');
assert.ok(repaired.indexOf(repaired[2]) < repaired.indexOf(mislabeled.extraLarge));
assert.ok(parseSet(service.getImageMediaSrcSet(mislabeled, 'compact', 'card')).every(x =>
  x.url.searchParams.get('url') === mislabeled.original), 'srcset follows the same reordered source');
const thumbnailOnly = service.getImageCandidates({ extraLarge: mislabeled.extraLarge }, 'compact', { preset: 'card' });
assert.ok(thumbnailOnly.every(value => value.startsWith('/') || value === mislabeled.extraLarge ||
  new URL(value).searchParams.get('url') === mislabeled.extraLarge), 'missing high-resolution URLs are never invented');

// Regression test: real AniList upstream contract and explicit extraLarge
// AniList GraphQL assigns coverImage.extraLarge to /cover/large/ (original) and
// coverImage.large to /cover/medium/ (thumbnail). The candidate chain must prioritize
// the best resolution (/cover/large/) over the downscaled thumbnail (/cover/medium/).
const realAnilistCover = {
  extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx20-dE6UHbFFg1A5.jpg',
  large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx20-dE6UHbFFg1A5.jpg',
  medium: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/small/bx20-dE6UHbFFg1A5.jpg',
};
const realCandidates = service.getImageCandidates(realAnilistCover, 'compact', { preset: 'card' });
assert.equal(new URL(realCandidates[0], 'https://youranimebox.com').searchParams.get('url'), realAnilistCover.extraLarge,
  'real AniList coverImage.extraLarge (/cover/large/) must be prioritized over downscaled thumbnail (/cover/medium/)');
assert.ok(realCandidates.indexOf(realCandidates[0]) < realCandidates.indexOf(realAnilistCover.large));

// Also verify that if a provider/mirror supplies a distinct /cover/extraLarge/ path, it is prioritized above /cover/large/
const distinctExtraLarge = {
  extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/extraLarge/anime1.jpg',
  large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/anime1.jpg',
  medium: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/anime1.jpg',
};
const qualityCandidates = service.getImageCandidates(distinctExtraLarge, 'compact', { preset: 'card' });
assert.equal(new URL(qualityCandidates[0], 'https://youranimebox.com').searchParams.get('url'), distinctExtraLarge.extraLarge,
  'distinct extraLarge path must be preferred over large for card preset');
assert.ok(qualityCandidates.indexOf(qualityCandidates[0]) < qualityCandidates.indexOf(distinctExtraLarge.large));


// Actual mounted components: onError must switch BOTH src and srcset. Neither
// picture source may keep pointing at the failed primary, including auto mode.
global.window = { innerHeight: 900, innerWidth: 1200, setTimeout, clearTimeout,
  requestAnimationFrame: fn => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout,
  addEventListener() {}, removeEventListener() {} };
global.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
Object.defineProperty(global, 'navigator', { value: { onLine: true }, configurable: true });
const health = {
  getMediaEdgeRetryAfterMs: () => 0, getMediaEdgeHealthRevision: () => 0,
  getMediaEdgeHealthServerRevision: () => 0, isMediaEdgeBlocked: () => false,
  isAnimeBoxMediaRequest: x => x.startsWith('https://media.') || x.startsWith('https://ru-media.'),
  reportMediaEdgeFailure() {}, reportMediaEdgeSuccess() {}, subscribeMediaEdgeHealth: () => () => {},
};
async function mounted(file, props) {
  const Component = load(file, {
    '@/lib/image-service': service,
    '@/lib/media-warmup-client': { observeNearViewportMedia: () => () => {} },
    '@/lib/media-edge-health-client': health,
  }).default;
  let tree;
  await act(async () => { tree = create(React.createElement(Component, props), {
    createNodeMock: element => element.type === 'img' ? { complete: false }
      : { getBoundingClientRect: () => ({ top: 10, bottom: 200, left: 10, right: 200 }) },
  }); });
  const img = () => tree.root.findByType('img');
  assert.equal(new URL(img().props.src).origin, 'https://media.youranimebox.com');
  const failedPrimaryLoad = img().props.onLoad;
  await act(async () => img().props.onError());
  await act(async () => failedPrimaryLoad({ currentTarget: { naturalWidth: 600, naturalHeight: 900 } }));
  assert.match(img().props.className, /opacity-0/, 'late primary completion cannot mark the fallback loaded');
  assert.equal(new URL(img().props.src).origin, 'https://ru-media.test');
  assert.ok(parseSet(img().props.srcSet).every(x => x.url.origin === 'https://ru-media.test'));
  assert.equal(img().props.sizes, '180px');
  for (const source of tree.root.findAllByType('source')) {
    assert.ok(parseSet(source.props.srcSet).every(x => x.url.origin === 'https://ru-media.test'));
  }
  await act(async () => img().props.onError());
  assert.ok(img().props.src.startsWith('/api/image?'), 'same best-original recovery stays server-side');
  assert.equal(new URL(img().props.src, 'https://youranimebox.com').searchParams.get('url'), poster.extraLarge);
  assert.equal(new URL(img().props.src, 'https://youranimebox.com').searchParams.get('optimize'), 'webp');
  assert.equal(img().props.srcSet, undefined);
  assert.equal(tree.root.findAllByType('source').length, 0, 'picture cannot revive failed primary on raw/proxy recovery');
  const previousLoad = img().props.onLoad;
  const replacement = { ...props, image: { ...poster, extraLarge: poster.extraLarge + '?title=2' },
    sources: [poster.extraLarge + '?title=2', ...poster.fallbackUrls] };
  await act(async () => tree.update(React.createElement(Component, replacement)));
  assert.equal(new URL(img().props.src).origin, 'https://media.youranimebox.com');
  await act(async () => previousLoad({ currentTarget: { naturalWidth: 600, naturalHeight: 900 } }));
  assert.match(img().props.className, /opacity-0/, 'previous title completion cannot mark the new title loaded');
  await act(async () => tree.update(React.createElement(Component, props)));
  assert.equal(new URL(img().props.src).origin, 'https://media.youranimebox.com', 'A -> B -> A resets source selection');
  await act(async () => tree.unmount());
}
(async () => {
  await mounted('components/AnimeImage.tsx', { image: poster, sourcePreference: 'compact', preset: 'card',
    quality: 70, sizes: '180px', loading: 'lazy', format: 'auto' });
  await mounted('components/AnimeImageCascade.tsx', { sources: [poster.extraLarge, ...poster.fallbackUrls],
    quality: 80, sizes: '180px', loading: 'lazy', preset: 'large' });

  // The detail-poster retry remains finite after the state consolidation.
  // Use timers controlled by the fixture, without waiting 16 real seconds.
  const savedSet = window.setTimeout, savedClear = window.clearTimeout;
  const pending = new Map(); let timerId = 0;
  window.setTimeout = (fn, delay) => { pending.set(++timerId, { fn, delay }); return timerId; };
  window.clearTimeout = id => pending.delete(id);
  const Cascade = load('components/AnimeImageCascade.tsx', { '@/lib/image-service': service }).default;
  let retryTree;
  await act(async () => { retryTree = create(React.createElement(Cascade, {
    sources: [poster.extraLarge], loading: 'lazy',
  }), { createNodeMock: () => ({ complete: false }) }); });
  const exhaust = async () => {
    for (let step = 0; step < 12; step++) {
      const image = retryTree.root.findByType('img');
      if (image.props.src === '/anime-placeholder.svg') return;
      await act(async () => image.props.onError());
    }
    assert.fail('cascade must reach terminal fallback in a bounded number of errors');
  };
  await exhaust();
  assert.equal(pending.size, 1);
  const [{ fn, delay }] = pending.values(); pending.clear();
  assert.equal(delay, 16000);
  await act(async () => fn());
  assert.ok(retryTree.root.findByType('img').props.src.startsWith('https://media.'));
  await exhaust();
  assert.equal(pending.size, 0, 'a persistent failure stops after one retry');
  await act(async () => retryTree.unmount());
  assert.equal(pending.size, 0, 'unmount removes retry timers');
  window.setTimeout = savedSet; window.clearTimeout = savedClear;

  // The shared observer is still one per module. Only supporting engines get
  // nested scroll margins; legacy engines retain the existing rootMargin path.
  for (const supported of [true, false]) {
    const observers = [];
    global.IntersectionObserver = class {
      constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); }
      observe() {} unobserve() {}
    };
    if (supported) Object.defineProperty(IntersectionObserver.prototype, 'scrollMargin', { value: '0px' });
    const warmup = load('lib/media-warmup-client.ts', { unused: true });
    const first = {}, second = {}, calls = [];
    const cleanA = warmup.observeNearViewportMedia(first, value => calls.push(value));
    const cleanB = warmup.observeNearViewportMedia(second, value => calls.push(value));
    assert.equal(observers.length, 1, 'posters share a single observer');
    const [, right, , left] = observers[0].options.rootMargin.split(' ');
    assert.equal(observers[0].options.scrollMargin, supported ? `0px ${right} 0px ${left}` : undefined,
      'nested warmup must not expand the vertical network window');
    observers[0].callback([{ target: first, isIntersecting: false }]);
    assert.equal(calls.length, 0, 'far posters stay deferred');
    observers[0].callback([{ target: first, isIntersecting: true }, { target: first, isIntersecting: true }]);
    assert.deepEqual(calls, ['warm'], 'each near poster is released only once');
    cleanA(); cleanB();
  }
  delete global.IntersectionObserver;
  for (const file of ['components/AnimeCard.tsx', 'components/SmartRecommendationCard.tsx']) {
    assert.match(fs.readFileSync(file, 'utf8'), /quality=\{70\}/, 'visible cards use the canonical q70 variant');
  }
  console.log('PASS poster fidelity: DPR originals, tiny budget, real fallback srcsets, format routing and shared nested-scroll warmup.');
})().catch(error => { console.error(error); process.exitCode = 1; });
