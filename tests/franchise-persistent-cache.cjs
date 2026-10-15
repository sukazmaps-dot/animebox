const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const server = fs.readFileSync('lib/anime-franchise-cache-server.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261015112000_franchise_persistent_cache_v1.sql', 'utf8');
const detail = fs.readFileSync('components/AnimeFranchise.tsx', 'utf8');
const seasons = fs.readFileSync('app/api/anime/[slug]/seasons/route.ts', 'utf8');

assert(detail.includes('getCachedAnimeFranchise('), 'title page must use shared cache');
assert(seasons.includes('getCachedAnimeFranchise('), 'watch seasons must use shared cache');
assert(migration.includes('enable row level security'), 'cache table must enable RLS');
assert(migration.includes('revoke all on public.anime_franchise_cache'), 'public clients cannot read snapshots');
assert(!/create policy/i.test(migration), 'service-only cache must not have public RLS policies');

const compiled = ts.transpileModule(server, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: 'lib/anime-franchise-cache-server.ts',
}).outputText;
const syntax = ts.createSourceFile('cache.ts', server, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
assert.equal(syntax.parseDiagnostics.length, 0, 'cache TypeScript should parse');

const rows = new Map();
const jobs = [];
let now = Date.parse('2026-10-15T00:00:00Z');
let storeReady = true;
let errors = [];
let upstreamCalls = 0;

function query() {
  let operation = 'read';
  let changes = null;
  let columns = null;
  const predicates = [];
  const q = {
    select(value) { columns = value; return q; },
    eq(field, value) { predicates.push((row) => row[field] === value); return q; },
    lt(field, value) { predicates.push((row) => row[field] < value); return q; },
    update(value) { operation = 'update'; changes = value; return q; },
    upsert(value) {
      if (!storeReady) return Promise.resolve({ error: { message: 'database down' } });
      rows.set(value.anime_id, { refresh_lease_until: new Date(0).toISOString(), ...(rows.get(value.anime_id) ?? {}), ...value });
      return Promise.resolve({ error: null });
    },
    maybeSingle() { return Promise.resolve(evaluate()); },
    then(resolve, reject) { return Promise.resolve(evaluate()).then(resolve, reject); },
  };
  function evaluate() {
    if (!storeReady) return { data: null, error: { message: 'database down' } };
    const current = [...rows.values()].find((row) => predicates.every((test) => test(row)));
    if (!current) return { data: null, error: null };
    if (operation === 'update') Object.assign(current, changes);
    const keys = columns?.split(',').map((s) => s.trim()) ?? null;
    return {
      data: keys ? Object.fromEntries(keys.map((key) => [key, current[key]])) : current,
      error: null,
    };
  }
  return q;
}

const moduleRef = { exports: {} };
const sandbox = {
  module: moduleRef, exports: moduleRef.exports,
  Date: class MockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  },
  console: { warn: (...args) => errors.push(args) },
  require(name) {
    if (name === 'server-only') return {};
    if (name === 'next/server') return { after: (work) => jobs.push(work) };
    if (name === '@/lib/supabase/admin') return {
      createSupabaseAdmin: () => {
        if (!storeReady) throw new Error('missing schema or key');
        return { from: (name) => {
          assert.equal(name, 'anime_franchise_cache');
          return query();
        } };
      },
    };
    throw new Error('Unexpected module ' + name);
  },
};
vm.runInNewContext(compiled, sandbox);
const get = moduleRef.exports.getCachedAnimeFranchise;
const groups = { series: [], movies: [], ova: [], specials: [], spinOffs: [], other: [] };
const snapshot = {
  currentId: 9, items: [
    { id: 9, title: { romaji: 'Season 1' }, category: 'series' },
    { id: 10, title: { romaji: 'Season 2' }, category: 'series' },
  ], groups, links: [], partial: false, failedIds: [], unexpandedIds: [],
};
const loader = async () => { upstreamCalls++; return snapshot; };
async function drain() {
  while (jobs.length) await jobs.shift()();
}

(async () => {
  const cold = await get(9, loader);
  assert.equal(cold.items.length, 2);
  assert.equal(upstreamCalls, 1);
  assert.equal(rows.size, 0, 'response should not wait for DB write');
  await drain();
  assert.equal(rows.size, 1, 'successful cold lookup must persist');

  const cached = await get(9, loader);
  assert.equal(cached.partial, false);
  assert.equal(upstreamCalls, 1, 'fresh shared hit must avoid provider');

  now += 3 * 60 * 60 * 1000 + 1;
  const stale1 = await get(9, loader);
  const stale2 = await get(9, loader);
  assert.equal(stale1.partial, true, 'expired snapshot must be marked stale');
  assert.equal(stale2.items.length, 2, 'stale parts must remain visible');
  assert.equal(upstreamCalls, 1, 'stale path should never block on AniList');
  await drain();
  assert.equal(upstreamCalls, 2, 'lease + freshness recheck must collapse refreshes');
  assert.equal((await get(9, loader)).partial, false);

  now += 3 * 60 * 60 * 1000 + 1;
  const stillVisible = await get(9, async () => {
    upstreamCalls++;
    throw new Error('AniList unavailable');
  });
  assert.equal(stillVisible.items.length, 2, 'stale parts must survive upstream outage');
  await drain();
  assert.equal(rows.get(9).payload.items.length, 2,
    'failed refresh must not replace last successful snapshot');

  storeReady = false;
  assert.equal((await get(9, loader)).items.length, 2, 'DB outage must fail open');
  assert.equal(upstreamCalls, 4);

  storeReady = true;
  rows.set(9, { anime_id: 9, payload: { malicious: 'shape' },
    expires_at: new Date(now + 1000).toISOString(),
    stale_until: new Date(now + 2000).toISOString() });
  assert.equal((await get(9, loader)).items.length, 2, 'invalid JSON shape must be ignored');

  const abort = new AbortController();
  abort.abort();
  await assert.rejects(get(9, loader, abort.signal), { name: 'AbortError' });
  assert(errors.length >= 1, 'store outages should be logged');
  console.log('PASS: shared franchise cache cold/fresh/stale, lease, outage, validation and abort');
})().catch((error) => { console.error(error); process.exitCode = 1; });
