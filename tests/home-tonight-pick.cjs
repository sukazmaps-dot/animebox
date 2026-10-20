/* eslint-disable @typescript-eslint/no-require-imports -- CJS harness must select React's test exports before loading React. */
process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;

const events = [];
let authUser = null;
let authLoading = false;
const authPrompts = [];
const libraryRequests = [];
let saveLibrary = async () => {};
let phone = false;
const mediaListeners = new Set();
let runtime;
const mocks = {
  './HomeTonightArtwork': { default: () => React.createElement('img', { 'data-priority': 'high' }) },
  './HomeHeroBookmark': { default: () => React.createElement('button', { 'aria-label': 'Добавить в список' }) },
  'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
  '@/components/AuthStateProvider': { useAuthState: () => ({ user: authUser, loading: authLoading }) },
  '@/components/AuthModalProvider': { useAuthModal: () => ({ openAuth: props => authPrompts.push(props) }) },
  '@/lib/community-client': { communityRequest: (path, body) => { libraryRequests.push({path, body}); return saveLibrary(); } },
  '@/components/AnimeImage': { default: props => React.createElement('img', { alt: props.alt, 'data-priority': props.fetchPriority, 'data-image': props.image, 'data-loading': props.loading, 'data-preset': props.preset, 'data-sizes': props.sizes, onError: () => props.onStateChange?.('fallback') }) },
  '@/components/AnimeIntentLink': { default: ({ children, ...props }) => React.createElement('a', props, children) },
  '@/lib/product-events-client': { trackProductClientEvent: (...args) => events.push(args) },
  './useVisibleHomeImpression': { useVisibleHomeImpression: () => React.useRef(null) },
  '@/components/home/HomeFeedRuntimeProvider': { useHomeFeedRuntime: () => runtime },
  '@/components/home/HomePersonalRetentionSections': { HomePersonalScheduleSection: () => null },
  '@/components/home/HomeLoadingSkeletons': { RecommendationFeedSkeleton: () => React.createElement('span', null, 'Loading rails') },
  '@/components/HomeMoodPicker': { default: () => null },
  '@/components/home/SectionHeader': { default: ({ title }) => React.createElement('h2', null, title) },
  'next/dynamic': { default: loader => loader.toString().includes('HomeTonightPick')
    ? load('components/home/HomeTonightPick.tsx').default : () => null },
};
for (const value of Object.values(mocks)) value.__esModule = true;
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const filename = path.resolve(file);
  const mod = new Module(filename); mod.filename = filename; mod.paths = Module._nodeModulePaths(process.cwd());
  cache.set(file, mod);
  const req = mod.require.bind(mod);
  mod.require = name => {
    if (mocks[name]) return mocks[name];
    if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    if (name.startsWith('@/lib/')) return load(name.replace('@/', '') + '.ts');
    if (name.startsWith('@/components/home/')) return load(name.replace('@/', '') + '.tsx');
    if (name === './HomeTonightLoading') return load('components/home/HomeTonightLoading.tsx');
    return req(name);
  };
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, filename);
  return mod.exports;
}
const { homeTonightCandidates, homeTonightReason } = load('lib/home-tonight-pick.ts');
const Pick = load('components/home/HomeTonightPick.tsx').default;
const item = (id, extra = {}) => ({
  anime: { id, slug: 'title-' + id, title: { russian: 'Тайтл ' + id }, genres: ['Drama'], description: '<b>История</b> о дороге домой.', score: 8.4, startDate: { year: 2024 }, format: 'TV' },
  moodTier: 'good', reason: 'Совпадает с твоей историей', explanations: [{ key: 'community_quality', text: 'Высокая оценка сообщества' }],
  ...extra,
});
const a = item(1), b = item(2), c = item(3);
assert.deepEqual(homeTonightCandidates([a, a, item(-1), b], 'any').map(x => x.anime.id), [1, 2]);
assert.equal(homeTonightCandidates([item(1, { franchiseRequiresPrevious: true })], 'any').length, 0);
assert.equal(homeTonightCandidates([item(1, { franchiseRequiresPrevious: true, franchiseContinuation: true })], 'any').length, 1);
assert.equal(homeTonightCandidates([{ ...a, anime: { ...a.anime, isAdult: true } }], 'any').length, 0);
assert.deepEqual(homeTonightCandidates([item(1, { moodTier: 'none' }), b], 'comfort').map(x => x.anime.id), [2]);
const personal = item(4, { explanations: [{ key: 'liked_reference', text: 'Похоже на любимое аниме' }] });
assert.equal(homeTonightReason(personal, 'any', false), 'Один из вариантов текущей подборки.');
assert.equal(homeTonightReason(personal, 'any', true), 'Похоже на любимое аниме');
assert.equal(homeTonightReason(item(5, { explanations: [{ key: 'taste_genres', text: 'Совпадает со вкусом: Drama' }] }), 'any', true), 'Совпадает со вкусом: Драма');
assert.equal(homeTonightReason(item(5, { explanations: [{ key: 'liked_reference', text: 'Похоже на «Drama»' }] }), 'any', true), 'Похоже на «Drama»', 'localization must not rewrite a referenced title');
assert.equal(homeTonightReason(item(5, { explanations: [personal.explanations[0], { key: 'mood_match', text: 'Под выбранное настроение' }] }), 'comfort', false), 'Под выбранное настроение');

const props = { items: [a, b, c], mood: 'any', busy: false, hasWatchHistory: false };
let html = renderToStaticMarkup(React.createElement(Pick, props));
assert(html.includes('href="/anime/title-1/watch?ep=1"'));
assert(html.includes('href="/anime/title-1"'));
assert(html.includes('История о дороге домой.') && !html.includes('<b>История'));
assert(html.includes('data-priority="high"'));
html = renderToStaticMarkup(React.createElement(Pick, { ...props, busy: true }));
assert(html.includes('data-home-tonight="loading"') && !html.includes('<a '), 'busy state has no stale watch link');
html = renderToStaticMarkup(React.createElement(Pick, { ...props, items: [] }));
assert(html.includes('data-home-tonight="empty"') && !html.includes('/watch'), 'empty state is terminal and offers catalogue');
html = renderToStaticMarkup(React.createElement(Pick, { ...props, items: [item(8, { anime: { ...a.anime, id: 8, score: 0, startDate: null, format: null, description: null } })] }));
assert(!html.includes('★') && !html.includes('2024') && !html.includes('История о дороге'), 'unknown metadata is omitted');

(async () => {
  let tree;
  await act(async () => { tree = create(React.createElement(Pick, props)); });
  const selected = () => tree.root.findByType('article').props['data-tonight-anime-id'];
  assert.equal(selected(), 1);
  await act(async () => tree.update(React.createElement(Pick, { ...props, items: [c, b, a] })));
  assert.equal(selected(), 1, 'background reorder cannot replace the pinned pick');
  const another = () => tree.root.findAllByType('button').find(button => ['Другой вариант', 'Начать заново'].includes(button.props.children));
  await act(async () => another().props.onClick()); assert.equal(selected(), 3);
  await act(async () => another().props.onClick()); assert.equal(selected(), 2);
  assert.equal(another().props.children, 'Начать заново', 'all candidates were shown without repeats');
  await act(async () => tree.update(React.createElement(Pick, { ...props, items: [a, c] })));
  assert.equal(tree.root.findAllByType('article').length, 0, 'removing the final pick must not silently repeat skipped titles');
  assert.equal(another().props.children, 'Начать заново');
  await act(async () => another().props.onClick()); assert.equal(selected(), 1, 'reset is explicit and uses the current ranked pool');
  await act(async () => tree.update(React.createElement(Pick, { ...props, items: [b] })));
  assert.equal(selected(), 2, 'removed candidate cannot remain as a stale recommendation');
  assert.equal(another().props.disabled, true, 'one remaining choice cannot pretend to offer alternatives');
  const watch = tree.root.findAllByType('a').find(x => x.props.href.includes('/watch'));
  await act(async () => watch.props.onClick());
  assert.equal(events.at(-1)[0], 'recommendation_click');
  assert.equal(events.at(-1)[1].metadata.action, 'watch');
  assert(!events.some(([name]) => /dismiss|hidden|started/.test(name)), 'browsing variants is neither negative taste feedback nor playback success');
  await act(async () => tree.unmount());

  // Mount the actual integration: selecting a new mood must never relabel an
  // old ranked pool. A failed recomputation must end in empty, not busy forever.
  const Discovery = load('components/home/HomeDiscoverySection.tsx').default;
  runtime = { mood: 'any', recommendationMood: 'any', moodSwitching: false, updateMood() {}, hydrated: true,
    popularLoading: false, ongoingLoading: false, smartRecommendations: [a, b], recommendationsReady: true, hasWatchHistory: false };
  await act(async () => { tree = create(React.createElement(Discovery)); });
  assert.equal(selected(), 1);
  runtime = { ...runtime, mood: 'comfort', moodSwitching: true };
  await act(async () => tree.update(React.createElement(Discovery)));
  assert.equal(tree.root.findAllByType('article').length, 0);
  assert.equal(tree.root.findAll(x => x.props['data-home-tonight'] === 'loading').length, 1);
  runtime = { ...runtime, moodSwitching: false };
  await act(async () => tree.update(React.createElement(Discovery)));
  assert.equal(tree.root.findAll(x => x.props['data-home-tonight'] === 'empty').length, 1);
  runtime = { ...runtime, recommendationMood: 'comfort', smartRecommendations: [b, c] };
  await act(async () => tree.update(React.createElement(Discovery)));
  assert.equal(selected(), 2, 'new mood uses its own ranked result');
  await act(async () => tree.unmount());
  // Test actual artwork selection and subscription cleanup without networking.
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    matchMedia: () => ({ matches: phone, addEventListener: (_, fn) => mediaListeners.add(fn), removeEventListener: (_, fn) => mediaListeners.delete(fn) }),
    dispatchEvent() {},
  } });
  try {
    const Artwork = load('components/home/HomeTonightArtwork.tsx').default;
    const primary = () => tree.root.findAll(node => typeof node.props?.['data-hero-art'] === 'string')[0].findByType('img');
    const ambiance = () => tree.root.findAll(node => Object.hasOwn(node.props ?? {}, 'data-poster-atmosphere'));

    const artworkAnime = { ...a.anime, bannerImage: 'https://example.org/banner.jpg', coverImage: { extraLarge: 'https://example.org/poster.jpg' } };
    await act(async () => { tree = create(React.createElement(Artwork, { anime: artworkAnime })); });
    assert.equal(primary().props['data-image'].extraLarge, artworkAnime.bannerImage);
    assert.equal(primary().props['data-loading'], 'eager');
    await act(async () => primary().props.onError());
    assert.equal(primary().props['data-image'].extraLarge, artworkAnime.coverImage.extraLarge, 'failed banner recovers the same title poster');
    assert.equal(tree.root.findByProps({ 'data-hero-art': 'poster' }).props['aria-hidden'], 'true');
    assert.equal(ambiance().length, 1, 'desktop banner failure uses the same cover to paint its ambient backdrop');
    assert.equal(ambiance()[0].findByType('img').props['data-image'].extraLarge, artworkAnime.coverImage.extraLarge);
    assert.equal(ambiance()[0].props['data-ready'], 'false', 'ambient starts transparent until image loads');
    assert.equal(primary().props['data-preset'], 'large', 'poster is sized for its own slot');
    assert(primary().props['data-sizes'].includes('96px'));
    phone = true;
    await act(async () => { for (const fn of mediaListeners) fn(); });
    assert.equal(primary().props['data-image'].extraLarge, artworkAnime.coverImage.extraLarge, 'phone uses portrait');
    assert.equal(ambiance().length, 0, 'phone must never mount an extra ambient image');
    await act(async () => tree.update(React.createElement(Artwork, { anime: { ...artworkAnime, mobileHeroImage: 'https://example.org/mobile.jpg' } })));
    assert.equal(primary().props['data-image'].extraLarge, 'https://example.org/mobile.jpg');
    assert(tree.root.findByProps({ 'data-hero-art': 'portrait' }));
    await act(async () => primary().props.onError());
    assert.equal(primary().props['data-image'].extraLarge, artworkAnime.coverImage.extraLarge, 'failed mobile artwork also recovers the poster');
    phone = false;
    await act(async () => { for (const fn of mediaListeners) fn(); });
    await act(async () => tree.update(React.createElement(Artwork, { anime: { ...artworkAnime, bannerImage: null } })));
    assert.equal(primary().props['data-image'].extraLarge, artworkAnime.coverImage.extraLarge, 'desktop without banner uses poster');
    assert.equal(ambiance().length, 1, 'saved desktop poster restores the empty hero background');
    assert.equal(ambiance()[0].findByType('img').props['data-sizes'], primary().props['data-sizes'], 'same source sizing avoids a second distinct image request');
    await act(async () => tree.unmount());
    assert.equal(mediaListeners.size, 0, 'resize subscription cleaned up');

    const Bookmark = load('components/home/HomeHeroBookmark.tsx').default;
    await act(async () => { tree = create(React.createElement(Bookmark, { animeId: 1 })); });
    await act(async () => tree.root.findByType('button').props.onClick());
    assert.equal(authPrompts.length, 1, 'guest opens existing auth modal');
    assert.equal(libraryRequests.length, 0, 'guest does not mutate library');
    authUser = { id: 'viewer-a' };
    await act(async () => tree.update(React.createElement(Bookmark, { animeId: 1 })));
    let finish;
    saveLibrary = () => new Promise(resolve => { finish = resolve; });
    let saving;
    await act(async () => {
      saving = tree.root.findByType('button').props.onClick();
      void tree.root.findByType('button').props.onClick();
    });
    assert.equal(libraryRequests.length, 1, 'double click deduplicated');
    assert.equal(tree.root.findByType('button').props.disabled, true);
    await act(async () => tree.update(React.createElement(Bookmark, { animeId: 2 })));
    await act(async () => { finish(); await saving; });
    assert.equal(tree.root.findByType('button').props['aria-pressed'], false, 'old save cannot mark new choice saved');
    saveLibrary = async () => { throw Error('outage'); };
    await act(async () => tree.root.findByType('button').props.onClick());
    assert.equal(tree.root.findByType('span').props.role, 'status', 'save error is visible');
    assert.equal(tree.root.findByType('button').props.disabled, false, 'failed save can retry');
    saveLibrary = async () => {};
    await act(async () => tree.root.findByType('button').props.onClick());
    assert.deepEqual(libraryRequests.at(-1), { path: 'library', body: { animeId: 2, status: 'planned' } });
    assert.equal(tree.root.findByType('button').props['aria-pressed'], true);
    authUser = { id: 'viewer-b' };
    await act(async () => tree.update(React.createElement(Bookmark, { animeId: 2 })));
    assert.equal(tree.root.findByType('button').props['aria-pressed'], false, 'saved state isolated by account');
    await act(async () => tree.unmount());
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
  }
  console.log('PASS: real artwork responsive source/cleanup and bookmark guest, duplicate, pending-choice isolation, error/retry, account isolation.');
  console.log('PASS: tonight candidates, honest reasons, canonical links, loading/empty, stable picks, alternatives/reset, removed IDs, mood integration and click attribution.');
})().catch(error => { console.error(error); process.exitCode = 1; });
