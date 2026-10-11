/** Built route CSS/JS with deterministic read-only data. Tracker is a CSS fixture;
 * authenticated status mutations are outside this layout check. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright-core'));
const root = process.cwd(), out = process.env.VISUAL_OUTPUT_DIR || '/tmp/animebox-page-consistency';
await fs.mkdir(out, { recursive:true });
const raster = await fs.readFile('public/brand/brand-mark.webp');
const now = Math.floor(Date.now()/1000);
const items = Array.from({length:56},(_,i)=>({id:i+1,airingAt:now+(i%7)*86400,episode:2,timingKind:'planned',media:{id:100+i,title:{russian:`Длинное название тестового аниме ${i}`},coverImage:{large:'https://s4.anilist.co/fixture.jpg'}}}));
const entries = Array.from({length:6},(_,i)=>({rank:i+1,userId:`fixture-${i}`,username:`Зритель ${i+1}`,avatarUrl:'/brand/brand-mark.webp',avatarTransform:null,premium:false,activeMs:3600000,completedEpisodes:4,lastWatchedAt:null,isCurrentUser:false,sponsor:null,role:'user',seasonFrameKey:null,progression:{level:3,rank:'Зритель',rankKey:'viewer',progressPct:20,totalXp:100}}));
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_EXECUTABLE_PATH, args:['--no-sandbox','--single-process','--no-zygote','--disable-gpu']});
const results=[];
try {
 const page=await browser.newPage();
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.hostname!=='animebox.test')return route.fulfill({contentType:'image/webp',body:raster});
  if(['/','/schedule','/leaderboard','/watch-together','/list'].includes(u.pathname))return route.fulfill({contentType:'text/html',body:await fs.readFile(`.next/server/app/${u.pathname==='/'?'index':u.pathname.slice(1)}.html`)});
  if(u.pathname==='/api/schedule')return route.fulfill({json:{generatedAt:now,count:items.length,items}});
  if(u.pathname==='/api/community/leaderboard')return route.fulfill({json:{period:'week',entries,me:null,season:null}});
  if(u.pathname==='/api/watch-party/rooms')return route.fulfill({json:{rooms:[]}});
  if(u.pathname==='/api/image')return route.fulfill({contentType:'image/webp',body:raster});
  if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{}});
  const base=u.pathname.startsWith('/_next/static/')?'.next/static':'public';
  const relative=u.pathname.startsWith('/_next/static/')?u.pathname.slice(14):u.pathname.slice(1);
  const file=path.resolve(base,relative);
  if(!file.startsWith(path.resolve(base)+path.sep))return route.abort();
  try{return route.fulfill({body:await fs.readFile(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('.webp')?'image/webp':'application/octet-stream'});}catch{return route.abort();}
 });

 for(const width of [390,1440,1920]) for(const theme of ['dark','light']) {
  await page.setViewportSize({width,height:1080});
  await page.goto('http://animebox.test/schedule',{waitUntil:'load'});
  await page.evaluate(theme=>document.documentElement.setAttribute('data-animebox-theme',theme),theme);
  const links=page.locator('.weekly-calendar__event'); await links.first().waitFor();
  for(const index of [0,48,55]) {
   const link=links.nth(index); await link.scrollIntoViewIfNeeded(); await link.focus();
   const tip=page.getByRole('tooltip'); await tip.waitFor({state:'visible'});
   await page.waitForTimeout(50);
   const v=await tip.evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,body:el.parentElement===document.body,z:Number(getComputedStyle(el).zIndex),text:el.textContent}});
   assert.ok(v.body && v.z>=1000,'portal outside calendar stacking context');
   assert.ok(v.left>=11 && v.right<=width-11 && v.top>=11 && v.bottom<=1080-11,JSON.stringify(v));
   assert.ok(v.text.includes('Эпизод'),'full tooltip label');
   assert.equal(await link.getAttribute('aria-describedby'),await tip.getAttribute('id'));
   assert.equal(await link.getAttribute('title'),null,'no duplicate native title');
   await page.keyboard.press('Escape'); await tip.waitFor({state:'hidden'});
   await link.evaluate(el=>el.blur());
  }
  const link=links.first(); await link.scrollIntoViewIfNeeded(); await link.hover();
  const tip=page.getByRole('tooltip'); await tip.waitFor({state:'visible'}); await tip.hover();
  await page.waitForTimeout(200); assert.ok(await tip.isVisible(),'tooltip remains hoverable');
  await page.mouse.move(width-2,2); await tip.waitFor({state:'hidden'});
 }
 console.log('Schedule tooltip: portal, viewport edges, keyboard/Escape, full text and hover persistence passed in dark/light themes at 390/1440/1920.');
}finally{await browser.close();}
