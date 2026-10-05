import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const temp = mkdtempSync(join(tmpdir(), 'animebox-catalog-outage-'));
const fixtures = new Map([
  ['server-only', ''],
  ['next/server', 'export const NextResponse=Response; export const after=()=>{};'],
  ['@/lib/combined-anime', `export async function getAnimesWithShikimori() {
    globalThis.catalogTest.providerCalls++;
    if(globalThis.catalogTest.healthy) return [{id:10,title:{romaji:'Healthy'},genres:[]}];
    throw new Error('AniList HTTP 403');
  }`],
  ['@/lib/request-observability-server', 'export const observeApiRoute=(name,handler)=>handler;'],
  ['@/lib/catalog-availability-server', `export async function filterAnimeByAvailability(items) {
      if(!globalThis.catalogTest.healthy) throw new Error('Saved cards must not require upstream refresh');
      return {items,refreshTargets:[]};
    }
    export async function refreshCatalogAvailabilityBatch() {throw new Error('Unexpected refresh');}`],
  ['@/lib/search-index-server', `export async function searchLocalAnimeIndex(){return [];}
    export async function hydrateLocalAnimeHits(){throw new Error('Unexpected AniList hydration');}
    export async function indexAnimeSearchDocuments(){globalThis.catalogTest.writes++;}`],
  ['@/lib/supabase/admin', `export function createSupabaseAdmin() {return {from(table) {
    if(table!=='anime_saved_playable_catalog') throw new Error('Unexpected table');
    const predicates=[];const orders=[];
    return {
      select(){return this;},
      ilike(column,value){globalThis.catalogTest.predicates.push([column,value]);predicates.push(r=>r[column].includes(value.slice(1,-1)));return this;},
      overlaps(column,values){predicates.push(r=>values.some(v=>r[column].includes(v)));return this;},
      contains(column,values){predicates.push(r=>values.every(v=>r[column].includes(v)));return this;},
      eq(column,value){predicates.push(r=>r[column]===value);return this;},
      in(column,values){predicates.push(r=>values.includes(r[column]));return this;},
      order(column,opts){orders.push([column,opts.ascending]);return this;},
      async range(from,to){
        if(globalThis.catalogTest.databaseFailure) return {data:null,error:{message:'Database unavailable'}};
        let rows=globalThis.catalogTest.rows.filter(r=>predicates.every(p=>p(r)));
        rows.sort((a,b)=>{for(const [c,asc] of orders){if(a[c]!==b[c])return (a[c]<b[c]?-1:1)*(asc?1:-1);}return 0;});
        return {data:rows.slice(from,to+1),error:null};
      }
    };
  }};}`],
]);
try {
  await build({entryPoints:[resolve(root,'app/api/anime/route.ts')],outfile:join(temp,'route.mjs'),bundle:true,platform:'node',format:'esm',plugins:[{
    name:'outage-fixtures',setup(builder){
      builder.onResolve({filter:/.*/},args=>{
        if(fixtures.has(args.path))return {path:args.path,namespace:'fixture'};
        if(args.path.startsWith('@/'))return {path:resolve(root,args.path.slice(2)+'.ts')};
      });
      builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:fixtures.get(args.path),loader:'js'}));
    }
  }]});
  const {GET}=await import(pathToFileURL(join(temp,'route.mjs')));
  const rows=Array.from({length:5},(_,index)=>({
    anime_id:index+1,title:index===4?'Фрирен':'Тайтл '+index,slug:null,aliases:index===4?['Sousou no Frieren']:[],
    search_text:index===4?'фрирен sousou no frieren':'тайтл '+index,
    genres:index%2===0?['Фэнтези']:['Экшен'],tags:['Magic'],studios:['Madhouse'],
    format:index%2===0?'ТВ':'Фильм',start_year:index===4?2023:2020,
    total_episodes:12,finished:index%2===0,provider_status:index%2===0?'released':'ongoing',start_month:index===4?10:1,provider_score:8,episodes_aired:8,poster_url:'https://images.example/poster.jpg',description:null,
    updated_at:'2026-10-01',last_success_at:'2026-10-05',mal_id:index+100,
  }));
  const originalWarn=console.warn, originalError=console.error;
  console.warn=()=>{};console.error=()=>{};
  try {
    const run=async(query,extra={})=>{
      globalThis.catalogTest={rows,providerCalls:0,writes:0,predicates:[],...extra};
      const url=new URL('https://example.com/api/anime?'+query);
      const response=await GET({nextUrl:url});
      return {body:await response.json(),status:response.status,state:globalThis.catalogTest};
    };
    const first=await run('limit=2&page=1'), second=await run('limit=2&page=2'), last=await run('limit=2&page=3');
    assert.equal(first.status,200);assert.equal(first.body.catalogMeta.source,'saved');
    assert.deepEqual(first.body.anime.map(x=>x.id),[1,2]);
    assert.deepEqual(second.body.anime.map(x=>x.id),[3,4]);
    assert.deepEqual(last.body.anime.map(x=>x.id),[5]);
    assert.equal(first.body.pagination.hasNextPage,true);assert.equal(last.body.pagination.hasNextPage,false);
    const ru=await run('search=фрирен');assert.deepEqual(ru.body.anime.map(x=>x.id),[5]);
    const en=await run('search=Frieren');assert.deepEqual(en.body.anime.map(x=>x.id),[5]);
    assert.equal(en.state.providerCalls,1);assert.equal(en.state.writes,0);
    assert.ok(en.body.anime[0].slug.endsWith('-5'));assert.equal(en.body.anime[0].idMal,104);
    const filtered=await run('genres=Fantasy&tags=Magic&studios=Madhouse&format=TV&year=2023&status=finished');
    assert.deepEqual(filtered.body.anime.map(x=>x.id),[5]);
    assert.deepEqual((await run('season=FALL&year=2023')).body.anime.map(x=>x.id),[5]);
    assert.deepEqual((await run('status=ongoing')).body.anime.map(x=>x.id),[2,4]);
    assert.deepEqual((await run('status=upcoming')).body.anime,[]);
    assert.equal(first.body.anime[0].score,8);assert.equal(first.body.anime[0].episodesAired,8);
    assert.deepEqual((await run('search=несуществующийтайтл')).body.anime,[]);
    assert.equal((await run('limit=20',{databaseFailure:true})).status,502);
    const healthy=await run('limit=20',{healthy:true});
    assert.equal(healthy.status,200);assert.equal(healthy.body.catalogMeta,undefined);
    assert.deepEqual(healthy.body.anime.map(x=>x.id),[10]);assert.equal(healthy.state.writes,1);
    console.log('PASS: AniList 403 -> saved catalog; RU/EN search; filters; stable nonoverlapping pages; no upstream retries or index overwrite; DB failure remains 502.');
  }finally{console.warn=originalWarn;console.error=originalError;}
} finally {rmSync(temp,{recursive:true,force:true});}
