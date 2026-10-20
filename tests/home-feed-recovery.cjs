// Build hosts can set NODE_ENV=production before running prebuild gates.
// React act() is a test-only API: select test exports before requiring React.
// This affects this test process only; the subsequent Next build stays production.
process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;
let viewportWidth = 390;
let sectionTop = 0;
const windowListeners = new Map();
global.window = {
  innerHeight: 800, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {}, length: 0 },
  setTimeout, clearTimeout, requestAnimationFrame: (fn) => setTimeout(fn, 0), cancelAnimationFrame: clearTimeout,
  addEventListener(name, fn) {
    if (!windowListeners.has(name)) windowListeners.set(name, new Set());
    windowListeners.get(name).add(fn);
  },
  removeEventListener(name, fn) { windowListeners.get(name)?.delete(fn); },
  getComputedStyle: () => ({ columnGap: '12px' }),
  matchMedia: () => ({ matches: true }),
};
// No IntersectionObserver: the visibility path must still bootstrap rows.
delete global.IntersectionObserver;
function loadFeed({ realLayout = false } = {}) {
  const filename = path.resolve('components/SmartRecommendationFeed.tsx');
  const mod = new Module(filename); mod.filename = filename; mod.paths = Module._nodeModulePaths(process.cwd());
  const req = mod.require.bind(mod);
  const rail = (id, items) => ({ id, items, title: id, subtitle: '', source: id, badge: id });
  const mocks = {
    '@/components/SmartRecommendationCard': { default: ({ recommendation, onHidden }) => React.createElement('article', { 'data-id': recommendation.anime.id, onHide: () => onHidden(recommendation.anime.id) }) },
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
  if (realLayout) {
    // Keep the actual allocation and reconciliation engines. The old fixture
    // invented rows even when the production layout returned no rows at all.
    const compile = (file, requireModule) => {
      const target = { exports: {} };
      new Function('require', 'exports', 'module', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
      }).outputText)(requireModule, target.exports, target);
      return target.exports;
    };
    mocks['@/lib/recommendation-rails'] = compile('lib/recommendation-rails.ts',
      () => ({ getRecommendationMoodLabel: x => x }));
    mocks['@/lib/home-rail-session'] = compile('lib/home-rail-session.ts', req);
  }
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
    // Production now measures real rail/slide geometry. Keep the original
    // recovery cases and give the fixture the same DOM surface as a section.
    createNodeMock: (element) => element.type === 'section' ? {
      getBoundingClientRect: () => ({ top: sectionTop, bottom: sectionTop + 300 }),
      querySelector: () => ({
        get clientWidth() { return viewportWidth; },
        querySelector: () => ({ getBoundingClientRect: () => ({ width: 170 }) }),
      }),
    } : null,
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
  assert.ok(!tree.root.findAllByType('section').find(x => x.props.className === 'smart-feed__personal-rail' && x.findAllByType('button').includes(retry))?.props.hidden, 'error recovery must remain visible');
  recover = true;
  await act(async () => retry.props.onClick()); await settle();
  assert.ok(tree.root.findAllByType('article').some((x) => x.props['data-id'] === 201));
  await act(async () => tree.unmount());

  calls = 0;
  let refill = false;
  global.fetch = async (url) => { calls++; const page = Number(new URL(url, 'https://test.local').searchParams.get('page')); return { ok: true, json: async () => ({ ...payload(refill ? [{ id: 301, lane: 'top_match' }] : [], true, page + 1), page }) }; };
  tree = await mount(loadFeed()); await settle();
  // Home 32 renamed the sparse-window action; retain the recovery behavior
  // contract and also guard against hiding the button with its parent rail.
  const resume = tree.root.findAllByType('button').find((x) => String(x.props.children).includes('Показать больше похожих аниме'));
  assert.ok(resume, 'a sparse window with hasMore is recoverable');
  const resumeRail = tree.root.findAllByType('section').find(x => x.props.className === 'smart-feed__personal-rail' && x.findAllByType('button').includes(resume));
  assert.ok(resumeRail && !resumeRail.props.hidden && resumeRail.props.style?.display !== 'none', 'sparse recovery must remain visible');
  refill = true;
  await act(async () => resume.props.onClick()); await settle();
  assert.ok(tree.root.findAllByType('article').some((x) => x.props['data-id'] === 301));
  await act(async () => tree.unmount());
  console.log('PASS: real feed mounts without IntersectionObserver, deduplicates simultaneous rows, retries errors and resumes a sparse candidate window.');

  // Two genuinely mounted feed rows share each page and fill the measured
  // desktop width, then increase their target after resize without a storm.
  calls = 0; viewportWidth = 1460;
  global.fetch = async (url) => {
    calls++;
    const page = Number(new URL(url, 'https://test.local').searchParams.get('page'));
    const items = ['top_match', 'endless'].flatMap((lane, laneIndex) =>
      Array.from({ length: 10 }, (_, index) => ({ id: page * 100 + laneIndex * 10 + index, lane })),
    );
    return { ok: true, json: async () => ({ ...payload(items, true, page + 1), page }) };
  };
  tree = await mount(loadFeed()); await settle();
  const rowCounts = () => tree.root.findAllByType('section')
    .filter(x => x.props['data-recommendation-rail-id'])
    .map(x => x.props['data-recommendation-rail-items']);
  assert.deepEqual(rowCounts(), [10, 10], 'desktop rows fill measured width plus one card');
  const beforeResize = calls;
  const resize = async () => {
    await act(async () => { for (const fn of [...windowListeners.get('resize') ?? []]) fn(); });
    await settle();
  };
  await resize(); await resize();
  assert.equal(calls, beforeResize, 'repeated same-size resize cannot refetch the candidate window');
  viewportWidth = 2200;
  await resize();
  assert.deepEqual(rowCounts(), [12, 12], 'wider rows refill up to the bounded target');
  const afterWidening = calls;
  assert.ok(afterWidening <= beforeResize + 1, 'rows share the cached next page and only prefetch its successor');
  await resize();
  assert.equal(calls, afterWidening);
  const ids = tree.root.findAllByType('article').map(x => x.props['data-id']);
  assert.equal(new Set(ids).size, ids.length, 'refill must not duplicate titles across rows');
  await act(async () => tree.unmount());
  assert.ok([...windowListeners.values()].every(set => set.size === 0), 'unmount cleans all viewport listeners');

  // An offscreen row must not chase matching titles automatically. The one
  // shared speculative page is existing feed behavior, independent of rails.
  sectionTop = 3000; calls = 0;
  tree = await mount(loadFeed()); await settle();
  assert.deepEqual(rowCounts(), [0, 0]);
  assert.equal(calls, 1, 'offscreen bootstrap adds no requests beyond the existing shared prefetch');
  await act(async () => tree.unmount());
  sectionTop = 0; viewportWidth = 390;
  console.log('PASS: desktop density, shared pagination, bounded resize refill, unique cards, offscreen rows and listener cleanup.');

  // A real empty layout must mount a recovery row, consume the first loaded
  // page and expose all local cards even after that page ends API pagination.
  viewportWidth = 390; calls = 0;
  const terminalItems = Array.from({ length: 20 }, (_, index) => ({
    id: 1000 + index, genres: [], episodes: 60, format: 'TV',
  }));
  global.fetch = async () => {
    calls++;
    return { ok: true, json: async () => payload(terminalItems) };
  };
  tree = await mount(loadFeed({ realLayout: true })); await settle();
  assert.ok(tree.root.findAllByType('article').length > 0,
    'real allocation engine must recover from an empty initial pool');
  const terminalCalls = calls;
  let loadSteps = 0;
  for (;;) {
    const row = tree.root.findAll(x => typeof x.props.onEndReached === 'function' && x.props.hasMore)[0];
    if (!row) break;
    assert.ok(++loadSteps <= 12, 'local pagination terminates instead of looping');
    await act(async () => row.props.onEndReached()); await settle();
  }
  const terminalIds = tree.root.findAllByType('article').map(x => x.props['data-id']);
  assert.deepEqual([...terminalIds].sort((a, b) => a - b), terminalItems.map(x => x.id),
    'all terminal-page candidates remain reachable beyond initial row limits');
  assert.equal(new Set(terminalIds).size, terminalIds.length);
  assert.equal(calls, terminalCalls, 'revealing loaded cards after API exhaustion makes no requests');
  await act(async () => tree.unmount());

  // Empty terminal results have a finite empty state, while a failed empty
  // start retains visible manual recovery using the production layout.
  calls = 0;
  global.fetch = async () => { calls++; return { ok: true, json: async () => payload([]) }; };
  tree = await mount(loadFeed({ realLayout: true })); await settle();
  assert.ok(tree.root.findAll(x => x.props.className === 'smart-feed__empty').length);
  assert.equal(calls, 1);
  await act(async () => tree.unmount());
  calls = 0; let available = false;
  global.fetch = async () => {
    calls++;
    return available ? { ok: true, json: async () => payload(terminalItems.slice(0, 3)) }
      : { ok: false, status: 400 };
  };
  tree = await mount(loadFeed({ realLayout: true })); await settle();
  const realRetry = tree.root.findAllByType('button').find(x => String(x.props.children).includes('Повторить'));
  assert.ok(realRetry, 'empty production layout retains retry after an API failure');
  const beforeErrorResize = calls;
  await resize(); await resize();
  assert.equal(calls, beforeErrorResize, 'resize must not restart a failed request');
  available = true;
  await act(async () => realRetry.props.onClick()); await settle();
  assert.equal(tree.root.findAllByType('article').length, 3);
  await act(async () => tree.unmount());

  // A user-created vacancy must re-arm bootstrap at the SAME target width.
  calls = 0;
  global.fetch = async url => {
    calls++;
    const page = Number(new URL(url, 'https://test.local').searchParams.get('page'));
    const items = ['top_match', 'endless'].flatMap((lane, laneIndex) =>
      Array.from({ length: 5 }, (_, index) => ({ id: page * 100 + laneIndex * 10 + index, lane })));
    return { ok: true, json: async () => ({ ...payload(items, true, page + 1), page }) };
  };
  tree = await mount(loadFeed()); await settle();
  const hiddenId = tree.root.findAllByType('article')[0].props['data-id'];
  const beforeHideCalls = calls;
  await act(async () => tree.root.findAllByType('article')[0].props.onHide()); await settle();
  assert.deepEqual(rowCounts(), [5, 5], 'hiding a card refills its row without a swipe or resize');
  assert.ok(!tree.root.findAllByType('article').some(x => x.props['data-id'] === hiddenId),
    'refill must not resurrect the hidden title');
  assert.ok(calls <= beforeHideCalls + 1, 'vacancy recovery shares the prefetched page');
  await act(async () => tree.unmount());
  assert.ok([...windowListeners.values()].every(set => set.size === 0));
  console.log('PASS: production empty-start recovery, terminal local pagination, finite empty/error states and refill after hiding.');

})().catch((error) => { console.error(error); process.exitCode = 1; });
