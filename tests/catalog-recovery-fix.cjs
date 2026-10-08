const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const originalLoad = Module._load, originalResolve = Module._resolveFilename;
let outage = false, viewMissing = true, optionalFailure = false, providerCalls = 0;
const rows = Array.from({length:7},(_,i)=>({ anime_id:i+1,title:'Наруто '+(i+1),aliases:['Naruto'],slug:null,
  search_text:'наруто naruto',genres:['Экшен'],tags:[],studios:[],poster_url:'https://shikimori.io/poster.jpg',format:'TV',start_year:2020,total_episodes:12,finished:true }));
const availability = [2,4,5,7].map(id=>({anime_id:id,mal_id:100+id,availability_status:'playable',max_episode:12}));
const tableCalls=[];
function builder(table) {
  tableCalls.push(table);
  const filters=[];let range=[0,9999];
  const q={
    select(){return q;}, order(){return q;}, abortSignal(signal){assert.ok(signal);return q;},
    ilike(c,v){filters.push(row=>String(row[c]).toLowerCase().includes(v.slice(1,-1).toLowerCase()));return q;},
    eq(c,v){filters.push(row=>row[c]===v);return q;}, gt(c,v){filters.push(row=>row[c]>v);return q;},
    in(c,v){filters.push(row=>v.includes(row[c]));return q;},
    overlaps(c,v){filters.push(row=>v.some(x=>(row[c]||[]).includes(x)));return q;},
    contains(c,v){filters.push(row=>v.every(x=>(row[c]||[]).includes(x)));return q;},
    range(a,b){range=[a,b];return q;},
    then(resolve){
      if(outage)return Promise.resolve({error:{code:'08006',message:'offline'}}).then(resolve);
      if(table==='anime_saved_playable_catalog' && viewMissing)return Promise.resolve({error:{code:'42P01',message:'relation does not exist'}}).then(resolve);
      const source=table==='anime_availability'?availability:rows;
      return Promise.resolve({data:source.filter(row=>filters.every(f=>f(row))).slice(range[0],range[1]+1),error:null}).then(resolve);
    },
  };return q;
}
const stubs={
  'server-only':{},
  'next/server':{NextResponse:Response,after:()=>{}},
  '@/lib/supabase/admin':{createSupabaseAdmin:()=>({from:builder})},
  '@/lib/combined-anime':{getAnimesWithShikimori:async (_opts,options)=>{
    providerCalls++;if(optionalFailure && providerCalls===1){options?.onPageInfo?.({hasNextPage:false});return [{id:2,title:{russian:'Наруто',romaji:'Naruto'},genres:[]}];}
    throw new Error('provider blocked');}},
  '@/lib/search-index-server':{searchLocalAnimeIndex:async()=>[],indexAnimeSearchDocuments:async()=>{}},
  '@/lib/catalog-availability-server':{filterAnimeByAvailability:async items=>({items,refreshTargets:[]})},
  '@/lib/request-observability-server':{observeApiRoute:(_name,handler)=>handler},
};
Module._load=function(name,...args){return Object.hasOwn(stubs,name)?stubs[name]:originalLoad.call(this,name,...args);};
Module._resolveFilename=function(name,...args){return originalResolve.call(this,name.startsWith('@/')?path.resolve(name.slice(2)):name,...args);};
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
async function main(){
  const {getSavedCatalogPage}=require('../lib/saved-catalog-server.ts');
  const first=await getSavedCatalogPage({limit:2,page:1,search:'Наруто'});
  const second=await getSavedCatalogPage({limit:2,page:2,search:'Naruto'});
  assert.deepEqual(first.anime.map(x=>x.id),[2,4]);assert.equal(first.hasNextPage,true);
  assert.deepEqual(second.anime.map(x=>x.id),[5,7]);assert.equal(second.hasNextPage,false);
  assert.equal(first.compatibility,true);assert.equal(first.anime[0].idMal,102);
  assert.deepEqual((await getSavedCatalogPage({season:'FALL'})).unsupportedFilters,['season']);
  assert.equal((await getSavedCatalogPage({page:100,limit:20})).scanLimited,true);
  outage=true;const count=tableCalls.length;
  await assert.rejects(getSavedCatalogPage({search:'Наруто'}));assert.equal(tableCalls.length,count+1,'database outage must not fan out');outage=false;
  const {GET}=require('../app/api/anime/route.ts');
  const response=await GET({nextUrl:new URL('https://youranimebox.com/api/anime?search=Наруто&limit=2')});
  assert.equal(response.status,200);assert.equal((await response.json()).catalogMeta.source,'saved');
  providerCalls=0;optionalFailure=true;
  const recovered=await GET({nextUrl:new URL('https://youranimebox.com/api/anime?search=Наруто%20сезон%202')});
  assert.equal(recovered.status,200);assert.ok((await recovered.json()).anime.length>0,'optional provider failure must preserve primary results');
  const {withCatalogProviderBudget}=require('../lib/catalog-provider-budget.ts');
  let aborted=false;
  await assert.rejects(withCatalogProviderBudget(signal=>{signal.addEventListener('abort',()=>{aborted=true;});return new Promise(()=>{});},5),{name:'TimeoutError'});
  assert.equal(aborted,true);
  assert.equal(await withCatalogProviderBudget(async()=>42,50),42);
  console.log('PASS: missing saved view, RU/EN pagination after availability, unsupported filters, database outage, optional search failure and hanging-provider deadline');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{Module._load=originalLoad;Module._resolveFilename=originalResolve;});
