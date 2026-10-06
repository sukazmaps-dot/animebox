import assert from 'node:assert/strict';
import {build, transform} from 'esbuild';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const {code}=await transform(readFileSync('lib/anime-metadata-merge.ts','utf8'),{loader:'ts',format:'esm'});
const {mergeAnimeMetadata,enrichAnimeCards,mergeAnimePages}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const rich={id:1,idMal:20,title:{russian:'Наруто',romaji:'Naruto',english:'Naruto'},episodes:220,score:8.1,genres:['Экшен'],studios:[{name:'Pierrot'}],format:'ТВ',description:'Описание',startDate:{year:2002,month:10},coverImage:{large:'poster',extraLarge:'large'}};
const sparse={id:1,title:{russian:'Naruto',romaji:'Наруто'},genres:[],episodes:null,score:null,description:' ',startDate:{year:2002,month:null},coverImage:{large:''}};
const copy=structuredClone(rich);
const filled=mergeAnimeMetadata(sparse,rich);
assert.equal(filled.title.russian,'Наруто');assert.equal(filled.title.romaji,'Naruto');
assert.equal(filled.episodes,220);assert.equal(filled.score,8.1);assert.equal(filled.startDate.month,10);
assert.equal(filled.coverImage.large,'poster');assert.equal(filled.description,'Описание');
assert.equal(mergeAnimeMetadata({...sparse,episodesAired:0}, {...rich,episodesAired:220}).episodesAired,0,'known zero aired episodes is preserved');
assert.equal(mergeAnimeMetadata({...sparse,startDate:{year:2002,month:1}}, {...rich,startDate:{year:2002,month:10,day:29}}).startDate.day,undefined,'do not borrow day from another month');
assert.deepEqual(rich,copy,'merging must not mutate the cached donor');
assert.equal(mergeAnimeMetadata({...rich,episodes:221,score:8.2},rich).episodes,221,'fresh nonempty fields win');
assert.equal(mergeAnimeMetadata({...rich,score:8.2},rich).score,8.2);
assert.equal(mergeAnimeMetadata({...sparse,startDate:{year:2027}},rich).startDate.month,undefined,'never borrow month from a different year');
assert.strictEqual(mergeAnimeMetadata(sparse,{...rich,id:2}),sparse,'different AniList IDs cannot merge');
assert.strictEqual(mergeAnimeMetadata({...sparse,idMal:999},rich).episodes,null,'conflicting MAL mapping cannot merge');
assert.deepEqual(enrichAnimeCards([], [rich]),[],'empty authoritative page must remain empty');
assert.deepEqual(enrichAnimeCards([{...sparse,id:2}], [rich]).map(x=>x.id),[2],'old results cannot change new result membership');
const pages=mergeAnimePages([rich,{...rich,id:2}], [sparse,{...rich,id:3}]);
assert.deepEqual(pages.map(x=>x.id),[1,2,3]);assert.equal(pages[0].episodes,220,'duplicate sparse card must not erase known episodes');

const dir=mkdtempSync(join(tmpdir(),'animebox-card-metadata-'));
const fixture=globalThis.cardFixture={reads:0,fail:false,seen:[],rows:[{
 anime_id:1,mal_id:20,title:'Наруто',slug:'naruto-1',aliases:['Naruto'],description:'Описание',genres:['Экшен'],tags:[],poster_url:'poster',studios:['Pierrot'],format:'ТВ',start_year:2002,start_month:10,total_episodes:220,finished:true,provider_status:'released',provider_score:8.1,episodes_aired:220,provider_romaji:'Naruto'
}]};
const modules={
 'next/server':`export const after=()=>{};export class NextResponse{static json(value,init={}){return Response.json(value,init)}}`,
 '@/lib/supabase/admin':`export function createSupabaseAdmin(){return {from(name){if(name!=='anime_saved_playable_catalog')throw Error(name);return {select(){return this},in(_,ids){this.ids=ids;return this},abortSignal(signal){const f=globalThis.cardFixture;f.reads++;f.seen.push(this.ids);if(!(signal instanceof AbortSignal))throw Error('missing timeout');return Promise.resolve(f.fail?{data:null,error:{message:'timeout'}}:{data:f.rows.filter(r=>this.ids.includes(r.anime_id)),error:null})}}}}}`,
 '@/lib/anime-taxonomy':'export const findAnimeGenre=()=>null;export const findAnimeTag=()=>null;',
 '@/lib/smart-search':'export const normalizeSearchText=q=>q.trim().toLowerCase();',
 '@/lib/anime-url':"export const stableAnimeSlug=id=>'anime-'+id;",
 '@/lib/api-rate-limit':'export const enforceIpRateLimit=async()=>null;',
 '@/lib/catalog-availability-server':'export const filterAnimeIdsByAvailability=async()=>{if(globalThis.cardFixture.availabilityWait)await globalThis.cardFixture.availabilityWait;return [1,2]};',
 '@/lib/edge-cache-policy':'export const publicApiCacheHeaders=()=>({});export const privateNoStoreHeaders=()=>({});',
 '@/lib/request-observability-server':'export const observeApiRoute=(_,fn)=>fn;',
 '@/lib/search-index-server':`export const searchLocalAnimeIndex=async()=>[1,2,3].map(animeId=>({animeId,title:'Title '+animeId,genres:[],score:1}));export const localAnimeSearchHitToAnime=h=>({id:h.animeId,title:{russian:h.title},genres:[],catalogEligible:true});`,
};
try{
 const plugins=[{name:'metadata-fixture',setup(b){
  b.onResolve({filter:/^(server-only|@\/|next\/server)/},a=>{
   if(['@/lib/saved-catalog-server','@/lib/public-result-cache','@/lib/anime-metadata-merge'].includes(a.path))return {path:resolve(a.path.replace('@/','')+'.ts')};
   return {path:a.path,namespace:'fixture'};
  });
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='server-only'?'':modules[a.path]??(()=>{throw Error('unexpected import '+a.path)})()}));
 }}];
 await build({entryPoints:[resolve('lib/saved-catalog-server.ts')],outfile:join(dir,'saved.mjs'),bundle:true,platform:'node',format:'esm',plugins});
 const {getSavedAnimeMetadata}=await import(join(dir,'saved.mjs'));
 const [a,b]=await Promise.all([getSavedAnimeMetadata([1,2,1,-1,NaN]),getSavedAnimeMetadata([2,1])]);
 assert.equal(fixture.reads,1,'same ID pool must coalesce into one DB read');assert.deepEqual(fixture.seen[0],[1,2]);
 assert.equal(a[0].episodes,220);assert.equal(b[0].score,8.1);
 fixture.fail=true;
 assert.deepEqual(await getSavedAnimeMetadata([3]),[],'optional metadata failure must leave the caller usable');
 fixture.fail=false;fixture.rows.push({...fixture.rows[0],anime_id:3});
 assert.equal((await getSavedAnimeMetadata([3])).length,1,'failure must not be cached');
 assert.deepEqual(await getSavedAnimeMetadata([]),[]);
 assert.deepEqual(await getSavedAnimeMetadata([4]),[]);
 fixture.rows.push({...fixture.rows[0],anime_id:4});
 assert.equal((await getSavedAnimeMetadata([4])).length,1,'empty result must not hide later metadata recovery');
 const before=fixture.reads;
 await getSavedAnimeMetadata(Array.from({length:80},(_,i)=>i+1));
 assert.equal(fixture.reads,before+1);assert.equal(fixture.seen.at(-1).length,50,'batch is bounded');
 await build({entryPoints:[resolve('app/api/search/instant/route.ts')],outfile:join(dir,'instant.mjs'),bundle:true,platform:'node',format:'esm',plugins});
 const {GET}=await import(join(dir,'instant.mjs'));
 const request={nextUrl:new URL('https://fixture/api/search/instant?q=naruto&limit=4')};
 let releaseAvailability;
 fixture.availabilityWait=new Promise(resolve=>{releaseAvailability=resolve;});
 const readsBeforeRoute=fixture.reads;
 const pendingResponse=GET(request);
 await new Promise(resolve=>setTimeout(resolve,10));
 const metadataStarted=fixture.reads>readsBeforeRoute;
 releaseAvailability();delete fixture.availabilityWait;
 const response=await pendingResponse;const body=await response.json();
 assert.equal(metadataStarted,true,'metadata read must start while availability is still pending');
 assert.equal(response.status,200);assert.deepEqual(body.items.map(x=>x.id),[1,2],'availability filtering and lexical order must remain authoritative');
 assert.equal(body.items[0].episodes,220);assert.equal(body.items[0].title.romaji,'Naruto');
 assert.equal(body.items[1].episodes,undefined,'missing saved data retains its shell');
 assert.ok(response.headers.get('server-timing').includes('animebox_metadata'));
 fixture.fail=true;
 const failedRequest={nextUrl:new URL('https://fixture/api/search/instant?q=naruto&limit=4')};
 // A fresh bundle isolates the previous successful process cache.
 await build({entryPoints:[resolve('app/api/search/instant/route.ts')],outfile:join(dir,'failed.mjs'),bundle:true,platform:'node',format:'esm',plugins});
 const failed=await (await import(join(dir,'failed.mjs'))).GET(failedRequest);
 assert.deepEqual((await failed.json()).items.map(x=>x.id),[1,2],'metadata outage must not blank fast search');

 fixture.fail=false;
 fixture.provider=[{id:1,idMal:20,title:{romaji:'Naruto'},genres:[],episodes:222,score:9.2,description:null,startDate:{year:2025}}, {id:2,title:{romaji:'Other'},genres:[]}];
 modules['@/lib/combined-anime']=`export const getAnimesWithShikimori=async(_,opts)=>{opts.onPageInfo({hasNextPage:true});return globalThis.cardFixture.provider};`;
 modules['@/lib/catalog-moods']=`export const isCatalogMood=()=>false;export const rankAnimeByCatalogMood=items=>items;`;
 modules['@/lib/search-intent']=`export const parseAnimeSearchIntent=()=>null;export const rankAnimeForSearchIntent=items=>items;`;
 modules['@/lib/search-query']=`export const classifySearchQuery=()=>null;`;
 modules['@/lib/smart-search']=`export const normalizeSearchText=q=>q.trim().toLowerCase();export const buildSmartSearchFallbacks=()=>[];export const mergeAnimeCandidates=(a,b)=>[...new Map([...a,...b].map(x=>[x.id,x])).values()];export const rankAnimeForSmartSearchDetailed=items=>items.map(anime=>({anime,score:1,matchKind:'exact'}));`;
 modules['@/lib/catalog-availability-server']=`export const filterAnimeByAvailability=async items=>({items:items.filter(x=>x.id<=2),refreshTargets:[]});export const refreshCatalogAvailabilityBatch=async()=>{};`;
 modules['@/lib/search-index-server']+=`export const hydrateLocalAnimeHits=async()=>{throw Error('provider unavailable')};export const indexAnimeSearchDocuments=async()=>{};`;
 await build({entryPoints:[resolve('app/api/anime/route.ts')],outfile:join(dir,'catalog.mjs'),bundle:true,platform:'node',format:'esm',plugins});
 const catalog=await import(join(dir,'catalog.mjs'));
 const catalogBody=await (await catalog.GET({nextUrl:new URL('https://fixture/api/anime?limit=4')})).json();
 assert.deepEqual(catalogBody.anime.map(x=>x.id),[1,2]);
 assert.equal(catalogBody.anime[0].score,9.2,'saved metadata cannot replace a fresh provider rating');
 assert.equal(catalogBody.anime[0].episodes,222);
 assert.equal(catalogBody.anime[0].description,'Описание','real catalog route fills missing saved description');
 assert.equal(catalogBody.anime[0].startDate.year,2025);
 assert.equal(catalogBody.pagination.hasNextPage,true);
 fixture.provider=[fixture.provider[0]];
 const searchBody=await (await catalog.GET({nextUrl:new URL('https://fixture/api/anime?search=naruto&limit=4')})).json();
 assert.deepEqual(searchBody.anime.map(x=>x.id).sort(),[1,2],'failed external hydration must preserve eligible local hits');
}finally{rmSync(dir,{recursive:true,force:true});delete globalThis.cardFixture;}
console.log('PASS: saved batch reads, cache recovery, real instant route and metadata-preserving page merges.');
