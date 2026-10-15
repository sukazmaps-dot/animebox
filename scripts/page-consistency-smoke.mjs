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
// Render the actual flexible content/catalog component with deterministic media.
// Image delivery is covered by schedule-poster-cascade-smoke separately.
const React = require('react'), {renderToStaticMarkup} = require('react-dom/server'), ts = require('typescript');
const cssFiles = await fs.readdir('.next/static/chunks');
const cardCSS = (await Promise.all(cssFiles.filter(f=>f.endsWith('.css')).map(f=>fs.readFile(path.join('.next/static/chunks',f),'utf8')))).find(s=>s.includes('AnimeCardContent-module'));
assert.ok(cardCSS, 'built shared card CSS');
const prefix = cardCSS.match(/\.(AnimeCardContent-module__[\w]+__content)/)[1].replace(/content$/,'');
const styles = Object.fromEntries(['content','poster','inline','media','details'].map(k=>[k,prefix+k]));
const compile = async (file,imports) => {
 const mod={exports:{}};
 const code=ts.transpileModule(await fs.readFile(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports','module',code)(name=>name==='react/jsx-runtime'?require(name):imports[name],mod.exports,mod);
 return mod.exports;
};
const content = await compile('components/AnimeCardContent.tsx', {'./AnimeCardContent.module.css':{default:styles}});
const scoreDisplay = await compile('lib/anime-score.ts', {});
const episodeDisplay = await compile('lib/anime-content-intelligence.ts', {});
const catalog = await compile('components/AnimeCard.tsx', {
 '@/components/AnimeCardContent':content,
 'next/link':{default:({prefetch,...props})=>React.createElement('a',props)},
 '@/components/AnimeImage':{default:({alt,className})=>React.createElement('img',{src:'/brand/brand-mark.webp',alt,className})},
 '@/lib/anime-url':{animeHref:anime=>`/anime/${anime.id}`},
 '@/lib/anime-display':{getAnimeTitle:anime=>anime.title.russian,isAnimeOngoing:()=>false},
 '@/lib/anime-score':scoreDisplay,
 '@/lib/anime-content-intelligence':episodeDisplay,
});
const fixtureCard = renderToStaticMarkup(React.createElement(catalog.default,{anime:{id:101,title:{russian:'Длинное название аниме на две строки'},genres:[],score:9.1,format:'TV',episodes:12,startDate:{year:2026}}}));
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
 for(const route of ['/schedule','/leaderboard','/watch-together','/list','/']) {
  await page.goto(`http://animebox.test${route}`,{waitUntil:'load'});
  if(route==='/schedule')await page.locator('.weekly-calendar__event').first().waitFor();
  if(route==='/leaderboard')await page.locator('[aria-label="Топ-3"]').waitFor();
  if(route==='/watch-together')await page.getByText('Пока нет открытых комнат',{exact:true}).waitFor();
  // Tracker snapshot has no image URLs. This fixture tests authenticated card CSS,
  // not auth or status handlers. Route styles come from the real built /list page.
  if(route==='/') { await page.addStyleTag({content:cardCSS}); await page.evaluate(html=>{const section=document.createElement('section');section.className='search-page';section.innerHTML='<h2>Карточки — тест размеров</h2><div class="anime-grid">'+html.repeat(6)+'</div>';document.querySelector('.home-page').prepend(section);},fixtureCard); }
  if(route==='/list')await page.evaluate(()=>{const target=document.querySelector('.tracker-page');target.insertAdjacentHTML('beforeend',`<article class="tracker-card"><div class="tracker-card__title"><a>Длинное название аниме</a></div><span class="tracker-card__label">ЛИЧНАЯ БИБЛИОТЕКА</span><div class="tracker-card__progress"><span>Подтверждённый просмотр</span><strong>Серия 1</strong></div></article>`);});
  for(const theme of ['dark','light']) for(const width of [390,1440,1920]){
   await page.setViewportSize({width,height:1000});
   await page.evaluate(theme=>document.documentElement.setAttribute('data-animebox-theme',theme),theme);
   const value=await page.evaluate(route=>{
    const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);
    const lum=c=>c.map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((v,n,i)=>v+n*[.2126,.7152,.0722][i],0);
    const ratio=(a,b)=>{const x=lum(rgb(a)),y=lum(rgb(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
    const cs=getComputedStyle(document.documentElement), bg=cs.getPropertyValue('--ab-ui-raised'),muted=cs.getPropertyValue('--ab-ui-muted');
    const temp=document.createElement('span');temp.style.color=muted;temp.style.background=bg;document.body.append(temp);const t=getComputedStyle(temp);const contrast=ratio(t.color,t.backgroundColor);temp.remove();
    const actualSelectors = route==='/leaderboard' ? '[class*="__timeLabel"],[class*="__cardProfileAction"],[class*="__modeSwitch"] > span' : route==='/watch-together' ? '[class*="__features"] > span,[class*="__publicEmpty"] > a' : route==='/list' ? '.tracker-card__label,.tracker-card__progress span' : '.anime-card__meta';
    const actualContrasts=[...document.querySelectorAll(actualSelectors)].map(el=>{
      let parent=el, background;
      while(parent){const color=getComputedStyle(parent).backgroundColor;const parts=color.match(/[\d.]+/g);if(parts && (parts.length===3 || Number(parts[3])===1)){background=color;break;}parent=parent.parentElement;}
      return ratio(getComputedStyle(el).color,background||getComputedStyle(document.body).backgroundColor);
    });
    const podium=document.querySelector('[aria-label="Топ-3"]')?.getBoundingClientRect(), board=document.querySelector('[aria-label="Топ-100 AnimeBox"]')?.getBoundingClientRect();
    const leaderboardColumns=Boolean(podium && board && board.left>=podium.right);
    const event=document.querySelector('.weekly-calendar__event'), day=document.querySelector('.weekly-calendar__day');
    const card=document.querySelector('.anime-card__image-wrap');
    return {leaderboardColumns,actualContrasts,route,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,contrast,days:document.querySelectorAll('.weekly-calendar__column').length,events:document.querySelectorAll('.weekly-calendar__event').length,eventHeight:event?.getBoundingClientRect().height,dayHeight:day?.getBoundingClientRect().height,posterRatio:card?card.getBoundingClientRect().width/card.getBoundingClientRect().height:null,trackerColor:document.querySelector('.tracker-card__label')?getComputedStyle(document.querySelector('.tracker-card__label')).color:null};
   },route);
   assert.ok(!value.overflow,`${route}/${theme}/${width}: horizontal page overflow`);
   assert.ok(value.actualContrasts.every(n=>n>=4.5),`${route}/${theme} actual text contrast: ${value.actualContrasts}`);
   assert.ok(value.contrast>=4.5,`${theme} muted contrast ${value.contrast}`);
   if(route==='/leaderboard' && width>=1440)assert.ok(value.leaderboardColumns,'two-column ranking layout');
   if(route==='/schedule'){assert.equal(value.days,7);assert.equal(value.events,56);assert.ok(value.dayHeight<=46);assert.ok(value.eventHeight<=85,JSON.stringify(value));}
   if(route==='/')assert.ok(value.posterRatio,'catalog card rendered');
   if(value.posterRatio)assert.ok(Math.abs(value.posterRatio-2/3)<.01,'poster ratio');
   results.push({theme,...value});
   if(width===1440)await page.screenshot({path:path.join(out,`${route==='/'?'home':route.slice(1)}-${theme}.png`)});
  }
 }
 console.log(JSON.stringify({ok:true,checks:results.length,results},null,2));
}finally{await browser.close();}
