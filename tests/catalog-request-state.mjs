import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transform} from 'esbuild';
const {code} = await transform(readFileSync('lib/catalog-request-state.ts', 'utf8'), {loader:'ts', format:'esm'});
const {createCatalogPageGate, waitForCurrentPreview} = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const ready = {loading:false,hasNextPage:true,failed:false,query:'naruto',liveQuery:'naruto'};
const gate = createCatalogPageGate();
let page = 1, calls = [];
const advance = state => {if(gate.claim(state)){page++;calls.push(page);}};
advance(ready); advance(ready); advance(ready);
assert.deepEqual(calls,[2], 'observer and button before render must issue only page 2');
gate.block();
advance({...ready,loading:true});
assert.deepEqual(calls,[2]);
// A failed request must retain the requested page and stop automatic promotion.
gate.block(); advance({...ready,failed:true}); advance(ready);
assert.equal(page,2);
calls.push(page); // explicit retry uses current page, not advance
assert.deepEqual(calls,[2,2]);
gate.release(); advance(ready);
assert.deepEqual(calls,[2,2,3], 'successful retry permits the following page');
for (const blocked of [{loading:true},{hasNextPage:false},{failed:true},{liveQuery:'bleach'}]) {
  gate.release(); advance({...ready,...blocked});
  assert.equal(page,3);
}
let generation = 1;
let settle;
const oldPreview = new Promise(resolve => {settle=resolve;});
const oldCatch = waitForCurrentPreview(oldPreview,()=>generation===1);
generation=2; settle({items:[{id:1}]});
assert.deepEqual(await oldCatch,{current:false}, 'ownership must be checked after preview resolves');
let reject;
const failedPreview = new Promise((_,r)=>{reject=r;});
const oldFailure = waitForCurrentPreview(failedPreview,()=>generation===2);
generation=3; reject(new Error('offline'));
assert.deepEqual(await oldFailure,{current:false}, 'rejected stale preview cannot write error state');
assert.deepEqual(await waitForCurrentPreview(Promise.resolve({items:[1]}),()=>true), {current:true,preview:{items:[1]}});
assert.deepEqual(await waitForCurrentPreview(Promise.reject(new Error('offline')),()=>true), {current:true,preview:null});
console.log('Catalog request races, synchronous page locking and retry continuity passed.');

// Exercise the actual client cache, rather than copying its TTL implementation.
const clientCode = await transform(readFileSync('lib/anime-client.ts','utf8'), {loader:'ts',format:'esm'});
const client = await import('data:text/javascript;base64,' + Buffer.from(clientCode.code).toString('base64'));
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
let now = 0, fetches = 0;
try {
  Date.now = () => now;
  globalThis.fetch = async () => {
    fetches++;
    return Response.json({anime:[{id:1}],catalogMeta:{source:'saved',message:'Резервный каталог'}});
  };
  assert.equal((await client.getAnimesWithMeta({search:'saved-cache-fixture'})).catalogMeta.source,'saved');
  now = 14_999;
  await client.getAnimesWithMeta({search:'saved-cache-fixture'});
  assert.equal(fetches,1);
  now = 15_000;
  await client.getAnimesWithMeta({search:'saved-cache-fixture'});
  assert.equal(fetches,2,'saved catalog must be refreshed at 15 seconds');
  globalThis.fetch = async () => {fetches++; return Response.json({anime:[{id:2}]});};
  await client.getAnimesWithMeta({search:'normal-cache-fixture'});
  now += 15_001;
  await client.getAnimesWithMeta({search:'normal-cache-fixture'});
  assert.equal(fetches,3,'normal search keeps its existing longer TTL');
} finally {globalThis.fetch=originalFetch;Date.now=originalNow;}
console.log('Actual anime client preserves fallback metadata and refreshes saved catalog after 15 seconds.');
