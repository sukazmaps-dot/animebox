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
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),ts=require('typescript');
const compile=async(file,imports)=>{const mod={exports:{}};const code=ts.transpileModule(await fs.readFile(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','exports','module',code)(name=>name==='react'||name==='react/jsx-runtime'?require(name):imports[name],mod.exports,mod);return mod.exports.default};
const link={default:props=>React.createElement('a',props)};
const Rating=await compile('components/AnimeRatingControl.tsx',{'next/link':link,'next/navigation':{usePathname:()=>'/anime/fixture'},'@/components/AuthStateProvider':{useAuthState:()=>({user:{id:'fixture'},loading:false})}});
const icon=props=>React.createElement('span',{'aria-hidden':true,style:{display:'inline-block',width:props.size,height:props.size}});
const Discussion=await compile('components/EpisodeDiscussionHub.tsx',{'next/link':link,'@phosphor-icons/react/ssr':{ArrowRightIcon:icon,ChatCircleTextIcon:icon,EyeSlashIcon:icon,GitBranchIcon:icon},'@/components/ui/AnimeBoxIconCore':{default:({children,className})=>React.createElement('div',{className},children)}});
const rating=renderToStaticMarkup(React.createElement(Rating,{animeId:154587}));
const discussion=renderToStaticMarkup(React.createElement(Discussion,{animeSlug:'fixture',animeTitle:'Фрирен',latestEpisode:28}));
const fp=css.match(/\.(FriendsPageClient-module__[\w]+__page)/)?.[1]?.replace(/page$/,'');assert.ok(fp,'built friend layout');
const friends=`<div class="${fp}page"><header><h1>Друзья</h1></header>${[1,2].map(n=>`<section class="${fp}panel"><h2>Список ${n}</h2><div class="${fp}people"><article style="display:flex;align-items:center;gap:12px;padding:12px"><span style="width:48px;height:48px;flex-shrink:0"></span><div style="min-width:0;flex:1"><strong>Друг с длинным именем</strong><p>В сети</p></div><button>Удалить</button></article></div></section>`).join('')}</div>`;
const interactive=`<main class="anime-detail-v4"><div class="anime-detail-v4__personal-grid"><section class="episode-library-compact"><h2>Библиотека</h2></section><section class="anime-notification-control"><h2>Уведомления</h2></section>${rating}</div>${discussion}<section class="episode-list-shell"><div class="episode-list">${Array.from({length:14},(_,i)=>`<a class="episode-list__item" href="#"><span class="episode-list__number">${i+1}</span><span class="episode-list__copy"><strong class="episode-list__label">Серия ${i+1}</strong><small>Продолжить просмотр</small></span></a>`).join('')}</div></section><div class="anime-detail-v3__genres"><span>Приключения</span></div></main>`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--single-process','--no-zygote','--disable-gpu']});
const output='/tmp/animebox-dense-layout';await fs.mkdir(output,{recursive:true});
let checks=0;
try{
 const page=await browser.newPage();
 let activeRoute;
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if (['/settings','/achievements'].includes(activeRoute) && route.request().resourceType()==='script') return route.abort();
  if(['/settings'].includes(url.pathname))return route.fulfill({contentType:'text/html',body:await fs.readFile(`.next/server/app/${url.pathname.slice(1)}.html`)});
  if(url.pathname.startsWith('/api/'))return route.fulfill({status:503,json:{}});
  if(url.pathname.startsWith('/_next/static/')){
   const file=path.resolve('.next/static',url.pathname.slice(14));
   if(!file.startsWith(path.resolve('.next/static')+path.sep))return route.abort();
   try{return route.fulfill({body:await fs.readFile(file),contentType:file.endsWith('.css')?'text/css':'application/javascript'});}catch{return route.abort();}
  }
  return route.abort();
 });
 for(const route of ['/settings']){
  activeRoute=route;
  await page.goto('http://animebox.test'+route,{waitUntil:'load'});
  await page.addStyleTag({content:css});
  if(route==='/achievements')await page.evaluate(markup=>{document.querySelector('.page-content').insertAdjacentHTML('beforeend',markup)},achievements);
  if(route==='/settings')await page.evaluate(markup=>{document.querySelector('.page-content').insertAdjacentHTML('beforeend',markup)},friends+interactive);
  for(const theme of ['dark','light'])for(const width of [390,1440,1920]){
   await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.setAttribute('data-animebox-theme',t),theme);
   await page.waitForTimeout(250); // Settle existing background transitions before contrast sampling.
   const result=await page.evaluate(route=>{
    const lum=s=>s.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4}).reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0);
    const selectors='.anime-rating-control p,.anime-rating-control__eyebrow,.episode-discussion-hub p,.episode-discussion-hub__eyebrow,.episode-discussion-hub__meta small,.episode-list__copy small,.anime-detail-v3__genres span';
    const contrasts=[...document.querySelectorAll(selectors)].map(el=>{
     let p=el,bg;
     while(p){const color=getComputedStyle(p).backgroundColor;const parts=color.match(/[\d.]+/g);if(parts&&(parts.length===3||Number(parts[3])===1)){bg=color;break}p=p.parentElement;}
     const a=lum(getComputedStyle(el).color),b=lum(bg||getComputedStyle(document.body).backgroundColor); return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });
    const r=document.querySelector('.anime-rating-control').getBoundingClientRect(),l=document.querySelector('.episode-library-compact').getBoundingClientRect(),d=document.querySelector('.episode-discussion-hub').getBoundingClientRect();const panels=[...document.querySelectorAll('[class*=FriendsPageClient-module][class*=__panel]')].map(e=>e.getBoundingClientRect());const cards=[...document.querySelectorAll('[class*=FriendsPageClient-module][class*=__people] article')].map(e=>e.getBoundingClientRect().width);return {friendColumns:panels[1].left>=panels[0].right,friendWidths:cards,overflow:document.documentElement.scrollWidth>innerWidth+1,contrasts,ratingWidth:r.width,ratingLeft:r.left,libraryRight:l.right,discussionWidth:d.width};
   },route);
   assert.ok(!result.overflow,`${route}/${theme}/${width} overflow`);
   assert.ok(result.contrasts.length>0,`${route}: no labels tested`);
   assert.ok(result.contrasts.every(n=>n>=4.5),`${route}/${theme}: ${result.contrasts}`);
   assert.ok(result.friendWidths.every(n=>n<=560),'bounded friend cards');if(width>=1440)assert.ok(result.friendColumns,'two-column friends');assert.ok(result.ratingWidth<=680.1,'bounded rating width'); if(width>=1440)assert.ok(result.ratingLeft>=result.libraryRight,'two-column interactions'); assert.ok(result.discussionWidth<=1040.1,'bounded discussion panel');
   if(width===1920)await page.screenshot({path:path.join(output,`${route.slice(1)}-${theme}.png`),fullPage:true});checks++;
  }
 }
 console.log(`Dense layout: ${checks} theme/viewport combinations passed for rendered rating/discussion, series CSS and friend layout fixtures.`);
}finally{await browser.close()}
