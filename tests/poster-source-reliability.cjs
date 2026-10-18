/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness executes real TypeScript with a controlled database fixture. */
/* Behavioural tests: real source merging, batched reads, image encoding and Worker storage policy. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const sharp = require('sharp');
const cache = new Map();
let reads = 0, fail = false;
let upstream;
const ani = 'https://s4.anilist.co/cover/large/1.png';
const shiki = 'https://shikimori.io/system/animes/original/20.jpg';
const admin = { createSupabaseAdmin: () => ({ from(table) {
  assert.equal(table, 'anime_shikimori_metadata');
  let ids;
  return { select(value) { assert.equal(value, 'mal_id,poster_url'); return this; },
    in(field, values) { assert.equal(field, 'mal_id'); ids = values; assert.ok(ids.length <= 50); return this; },
    async abortSignal(signal) { assert.ok(signal); reads++;
      return fail ? {error:{message:'offline'}} : {data:ids.includes(20)?[{mal_id:20,poster_url:shiki}]:[],error:null}; },
  };
} }) };
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const mod = {exports:{}};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText;
  new Function('require','module','exports',code)(name => {
    if (name === 'server-only') return {};
    if (name === '@/lib/supabase/admin') return admin;
    if (name === 'next/server') return { NextResponse: Response };
    if (name === '@/lib/public-api-rate-limit') return { enforcePublicIpRateLimit: () => null };
    if (name === '@/lib/image-upstream-server') return { fetchImageUpstream: (...args) => upstream(...args) };
    return name.startsWith('@/') ? load(name.slice(2)+'.ts') : require(name);
  },mod,mod.exports);
  cache.set(file,mod.exports); return mod.exports;
}
(async () => {
  process.env.NODE_ENV = 'production';
  const merge = load('lib/anime-metadata-merge.ts');
  const primary = {id:1,idMal:20,title:{romaji:'One'},genres:[],coverImage:{large:ani,extraLarge:ani}};
  const donor = {...primary,coverImage:{large:shiki,extraLarge:shiki}};
  const copy = structuredClone(primary);
  const merged = merge.mergeAnimeMetadata(primary,donor);
  assert.equal(merged.coverImage.large,ani);
  assert.deepEqual(merged.coverImage.fallbackUrls,[shiki]);
  assert.deepEqual(primary,copy,'do not mutate cached cards');
  assert.strictEqual(merge.mergeAnimeMetadata(primary,{...donor,idMal:999}),primary);
  const service = load('lib/image-service.ts');
  const candidates = service.getImageCandidates({...merged.coverImage,medium:'https://s4.anilist.co/medium/1.jpg',preview:'https://cdn.myanimelist.net/1.jpg'},'compact',{preset:'card'});
  const proxy = '/api/image?'+new URLSearchParams({url:shiki,fallback:'error'});
  assert.ok(candidates.indexOf(proxy)>0 && candidates.indexOf(proxy)<candidates.indexOf(ani));
  assert.ok(!candidates.includes(shiki),'Shikimori must not leak into direct browser requests');
  assert.ok(candidates.includes('https://cdn.myanimelist.net/1.jpg'),'third/fourth sources must survive');
  assert.equal(candidates.length,new Set(candidates).size);
  assert.ok(service.getImageCandidates({large:ani,fallbackUrls:Array.from({length:100},(_,i)=>`https://cdn.myanimelist.net/${i}.jpg`)},'compact',{preset:'card'}).length<=8);

  const {enrichAnimePosterSources} = load('lib/anime-poster-metadata-server.ts');
  const [first,second] = await Promise.all([enrichAnimePosterSources([primary]),enrichAnimePosterSources([primary])]);
  assert.equal(reads,1,'matching grids share a bounded batch lookup');
  assert.deepEqual(first[0].coverImage.fallbackUrls,[shiki]);
  assert.equal(second[0].id,primary.id);
  const unknown = [{...primary,id:2,idMal:999}];
  fail=true; assert.strictEqual(await enrichAnimePosterSources(unknown),unknown);
  fail=false; await enrichAnimePosterSources(unknown); assert.equal(reads,3,'failed lookup is not cached');
  const noMapping=[{...primary,idMal:null}];
  assert.strictEqual(await enrichAnimePosterSources(noMapping),noMapping); assert.equal(reads,3);

  const {optimizeRelayImage} = load('lib/image-relay-optimize.ts');
  const png = await sharp({create:{width:600,height:900,channels:3,background:'#664499'}}).png({compressionLevel:0}).toBuffer();
  const original={bytes:png,contentType:'image/png'};
  const signal=new AbortController().signal;
  const [encoded,shared]=await Promise.all([optimizeRelayImage('poster',original,signal),optimizeRelayImage('poster',original,signal)]);
  assert.equal(encoded.contentType,'image/webp'); assert.ok(encoded.bytes.length<png.length);
  const info=await sharp(encoded.bytes).metadata(); assert.equal(info.width,600); assert.equal(info.height,900);
  await sharp(encoded.bytes).stats(); assert.strictEqual(encoded,shared,'encodes coalesce');
  const corrupt={bytes:Buffer.from('invalid'),contentType:'image/png'};
  assert.strictEqual(await optimizeRelayImage('corrupt',corrupt,signal),corrupt,'decode failure retains the original path');
  const aborted=new AbortController();aborted.abort();
  await assert.rejects(optimizeRelayImage('abort',original,aborted.signal));

  const {GET}=load('app/api/image/route.ts');
  upstream=async()=>new Response(png,{headers:{'Content-Type':'image/png'}});
  const url=new URL('https://youranimebox.com/api/image?'+new URLSearchParams({url:ani,optimize:'webp',fallback:'error'}));
  const served=await GET({nextUrl:url,signal});
  assert.equal(served.status,200);assert.equal(served.headers.get('content-type'),'image/webp');
  assert.match(served.headers.get('cache-control'),/public/);
  const servedBytes=Buffer.from(await served.arrayBuffer());
  assert.ok(servedBytes.length<png.length);await sharp(servedBytes).stats();

  const code=fs.readFileSync('infra/cloudflare/media-worker.js','utf8');
  const worker=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
  const saved={fetch:global.fetch,caches:global.caches};
  let writes=0;
  global.caches={default:{match:async()=>undefined,put:async()=>{}}};
  global.fetch=async()=>new Response(png,{headers:{'Content-Type':'image/png','cf-resized':'w=240'}});
  const bucket={get:async()=>null,put:async()=>{writes++;}};
  const waits=[];const ctx={waitUntil:p=>waits.push(p)};
  try {
    const health=await (await worker.default.fetch(new Request('https://media.youranimebox.com/health'),{MEDIA_BUCKET:bucket},ctx)).json();
    assert.equal(health.r2,true);assert.equal(health.r2WritesEnabled,false);
    const request=()=>new Request('https://media.youranimebox.com/image?'+new URLSearchParams({url:ani,w:'240',q:'70',f:'webp'}));
    assert.equal((await worker.default.fetch(request(),{MEDIA_BUCKET:bucket},ctx)).status,200);
    await Promise.all(waits.splice(0));assert.equal(writes,0,'attached bucket must never imply writes');
    assert.equal((await worker.default.fetch(request(),{MEDIA_BUCKET:bucket,MEDIA_R2_WRITES_ENABLED:'true'},ctx)).status,200);
    await Promise.all(waits.splice(0));assert.equal(writes,1,'only explicit opt-in may write');
  } finally {global.fetch=saved.fetch;global.caches=saved.caches;}
  console.log('Poster reliability: independent sources, bounded batch/outage, real WebP decode, coalescing and default no-storage passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
