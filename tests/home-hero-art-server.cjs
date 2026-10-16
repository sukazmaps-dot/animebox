const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(path,imports={}){const module={exports:{}};const js=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('module','exports','require',js)(module,module.exports,name=>{if(name in imports)return imports[name];throw Error('Unexpected '+name)});return module.exports;}
const cache=load('lib/public-result-cache.ts');
let calls=0,seen=[];
const {enrichHomeHeroArt:enrich}=load('lib/home-hero-art-server.ts',{'server-only':{},'@/lib/public-result-cache':cache,'@/lib/anilist':{getAnimesByIds:async(ids,{signal})=>{calls++;seen=ids;assert(signal instanceof AbortSignal);if(ids.includes(50))throw Error('provider down');return [{id:1,idMal:10,bannerImage:'https://example.org/banner.jpg',coverImage:{extraLarge:'https://example.org/xl.jpg'}},{id:2,idMal:999,bannerImage:'wrong-match'},{id:999,bannerImage:'unrequested'}]}}});
(async()=>{
 const input=[{id:1,idMal:10,title:{russian:'Сохранённое'},score:7.1,episodes:12,slug:'keep',mobileHeroImage:'curated',mobileHeroPosition:{x:20,y:10},coverImage:{extraLarge:'small',large:'small'}},{id:2,idMal:20},{id:1,idMal:10},{id:3,bannerImage:'existing'}];
 const [a,b]=await Promise.all([enrich(input),enrich(input)]);
 assert.equal(calls,1,'concurrent batch coalesced');assert.deepEqual(seen,[1,2]);assert.deepEqual(a,b);
 assert.equal(a[0].bannerImage,'https://example.org/banner.jpg');assert.equal(a[0].coverImage.extraLarge,'https://example.org/xl.jpg');assert.equal(a[0].coverImage.large,'small');
 for(const key of ['title','score','episodes','slug','mobileHeroImage','mobileHeroPosition'])assert.deepEqual(a[0][key],input[0][key]);
 assert.equal(a[1],input[1],'MAL conflict rejected');assert.equal(a[3],input[3],'existing banner untouched');assert.deepEqual(a.map(x=>x.id),input.map(x=>x.id));
 await enrich(input);assert.equal(calls,1,'warm cache avoids provider');
 const failure=[{id:50}];assert.equal(await enrich(failure),failure,'provider failure preserves feed');
 await enrich(Array.from({length:40},(_,i)=>({id:i+100})));assert.equal(seen.length,24,'batch bounded');
 console.log('PASS hero art batch/cache/coalescing, fail-open, ID/MAL ownership, curated art and metadata preservation.');
})().catch(e=>{console.error(e);process.exit(1)});
