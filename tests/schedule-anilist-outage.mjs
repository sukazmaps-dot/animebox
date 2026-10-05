import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';

const root = process.cwd(), temp = mkdtempSync(join(tmpdir(), 'animebox-schedule-'));
const fixtures = new Map([
  ['@/lib/shikimori-schedule-server', 'export async function getShikimoriSchedule(){throw new Error("Shikimori unavailable");}'],
  ['server-only', ''],
  ['next/cache', 'export const unstable_cache=(fn)=>fn;'],
  ['next/server', 'export const NextResponse=Response;'],
  ['@/lib/anime-registry', 'export const registerAnime=(anime)=>({...anime,slug:"healthy-"+anime.id});'],
  ['@/lib/catalog-filter', 'export const isCatalogAnime=()=>true;'],
  ['@/lib/fetch-retry', `export async function fetchWithRetry(url){
    globalThis.scheduleTest.primaryCalls++;
    if(!globalThis.scheduleTest.healthy)return new Response('blocked',{status:403});
    return Response.json({data:{Page:{pageInfo:{hasNextPage:false},airingSchedules:[{
      id:88,airingAt:globalThis.scheduleTest.airingAt,episode:3,media:{id:154587,title:{romaji:'Healthy'}}
    }]}}});
  }`],
  ['@/lib/supabase/admin', `export const createSupabaseAdmin=()=>({from(table){return {
    select(){return this;},eq(){return this;},abortSignal(){return this;},
    async maybeSingle(){return {data:globalThis.scheduleTest.snapshot??null};},
    upsert(row){globalThis.scheduleTest.writes.push(row);return {abortSignal:async()=>({error:globalThis.scheduleTest.writeFailure?{message:"offline"}:null})};},
    async in(column,ids){
      if(globalThis.scheduleTest.databaseFailure)return {error:{message:'offline'}};
      if(table==='anime_availability')return {data:globalThis.scheduleTest.mapping.filter(r=>ids.includes(r.mal_id))};
      if(table==='anime_search_documents')return {data:globalThis.scheduleTest.cards.filter(r=>ids.includes(r.anime_id))};
      throw new Error('Unexpected table');
    }
  };}});`],
]);
const monday = Math.floor(Date.parse('2026-10-05T00:00:00Z') / 1000);
const weekly = (id, extra = {}) => ({mal_id:id, title:'MAL title', airing:true,
  broadcast:{day:'Mondays',time:'01:00',timezone:'Asia/Tokyo'}, ...extra});
const originalFetch=globalThis.fetch, originalError=console.error, originalWarn=console.warn, originalInfo=console.info;
try {
  await build({stdin:{contents:`export {GET} from './app/api/schedule/route.ts';
    export {plannedBroadcastTimes} from './lib/jikan-schedule-server.ts';`,resolveDir:root,loader:'ts'},
    outfile:join(temp,'route.mjs'),bundle:true,platform:'node',format:'esm',plugins:[{
      name:'fixtures',setup(b){
        b.onResolve({filter:/.*/},a=>{
          if(fixtures.has(a.path))return {path:a.path,namespace:'fixture'};
          if(a.path.startsWith('@/'))return {path:resolve(root,a.path.slice(2)+'.ts')};
        });
        b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:fixtures.get(a.path),loader:'js'}));
      }
    }]});
  const {GET,plannedBroadcastTimes}=await import(pathToFileURL(join(temp,'route.mjs')));
  const expected=monday-8*3600; // Monday 01:00 JST is Sunday 16:00 UTC.
  assert.deepEqual(plannedBroadcastTimes(weekly(52991),monday-86400,monday+86400),[expected]);
  assert.deepEqual(plannedBroadcastTimes(weekly(52991),expected,expected+3600),[]);
  assert.equal(plannedBroadcastTimes(weekly(52991),monday-86400,monday+9*86400).length,2);
  for(const broadcast of [null,{day:'Mondays',time:'25:00',timezone:'Asia/Tokyo'},
    {day:'Mondays',time:'01:60',timezone:'Asia/Tokyo'},
    {day:'Mondays',time:'01:00',timezone:'Europe/London'},
    {day:'Unknown',time:'01:00',timezone:'Asia/Tokyo'}]) {
    assert.deepEqual(plannedBroadcastTimes(weekly(52991,{broadcast}),monday-86400,monday+86400),[]);
  }
  assert.deepEqual(plannedBroadcastTimes(weekly(52991,{airing:false}),monday-86400,monday+86400),[]);
  globalThis.fetch=async(url)=>{
    assert.ok(String(url).startsWith('https://api.jikan.moe/v4/schedules?'));
    const state=globalThis.scheduleTest;state.fallbackCalls++;
    if(state.timeout)throw new DOMException('The operation was aborted due to timeout','TimeoutError');
    if(state.bodyTimeout)return {ok:true,status:200,json:async()=>{throw new DOMException('body timeout','TimeoutError');}};
    if(state.failPage2 && new URL(url).searchParams.get('page')==='2')throw new DOMException('page two timeout','TimeoutError');
    if(state.jikanFailure)return new Response('rate limit',{status:429});
    if(state.invalidPayload)return Response.json({data:[]});
    return Response.json({data:state.weekly,pagination:{has_next_page:!!state.failPage2}});
  };
  console.error=()=>{};console.warn=(...args)=>globalThis.scheduleTest?.logs.push(args.join(" "));console.info=()=>{};
  const run=async(extra={},query=`from=${monday-86400}&to=${monday+86400}`)=>{
    globalThis.scheduleTest={writes:[],logs:[],primaryCalls:0,fallbackCalls:0,airingAt:expected,
      weekly:[weekly(52991),weekly(999),weekly(777)],
      mapping:[{anime_id:154587,mal_id:52991},{anime_id:22,mal_id:777},{anime_id:33,mal_id:777}],
      cards:[{anime_id:154587,title:'Фрирен',slug:'frieren-154587',poster_url:'https://images.example/frieren.jpg',format:'TV'}],
      ...extra};
    const response=await GET({nextUrl:new URL('https://example.com/api/schedule?'+query)});
    return {status:response.status,body:await response.json(),state:globalThis.scheduleTest};
  };
  const fallback=await run();
  assert.equal(fallback.status,200);assert.equal(fallback.body.source,'jikan');
  assert.equal(fallback.body.items.length,1);
  assert.equal(fallback.body.items[0].media.id,154587);
  assert.equal(fallback.body.items[0].media.idMal,52991);
  assert.equal(fallback.body.items[0].media.slug,'frieren-154587');
  assert.equal(fallback.body.items[0].airingAt,expected);
  assert.equal(fallback.body.items[0].episode,null);
  assert.equal(fallback.body.items[0].timingKind,'weekly');
  assert.match(fallback.body.notice,/плановое/);assert.match(fallback.body.notice,/часть/);
  assert.equal(fallback.state.primaryCalls,1);assert.equal(fallback.state.fallbackCalls,1);
  const healthy=await run({healthy:true});
  assert.equal(healthy.status,200);assert.equal(healthy.body.items[0].episode,3);
  assert.equal(healthy.body.source,undefined);assert.equal(healthy.state.fallbackCalls,0);
  const empty=await run({mapping:[]});assert.equal(empty.status,200);assert.deepEqual(empty.body.items,[]);
  const limited=await run({},`from=${monday-86400}&to=${monday+9*86400}&limit=1`);
  assert.equal(limited.body.items.length,1);
  for(const extra of [{jikanFailure:true},{databaseFailure:true},{invalidPayload:true}])assert.equal((await run(extra)).status,502);
  assert.equal(fallback.state.writes.length,1,'full download persisted');
  const snapshot=(hours,anime=[weekly(52991)])=>({updated_at:new Date(Date.now()-hours*3600_000).toISOString(),payload:{anime,complete:true}});
  const fresh=await run({snapshot:snapshot(0.5),timeout:true});
  assert.equal(fresh.status,200);assert.equal(fresh.state.fallbackCalls,0);assert.equal(fresh.body.stale,false);
  const stale=await run({snapshot:snapshot(2),timeout:true});
  assert.equal(stale.status,200);assert.equal(stale.body.stale,true);assert.match(stale.body.notice,/устаревшими/);
  assert.equal(stale.state.writes.length,0);assert.match(stale.state.logs.join(' '),/page 1 headers: TimeoutError/);
  const body=await run({snapshot:snapshot(2),bodyTimeout:true});
  assert.equal(body.status,200);assert.match(body.state.logs.join(' '),/page 1 body: TimeoutError/);
  const incomplete=await run({snapshot:snapshot(2),failPage2:true});
  assert.equal(incomplete.status,200);assert.equal(incomplete.state.writes.length,0);
  assert.match(incomplete.state.logs.join(' '),/page 2 headers: TimeoutError/);
  const recovered=await run({snapshot:snapshot(2)});
  assert.equal(recovered.body.stale,false);assert.equal(recovered.state.writes.length,1);
  for(const extra of [{timeout:true},{timeout:true,snapshot:snapshot(49)},
    {timeout:true,snapshot:{...snapshot(2),payload:{anime:[],complete:false}}}])assert.equal((await run(extra)).status,502);
  const unwritable=await run({writeFailure:true});assert.equal(unwritable.status,200);assert.match(unwritable.state.logs.join(' '),/WRITE_FAILED/);
  const requestsBefore=globalThis.scheduleTest.fallbackCalls;
  const concurrentUrl=new URL(`https://example.com/api/schedule?from=${monday-86400}&to=${monday+86400}`);
  const parallel=await Promise.all([GET({nextUrl:concurrentUrl}),GET({nextUrl:concurrentUrl})]);
  assert.ok(parallel.every(response=>response.status===200));
  assert.equal(globalThis.scheduleTest.fallbackCalls-requestsBefore,1,'concurrent calls share the download');
  const invalid=await run({},`from=${monday}&to=${monday-1}`);
  assert.equal(invalid.status,400);assert.equal(invalid.state.fallbackCalls,0);assert.equal(invalid.state.primaryCalls,0);
  console.log('PASS: persistent fresh/stale snapshots, header/body timeout diagnostics, cold/expired failure and no partial overwrite; AniList 403 -> Jikan weekly schedule; correct JST dates and AnimeBox IDs; ambiguous/missing mappings omitted; no guessed episodes; healthy path preserved; 429/DB failure remain 502.');
} finally {
  globalThis.fetch=originalFetch;console.error=originalError;console.warn=originalWarn;console.info=originalInfo;rmSync(temp,{recursive:true,force:true});
}
