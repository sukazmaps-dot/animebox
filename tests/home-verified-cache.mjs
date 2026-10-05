import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'animebox-home-cache-'));
globalThis.homeCacheTest={reads:0,refreshes:0,healthy:true,saved:false};
try {
 await build({entryPoints:[resolve('lib/home-feed-server.ts')],outfile:join(dir,'home.mjs'),bundle:true,platform:'node',format:'esm',plugins:[{name:'mocks',setup(b){
  b.onResolve({filter:/^(server-only|next\/|@\/)/},a=>({path:a.path,namespace:'mock'}));
  b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:
   a.path==='server-only'?'':
   a.path==='next/cache'?`export const unstable_cache=fn=>{let cached;return async()=>{if(cached)return cached;cached=await fn();return cached}};`:
   a.path==='next/server'?`export const after=fn=>fn();`:
   a.path==='@/lib/combined-anime'?`export async function getAnimesWithShikimori(){return [{id:1,metadataSource:globalThis.homeCacheTest.saved?'saved':undefined}]}`:
   a.path==='@/lib/saved-catalog-server'?`export async function getSavedCatalogPage(){return {anime:[]}}`:
   a.path==='@/lib/catalog-availability-server'?`export async function filterAnimeByAvailability(items){globalThis.homeCacheTest.reads++;return {items,refreshTargets:items,registryHealthy:globalThis.homeCacheTest.healthy}};export async function refreshCatalogAvailabilityBatch(){globalThis.homeCacheTest.refreshes++}`:
   (()=>{throw new Error(a.path)})()}));
 }}]});
 const {getHomeInitialFeed}=await import(join(dir,'home.mjs'));
 globalThis.homeCacheTest.healthy=false;
 assert.deepEqual(await getHomeInitialFeed(),{popular:[],ongoing:[]});
 globalThis.homeCacheTest.healthy=true;
 assert.equal((await getHomeInitialFeed()).popular.length,1);
 assert.equal((await getHomeInitialFeed()).popular.length,1);
 assert.equal(globalThis.homeCacheTest.reads,2,'failed registry result is not cached; healthy hit does not re-read');
 assert.equal(globalThis.homeCacheTest.refreshes,1,'background probe only scheduled when filling cache');
 console.log('PASS: home cache includes verified cards; warm hits avoid registry queries/probes; registry outage does not poison cache');
}finally{rmSync(dir,{recursive:true,force:true});delete globalThis.homeCacheTest;}
