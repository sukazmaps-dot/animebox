'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { setTimeout: delay } = require('node:timers/promises');

function createHarness({ holdReads = false, staleCount = 0, probeDelayMs = 8 } = {}) {
  let activeProbes = 0;
  let peakActiveProbes = 0;
  let probeCalls = 0;
  let registryReads = 0;
  const heldReadReleases = [];
  const staleRows = Array.from({ length: staleCount }, (_, index) => ({ anime_id: index + 1 }));

  function createSupabaseAdmin() {
    return {
      from() {
        let payload = null;
        const query = {
          select() { return this; },
          in() { return this; },
          abortSignal() {
            registryReads += 1;
            if (holdReads) {
              return new Promise(resolve => {
                heldReadReleases.push(() => resolve({ data: [], error: null }));
              });
            }
            return Promise.resolve({ data: [], error: null });
          },
          upsert(value) { payload = value; return this; },
          single() { return Promise.resolve({ data: payload, error: null }); },
          eq() { return this; },
          or() { return this; },
          order() { return this; },
          limit(limit) {
            return Promise.resolve({ data: staleRows.slice(0, limit), error: null });
          },
        };
        return query;
      },
    };
  }

  const imports = {
    'server-only': {},
    '@/lib/supabase/admin': { createSupabaseAdmin },
    '@/lib/public-read-circuit': {
      createPublicReadCircuit: () => ({
        isOpen: () => false,
        recordSuccess() {},
        recordFailure() {},
      }),
    },
    '@/lib/combined-anime': {
      getAnimesByIdsWithShikimori: async ids => ids.map(id => ({
        id,
        idMal: id + 100_000,
        status: 'finished',
      })),
    },
    '@/lib/kodik-episode-availability': {
      searchKodikByShikimoriId: async () => {
        probeCalls += 1;
        activeProbes += 1;
        peakActiveProbes = Math.max(peakActiveProbes, activeProbes);
        try {
          await delay(probeDelayMs);
          return [{ last_episode: 1 }];
        } finally {
          activeProbes -= 1;
        }
      },
    },
    '@/lib/source-availability': {
      checkAnimeCatalogAvailability: async () => ({ available: true }),
    },
    '@/lib/direct-player-server': {
      resolveDirectPlayerStreams: async () => ({ streams: [], reason: 'stream_not_found' }),
    },
    '@/lib/runtime-refresh-lease-server': {
      tryAcquireRuntimeRefreshLease: async () => ({ acquired: true, ownerToken: 'memory-bounds-test' }),
      releaseRuntimeRefreshLease: async () => {},
    },
  };

  const sourcePath = 'lib/catalog-availability-server.ts';
  const js = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    fileName: sourcePath,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)(
    name => {
      if (Object.prototype.hasOwnProperty.call(imports, name)) return imports[name];
      throw new Error('Unexpected runtime import in test harness: ' + name);
    },
    mod,
    mod.exports,
  );

  return {
    api: mod.exports,
    stats: () => ({ activeProbes, peakActiveProbes, probeCalls, registryReads }),
    releaseHeldReads: () => heldReadReleases.splice(0).forEach(release => release()),
  };
}

async function waitUntil(predicate, description, timeoutMs = 2_000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for ' + description);
    await delay(1);
  }
}

async function registryReadBoundCheck() {
  const h = createHarness({ holdReads: true });
  const requests = Array.from({ length: 33 }, (_, index) =>
    h.api.filterAnimeByAvailability([{ id: index + 1, idMal: index + 100_000, status: 'finished' }], 'catalog'),
  );

  await waitUntil(() => h.stats().registryReads === 32, '32 held registry reads');
  assert.equal(h.stats().registryReads, 32, 'registry reads must stop at the in-flight limit');

  const overflow = await Promise.race([
    requests[32],
    delay(150).then(() => null),
  ]);
  assert(overflow, 'the over-limit request must fail closed promptly instead of waiting for a database slot');
  assert.equal(overflow.registryHealthy, false, 'over-limit registry reads are degraded/unhealthy, not authoritative misses');
  assert.equal(h.stats().registryReads, 32, 'the 33rd distinct read must not start another database query');

  h.releaseHeldReads();
  const results = await Promise.all(requests);
  assert.equal(results.length, 33);
  assert.equal(results[32].registryHealthy, false);
}

async function probeAndBatchBoundCheck() {
  const h = createHarness({ staleCount: 24 });
  const summary = await h.api.refreshStaleCatalogAvailability(24);

  assert.equal(summary.checked, 24, 'the stale registry scan may discover 24 due records');
  assert.equal(summary.refreshed, 20, 'only non-null successful refreshes are counted as refreshed');
  assert.equal(h.stats().probeCalls, 20, 'the batch is capped to four active plus sixteen queued probes');
  assert(h.stats().peakActiveProbes <= 4, 'active provider probes must never exceed four');
}

async function concurrentDistinctRefreshCheck() {
  const h = createHarness();
  const results = await Promise.all(Array.from({ length: 36 }, (_, index) =>
    h.api.refreshCatalogAvailability({ id: index + 1_000, idMal: index + 101_000, status: 'finished' }, { force: true }),
  ));

  assert.equal(results.length, 36);
  assert(h.stats().peakActiveProbes <= 4, 'burst must stay within four active provider probes');
  assert(h.stats().probeCalls <= 20, 'one process must admit no more than four active plus sixteen queued distinct probes');
  assert.equal(h.stats().registryReads, 32, 'concurrent distinct registry reads must not exceed the 32-read budget');
}

(async () => {
  await registryReadBoundCheck();
  await probeAndBatchBoundCheck();
  await concurrentDistinctRefreshCheck();
  console.log('PASS memory bounds: registry reads <=32, provider probes <=4 active / 16 queued, refresh batch <=20, and refreshed counts exclude null results.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
