import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const worker = read('infra/cloudflare/media-worker.js');
const coalescer = worker.slice(worker.indexOf('async function fetchOriginCoalesced('), worker.indexOf('\nexport default'));
function mediaHarness() {
  const calls = [];
  const context = vm.createContext({
    inFlightOriginFetches: new Map(), inFlightSourceProbes: new Map(),
    fetchOrigin: (_source, variant) => {
      const task = deferred(); calls.push({ token: variant?.token, ...task }); return task.promise;
    },
  });
  vm.runInContext(coalescer, context);
  return { context, calls, fetch: (token) => context.fetchOriginCoalesced('source', { token }, 'hash') };
}
{
  const h = mediaHarness();
  const a = h.fetch('240'), b = h.fetch('240');
  assert.equal(h.calls.length, 1);
  h.calls[0].resolve({ response: { bytes: 'a' } });
  assert.deepEqual(await a, await b);
  assert.equal(h.context.inFlightOriginFetches.size, 0);
}
{
  const h = mediaHarness();
  const probe = h.fetch('240');
  const a = h.fetch('540'), b = h.fetch('540'), c = h.fetch('720');
  h.calls[0].resolve({ response: { bytes: 'probe' } });
  await probe;
  await new Promise(setImmediate);
  assert.deepEqual(h.calls.map(x => x.token), ['240', '540', '720']);
  h.calls[1].resolve({ response: { bytes: '540' } });
  h.calls[2].resolve({ response: { bytes: '720' } });
  assert.deepEqual(await a, await b);
  assert.notDeepEqual(await a, await c);
  assert.equal(h.context.inFlightOriginFetches.size, 0);
  assert.equal(h.context.inFlightSourceProbes.size, 0);
}
{
  const h = mediaHarness();
  const a = h.fetch('240'), b = h.fetch('540');
  h.calls[0].resolve({ response: null, error: 'origin-fetch-failed' });
  assert.deepEqual(await a, await b);
  assert.equal(h.calls.length, 1);
  assert.equal(h.context.inFlightSourceProbes.size, 0);
}

// Execute the production callback, transpiling its TypeScript signature only.
const feed = read('components/SmartRecommendationFeed.tsx');
const start = feed.indexOf('  const ensureRailDepth = useCallback(');
const end = feed.indexOf('\n  useEffect(() => {', start);
const code = ts.transpile(feed.slice(start, end), { target: ts.ScriptTarget.ES2022 });
function railHarness() {
  const task = deferred();
  const writes = [];
  const c = {
    useCallback: (fn) => fn, moodTransitionRef: { current: false },
    requestGenerationRef: { current: 1 }, hasMoreRef: { current: true },
    railLoadingRef: { current: new Set() }, exhaustedRails: new Set(),
    railLimits: {}, pointerRef: { current: { page: 2 } },
    railVirtualMetricsRef: { current: new Map() }, tasteGraph: null, filtered: [],
    railOwnershipRef: { current: new Map() },
    DEFAULT_RECOMMENDATION_RAIL_LIMIT: 8, MIN_INITIAL_RAIL_ITEMS: 4,
    RECOMMENDATION_RAIL_BATCH_SIZE: 8, SPARSE_RAIL_BOOTSTRAP_PAGE_HOPS: 1,
    MAX_EMPTY_PAGE_HOPS: 2, STRICT_EMPTY_PAGE_HOPS: 1, MAX_RAIL_DOM_ITEMS: 20,
    recommendationMatchesRail: () => true, recommendationMatchesRailRelaxed: () => true,
    fetchNextCandidateBatch: () => task.promise,
    trackProductClientEvent: () => {}, console, DOMException,
  };
  for (const name of ['setLoadingRails', 'setRailErrors', 'setRailLimits', 'setExhaustedRails', 'setRailOwnership']) c[name] = () => writes.push(name);
  vm.createContext(c);
  vm.runInContext(code + '\nglobalThis.run = ensureRailDepth;', c);
  return { c, task, writes };
}
for (const fail of [false, true]) {
  const { c, task, writes } = railHarness();
  const pending = c.run({ id: 'test', items: [], source: 'test' }, { bootstrap: true });
  c.requestGenerationRef.current++;
  const before = writes.length;
  if (fail) task.reject(new Error('late failure'));
  else task.resolve([{ anime: { id: 123 } }]);
  await pending;
  assert.equal(writes.length, before, 'stale completion must not update new state');
  assert.equal(c.railOwnershipRef.current.size, 0);
  assert.equal(c.railLoadingRef.current.has('test'), true, 'old cleanup must not clear a new loading flag');
}
{
  const { c, task, writes } = railHarness();
  const pending = c.run({ id: 'test', items: [], source: 'test' }, { bootstrap: true });
  task.resolve([{ anime: { id: 123 } }]);
  await pending;
  assert.equal(c.railOwnershipRef.current.get(123), 'test');
  assert.equal(c.railLoadingRef.current.size, 0);
  assert.ok(writes.includes('setRailOwnership'));
}
{
  const queueStart = feed.indexOf('          const generation = requestGenerationRef.current;');
  const queueEnd = feed.indexOf('\n        }\n      },', queueStart);
  assert.ok(queueStart > 0 && queueEnd > queueStart);
  const blocker = deferred();
  let requests = 0;
  const c = vm.createContext({
    requestGenerationRef: { current: 1 }, moodTransitionRef: { current: false },
    sparseRailQueueRef: { current: blocker.promise },
    ensureRailDepth: async () => { requests++; }, rail: {}, railId: 'test', console,
  });
  vm.runInContext(feed.slice(queueStart, queueEnd), c);
  c.requestGenerationRef.current++;
  blocker.resolve();
  await c.sparseRailQueueRef.current;
  assert.equal(requests, 0, 'queued task from an old mood must not fetch');
}
// Check the actual jitter function across many image keys, not only its name.
{
  const image = read('components/AnimeImage.tsx');
  const constants = image.match(/const TRANSIENT_RETRY_(?:MIN|MAX)_DELAY_MS = [^;]+;/g).join('\n');
  const start = image.indexOf('function stableRetryDelayMs(');
  const end = image.indexOf('\nfunction sourceTimeoutMs', start);
  const c = vm.createContext({});
  vm.runInContext(ts.transpile(constants + '\n' + image.slice(start, end)), c);
  const delays = new Set();
  for (let i = 0; i < 100; i++) {
    const key = `poster-${i}`;
    const delay = c.stableRetryDelayMs(key);
    assert.ok(delay >= 20_000 && delay <= 45_000);
    assert.equal(delay, c.stableRetryDelayMs(key));
    delays.add(delay);
  }
  assert.ok(delays.size > 50, 'retry delays must spread across image keys');
}
console.log('Patch 18.5.6.2: media coalescing and recommendation lifecycle checks passed');
