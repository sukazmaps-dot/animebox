import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.cwd(),temp=mkdtempSync(join(tmpdir(),'shikimori-schedule-'));
const calendar=JSON.parse(readFileSync('tests/fixtures/shikimori-calendar.json','utf8'));
const clock=Date.parse('2026-10-05T13:40:00Z');
const original={now:Date.now,fetch:globalThis.fetch,warn:console.warn,error:console.error,info:console.info};
const fixtures=new Map([
  ['server-only',''],['next/server','export const NextResponse=Response;'],
  ['@/lib/anime-registry','export const registerAnime=x=>x;'],
  ['@/lib/catalog-filter','export const isCatalogAnime=()=>true;'],
  ['@/lib/fetch-retry','export async function fetchWithRetry(){return new Response("blocked",{status:403});}'],
  ['@/lib/jikan-schedule-server','export async function getJikanSchedule(){globalThis.shikiTest.jikanCalls++;throw new Error("Jikan HTTP 522");}'],
  ['@/lib/supabase/admin',`export const createSupabaseAdmin=()=>({from(table){return {
    select(){return this;},eq(){return this;},abortSignal(){return this;},
    async maybeSingle(){return {data:globalThis.shikiTest.snapshot};},
    upsert(row){globalThis.shikiTest.writes.push(row);return {abortSignal:async()=>({error:null})};},
    async in(column,ids){
      if(globalThis.shikiTest.databaseFailure)return {error:{message:'offline'}};
      if(table==='anime_availability')return {data:globalThis.shikiTest.mapping.filter(r=>ids.includes(r.mal_id))};
      if(table==='anime_search_documents')return {data:globalThis.shikiTest.cards.filter(r=>ids.includes(r.anime_id))};
      throw new Error('Unexpected table');
    }
  };}});`],
]);
try{
  await build({entryPoints:[resolve(root,'app/api/schedule/route.ts')],outfile:join(temp,'route.mjs'),bundle:true,platform:'node',format:'esm',plugins:[{
    name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>{
      if(fixtures.has(a.path))return {path:a.path,namespace:'fixture'};
      if(a.path.startsWith('@/'))return {path:resolve(root,a.path.slice(2)+(a.path.endsWith('.mjs')?'':'.ts'))};
    });b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:fixtures.get(a.path),loader:'js'}));}
  }]});
  const {GET}=await import(pathToFileURL(join(temp,'route.mjs')));
  Date.now=()=>clock;console.warn=()=>{};console.error=()=>{};console.info=()=>{};
  globalThis.fetch=async(url)=>{
    assert.equal(url,'https://shikimori.io/api/calendar');globalThis.shikiTest.fetches++;
    if(globalThis.shikiTest.offline)throw new DOMException('timeout','TimeoutError');
    if(globalThis.shikiTest.html)return new Response('<html>challenge</html>',{status:200});
    return Response.json(calendar);
  };
  const saved=(hours=0.5)=>({payload:{anime:calendar,complete:true},updated_at:new Date(clock-hours*3600_000).toISOString()});
  const run=async(extra={},params='')=>{
    globalThis.shikiTest={snapshot:saved(),fetches:0,jikanCalls:0,writes:[],
      mapping:[{anime_id:212888,mal_id:64340},{anime_id:185874,mal_id:60636},
        {anime_id:1,mal_id:21},{anime_id:2,mal_id:21}],
      cards:[{anime_id:212888,title:'Во всеоружии',slug:'overgeared-212888',poster_url:'https://images.example/1.jpg',format:'TV'},
        {anime_id:185874,title:'Блич',slug:'bleach-185874',poster_url:'https://images.example/2.jpg',format:'TV'}],...extra};
    const response=await GET({nextUrl:new URL('https://example.com/api/schedule?'+params)});
    return {status:response.status,body:await response.json(),state:globalThis.shikiTest};
  };
  const result=await run({offline:true});
  assert.equal(result.status,200);assert.equal(result.body.source,'shikimori');
  assert.equal(result.state.fetches,0);assert.equal(result.state.jikanCalls,0);
  assert.deepEqual(result.body.items.map(x=>x.media.id),[null,212888,185874,null]);
  assert.deepEqual(result.body.items.map(x=>x.episode),[1,3,9,1181]);
  assert.equal(result.body.items[2].airingAt,Date.parse('2026-10-10T14:00:00Z')/1000);
  assert.equal(result.body.items[2].timingKind,'planned');assert.equal(result.body.items[2].media.idMal,60636);
  assert.match(result.body.notice,/плановые/);assert.match(result.body.notice,/поиск/);
  assert.equal(result.body.items[0].media.coverImage,null);
  const withoutPoster=await run({cards:[]});assert.equal(withoutPoster.body.items.length,4);
  const stale=await run({snapshot:saved(2),offline:true});
  assert.equal(stale.status,200);assert.equal(stale.body.stale,true);assert.match(stale.body.notice,/устаревшими/);
  const live=await run({snapshot:null});assert.equal(live.status,200);assert.equal(live.state.writes.length,1);
  const cold=await run({snapshot:null,offline:true});assert.equal(cold.status,502);assert.equal(cold.state.jikanCalls,1);
  assert.equal((await run({snapshot:saved(49),offline:true})).status,502);
  assert.equal((await run({snapshot:null,html:true})).status,502);
  assert.equal((await run({databaseFailure:true})).status,502);
  const boundary=Date.parse(calendar[0].next_episode_at)/1000;
  const exactStart=await run({},`from=${boundary}&to=${boundary+3600}`);
  assert.equal(exactStart.body.items.length,1);assert.equal(exactStart.body.items[0].airingAt,boundary);
  const limited=await run({},'limit=1');assert.equal(limited.body.items.length,1);
  const range=await run({},`from=${Date.parse('2026-10-10T00:00:00Z')/1000}&to=${Date.parse('2026-10-11T00:00:00Z')/1000}`);
  assert.deepEqual(range.body.items.map(x=>x.media.id),[185874]);
  console.log('PASS: real Shikimori calendar fixture -> saved snapshot -> AnimeBox IDs, exact timezone/episode, planned labels; unknown/ambiguous IDs retained without canonical links; missing posters retained; fresh/stale/live/expired/HTML failure paths.');
}finally{Date.now=original.now;globalThis.fetch=original.fetch;console.warn=original.warn;console.error=original.error;console.info=original.info;rmSync(temp,{recursive:true,force:true});}
