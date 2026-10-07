const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
const mod = { exports: {} };
const code = ts.transpileModule(fs.readFileSync('lib/home-rail-session.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
new Function('exports', 'module', code)(mod.exports, mod);
const { reconcileHomeRails } = mod.exports;
const rail = (id, ids) => ({ id, title: id, items: ids.map(id => ({ anime: { id } })) });
const ids = new Set([1, 2, 3, 4, 5]);
const initial = [rail('top_match', [1]), rail('explore', [2]), rail('endless', [3])];
const first = reconcileHomeRails([], initial, ids);
const next = reconcileHomeRails(first, [rail('top_match', [1, 4]), rail('story_continues', [5]),
  rail('explore', [2]), rail('endless', [3])], ids);
assert.deepEqual(next.map(r => r.id), ['top_match', 'explore', 'endless', 'story_continues'],
  'late discoveries cannot insert above rows already on screen');
assert.deepEqual(next[0].items.map(x => x.anime.id), [1, 4], 'existing rows receive new cards');
const paused = reconcileHomeRails(next, [rail('top_match', [1]), rail('endless', [3])], ids);
assert.deepEqual(paused.map(r => r.id), next.map(r => r.id), 'a sparse miss cannot remove row slots');
assert.deepEqual(paused[1].items.map(x => x.anime.id), [2], 'sparse rows keep their cards');
const hidden = reconcileHomeRails(paused, [rail('top_match', [1]), rail('endless', [3])], new Set([1, 3, 5]));
assert.equal(hidden[1].items.length, 0, 'hidden cards do not resurrect in retained rows');
const resumed = reconcileHomeRails(hidden, [rail('story_continues', [5]), rail('explore', [4]), rail('top_match', [1])], ids);
assert.deepEqual(resumed.map(r => r.id), next.map(r => r.id), 'retry cannot swap row positions');
assert.deepEqual(reconcileHomeRails([], [rail('mood_lane', [4])], ids).map(r => r.id), ['mood_lane'],
  'explicit mood change starts a fresh composition');
assert.equal(initial[0].items.length, 1, 'shared input is not mutated');
console.log('Home rows: late insertion, sparse miss, retry, hidden cards and mood reset passed.');

// Exercise the actual feed render and allocation engine across state updates.
function compile(path, requireModule = () => { throw new Error('unexpected import'); }) {
  const target = { exports: {} };
  new Function('require', 'exports', 'module', ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText)(requireModule, target.exports, target);
  return target.exports;
}
const engine = compile('lib/recommendation-rails.ts', () => ({ getRecommendationMoodLabel: x => x }));
const states = [], refs = [], memos = [];
let stateIndex = 0, refIndex = 0, memoIndex = 0, dirty = false;
const react = {
  Fragment: 'fragment', startTransition: fn => fn(), useEffect() {},
  useRef(value) { return refs[refIndex++] ??= { current: value }; },
  useState(initial) {
    const index = stateIndex++;
    if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
    return [states[index], value => {
      const next = typeof value === 'function' ? value(states[index]) : value;
      if (!Object.is(next, states[index])) { states[index] = next; dirty = true; }
    }];
  },
  useMemo(fn, deps) {
    const index = memoIndex++, prior = memos[index];
    if (!prior || deps.some((value, i) => !Object.is(value, prior.deps[i]))) {
      memos[index] = { deps, value: fn() };
    }
    return memos[index].value;
  },
  useCallback(fn, deps) { return this.useMemo(() => fn, deps); },
};
// Destructured hook calls have no receiver.
react.useCallback = (fn, deps) => react.useMemo(() => fn, deps);
const jsx = (type, props) => ({ type, props });
const feed = compile('components/SmartRecommendationFeed.tsx', name => {
  if (name === 'react') return react;
  if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
  if (name === '@/lib/recommendation-rails') return engine;
  if (name === '@/lib/home-rail-session') return { reconcileHomeRails };
  if (name === '@/lib/taste-graph') return { readCachedTasteGraph: () => null };
  return { default: name, RecommendationCardSkeleton: 'skeleton' };
}).default;
const item = (id, extra = {}) => ({ anime: { id, genres: [], episodes: 60 },
  moodScore: 0, score: .5, matchScore: 95, hiddenGemScore: 0,
  sessionIntentConfidence: 0, sessionIntentScore: 0, ...extra });
let pool = Array.from({ length: 12 }, (_, i) => item(i + 1));
function render() {
  let tree, passes = 0;
  do {
    assert(++passes < 12, 'session adjustments must converge without a render loop');
    dirty = false; stateIndex = refIndex = memoIndex = 0;
    tree = feed({ items: pool, mood: 'any', hasWatchHistory: true });
  } while (dirty);
  const rows = [];
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    if (node.props?.['data-recommendation-rail-id']) rows.push(node);
    visit(node.props?.children);
  };
  visit(tree);
  return rows;
}
let rows = render();
const originalRowIds = rows.map(r => r.props['data-recommendation-rail-id']);
assert(states[0].size > 0, 'initial allocations must be saved even before sparse pagination');
pool = [...pool, item(20, { franchiseContinuation: true }), item(21, { source: 'discovery' })];
states[5] = pool;
rows = render();
assert.deepEqual(rows.map(r => r.props['data-recommendation-rail-id']).slice(0, originalRowIds.length), originalRowIds);
const continuationIndex = rows.findIndex(r => r.props['data-recommendation-rail-id'] === 'story_continues');
assert(continuationIndex >= originalRowIds.length, 'late continuation cannot jump above current rows');
states[12] = new Set(['story_continues', 'explore']);
const pausedRows = render();
assert.deepEqual(pausedRows.map(r => r.props['data-recommendation-rail-id']), rows.map(r => r.props['data-recommendation-rail-id']),
  'the actual component must keep exhausted sparse rows mounted');
states[9] = false;
assert.deepEqual(render().map(r => r.props['data-recommendation-rail-id']), rows.map(r => r.props['data-recommendation-rail-id']),
  'ending pagination cannot collapse earlier mounted rows');
const oldOwner = new Map([[7, 'mood_lane'], [1, 'mood_lane']]);
const allocation = engine.buildRecommendationRailLayout([item(1, { moodTier: 'strong', moodScore: 1 }),
  item(7, { moodTier: 'strong', moodScore: .1 })],
  { mood: 'action', hasMore: true, hasWatchHistory: true, ownership: oldOwner });
assert.deepEqual(allocation.rails.find(r => r.id === 'mood_lane').items.map(x => x.anime.id), [7, 1],
  'candidate ranking cannot change the order of previously allocated cards');
console.log('Actual feed: allocation persistence, bounded rerenders, late rows and sparse exhaustion passed.');
