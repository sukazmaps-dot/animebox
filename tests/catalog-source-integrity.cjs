const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;
const originalResolve = Module._resolveFilename;
const originalFetch = global.fetch;
const token = process.env.KODIK_TOKEN;
const stubs = {
  'server-only': {},
  '@/lib/upstream-resilience-server': {
    runWithUpstreamBudget: async (_name, work) => work(),
    isTransientUpstreamResponse: () => false,
    isUpstreamPressureError: () => false,
  },
};
Module._load = function (name, ...args) {
  if (Object.hasOwn(stubs, name)) return stubs[name];
  return originalLoad.call(this, name, ...args);
};
Module._resolveFilename = function (name, ...args) {
  return originalResolve.call(this, name.startsWith('@/') ? path.join(root, name.slice(2)) : name, ...args);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);

async function main() {
  process.env.KODIK_TOKEN = 'test-only';
  const { searchKodikByShikimoriId, checkKodikEpisodeAvailability } = require('../lib/kodik-episode-availability.ts');
  for (const payload of [{}, null, [], { error: 'bad token', results: [] }, { results: [null] }, { results: [{}] }, { results: [{ link: 'javascript:bad' }] }]) {
    global.fetch = async () => Response.json(payload);
    await assert.rejects(searchKodikByShikimoriId(1), /invalid|no valid/i);
    assert.equal((await checkKodikEpisodeAvailability(1, 1)).status, 'unknown');
  }
  global.fetch = async () => Response.json({ results: [] });
  assert.equal((await checkKodikEpisodeAvailability(1, 1)).status, 'unavailable');
  global.fetch = async () => Response.json({ results: [{ link: '//player.test/1', last_episode: 12 }] });
  assert.equal((await checkKodikEpisodeAvailability(1, 12, { verifyPlayerUrl: false })).status, 'available');

  const { collectEpisodePages } = require('../lib/provider-episodes.ts');
  const endpoint = 'https://provider.test/api/v1/release';
  assert.deepEqual((await collectEpisodePages({ 1: { hls_720: 'a' }, ep2: { hls_720: 'b' } }, endpoint, async () => [])).map(x => x.ordinal), [1, 2]);
  const pages = Array.from({ length: 13 }, (_, page) => ({
    data: Array.from({ length: 100 }, (_, i) => ({ ordinal: page * 100 + i + 1 })),
    links: { next: page < 12 ? `?page=${page + 2}` : null },
  }));
  assert.equal((await collectEpisodePages(pages[0], endpoint, async url => pages[Number(new URL(url).searchParams.get('page')) - 1])).length, 1300);
  await assert.rejects(collectEpisodePages({ data: [], links: { next: 'https://other.test/api/v1/releases' } }, endpoint, async () => []), /origin/);
  await assert.rejects(collectEpisodePages({ data: [], meta: { current_page: 1, last_page: 2 } }, endpoint, async () => []), /partial/);
  for (const page of [null, { error: 'unavailable' }, { data: null }, { data: [null] }, { data: [{ ordinal: 0 }] }]) {
    await assert.rejects(collectEpisodePages(page, endpoint, async () => []), /Invalid/);
  }

  const { checkAnimeSourceAvailability } = require('../lib/source-availability.ts');
  const anime = { id: 1, title: { romaji: 'One Piece' } };
  const episode = { ordinal: 1, hls_720: 'https://cdn.test/1.m3u8' };
  const release = (name, alias = 'one-piece') => ({ alias, name: { english: name }, episodes: [episode], player: { list: [episode] } });
  let detailCalls = 0;
  global.fetch = async url => {
    if (String(url).includes('/anime/releases/')) { detailCalls++; return Response.json(release('One Piece Movie')); }
    return Response.json([release('One Piece Movie')]);
  };
  assert.equal((await checkAnimeSourceAvailability(anime, 1)).status, 'unknown');
  assert.equal(detailCalls, 0, 'substring match must never select a film');
  global.fetch = async () => Response.json([release('One Piece')]);
  assert.equal((await checkAnimeSourceAvailability(anime, 1)).status, 'available');
  global.fetch = async () => Response.json([release('One Piece', 'a'), release('One Piece', 'b')]);
  assert.equal((await checkAnimeSourceAvailability(anime, 1)).status, 'unknown');
  global.fetch = async () => Response.json({ error: 'maintenance' });
  assert.equal((await checkAnimeSourceAvailability(anime, 1)).status, 'unknown');
  global.fetch = async () => Response.json({ error: 'maintenance', data: [] });
  assert.equal((await checkAnimeSourceAvailability(anime, 1)).status, 'unknown');
  global.fetch = async () => Response.json(null);
  assert.equal((await checkAnimeSourceAvailability(anime, 1)).status, 'unknown');
  global.fetch = async () => Response.json([]);
  assert.equal((await checkAnimeSourceAvailability(anime, 1)).status, 'unavailable');
  global.fetch = async url => Response.json(String(url).includes('/anime/releases/')
    ? { ...release('One Piece'), episodes: [], external_player: 'https://player.test/embed' }
    : String(url).includes('/v3/') ? [] : [release('One Piece')]);
  assert.equal((await checkAnimeSourceAvailability(anime, 2)).status, 'unknown', 'release iframe does not prove a missing episode');
  const gintama = { id: 2, title: { romaji: "Gintama'" } };
  global.fetch = async () => Response.json([release("Gintama'")]);
  assert.equal((await checkAnimeSourceAvailability(gintama, 1)).status, 'available');
  global.fetch = async () => Response.json([release('Gintama')]);
  assert.equal((await checkAnimeSourceAvailability(gintama, 1)).status, 'unknown');

  const rows = new Map();
  let kodikMode = 'missing';
  let directReason = 'server_busy';
  stubs['@/lib/supabase/admin'] = { createSupabaseAdmin: () => ({ from: () => ({
    select: () => ({ in: async (_column, ids) => ({ data: ids.map(id => rows.get(id)).filter(Boolean), error: null }) }),
    upsert: payload => ({ select: () => ({ single: async () => { rows.set(payload.anime_id, payload); return { data: payload, error: null }; } }) }),
  }) }) };
  stubs['@/lib/combined-anime'] = { getAnimesByIdsWithShikimori: async () => [] };
  stubs['@/lib/kodik-episode-availability'] = { searchKodikByShikimoriId: async () => {
    if (kodikMode === 'token') throw new Error('KODIK_TOKEN is not configured');
    return [];
  } };
  stubs['@/lib/source-availability'] = { checkAnimeCatalogAvailability: async () => ({ status: 'unavailable', reason: 'missing' }) };
  stubs['@/lib/direct-player-server'] = { resolveDirectPlayerStreams: async () => ({ streams: [], reason: directReason }) };
  stubs['@/lib/runtime-refresh-lease-server'] = {
    tryAcquireRuntimeRefreshLease: async () => ({ acquired: true, ownerToken: 'test' }), releaseRuntimeRefreshLease: async () => {},
  };
  const { refreshCatalogAvailability } = require('../lib/catalog-availability-server.ts');
  const noMapping = await refreshCatalogAvailability({ ...anime, id: 101 }, { force: true });
  assert.equal(noMapping.availability_status, 'unknown');
  assert.equal(noMapping.consecutive_misses, 0);
  kodikMode = 'token';
  directReason = 'feature_disabled';
  const previous = { anime_id: 102, mal_id: 20, availability_status: 'playable', max_episode: 12, consecutive_misses: 1, last_success_at: new Date().toISOString(), last_failure_at: null };
  rows.set(102, previous);
  const misconfigured = await refreshCatalogAvailability({ ...anime, id: 102, idMal: 20 }, { force: true });
  assert.equal(misconfigured.availability_status, 'unknown');
  assert.equal(misconfigured.max_episode, 12);
  assert.equal(misconfigured.consecutive_misses, 1);
  assert.equal(misconfigured.last_failure_at, null);
  const remapped = await refreshCatalogAvailability({ ...anime, id: 102, idMal: 21 }, { force: true });
  assert.equal(remapped.max_episode, null, 'do not reuse range from another MAL mapping');
  kodikMode = 'missing';
  directReason = 'server_busy';
  const busy = await refreshCatalogAvailability({ ...anime, id: 103, idMal: 20 }, { force: true });
  assert.equal(busy.availability_status, 'unknown');
  assert.equal(busy.consecutive_misses, 0);
  directReason = 'direct_stream_not_found';
  const absent = await refreshCatalogAvailability({ ...anime, id: 104, idMal: 20 }, { force: true });
  assert.equal(absent.availability_status, 'unavailable');
  console.log('PASS: malformed provider payloads, exact/ambiguous releases, missing episodes, dictionaries and registry miss/range preservation');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = originalFetch;
  Module._load = originalLoad;
  Module._resolveFilename = originalResolve;
  if (token === undefined) delete process.env.KODIK_TOKEN; else process.env.KODIK_TOKEN = token;
});
