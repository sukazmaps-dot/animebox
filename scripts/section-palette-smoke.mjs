/** Built guest pages plus scoped fixtures for authenticated/dynamic chrome.
 * No real sessions, provider requests or account mutations are replayed. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright-core'));
const cssFiles=(await fs.readdir('.next/static/chunks')).filter(f=>f.endsWith('.css'));
const css=(await Promise.all(cssFiles.map(f=>fs.readFile(path.join('.next/static/chunks',f),'utf8')))).join('\n');
const fixture=(module)=>{
 const prefix=css.match(new RegExp(`\\.(${module}-module__[\\w]+__page)`))?.[1]?.replace(/page$/,'');
 assert.ok(prefix,`${module} built CSS`);
 return `<main class="${prefix}page"><section class="${prefix}hero"><h1>Настройки</h1><p data-muted>Описание настроек сайта</p></section><section class="${prefix}card"><p class="${prefix}cardCopy" data-muted>Подробности настройки</p><div class="${prefix}themeChoice"><strong>Тёмная</strong><small data-muted>Единая палитра</small></div></section></main>`;
};
const settings=fixture('SettingsClient');
const journey=fixture('AchievementJourneyClient');
const chatPrefix=css.match(/\.(GlobalChatV11Client-module__[\w]+__shell)/)?.[1]?.replace(/shell$/,'');
assert.ok(chatPrefix,'built chat CSS');
const chat=`<main class="${chatPrefix}shell"><section class="${chatPrefix}chatPanel"><header class="${chatPrefix}header"><h1>Чат</h1><p data-muted>Описание чата</p></header><div class="${chatPrefix}composer"><textarea placeholder="Сообщение"></textarea></div></section><aside class="${chatPrefix}sideCard"><p data-muted>Правила чата</p></aside></main>`;
const achievements=fixture('Achievements');
const anime='<main class="anime-detail-v4"><section class="anime-detail-v4__hero-shell"><h1 class="anime-detail-v4__title">Фрирен</h1><p class="anime-detail-v4__description" data-muted>Подробное описание аниме</p></section><section class="anime-detail-v3__facts-shell"><dl class="anime-detail-v3__facts-list"><dt data-muted>Студия</dt><dd>Bones</dd></dl></section></main><main class="episode-page"><nav class="episode-quick-nav"><button class="episode-quick-nav__current">Серия 1</button></nav><section class="community-panel"><p data-muted>Подтверждённый просмотр</p></section></main>';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--single-process','--no-zygote','--disable-gpu']});
const output='/tmp/animebox-section-palette';await fs.mkdir(output,{recursive:true});
let checks=0;
try{
 const page=await browser.newPage();
 let activeRoute;
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if (['/settings','/achievements'].includes(activeRoute) && route.request().resourceType()==='script') return route.abort();
  if(['/premium','/friends','/achievements','/settings'].includes(url.pathname))return route.fulfill({contentType:'text/html',body:await fs.readFile(`.next/server/app/${url.pathname.slice(1)}.html`)});
  if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{}});
  if(url.pathname.startsWith('/_next/static/')){
   const file=path.resolve('.next/static',url.pathname.slice(14));
   if(!file.startsWith(path.resolve('.next/static')+path.sep))return route.abort();
   try{return route.fulfill({body:await fs.readFile(file),contentType:file.endsWith('.css')?'text/css':'application/javascript'});}catch{return route.abort();}
  }
  return route.abort();
 });
 for(const route of ['/premium','/friends','/achievements','/settings']){
  activeRoute=route;
  await page.goto('http://animebox.test'+route,{waitUntil:'load'});
  await page.addStyleTag({content:css});
  if(route==='/achievements')await page.evaluate(markup=>{document.querySelector('.page-content').insertAdjacentHTML('beforeend',markup)},achievements);
  if(route==='/settings')await page.evaluate(markup=>{document.querySelector('.page-content').insertAdjacentHTML('beforeend',markup)},settings+anime+journey+chat);
  for(const theme of ['dark','light'])for(const width of [390,1440]){
   await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.setAttribute('data-animebox-theme',t),theme);
   await page.waitForTimeout(250); // Settle existing background transitions before contrast sampling.
   const result=await page.evaluate(route=>{
    const lum=s=>s.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4}).reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0);
    const selectors=route==='/settings'?'[data-muted]':route==='/premium'?'.premium-hero p,.premium-plan__billing,.premium-v2__pillar p':route==='/friends'?'main p':'[class*="Achievements-module"][class*="__hero"] p';
    const contrasts=[...document.querySelectorAll(selectors)].map(el=>{
     let p=el,bg;
     while(p){const color=getComputedStyle(p).backgroundColor;const parts=color.match(/[\d.]+/g);if(parts&&(parts.length===3||Number(parts[3])===1)){bg=color;break}p=p.parentElement;}
     const a=lum(getComputedStyle(el).color),b=lum(bg||getComputedStyle(document.body).backgroundColor);; return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });
    return {overflow:document.documentElement.scrollWidth>innerWidth+1,contrasts};
   },route);
   assert.ok(!result.overflow,`${route}/${theme}/${width} overflow`);
   assert.ok(result.contrasts.length>0,`${route}: no labels tested`);
   assert.ok(result.contrasts.every(n=>n>=4.5),`${route}/${theme}: ${result.contrasts}`);
   if(width===1440)await page.screenshot({path:path.join(output,`${route.slice(1)}-${theme}.png`),fullPage:true});checks++;
  }
 }
 console.log(`Section palette: ${checks} route/theme/viewport combinations passed; authenticated settings/achievements and anime use CSS fixtures.`);
}finally{await browser.close()}
