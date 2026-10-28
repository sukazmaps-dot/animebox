'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { setTimeout: delay } = require('node:timers/promises');

const READ_LIMIT = 32;
const REFRESH_LIMIT = 20;
const REFRESH_ACTIVE_LIMIT = 4;

function loadTs(path, imports = {}) {
  const js = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)(
    name => {
      if (Object.prototype.hasOwnProperty.call(imports, name)) return imports[name];
      throw new Error('Unexpected runtime import in memory-bounds test: ' + name);
    },
    mod,
    mod.exports,
  );
  return mod.exports;
}

function catalogRow(id) {
  return {
    id,
    title: 'Memory-bounds fixture ' + id,
    total_episodes: 12,
    finished: true,
    genres: [],
    studios: [],
    format: 'TV',
    start_year: 2024,
    recommendation_metadata_version: 1,
    poster_url: null,
    slug: 'memory-bounds-fixture-' + id,
    updated_at: new Date().toISOString(),
  };
}

function animeRecord(id) {
  return {
    id,
    idMal: id + 100_000,
    status: 'FINISHED',
    title: { english: 'Memory-bounds fixture ' + id, romaji: 'Memory-bounds fixture ' + id },
    startDate: { year: 2024 },
    genres: [],
    studios: [],
    episodes: 12,
    coverImage: {},
  };
}

function createHarness({
  holdReads = false,
  returnReadRows = true,
  holdFirstMetadata = 0,
} = {}) {
  const readReleases = [];
  const metadataReleases = [];
  let readCalls = 0;
  let activeReads = 0;
  let peakActiveReads = 0;
  let metadataCalls = 0;
  let activeMetadata = 0;
  let peakActiveMetadata = 0;
  let refreshWrites = 0;

  function createAdmin() {
    return {
      from() {
        let ids = [];
        let payload = null;
        return {
          select() { return this; },
          in(_column, values) { ids = values; return this; },
          upsert(value) { payload = value; return this; },
          single() { return this; },
          abortSignal(signal) {
            if (payload) {
              refreshWrites += 1;
              return Promise.resolve({ data: payload, error: null });
            }

            readCalls += 1;
            activeReads += 1;
            peakActiveReads = Math.max(peakActiveReads, activeReads);
            const rows = returnReadRows ? ids.map(catalogRow) : [];

            if (!holdReads) {
              activeReads -= 1;
              return Promise.resolve({ data: rows, error: null });
            }

            return new Promise((resolve, reject) => {
              let settled = false;
              const finish = callback => {
                if (settled) return;
                settled = true;
                signal.removeEventListener('abort', onAbort);
                callback();
              };
              const onAbort = () => finish(() => {
                activeReads -= 1;
                reject(signal.reason);
              });
              signal.addEventListener('abort', onAbort, { once: true });
              readReleases.push(() => finish(() => {
                activeReads -= 1;
                resolve({ data: rows, error: null });
              }));
              if (signal.aborted) onAbort();
            });
          },
        };
      },
    };
  }

  async function getAnimeByIdWithShikimori(id) {
    metadataCalls += 1;
    activeMetadata += 1;
    peakActiveMetadata = Math.max(peakActiveMetadata, activeMetadata);
    try {
      if (metadataCalls <= holdFirstMetadata) {
        await new Promise(resolve => metadataReleases.push(resolve));
      }
      return animeRecord(id);
    } finally {
      activeMetadata -= 1;
    }
  }

  const boundedWork = loadTs('lib/bounded-work.ts');
  const imports = {
    'server-only': {},
    '@/lib/bounded-work': boundedWork,
    '@/lib/browser-request-origin': { isAllowedBrowserOrigin: () => true },
    '@/lib/env/server': { optionalServerSecret: () => 'test-service-role-key' },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } }) },
    '@supabase/supabase-js': { createClient: () => createAdmin() },
    '@/lib/combined-anime': { getAnimeByIdWithShikimori },
    '@/lib/anime-display': { getAnimeTitle: anime => anime.title.english },
    '@/lib/runtime-refresh-lease-server': {
      tryAcquireRuntimeRefreshLease: async () => ({
        acquired: true,
        ownerToken: 'memory-bounds-test',
        degraded: false,
      }),
      releaseRuntimeRefreshLease: async () => {},
    },
  };
  const api = loadTs('lib/community-server.ts', imports);

  return {
    api,
    stats: () => ({
      readCalls,
      activeReads,
      peakActiveReads,
      metadataCalls,
      activeMetadata,
      peakActiveMetadata,
      refreshWrites,
    }),
    releaseReads: () => readReleases.splice(0).forEach(release => release()),
    releaseMetadata: () => metadataReleases.splice(0).forEach(release => release()),
  };
}

async function waitUntil(predicate, description, timeoutMs = 1_000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start >= timeoutMs) throw new Error('Timed out waiting for ' + description);
    await delay(2);
  }
}

async function boundedCatalogReadCheck() {
  const h = createHarness({ holdReads: true, returnReadRows: true });
  const requests = Array.from({ length: READ_LIMIT + 1 }, (_, index) =>
    h.api.ensureAnimes([index + 1_000]),
  );
  const settled = Promise.allSettled(requests);

  await waitUntil(() => h.stats().readCalls === READ_LIMIT, '32 held catalog reads');
  assert.equal(h.stats().activeReads, READ_LIMIT, 'read concurrency must stop at 32');
  await assert.rejects(
    requests[READ_LIMIT],
    /Каталог временно перегружен/,
    'the 33rd unique batch must be rejected rather than retained in the in-flight map',
  );
  assert.equal(h.stats().readCalls, READ_LIMIT, 'the rejected request must not start a DB query');

  h.releaseReads();
  const results = await settled;
  assert.equal(results.filter(result => result.status === 'fulfilled').length, READ_LIMIT);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
}

async function boundedMetadataRefreshCheck() {
  const h = createHarness({ returnReadRows: false, holdFirstMetadata: REFRESH_ACTIVE_LIMIT });
  const requests = Array.from({ length: REFRESH_LIMIT + 1 }, (_, index) =>
    h.api.ensureAnimes([index + 20_000]),
  );
  const settled = Promise.allSettled(requests);

  await waitUntil(() => h.stats().metadataCalls === REFRESH_ACTIVE_LIMIT, 'four active metadata refreshes');
  await assert.rejects(
    requests[REFRESH_LIMIT],
    /Каталог временно перегружен/,
    'the 21st distinct refresh must be rejected when active + queued work reaches its cap',
  );
  assert.equal(h.stats().metadataCalls, REFRESH_ACTIVE_LIMIT, 'queued work must not start external calls ahead of active slots');
  assert(h.stats().peakActiveMetadata <= REFRESH_ACTIVE_LIMIT, 'active metadata refreshes must stay at or below four');

  h.releaseMetadata();
  const results = await settled;
  assert.equal(results.filter(result => result.status === 'fulfilled').length, REFRESH_LIMIT);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.equal(h.stats().metadataCalls, REFRESH_LIMIT, 'all admitted refreshes eventually complete');
  assert.equal(h.stats().refreshWrites, REFRESH_LIMIT, 'only admitted refreshes write catalog metadata');
  assert(h.stats().peakActiveMetadata <= REFRESH_ACTIVE_LIMIT);
}

async function sourceContractCheck() {
  const community = fs.readFileSync('lib/community-server.ts', 'utf8');
  const leases = fs.readFileSync('lib/runtime-refresh-lease-server.ts', 'utf8');
  assert.match(community, /ANIME_CATALOG_READ_IN_FLIGHT_LIMIT\s*=\s*32/);
  assert.match(community, /ANIME_CATALOG_READ_TIMEOUT_MS\s*=\s*1_800/);
  assert.match(community, /ANIME_CATALOG_REFRESH_ACTIVE_LIMIT\s*=\s*4/);
  assert.match(community, /ANIME_CATALOG_REFRESH_QUEUE_LIMIT\s*=\s*16/);
  assert.match(community, /ANIME_CATALOG_REFRESH_QUEUE_WAIT_MS\s*=\s*8_000/);
  assert.match(community, /AbortSignal\.timeout\(ANIME_CATALOG_READ_TIMEOUT_MS\)/);
  assert.match(community, /AbortSignal\.timeout\(ANIME_CATALOG_REFRESH_WRITE_TIMEOUT_MS\)/);
  assert.match(leases, /LEASE_RPC_TIMEOUT_MS\s*=\s*1_200/);
  assert.equal((leases.match(/abortSignal\(AbortSignal\.timeout\(LEASE_RPC_TIMEOUT_MS\)\)/g) || []).length, 2,
    'both acquire and release lease RPCs must have explicit deadlines');
}

(async () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.fixture.test';
  try {
    await boundedCatalogReadCheck();
    await boundedMetadataRefreshCheck();
    await sourceContractCheck();
    console.log('PASS Patch 31.22: catalog in-flight reads <= 32, metadata refreshes <= 4 active + 16 queued, overload is bounded, and database/lease calls have deadlines.');
  } finally {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
