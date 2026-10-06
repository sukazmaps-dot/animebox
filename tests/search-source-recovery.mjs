import assert from 'node:assert/strict';
import {build, transform} from 'esbuild';
import {readFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const importTs = async path => {
  const {code} = await transform(readFileSync(path, 'utf8'), {loader: 'ts', format: 'esm'});
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
};
const {createPublicResultCache} = await importTs('lib/public-result-cache.ts');
const originalNow = Date.now;
let now = 0, calls = 0, release;
Date.now = () => now;
try {
  const cached = createPublicResultCache({ttlMs: 100, maxEntries: 1, cacheWhen: rows => rows.length > 0});
  const gate = new Promise(resolve => {release = resolve;});
  const load = async () => {calls++; await gate; return [1];};
  const a = cached('same', load), b = cached('same', load);
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.deepEqual(await cached('overflow', async () => [2]), [2]);
  release(); await Promise.all([a, b]);
  assert.deepEqual(await cached('same', async () => [3]), [1]);
  now = 101;
  assert.deepEqual(await cached('same', async () => [3]), [3]);
  await cached('empty', async () => []);
  assert.deepEqual(await cached('empty', async () => [4]), [4]);
  await assert.rejects(cached('failure', async () => {throw new Error('offline');}));
  assert.deepEqual(await cached('failure', async () => [5]), [5]);
  assert.deepEqual(await cached('same', async () => [6]), [6], 'bounded completed cache evicts oldest');
} finally {Date.now = originalNow;}

const {sourceFailureReason} = await importTs('lib/source-failure-reason.ts');
assert.equal(sourceFailureReason(['provider_timeout', 'episode_unavailable'], false), 'provider_timeout');
assert.equal(sourceFailureReason(['provider_unavailable', 'not_found'], false), 'provider_unavailable');
assert.equal(sourceFailureReason(['episode_unavailable', 'not_found'], false), 'episode_unavailable');
assert.equal(sourceFailureReason(['copyright_restricted'], false), 'copyright_restricted');
assert.equal(sourceFailureReason(['not_found'], true), 'discovery_budget_exhausted');

const originalFetch = globalThis.fetch;
let clientCalls = 0;
try {
  globalThis.fetch = async () => {
    clientCalls++;
    return Response.json({query: 'recovered-title', source: 'local-index-v2', items: clientCalls === 1 ? [] : [{id: 1}]});
  };
  const {getInstantAnimeSearch} = await importTs('lib/instant-search-client.ts');
  assert.equal((await getInstantAnimeSearch('recovered-title')).items.length, 0);
  assert.equal((await getInstantAnimeSearch('recovered-title')).items.length, 1, 'empty error payload must not hide index recovery');
  await getInstantAnimeSearch('recovered-title');
  assert.equal(clientCalls, 2, 'nonempty results retain normal browser memory cache');
} finally {globalThis.fetch = originalFetch;}

const dir = mkdtempSync(join(tmpdir(), 'animebox-search-source-'));
globalThis.lookupFixture = {rpcCalls: 0, routeCalls: 0, local: true, failure: false};
try {
  await build({entryPoints: [resolve('lib/search-index-server.ts')], outfile: join(dir, 'search.mjs'), bundle: true, platform: 'node', format: 'esm', plugins: [{name: 'search-fixture', setup(b) {
    b.onResolve({filter: /^@\/lib\/public-result-cache$/}, () => ({path: resolve('lib/public-result-cache.ts')}));
    b.onResolve({filter: /^(server-only|@\/)/}, a => ({path: a.path, namespace: 'fixture'}));
    b.onLoad({filter: /.*/, namespace: 'fixture'}, a => ({loader: 'js', contents:
      a.path === 'server-only' ? '' :
      a.path === '@/lib/supabase/admin' ? `export function createSupabaseAdmin(){return {rpc:async(name,args)=>{globalThis.lookupFixture.rpcCalls++;return {data:Array.from({length:args.match_count},(_,i)=>({anime_id:i+1,similarity_score:1,title:'Naruto',slug:'naruto-'+i})),error:null}}}}` :
      a.path === '@/lib/combined-anime' ? 'export const getAnimesByIdsWithShikimori=async()=>[];' :
      a.path === '@/lib/smart-search' ? 'export const normalizeSearchText=q=>q.trim().toLowerCase();export const buildSearchQueryVariants=q=>[q];' : (() => {throw new Error(a.path);})()}));
  }}]});
  const {searchLocalAnimeIndex} = await import(join(dir, 'search.mjs'));
  const [preview, main] = await Promise.all([searchLocalAnimeIndex('naruto', 18), searchLocalAnimeIndex('naruto', 16)]);
  assert.equal(globalThis.lookupFixture.rpcCalls, 1, 'preview and authoritative lookup share RPC pool');
  assert.equal(preview.length, 18); assert.equal(main.length, 16);
  await searchLocalAnimeIndex('naruto', 18);
  assert.equal(globalThis.lookupFixture.rpcCalls, 1);

  globalThis.lookupFixture.controlReads = 0;
  await build({entryPoints: [resolve('lib/player-source-control.ts')], outfile: join(dir, 'control.mjs'), bundle: true, platform: 'node', format: 'esm', plugins: [{name: 'control-fixture', setup(b) {
    b.onResolve({filter: /^@\/lib\/player-source-orchestrator$/}, () => ({path: resolve('lib/player-source-orchestrator.ts')}));
    b.onResolve({filter: /^(server-only|@\/)/}, a => ({path: a.path, namespace: 'fixture'}));
    b.onLoad({filter: /.*/, namespace: 'fixture'}, a => ({loader: 'js', contents:
      a.path === 'server-only' ? '' :
      a.path === '@/lib/community-server' ? `export function adminClient(){return {from(){globalThis.lookupFixture.controlReads++;return {select(){const result=Promise.resolve({data:[],error:null});return {then:result.then.bind(result),order:()=>result}}}}}}` :
      a.path === '@/lib/copyright-server' ? 'export const getPlaybackRestriction=async()=>null;' :
      a.path === '@/lib/system-observability-server' ? 'export const reportSystemIncident=async()=>{};export const resolveSystemIncident=async()=>{};' :
      a.path === '@/lib/runtime-refresh-lease-server' ? 'export const tryAcquireRuntimeRefreshLease=async()=>({acquired:true});' : (() => {throw new Error(a.path);})()}));
  }}]});
  const control = await import(join(dir, 'control.mjs'));
  await Promise.all([control.getProviderDecision('kodik', {}), control.getProviderDecision('aniliberty', {})]);
  assert.equal(globalThis.lookupFixture.controlReads, 2, 'parallel decisions share one settings/runtime read pair');
  await control.getProviderDecision('kodik', {});
  assert.equal(globalThis.lookupFixture.controlReads, 2, 'existing 15-second policy cache remains in use');
  control.invalidateProviderControlCache();
  await control.getProviderDecision('kodik', {});
  assert.equal(globalThis.lookupFixture.controlReads, 4, 'admin invalidation still reloads controls');

  await build({entryPoints: [resolve('app/api/anime/[slug]/episode-availability/route.ts')], outfile: join(dir, 'route.mjs'), bundle: true, platform: 'node', format: 'esm', plugins: [{name: 'route-fixture', setup(b) {
    b.onResolve({filter: /^(next\/|@\/)/}, a => ({path: a.path, namespace: 'fixture'}));
    b.onLoad({filter: /.*/, namespace: 'fixture'}, a => ({loader: 'js', contents:
      a.path === 'next/server' ? 'export const after=fn=>fn();export const NextResponse={json:(value,init)=>Response.json(value,init)};' :
      a.path === '@/lib/anime-route' ? 'export const resolveAnimeRoute=async()=>{globalThis.lookupFixture.routeCalls++;return {id:1,idMal:20}};' :
      a.path === '@/lib/anime-localization-server' ? 'export const getLocalAnimeDetailFallback=async()=>globalThis.lookupFixture.local?{id:1,idMal:20}:null;' :
      a.path === '@/lib/episode-provider-availability' ? `export const getEpisodeProviderAvailability=async()=>{if(globalThis.lookupFixture.failure)throw new DOMException('timed out','TimeoutError');return {animeId:1,status:'available',episodes:[1],maxEpisode:1,providers:[]}};` :
      a.path === '@/lib/seo-episode-index' ? 'export const syncSeoEpisodeIndex=async()=>{};' : (() => {throw new Error(a.path);})()}));
  }}]});
  const {GET} = await import(join(dir, 'route.mjs'));
  const request = new Request('https://example.test/api/anime/1/episode-availability');
  const params = {params: Promise.resolve({slug: '1'})};
  assert.equal((await (await GET(request, params)).json()).status, 'available');
  assert.equal(globalThis.lookupFixture.routeCalls, 0, 'saved provider mapping bypasses external detail resolution');
  globalThis.lookupFixture.local = false;
  await GET(request, params);
  assert.equal(globalThis.lookupFixture.routeCalls, 1, 'missing saved metadata still resolves through fallback');
  globalThis.lookupFixture.failure = true;
  const timedOut = await (await GET(request, params)).json();
  assert.equal(timedOut.status, 'unknown'); assert.equal(timedOut.reason, 'provider_timeout');
  assert.equal((await GET(request, {params: Promise.resolve({slug: 'bad'})})).status, 400);
  console.log('PASS: bounded shared search cache, RPC pool reuse, expiry/recovery, source reasons and saved-first availability route');
} finally {delete globalThis.lookupFixture; rmSync(dir, {recursive: true, force: true});}
