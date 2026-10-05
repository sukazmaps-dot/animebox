import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Run the real route, local fallback and provider lookup with AniList down.
// External services are fixtures; no production database writes or tokens.
const root = process.cwd();
const output = mkdtempSync(join(tmpdir(), 'animebox-player-outage-'));
const fixtures = new Map([
  ['server-only', ''],
  ['react', 'export const cache = fn => fn;'],
  ['next/cache', 'export const unstable_cache = fn => fn;'],
  ['next/server', 'export const NextResponse = Response; export const after = () => {};'],
  ['@/lib/anilist', `export async function getAnimeById() {
    globalThis.outageTest.anilistCalls++;
    throw new Error('AniList HTTP 403');
  }`],
  ['@/lib/community-server', `export function adminClient() { return {
    from(table) { return {
      select() { return this; }, eq() { return this; },
      async maybeSingle() {
        const state = globalThis.outageTest;
        if (table === 'anime_availability') return state.mappingError
          ? {data:null,error:{message:'Mapping table unavailable'}}
          : {data:state.malId ? {mal_id:state.malId} : null,error:null};
        if (!state.hasAnime) return {data:null,error:null};
        return {data: table === 'anime_catalog'
          ? {title:'Фрирен',genres:[],total_episodes:28,finished:true}
          : {title:'Фрирен',aliases:['Sousou no Frieren'],description:'Описание аниме'},error:null};
      }
    }; }
  }; }`],
  ['@/lib/player-source-control', 'export async function getProviderDecision() { return {enabled:true}; }'],
  ['@/lib/upstream-resilience-server', `export const isTransientUpstreamResponse = r => r.status >= 500;
    export const isUpstreamPressureError = () => false;
    export const upstreamKeyForUrl = () => null;
    export async function runWithUpstreamBudget(key, fn) { return fn(); }`],
  ['@/lib/seo-episode-index', 'export async function syncSeoEpisodeIndex() {}'],
]);
try {
  await build({
    entryPoints: [resolve(root, 'app/api/anime/[slug]/episode-availability/route.ts')],
    outfile: join(output, 'route.mjs'), bundle: true, platform: 'node', format: 'esm',
    plugins: [{name:'outage-fixtures', setup(builder) {
      builder.onResolve({filter:/.*/}, args => {
        if (fixtures.has(args.path)) return {path:args.path,namespace:'fixture'};
        if (args.path.startsWith('@/')) return {path:resolve(root,args.path.slice(2)+'.ts')};
      });
      builder.onLoad({filter:/.*/,namespace:'fixture'}, args => ({contents:fixtures.get(args.path),loader:'js'}));
    }}],
  });
  process.env.ANIMEBOX_RUNTIME = 'cloudflare';
  process.env.KODIK_TOKEN = 'test-fixture-token';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === 'kodik-api.com') {
      globalThis.outageTest.kodikIds.push(url.searchParams.get('shikimori_id'));
      return Response.json({results:[{link:'//player.example/verified-release',last_episode:28}]});
    }
    if (/aniliberty|anilibria/.test(url.hostname)) return Response.json([]);
    throw new Error('Unexpected external request: '+url.hostname);
  };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const {GET} = await import(pathToFileURL(join(output,'route.mjs')));
    const run = async options => {
      globalThis.outageTest = {hasAnime:true,malId:52991,mappingError:false,anilistCalls:0,kodikIds:[],...options};
      const response = await GET(new Request('https://example.com/api/anime/154587/episode-availability'),{params:Promise.resolve({slug:options.slug ?? '154587'})});
      return {status:response.status,body:await response.json(),state:globalThis.outageTest};
    };
    const playable = await run({});
    assert.equal(playable.status,200);
    assert.equal(playable.body.status,'available');
    assert.equal(playable.body.maxEpisode,28);
    assert.equal(playable.body.animeId,154587);
    assert.deepEqual(playable.state.kodikIds,['52991'], 'Use stored MAL ID, never AniList ID');
    assert.equal(playable.state.anilistCalls,1);
    for (const options of [{malId:null},{malId:-1},{mappingError:true}]) {
      const unknown = await run(options);
      assert.equal(unknown.body.status,'unknown');
      assert.deepEqual(unknown.state.kodikIds,[]);
    }
    assert.equal((await run({hasAnime:false})).status,404);
    assert.equal((await run({slug:'invalid'})).status,400);
    console.log('PASS: AniList 403 + stored mapping reaches Kodik; missing/invalid mapping stays unknown; 404/400 preserved.');
  } finally {globalThis.fetch=originalFetch;console.warn=originalWarn;}
} finally {rmSync(output,{recursive:true,force:true});}
