'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function loadSourceAvailability() {
  const sourcePath = 'lib/source-availability.ts';
  const source = fs.readFileSync(sourcePath, 'utf8');
  const js = ts.transpileModule(source, {
    fileName: sourcePath,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const imports = {
    '@/lib/anilibria': {
      extractHlsVideos: () => [],
      getEpisodeFromList: () => null,
      getExternalPlayer: () => null,
    },
    '@/lib/release-match': {
      animeSearchTitles: anime => [anime.title?.english, anime.title?.romaji].filter(Boolean),
      normalizeReleaseTitle: value => String(value ?? '').normalize('NFKC').trim().toLowerCase(),
    },
    '@/lib/upstream-resilience-server': {
      isTransientUpstreamResponse: () => false,
      isUpstreamPressureError: () => false,
      runWithUpstreamBudget: async (_key, work) => work(),
    },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => {
    if (Object.prototype.hasOwnProperty.call(imports, name)) return imports[name];
    throw new Error('Unexpected runtime import in test harness: ' + name);
  }, mod, mod.exports);
  return { api: mod.exports, source };
}

function anime(id) {
  return {
    id,
    idMal: id,
    title: { english: 'Cache-bound fixture ' + id },
  };
}

(async () => {
  const originalFetch = global.fetch;
  const originalNow = Date.now;
  let now = originalNow();
  let providerCalls = 0;
  global.fetch = async () => {
    providerCalls += 1;
    // A confirmed 404 is a normal provider response and yields a cacheable
    // "unavailable" result without network access in this test.
    return new Response(null, { status: 404 });
  };
  Date.now = () => now;

  try {
    const { api, source } = loadSourceAvailability();
    const limitMatch = source.match(/CATALOG_AVAILABILITY_CACHE_LIMIT\s*=\s*(\d[\d_]*)/);
    assert(limitMatch, 'catalog availability cache must declare an explicit capacity');
    const cacheLimit = Number(limitMatch[1].replaceAll('_', ''));
    assert.equal(cacheLimit, 2_000, 'keep the per-process availability cache deliberately bounded');

    for (let id = 1; id <= cacheLimit; id += 1) {
      const result = await api.checkAnimeCatalogAvailability(anime(id));
      assert.equal(result.status, 'unavailable');
    }

    const afterFill = providerCalls;
    await api.checkAnimeCatalogAvailability(anime(cacheLimit));
    assert.equal(providerCalls, afterFill, 'recent cache hit should not re-check providers');

    await api.checkAnimeCatalogAvailability(anime(cacheLimit + 1));
    assert.equal(providerCalls, afterFill + 2, 'new title should be checked once against each 404 provider');

    const afterOverflow = providerCalls;
    await api.checkAnimeCatalogAvailability(anime(1));
    assert.equal(providerCalls, afterOverflow + 2, 'oldest title must be evicted once cache capacity is exceeded');

    const afterEvictedReload = providerCalls;
    await api.checkAnimeCatalogAvailability(anime(cacheLimit + 1));
    assert.equal(providerCalls, afterEvictedReload, 'recently used title should remain in the bounded cache');

    now += 7 * 60 * 60 * 1000;
    const beforeExpiredRead = providerCalls;
    await api.checkAnimeCatalogAvailability(anime(cacheLimit + 1));
    assert.equal(providerCalls, beforeExpiredRead + 2, 'expired result must never be served from cache');

    assert.match(source, /CATALOG_AVAILABILITY_CACHE_SWEEP_MS\s*=\s*30_000/);
    assert.match(source, /entry\.expiresAt\s*<=\s*now/);
    assert.match(source, /catalogAvailabilityCache\.delete\(oldest\)/);
    console.log('PASS catalog availability cache: bounded to 2000 keys, LRU eviction works, expired entries are swept, and expired results are revalidated.');
  } finally {
    global.fetch = originalFetch;
    Date.now = originalNow;
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
