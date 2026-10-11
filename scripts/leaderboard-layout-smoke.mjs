/** Actual built leaderboard, read-only deterministic responses including me/rewards. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || (process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright-core') : 'playwright'));
const html=await fs.readFile('.next/server/app/leaderboard.html','utf8');
const raster=await fs.readFile('public/brand/brand-mark.webp');
const entry=(rank,current)=>({rank,userId:`fixture-${rank}`,username:rank===2?'ОченьДлинныйНикБезПробеловДляПроверкиПереполнения':rank===3?'ゆかめわ':'Зритель '+rank,avatarUrl:'/brand/brand-mark.webp',avatarTransform:null,premium:rank===1,activeMs:[0,13320000,5700000,2160000,1200000][rank]||1140000,completedEpisodes:rank===1?7:rank===2?2:1,lastWatchedAt:null,isCurrentUser:rank===current,sponsor:null,role:'user',seasonFrameKey:null,progression:{level:rank===current?50:3,rank:'Исследователь',rankKey:'viewer',progressPct:20,totalXp:100}});
const season={id:'fixture-season',endsAt:new Date(Date.now()+86400000).toISOString(),rewards:[
 {minPlace:1,maxPlace:1,title:'Чемпион недели',shortLabel:'7 дней Premium + Рамка чемпиона на 7 дней'},
 {minPlace:2,maxPlace:2,title:'Серебряный призёр недели',shortLabel:'3 дня Premium + элитная рамка на 7 дней'},
 {minPlace:3,maxPlace:3,title:'Бронзовый призёр недели',shortLabel:'1 день Premium + Рамка призёра на 7 дней'},
 {minPlace:4,maxPlace:10,title:'Топ-10 недели',shortLabel:'Рамка Топ-10 на 7 дней'},
]};
const cases=[{count:5,current:4,season,tag:'five'},{count:3,current:1,season,tag:'podium'},{count:2,current:null,season:null,tag:'guest'},{count:25,current:4,season:null,tag:'long'}];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--single-process','--no-zygote','--disable-gpu']});
let checks=0;
try{
 const page=await browser.newPage();
 let fixture=cases[0];
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.hostname!=='animebox.test')return route.abort();
  if(u.pathname==='/leaderboard')return route.fulfill({contentType:'text/html',body:html});
  if(u.pathname==='/api/community/leaderboard')return route.fulfill({json:{period:u.searchParams.get('period'),entries:Array.from({length:fixture.count},(_,i)=>entry(i+1,fixture.current)),me:fixture.current?entry(fixture.current,fixture.current):null,season:fixture.season}});
  if(u.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{}});
  const base=u.pathname.startsWith('/_next/static/')?'.next/static':'public';
  const relative=u.pathname.startsWith('/_next/static/')?u.pathname.slice(14):u.pathname.slice(1);
  const file=path.resolve(base,relative);
  if(!file.startsWith(path.resolve(base)+path.sep))return route.abort();
  try{return route.fulfill({body:await fs.readFile(file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.webp')?'image/webp':'application/octet-stream'});}catch{return route.abort();}
 });
 for(const c of cases)for(const width of [390,768,1280,1440,1920])for(const theme of ['dark','light']){
  fixture=c;
  await page.setViewportSize({width,height:1080});
  await page.goto('http://animebox.test/leaderboard',{waitUntil:'load'});
  await page.locator('[aria-label="Топ-3"] article').first().waitFor();
  await page.evaluate(t=>document.documentElement.setAttribute('data-animebox-theme',t),theme);
  const result=await page.evaluate(()=>{
   const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
   const main=document.querySelector('main[class*=Leaderboard-module]');
   const personal=document.querySelector('[aria-label="Твоё место в рейтинге"]');
   const action=personal.querySelector('a');
   const podium=[...document.querySelectorAll('[aria-label="Топ-3"] article')].map(e=>({rank:Number(e.dataset.rank),...rect(e),button:rect(e.querySelector('a'))}));
   const awards=[...document.querySelectorAll('[class*=__rewardTier] article strong,article[class*=__rewardTier] strong')].map(e=>({overflow:getComputedStyle(e).textOverflow,whiteSpace:getComputedStyle(e).whiteSpace,scroll:e.scrollWidth,width:e.clientWidth}));
   const hero=main.querySelector('[class*=__hero]'),season=main.querySelector('[class*=__seasonPanel]'),results=main.querySelector('[class*=__results]');
   const localScroll=[...main.querySelectorAll('section')].some(e=>['auto','scroll'].includes(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight+1);
   return {overflow:document.documentElement.scrollWidth>innerWidth+1,main:rect(main),personal:rect(personal),action:rect(action),podium,awards,hero:rect(hero),season:season?rect(season):null,results:rect(results),localScroll};
  });
  assert.ok(!result.overflow,`${c.tag}/${width}/${theme}: document overflow`);
  assert.ok(!result.localScroll,'no independently scrolling sections');
  assert.ok(result.personal.right-result.action.right>=12,'profile action retains right padding');
  assert.ok(result.action.left>=result.personal.left+12,'profile action inside personal panel');
  if(width>760){
   const bottom=result.podium[0].bottom;
   assert.ok(result.podium.every(p=>Math.abs(p.bottom-bottom)<1),'podium bottom baseline');
   assert.ok(result.podium.every(p=>p.height===(p.rank===1?344:316)),'stable card proportions');
   assert.ok(result.podium.every(p=>Math.abs(p.button.bottom-result.podium[0].button.bottom)<1),'profile buttons share baseline');
  }
  assert.ok(result.awards.every(a=>a.overflow!=='ellipsis'&&a.whiteSpace==='normal'&&a.scroll<=a.width+1),'reward titles wrap without early truncation');
  if(result.season)assert.ok(Math.abs(result.season.top-result.hero.bottom-16)<1,'continuous hero/rewards gap');
  const previous=result.season||result.hero;
  assert.ok(Math.abs(result.results.top-previous.bottom-16)<1,'continuous results gap');
  if(width===1920&&c.tag==='five'){
   console.log({width,theme,mainHeight:result.main.height,heroHeight:result.hero.height,seasonHeight:result.season?.height,resultsHeight:result.results.height});
   await page.screenshot({path:`/tmp/animebox-leaderboard-debug-${theme}.png`,fullPage:true});
   assert.ok(result.main.height<1100,'short ranking stays compact');
   await page.screenshot({path:`/tmp/animebox-leaderboard-${theme}.png`,fullPage:true});
   await page.evaluate(()=>window.scrollTo(0,document.querySelector('[aria-label="Топ-3"]').getBoundingClientRect().top+scrollY-100));
   await page.screenshot({path:`/tmp/animebox-leaderboard-scrolled-${theme}.png`});
  }
  checks++;
 }
 console.log(`Leaderboard: ${checks} real route cases passed for me #4/top-3/guest, 2/3/5/25 entries, both themes and 390/768/1280/1440/1920px.`);
}finally{await browser.close();}
