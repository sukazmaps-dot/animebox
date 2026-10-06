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
   a.path==='@/lib/combined-anime'?`export async function getAnimesWithShikimori(options){if(globalThis.homeCacheTest.partial&&options.status)throw new Error('ongoing provider unavailable');globalThis.homeCacheTest.upstream=(globalThis.homeCacheTest.upstream??0)+1;return [{id:1,metadataSource:globalThis.homeCacheTest.saved?'saved':undefined}]}`:
   a.path==='@/lib/saved-catalog-server'?`export async function getSavedCatalogPage(options){return {anime:globalThis.homeCacheTest.savedFirst||(globalThis.homeCacheTest.partial&&!options.status)?[{id:2,metadataSource:'saved'}]:[]}}`:
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
 globalThis.homeCacheTest={reads:0,refreshes:0,upstream:0,healthy:true,savedFirst:true};
 const savedFirst=await import(join(dir,'home.mjs')+'?saved-first');
 assert.equal((await savedFirst.getHomeInitialFeed()).popular[0].id,2);
 assert.equal(globalThis.homeCacheTest.upstream,0,'persisted first-screen cards do not wait for upstream');
 assert.equal(globalThis.homeCacheTest.reads,0,'saved playable view needs no second availability query');
 globalThis.homeCacheTest={reads:0,refreshes:0,healthy:true,partial:true};
 const partial=await import(join(dir,'home.mjs')+'?partial');
 assert.deepEqual(await partial.getHomeInitialFeed(),{popular:[{id:2,metadataSource:'saved'}],ongoing:[]},'failed ongoing source must not erase saved popular cards');
 globalThis.homeCacheTest.partial=false;
 assert.equal((await partial.getHomeInitialFeed()).ongoing.length,1,'recovery remains uncached and the next healthy fill retries');
 console.log('PASS: home cache includes verified cards; warm hits avoid registry queries/probes; registry outage does not poison cache');
}finally{rmSync(dir,{recursive:true,force:true});delete globalThis.homeCacheTest;}
