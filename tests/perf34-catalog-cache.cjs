'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const js = ts.transpileModule(fs.readFileSync('lib/anime-client.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const target = {exports:{}};
new Function('module','exports','require',js)(target,target.exports,()=>{throw Error('Unexpected runtime import');});
const {getAnimesWithMeta} = target.exports;
const originalFetch = global.fetch;
const originalNow = Date.now;
let now = 1000;
let calls = 0;
let meta;
global.fetch = async () => {
  calls++;
  return {ok:true,json:async()=>({anime:[{id:calls}],...(meta ? {catalogMeta:meta}:{}),
    pagination:{page:1,limit:20,hasNextPage:true}})};
};
Date.now = () => now;
async function check(options, catalogMeta, ttl) {
  meta = catalogMeta;
  const before = calls;
  const first = await getAnimesWithMeta(options);
  now += ttl - 1;
  assert.strictEqual(await getAnimesWithMeta(options),first);
  assert.equal(calls,before+1,'response must survive until its expiry');
  now++;
  const second = await getAnimesWithMeta(options);
  assert.equal(calls,before+2,'expired response must refetch');
  assert.notStrictEqual(first,second);
  assert.equal(second.pagination.hasNextPage,true,'retain pagination metadata');
}
(async()=>{
  try {
    await check({catalogSource:'saved',page:1},{source:'saved',completeness:'full',message:''},300000);
    await check({catalogSource:'saved',search:'Naruto'},{source:'saved',completeness:'full',message:''},60000);
    await check({catalogSource:'saved',page:2},{source:'saved',completeness:'partial',message:''},15000);
    await check({catalogSource:'saved',page:3},{source:'degraded',completeness:'full',message:''},15000);
    await check({catalogSource:'saved',page:4},{source:'saved',message:''},15000);
    await check({page:5},undefined,300000);
    const before=calls;
    await getAnimesWithMeta({page:5},{refresh:true});
    assert.equal(calls,before+1,'explicit retry bypasses a warm memory cache');
    console.log('PASS complete catalog TTL, search TTL, partial/degraded expiry, pagination and refresh');
  } finally {global.fetch=originalFetch;Date.now=originalNow;}
})().catch(error=>{console.error(error);process.exitCode=1;});
