const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const postcss=require('postcss'),local=require('next/dist/compiled/postcss-modules-local-by-default'),scope=require('next/dist/compiled/postcss-modules-scope');
const read=p=>fs.readFileSync(p,'utf8');
function compile(source,resolve=require){const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(resolve,mod,mod.exports);return mod.exports;}
const player=read('components/AnimePlayer.tsx'),ast=ts.createSourceFile('player.tsx',player,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const dropdown=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='PlayerDropdown').getText(ast);
function jsxWithClass(needle){let found;function visit(n){if(ts.isJsxElement(n)){const attr=n.openingElement.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.text==='className');if(attr?.getText(ast).includes(needle))found=n.getText(ast);}if(!found)ts.forEachChild(n,visit);}visit(ast);assert(found,needle);return found;}
const header=jsxWithClass('animebox-player-header'),fullscreen=jsxWithClass('animebox-player-fullscreen-button');
const {Header,Fullscreen}=compile(`import React,{useState,useRef,useEffect} from 'react';const Icon=()=> <svg width="16" height="16"/>;${dropdown}
export function Header({showEpisodeSelector=true}){
const watchTogetherMode=false,title='Очень длинное название аниме для проверки мобильной страницы',episodeMeta='Серия 1 из 28',sources=[{name:'Kodik'},{name:'AniLiberty'}],sourceMode='auto',activeSourceIndex=0,sourceStatuses={},enableAutoSource=()=>{},selectSource=()=>{},sourceLabel=n=>n,qualitySummary='720p',qualityInfo=null,deliverySummary='iframe',episodeNumber=1,episodeOptions=[{id:'1',label:'1 серия'}],selectEpisode=()=>{},translationOptions=[{id:'0',label:'AnimeVost'}],currentSource={name:'Kodik'},activeTranslationIndex=0,selectTranslation=()=>{},theaterMode=false,setTheaterMode=()=>{};
return (${header});}
export function Fullscreen({fullscreenActive=false}){const toggleFullscreen=()=>{};return (${fullscreen});}`);
const Quick=compile(read('components/EpisodeQuickSelector.tsx')).default;
const svg='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="purple"/></svg>').toString('base64');
let profile=null;
const Account=compile(read('components/MobileAccountNav.tsx'),id=>{
 if(id==='next/link')return {__esModule:true,default:({children,...p})=>React.createElement('a',p,children)};
 if(id==='@/components/Icon')return {__esModule:true,default:()=>React.createElement('svg',{width:20,height:20})};
 if(id==='@/components/AuthStateProvider')return {useAuthState:()=>({profile,loading:false})};
 if(id==='@/lib/supabase/client')return {createClient:()=>({storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:svg}})})}})};
 if(id==='@/lib/premium-studio')return {premiumMediaStyle:t=>({transform:`scale(${t?.zoom||1})`,objectPosition:'50% 50%'})};
 if(id==='@/lib/telegram-links')return {TELEGRAM_MINI_APP_URL:'https://t.me/YourAnimeBoxBot'};
 if(id==='@/lib/contact')return {buildSupportMailto:()=>''};
 return require(id);
}).default;
(async()=>{
 const moduleCss=await postcss([local(),scope({generateScopedName:n=>'fixture_'+n})]).process(read('components/EpisodePageDensity.module.css'),{from:undefined});
 const css=['app/layout.tsx','app/anime/layout.tsx'].flatMap(p=>[...read(p).matchAll(/import '\.\.?\/([^']+\.css)'/g)].map(m=>read('app/'+m[1]).replace(/@import[^;]+;/g,''))).join('\n')+'\n'+moduleCss.css;
 assert(read('components/AnimeEpisodePage.tsx').includes('showEpisodeSelector={false}'),'normal route delegates episode selection to QuickSelector');
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});let cases=0;
 try{
  for(const [width,height] of [[360,800],[390,844],[430,932],[740,360],[844,390],[960,440],[1100,500]]){
   for(const zoom of [1,3]){
    profile={username:'Длинное имя пользователя',avatar_path:'avatar.webp',display_avatar_transform:{x:50,y:50,zoom}};
    const account=renderToStaticMarkup(React.createElement(Account,{pathname:'/anime/test/episode/1'}));
    const controls=renderToStaticMarkup(React.createElement(Header,{showEpisodeSelector:false}));
    const quick=renderToStaticMarkup(React.createElement(Quick,{currentEpisode:1,totalEpisodes:28,hasNext:true,hasPrev:false,nextLabel:'След.',onPrevious:()=>{},onNext:()=>{},onSelect:()=>{}}));
    const entry=renderToStaticMarkup(React.createElement(Fullscreen,{}));
    const page=await browser.newPage({viewport:{width,height}});
    await page.setContent(`<html><head><style>*,*::before,*::after{box-sizing:border-box}body{margin:0}button{font:inherit}.hidden{display:none}.relative{position:relative}.absolute{position:absolute}.invisible{visibility:hidden}.opacity-0{opacity:0}.w-full{width:100%}.h-full{height:100%}.inset-0{inset:0}.flex{display:flex}.inline-flex{display:inline-flex}.items-center{align-items:center}.flex-1{flex:1}.block{display:block}.min-w-0{min-width:0}.h-4{height:16px}.w-4{width:16px}.shrink-0{flex-shrink:0}${css}</style></head><body><main class="fixture_page episode-page" style="padding:12px"><section class="animebox-premium-player"><div class="animebox-player-media relative" style="aspect-ratio:16/9;background:black">${entry}</div>${controls}</section>${quick}</main><nav class="mobile-nav">${'<a class="mobile-nav__item"><svg width="20" height="20"></svg><span>Главная</span></a>'.repeat(4)}${account}</nav></body></html>`);
    await page.locator('.mobile-nav__avatar img').waitFor();
    const r=await page.evaluate(()=>{
     const avatar=document.querySelector('.mobile-nav__avatar'),img=avatar.querySelector('img'),a=avatar.getBoundingClientRect();
     const b=document.querySelector('.animebox-player-fullscreen-button'),br=b.getBoundingClientRect(),media=b.parentElement.getBoundingClientRect();
     const selectors=[...document.querySelectorAll('.premium-player-dropdown')];const sr=selectors[0].getBoundingClientRect(),toolbar=document.querySelector('.animebox-player-toolbar').getBoundingClientRect();
     const x=a.right+6,y=a.top+a.height/2;
     return {avatar:{w:a.width,h:a.height,overflow:getComputedStyle(avatar).overflow,display:getComputedStyle(avatar).display},leak:document.elementFromPoint(x,y)===img,button:{w:br.width,h:br.height,text:b.textContent.trim(),label:b.getAttribute('aria-label'),fits:br.x>=media.x&&br.right<=media.right&&br.y>=media.y&&br.bottom<=media.bottom},selectors:selectors.length,selectorWidth:sr.width,selectorHeight:sr.height,toolbarWidth:toolbar.width,episodeNative:document.querySelectorAll('select[aria-label="Серия"]').length,quick:document.querySelectorAll('.episode-quick-nav__current').length,overflow:document.documentElement.scrollWidth>innerWidth};
    });
    assert(r.avatar.w>=20&&r.avatar.w<=24&&r.avatar.h<=24,JSON.stringify(r));assert.equal(r.avatar.overflow,'hidden');assert.notEqual(r.avatar.display,'inline');assert(!r.leak,'zoomed avatar must be clipped');
    assert.equal(r.button.w,44);assert.equal(r.button.h,44);assert.equal(r.button.text,'');assert(r.button.label);assert(r.button.fits);assert.equal(r.selectors,1);assert(r.selectorHeight>=44&&r.selectorHeight<=72,`selector height ${r.selectorHeight}`);assert.equal(r.episodeNative,0);assert.equal(r.quick,1);assert(Math.abs(r.selectorWidth-r.toolbarWidth)<1);assert(!r.overflow);
    if(width===390&&zoom===3)await page.screenshot({path:'/tmp/animebox-mobile-controls-hotfix.png',fullPage:true});
    // Embedded/Watch Together mode keeps its own selector.
    assert(renderToStaticMarkup(React.createElement(Header,{showEpisodeSelector:true})).includes('aria-label="Серия"'));
    await page.close();cases++;
   }
  }
  console.log(`PASS ${cases} actual-source mobile controls/nav cases: 360–1100px, portrait/landscape, avatar zoom 1–3, one episode picker, full-width translation, icon-only 44px fullscreen.`);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
