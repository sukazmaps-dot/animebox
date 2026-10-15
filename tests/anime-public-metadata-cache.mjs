import assert from 'node:assert/strict';
import { build } from 'esbuild';
import fs, { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const temp = mkdtempSync(join(tmpdir(), 'animebox-metadata-cache-'));
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
  await build({
    entryPoints: [resolve(root, 'lib/anime-public-metadata-server.ts')],
    outfile: join(temp, 'cache.mjs'),
    format: 'esm', bundle: true, platform: 'node',
    plugins: [{ name: 'metadata-fixtures', setup(builder) {
      builder.onResolve({ filter: /^(server-only|next\/server|@\/lib\/supabase\/admin|@\/lib\/anilist)$/ },
        (arg) => ({ path: arg.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, arg => ({
        loader: 'js',
        contents: arg.path === 'server-only' ? '' :
          arg.path === 'next/server' ? 'export const after=work=>globalThis.patch304.jobs.push(work);' :
          arg.path === '@/lib/anilist' ? `
            export async function getAnimesByIds(ids) {
              globalThis.patch304.state.providerCalls++;
              if (globalThis.patch304.state.providerDown) throw Error('provider HTTP 429');
              return ids.map(id=>({id,score:9.3,averageScore:93,episodes:12,
                episodesAired:5,status:'RELEASING',title:{romaji:'Provider'},genres:[]}));
            }` :
          `export const createSupabaseAdmin=()=>({
            from(table) {
              if (table !== 'anime_public_metadata_cache') throw Error(table);
              return globalThis.patch304.fakeQuery();
            },
            async rpc(name, args) {
              if (name !== 'merge_anilist_metadata_batch') throw Error(name);
              if (globalThis.patch304.state.dbDown) return {error:{message:'database offline'}};
              if (args.rows.length > 30) throw Error('unbounded writes');
              globalThis.patch304.state.writes++;
              for (const row of args.rows) {
                const current = globalThis.patch304.snapshots.get(row.anime_id);
                if (!current || current.fetched_at <= row.fetched_at) {
                  globalThis.patch304.snapshots.set(row.anime_id,
                    {...row,source:'anilist'});
                }
              }
              return { error: null };
            }
          });`,
      }));
      builder.onResolve({ filter: /^@\// }, arg => ({ path: resolve(root, arg.path.slice(2)+'.ts') }));
    }}],
  });
  globalThis.patch304.fakeQuery = fakeQuery;
  const api = await import(pathToFileURL(join(temp, 'cache.mjs')));

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
  assert(savedSource.includes('enrichSavedAnimeMetadata('));
  assert(source.includes('unstable_cache'), 'existing home cache retained');
  console.log('PASS Patch 30.4: canonical score, unknown, expiry, provider outage, DB fallback, batch overlay/write, home async refresh, field/identity preservation.');
} finally {
  rmSync(temp,{recursive:true,force:true});
  delete globalThis.patch304;
}
