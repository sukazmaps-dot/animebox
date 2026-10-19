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
let runtime;
const mocks = {
  '@/components/AnimeImage': { default: props => React.createElement('img', { alt: props.alt, 'data-priority': props.fetchPriority }) },
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
assert(html.includes('data-priority="low"'));
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
  const another = () => tree.root.findByType('button');
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
  console.log('PASS: tonight candidates, honest reasons, canonical links, loading/empty, stable picks, alternatives/reset, removed IDs, mood integration and click attribution.');
})().catch(error => { console.error(error); process.exitCode = 1; });
