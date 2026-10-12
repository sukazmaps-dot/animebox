const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
global.window = {
  innerHeight: 800, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {}, length: 0 },
  setTimeout, clearTimeout, requestAnimationFrame: (fn) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout,
  addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: true }),
};
// No IntersectionObserver: the visibility path must still bootstrap rows.
delete global.IntersectionObserver;
function loadFeed() {
  const filename = path.resolve('components/SmartRecommendationFeed.tsx');
  const mod = new Module(filename); mod.filename = filename; mod.paths = Module._nodeModulePaths(process.cwd());
  const req = mod.require.bind(mod);
  const rail = (id, items) => ({ id, items, title: id, subtitle: '', source: id, badge: id });
  const mocks = {
    '@/components/SmartRecommendationCard': { default: ({ recommendation }) => React.createElement('article', { 'data-id': recommendation.anime.id }) },
    '@/components/home/HomeLoadingSkeletons': { RecommendationCardSkeleton: () => React.createElement('i') },
    '@/components/ui/ScrollRow': { default: ({ children }) => React.createElement('div', null, children) },
    '@/lib/recommendations': { getPersonalizedRecommendations: (items) => items.map((anime) => ({ anime })) },
    '@/lib/taste-graph': { readCachedTasteGraph: () => null },
    '@/lib/product-events-client': { trackProductClientEvent() {} },
    '@/lib/home-rail-session': { reconcileHomeRails: (_, incoming) => incoming },
    '@/lib/recommendation-rails': {
      DEFAULT_RECOMMENDATION_RAIL_LIMIT: 5, RECOMMENDATION_RAIL_BATCH_SIZE: 5,
      SESSION_STABLE_RAIL_ORDER: ['top_match', 'endless'], getHomeScheduleInsertionIndex: () => -1,
      recommendationMatchesRail: (item, row) => item.anime.lane === row.id,
      recommendationMatchesRailRelaxed: (item, row) => item.anime.lane === row.id,
      buildRecommendationRailLayout: (items, { ownership }) => ({ ownership, rails: ['top_match', 'endless'].map((id) => rail(id, items.filter((item) => ownership.get(item.anime.id) === id))) }),
    },
  };
  for (const value of Object.values(mocks)) value.__esModule = true;
  mod.require = (name) => mocks[name] ?? req(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  return mod.exports.default;
}
const payload = (items, hasMore = false, nextPage = null) => ({ items, page: 2, hasMore, bucket: 0, nextPage, nextCursor: null });
async function settle() { for (let n = 0; n < 5; n++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); }); }
async function mount(Feed) {
  let tree;
  await act(async () => { tree = create(React.createElement(Feed, { items: [], mood: 'any', hasWatchHistory: false }), {
    createNodeMock: (element) => element.type === 'section' ? { getBoundingClientRect: () => ({ top: 0, bottom: 300 }) } : null,
  }); });
  return tree;
}
(async () => {
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: true, json: async () => payload([{ id: 101, lane: 'top_match' }, { id: 102, lane: 'endless' }]) }; };
  let tree = await mount(loadFeed()); await settle();
  assert.deepEqual(tree.root.findAllByType('article').map((x) => x.props['data-id']).sort(), [101, 102]);
  assert.equal(calls, 1, 'visible rows share the same page request');
  await act(async () => tree.unmount());

  calls = 0;
  let recover = false;
  global.fetch = async () => { calls++; return !recover ? { ok: false, status: 400 } : { ok: true, json: async () => payload([{ id: 201, lane: 'top_match' }, { id: 202, lane: 'endless' }]) }; };
  tree = await mount(loadFeed()); await settle();
  const retry = tree.root.findAllByType('button').find((x) => String(x.props.children).includes('Повторить'));
  assert.ok(retry, 'error exposes recovery instead of an endless skeleton');
  recover = true;
  await act(async () => retry.props.onClick()); await settle();
  assert.ok(tree.root.findAllByType('article').some((x) => x.props['data-id'] === 201));
  await act(async () => tree.unmount());

  calls = 0;
  let refill = false;
  global.fetch = async (url) => { calls++; const page = Number(new URL(url, 'https://test.local').searchParams.get('page')); return { ok: true, json: async () => ({ ...payload(refill ? [{ id: 301, lane: 'top_match' }] : [], true, page + 1), page }) }; };
  tree = await mount(loadFeed()); await settle();
  const resume = tree.root.findAllByType('button').find((x) => String(x.props.children).includes('Продолжить поиск'));
  assert.ok(resume, 'a sparse window with hasMore is recoverable');
  refill = true;
  await act(async () => resume.props.onClick()); await settle();
  assert.ok(tree.root.findAllByType('article').some((x) => x.props['data-id'] === 301));
  await act(async () => tree.unmount());
  console.log('PASS: real feed mounts without IntersectionObserver, deduplicates simultaneous rows, retries errors and resumes a sparse candidate window.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
