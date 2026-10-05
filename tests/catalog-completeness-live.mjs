// Opt-in smoke against configured Supabase; AniList outage is injected.
// The schedule handler may refresh its provider snapshot if the cache read fails.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
for(const path of ['.env.local','.env'])if(existsSync(path))process.loadEnvFile(path);
const root=process.cwd(),dir=mkdtempSync(join(tmpdir(),'animebox-completeness-'));
const fixtures=new Map([
 ['server-only',''],['next/server','export const NextResponse=Response;export const after=()=>{};'],
 ['next/cache','export const unstable_cache=fn=>fn;'],
 ['@/lib/anime-registry','export const registerAnime=x=>x;'],
 ['@/lib/combined-anime','export async function getAnimesWithShikimori(){throw new Error("Injected AniList 403");}'],
 ['@/lib/fetch-retry','export async function fetchWithRetry(){return new Response("blocked",{status:403});}'],
 ['@/lib/jikan-schedule-server','export async function getJikanSchedule(){throw new Error("Unexpected Jikan fallback");}'],
 ['@/lib/catalog-filter','export const isCatalogAnime=()=>true;'],
 ['@/lib/request-observability-server','export const observeApiRoute=(name,handler)=>handler;'],
 ['@/lib/api-rate-limit','export const enforceIpRateLimit=async()=>null;'],
 ['@/lib/runtime-controls-server','export const runtimeFeatureDecision=async()=>({allowed:true,snapshot:{features:{background_jobs:false},mode:"normal"}});'],
 ['@/lib/catalog-availability-server','export async function filterAnimeByAvailability(){throw new Error("Saved cards must not refresh upstream");}export const refreshCatalogAvailabilityBatch=()=>{};'],
 ['@/lib/search-index-server','export const searchLocalAnimeIndex=async()=>[];export const hydrateLocalAnimeHits=async()=>[];export const indexAnimeSearchDocuments=async()=>{};'],
]);
const originalWarn=console.warn,originalError=console.error;
try{
 await build({entryPoints:{schedule:resolve(root,'app/api/schedule/route.ts'),catalog:resolve(root,'app/api/anime/route.ts'),recommendations:resolve(root,'app/api/recommendations/route.ts')},outdir:dir,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'fixtures',setup(b){
  b.onResolve({filter:/.*/},a=>fixtures.has(a.path)?{path:a.path,namespace:'fixture'}:a.path.startsWith('@/')?{path:resolve(root,a.path.slice(2)+(a.path.endsWith('.mjs')?'':'.ts'))}:null);
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:fixtures.get(a.path),loader:'js'}));
 }}]});
 // External imports must resolve project dependencies from temporary bundles.
 const {symlinkSync}=await import('node:fs');symlinkSync(resolve(root,'node_modules'),join(dir,'node_modules'),'dir');
 console.warn=()=>{};console.error=()=>{};
 const call=async(name,query)=>{
  const {GET}=await import(pathToFileURL(join(dir,name+'.mjs')));
  const response=await GET({nextUrl:new URL('https://example.com/api/'+name+'?'+query)});
  assert.equal(response.status,200,`${name} should succeed with AniList down`);return response.json();
 };
 const from=Date.parse('2026-10-05T00:00:00+05:00')/1000,to=Date.parse('2026-10-12T00:00:00+05:00')/1000;
 const schedule=await call('schedule',`from=${from}&to=${to}`);
 assert.equal(schedule.source,'shikimori');assert.ok(schedule.items.length>23);
 assert.ok(schedule.items.some(item=>item.media.id==null));
 assert.ok(schedule.items.some(item=>!item.media.coverImage));
 const catalog=await call('catalog','limit=30&order=ranked');
 assert.equal(catalog.catalogMeta.source,'saved');assert.equal(catalog.anime.length,30);
 assert.ok(catalog.anime.every(item=>item.startDate?.year && item.score>0));
 const seasonal=await call('catalog','season=FALL&year=2026&limit=30');assert.ok(seasonal.anime.length>1);
 const first=await call('recommendations','limit=20&page=1&bucket=1');
 const next=await call('recommendations','limit=20&page=8&bucket=1');
 assert.equal(first.candidateSource,'ranked');assert.equal(next.candidateSource,'ranked');
 assert.equal(first.items.length,20);assert.equal(next.items.length,20);
 assert.ok(next.items.every(item=>!first.items.some(before=>before.id===item.id)));
 console.log(JSON.stringify({schedule:schedule.items.length,unmapped:schedule.items.filter(item=>item.media.id==null).length,catalog:catalog.anime.length,seasonal:seasonal.anime.length,recommendations:[first.items.length,next.items.length]}));
 console.log('PASS: actual cached DB -> real schedule/catalog/recommendation handlers with injected AniList outage, complete calendar, metadata and nonoverlapping pages.');
}finally{console.warn=originalWarn;console.error=originalError;rmSync(dir,{recursive:true,force:true});}
