/** Local synthetic drill only. No external fetches, credentials or user data.
 * Run with --expose-gc in a fresh process for every variant and concurrency. */
const {execFileSync} = require('node:child_process');
const {setTimeout: delay} = require('node:timers/promises');
const {imageRoute, req, load} = require('../tests/railway-cost.cjs');
const variant = process.argv[2] || 'after', count = Number(process.argv[3] || 1);
if (!['before','after'].includes(variant) || ![1,5,10,20].includes(count)) throw Error('Use before|after 1|5|10|20');
const bytes = 10 * 1024 * 1024;
let active = 0, peakActive = 0, completed = 0;
const origin = async () => {
  active++; peakActive = Math.max(peakActive, active);
  let sent = 0;
  return new Response(new ReadableStream({
    async pull(controller) {
      await delay(1);
      if (sent === bytes) {active--; controller.close(); return;}
      const chunk = new Uint8Array(Math.min(64*1024, bytes-sent));
      chunk.fill(91); sent += chunk.length; controller.enqueue(chunk);
    },
  }), {headers:{'content-type':'image/jpeg','content-length':String(bytes)}});
};
const source = variant === 'before' ? execFileSync('git',['show','0995770:app/api/image/route.ts'],{encoding:'utf8'}) : undefined;
// Historical route uses its historical cache, not the new accounting helper.
const historicalCache = variant === 'before' ? load('lib/public-result-cache.ts', {}, execFileSync('git',['show','0995770:lib/public-result-cache.ts'],{encoding:'utf8'})) : null;
let route;
if (variant === 'before') route = load('app/api/image/route.ts', {
  'next/server':{NextResponse:Response}, '@/lib/public-result-cache':historicalCache,
  '@/lib/public-api-rate-limit':{enforcePublicIpRateLimit:()=>null},
},source);
else route = imageRoute(origin);
global.fetch = origin;
global.gc?.();
const baseline = process.memoryUsage();
let peak = {...baseline};
function sample() {const m=process.memoryUsage(); for(const key of Object.keys(m)) peak[key]=Math.max(peak[key],m[key]);}
const sampling = setInterval(sample,2);
const start = performance.now();
(async () => {
  await Promise.all(Array.from({length:count},(_,i) => route.GET(req('synthetic-'+i)).then(async response => {
    if(response.status!==200) throw Error('Unexpected status '+response.status);
    const reader=response.body.getReader();
    while(!(await reader.read()).done) sample();
    reader.releaseLock(); completed++;
  })));
  sample(); clearInterval(sampling);
  const elapsedMs=performance.now()-start;
  global.gc?.(); await delay(25); global.gc?.();
  console.log(JSON.stringify({variant,count,imageBytes:bytes,completed,peakActive,elapsedMs,baseline,peak,afterGc:process.memoryUsage(),node:process.version}));
})().catch(e=>{clearInterval(sampling); console.error(e); process.exitCode=1;});
