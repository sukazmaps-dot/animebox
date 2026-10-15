import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

const jobs = [];
const snapshots = new Map();
const state = { dbDown: false, providerDown: false, providerCalls: 0, dbReads: [], writes: 0 };
globalThis.patch304 = { jobs, snapshots, state };

const sql = readFileSync('supabase/migrations/20261015140000_anime_public_metadata_cache_v1.sql', 'utf8');
assert.match(sql, /enable row level security/i);
assert.match(sql, /revoke all on public.anime_public_metadata_cache from public, anon, authenticated/i);
assert.match(sql, /grant .* to service_role/i);
assert.match(sql, /security invoker/i);
assert.match(sql, /jsonb_array_length\(rows\) > 30/i);
assert.match(sql, /fetched_at <= excluded.fetched_at/i);
assert.doesNotMatch(sql, /create policy/i);

function fakeQuery() {
  let requested = [];
  let onlyFresh = null;
  return {
    select() { return this; },
    in(field, ids) {
      assert.equal(field, 'anime_id');
      requested = ids;
      state.dbReads.push([...ids]);
      return this;
    },
    gt(field, value) {
      assert.equal(field, 'expires_at');
      onlyFresh = value;
      return this;
    },
    abortSignal() { return this; },
    then(resolve, reject) {
      if (state.dbDown) return Promise.resolve({
        data: null, error: { message: 'relation does not exist' },
      }).then(resolve, reject);
      return Promise.resolve({
        data: requested.map(id => snapshots.get(id)).filter(
          row => row && (!onlyFresh || row.expires_at > onlyFresh),
        ), error: null,
      }).then(resolve, reject);
    },
  };
}

try {
  function compile(path, modules = {}) {
    const source = readFileSync(path, 'utf8');
    const javascript = ts.transpileModule(source, {
      fileName: path,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      reportDiagnostics: true,
    });
    assert.equal(javascript.diagnostics?.length ?? 0, 0, 'could not transpile '+path);
    const moduleRef = { exports: {} };
    new Function('require','exports','module', javascript.outputText)(
      (name) => {
        if (Object.prototype.hasOwnProperty.call(modules, name)) return modules[name];
        throw new Error('Unexpected import '+name+' in '+path);
      },
      moduleRef.exports, moduleRef,
    );
    return moduleRef.exports;
  }
  const score = compile('lib/anime-score.ts');
  globalThis.patch304.fakeQuery = fakeQuery;
  const db = {
    createSupabaseAdmin: () => ({
      from(table) {
        assert.equal(table, 'anime_public_metadata_cache');
        return fakeQuery();
      },
      async rpc(name, args) {
        assert.equal(name, 'merge_anilist_metadata_batch');
        if (state.dbDown) return { error: { message: 'database offline' } };
        assert(args.rows.length <= 30, 'unbounded writes');
        state.writes++;
        for (const row of args.rows) {
          const current = snapshots.get(row.anime_id);
          if (!current || current.fetched_at <= row.fetched_at) {
            snapshots.set(row.anime_id, { ...row, source:'anilist' });
          }
        }
        return { error:null };
      },
    }),
  };
  const api = compile('lib/anime-public-metadata-server.ts', {
    'server-only': {},
    'next/server': { after: (work) => jobs.push(work) },
    '@/lib/anilist': {
      getAnimesByIds: async (ids) => {
        state.providerCalls++;
        if (state.providerDown) throw Error('provider HTTP 429');
        return ids.map(id => ({ id, score:9.3, averageScore:93,
          episodes:12, episodesAired:5, status:'RELEASING',
          title:{romaji:'Provider'}, genres:[] }));
      },
    },
    '@/lib/supabase/admin': db,
    '@/lib/anime-score': score,
    '@/lib/runtime-refresh-lease-server': {
      tryAcquireRuntimeRefreshLease: async () => ({
        acquired: !state.leaseDenied, ownerToken:'mock-owner', degraded:false,
      }),
      releaseRuntimeRefreshLease: async () => {},
    },
  });

  const saved = [
    { id: 101, idMal: 998, title: { russian: 'Сохранённый' },
      coverImage: { large: 'poster' }, genres: [], score: 8.1,
      episodes: 24, episodesAired: 7, status: 'Онгоинг', metadataSource: 'saved' },
    { id: 102, idMal: 999, title: { romaji: 'B' },
      genres: [], score: 7.5, episodes: 13 },
  ];
  let actual = await api.enrichSavedAnimeMetadata(saved);
  assert.equal(actual[0].score, 8.1, 'empty/missing migration keeps known Shikimori score');
  assert.deepEqual(actual.map(x => x.id), [101, 102]);
  assert.equal(actual[0].title.russian, 'Сохранённый');
  assert.equal(actual[0].coverImage.large, 'poster');

  await api.persistAniListMetadata([{ id: 101, score: 9.25, averageScore: 93,
    episodes: 12, episodesAired: 5, status: 'RELEASING', genres: [], title: {} }]);
  const canonical = snapshots.get(101);
  assert.equal(canonical.score_10, 9.3, 'score normalized exactly to one decimal');
  assert.equal(state.writes, 1);
  actual = await api.enrichSavedAnimeMetadata(saved);
  assert.equal(actual[0].score, 9.3);
  assert.equal(actual[0].averageScore, 93);
  assert.equal(actual[0].episodes, 12);
  assert.equal(actual[0].episodesAired, 5);
  assert.equal(actual[0].status, 'RELEASING');
  assert.equal(actual[0].metadataSource, 'saved', 'availability fast path intact');
  assert.strictEqual(actual[1], saved[1], 'distinct anime untouched');
  assert.equal(actual[0].idMal, 998, 'AniList and MAL identities not mixed');

  snapshots.set(102, { anime_id:102, score_10:null, episodes_total:null,
    episodes_aired:null,status:null,source:'anilist',
    fetched_at:new Date().toISOString(),
    expires_at:new Date(Date.now()+60_000).toISOString() });
  actual = await api.enrichSavedAnimeMetadata(saved);
  assert.equal(actual[1].score, null, 'known unknown score should not fall back to Shikimori');
  assert.equal(actual[1].episodes,13,'unknown total does not erase saved total');
  assert.equal(state.dbReads.at(-1).length,2, 'one deduped batch DB request');

  snapshots.set(102,{...snapshots.get(102),
    score_10:4.8, expires_at:new Date(Date.now()-1000).toISOString()});
  actual = await api.enrichSavedAnimeMetadata(saved);
  assert.equal(actual[1].score,7.5,'expired canonical record does not override fallback');

  state.dbDown = true;
  actual = await api.enrichSavedAnimeMetadata(saved);
  assert.equal(actual[0].score,8.1,'database failure must fail open');
  state.dbDown = false;

  const previousReads = state.dbReads.length;
  const previousProviderCalls = state.providerCalls;
  api.scheduleHomeMetadataRefresh([...saved, saved[0]]);
  assert.equal(state.providerCalls, previousProviderCalls,'home must never wait on provider');
  assert.equal(jobs.length,1);
  await jobs.shift()();
  assert.equal(state.providerCalls,previousProviderCalls+1,'one batch provider call');
  assert.deepEqual(state.dbReads[previousReads],[101,102],'one bounded snapshot query');
  assert.equal(snapshots.get(102).score_10,9.3,'background refresh filled expired item');

  state.providerDown = true;
  snapshots.get(102).expires_at = new Date(Date.now()-1000).toISOString();
  api.scheduleHomeMetadataRefresh([saved[1]]);
  await jobs.shift()();
  assert.equal(snapshots.get(102).score_10,9.3,
    'failed upstream refresh never erases last known snapshot');
  state.providerDown = false;

  const ids = Array.from({length:75},(_,i)=>({id:i+300,score:9,title:{},genres:[]}));
  api.scheduleHomeMetadataRefresh(ids);
  await jobs.shift()();
  assert(state.dbReads.at(-1).length <= 24,'background refresh is capped');
  assert(state.writes <= 4, 'no per-card DB writes');
  assert.equal(state.dbReads.at(-1)[0],300);

  const source = readFileSync('lib/home-feed-server.ts','utf8');
  const detail = readFileSync('lib/anime-route.ts','utf8');
  const savedSource = readFileSync('lib/saved-catalog-server.ts','utf8');
  assert(source.includes('scheduleHomeMetadataRefresh('));
  assert(detail.includes('scheduleAniListMetadataPersist(baseAnime)'));
  assert(detail.includes('enrichSavedAnimeMetadata([localized])'), 'canonical snapshots must restore title score on AniList outage');
  assert(savedSource.includes('enrichSavedAnimeMetadata('));
  assert(source.includes('unstable_cache'), 'existing home cache retained');
  console.log('PASS Patch 30.4: canonical score, unknown, expiry, provider outage, DB fallback, batch overlay/write, home async refresh, field/identity preservation.');
} finally {
  delete globalThis.patch304;
}
