/** Real built Calendar/AnimeImage; deterministic upstream and browser clock. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || (process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright-core') : 'playwright'));
const html = await fs.readFile('.next/server/app/schedule.html', 'utf8');
const raster = await fs.readFile('public/brand/brand-mark.webp');
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_EXECUTABLE_PATH, args:['--no-sandbox','--single-process','--no-zygote','--disable-gpu']});
try {
 const page = await browser.newPage();
 await page.clock.install();
 for (const width of [390,1440,1920]) for (const theme of ['dark','light']) {
  await page.setViewportSize({width,height:1080});
  await page.unrouteAll({behavior:'wait'});
  const now = Math.floor(Date.now()/1000);
  const items = Array.from({length:4},(_,i)=>({id:i+1,airingAt:now,episode:2,timingKind:'planned',media:{id:100+i,title:{russian:`Длинное название аниме с постером ${i}`},coverImage:{large:`https://s4.anilist.co/recovery-${i}.jpg`}}}));
  let healthy = false, mediaRequests = 0;
  await page.route('**/*', async route => {
   const u=new URL(route.request().url());
   if(u.hostname==='media.youranimebox.com') {mediaRequests++; return healthy ? route.fulfill({contentType:'image/webp',body:raster}) : route.fulfill({status:503,body:''});}
   if(u.hostname!=='animebox.test')return route.abort();
   if(u.pathname==='/schedule')return route.fulfill({contentType:'text/html',body:html});
   if(u.pathname==='/api/schedule')return route.fulfill({json:{generatedAt:now,count:items.length,items}});
   if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{}});
   const base=u.pathname.startsWith('/_next/static/')?'.next/static':'public';
   const relative=u.pathname.startsWith('/_next/static/')?u.pathname.slice(14):u.pathname.slice(1);
   const file=path.resolve(base,relative);
   if(!file.startsWith(path.resolve(base)+path.sep))return route.abort();
   try{return route.fulfill({body:await fs.readFile(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.webp')?'image/webp':'application/octet-stream'});}catch{return route.abort();}
  });
  await page.goto('http://animebox.test/schedule',{waitUntil:'load'});
  await page.evaluate(t=>document.documentElement.setAttribute('data-animebox-theme',t),theme);
  const posters=page.locator('.weekly-calendar__poster[data-image-state]');
  await page.waitForFunction(()=>{const all=[...document.querySelectorAll('.weekly-calendar__poster[data-image-state]')];return all.length===4&&all.every(p=>p.dataset.imageState==='fallback')});
  const fallbackBounds=await posters.evaluateAll(all=>all.map(p=>{const r=p.getBoundingClientRect();return [r.width,r.height]}));
  for(const bounds of fallbackBounds)assert.deepEqual(bounds,[28,42],'fallback keeps same shell');
  const initialRequests=mediaRequests;
  assert.ok(initialRequests>=4 && initialRequests<=8,'bounded initial requests including browser transient retries');
  await page.clock.fastForward(58_000);
  assert.equal(mediaRequests,initialRequests,'retry must wait for media cooldown');
  healthy=true;
  // First independent proxy retry also fails in this fixture. The second
  // full pass waits for the Worker cooldown before recovering.
  await page.clock.fastForward(80_000);
  await page.waitForFunction(()=>[...document.querySelectorAll('.weekly-calendar__poster[data-image-state]')].every(p=>p.dataset.imageState==='loaded'));
  const recoveredRequests=mediaRequests;
  assert.ok(recoveredRequests>initialRequests && recoveredRequests<=initialRequests+8,'bounded recovery requests');
  const geometry=await posters.evaluateAll(all=>all.map(p=>{const a=p.getBoundingClientRect(),img=p.querySelector('img'),b=img.getBoundingClientRect();return {w:a.width,h:a.height,iw:b.width,ih:b.height,sizes:img.sizes,preset:p.dataset.imagePreset,src:img.currentSrc}}));
  for(const p of geometry){assert.equal(p.w,28);assert.equal(p.h,42);assert.equal(p.iw,p.w);assert.equal(p.ih,p.h);assert.equal(p.sizes,'28px');assert.equal(p.preset,'tiny');assert.ok(p.src.includes('w=96'),'small responsive variant');}
  await page.clock.fastForward(120_000);
  assert.equal(mediaRequests,recoveredRequests,'loaded posters do not restart');
  if(width===1920)await page.screenshot({path:`/tmp/animebox-poster-${theme}.png`,fullPage:true});
 }
 console.log('Schedule poster recovery: six theme/viewport combinations passed; actual Calendar/AnimeImage geometry and recovery after cooldown.');
} finally { await browser.close(); }
