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
 assert(player.includes('animebox-player-root relative isolate w-full'),'smoke fixture must preserve production player outer isolation');
 assert(player.includes("data-player-theater={theaterMode ? 'true' : undefined}"),'theater state must opt out of lowered episode stacking');
 assert(player.includes('{(!isKodik || fullscreenActive) && ('),'Kodik owns fullscreen in iframe when not in AnimeBox fullscreen');
 assert(player.includes('animebox-player-source-dot block h-1.5 w-1.5 shrink-0'),'source marker must have fixed inline alignment');
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});let cases=0;
 try{
  for(const [width,height] of [[360,800],[390,844],[430,932],[740,360],[844,390],[960,440],[1100,500],[1440,900],[1920,1080]]){
   for(const zoom of [1,3]){
    profile={username:'Длинное имя пользователя',avatar_path:'avatar.webp',display_avatar_transform:{x:50,y:50,zoom}};
    const account=renderToStaticMarkup(React.createElement(Account,{pathname:'/anime/test/episode/1'}));
    const controls=renderToStaticMarkup(React.createElement(Header,{showEpisodeSelector:false}));
    const quick=renderToStaticMarkup(React.createElement(Quick,{currentEpisode:1,totalEpisodes:28,hasNext:true,hasPrev:false,nextLabel:'Следующая серия',onPrevious:()=>{},onNext:()=>{},onSelect:()=>{}}));
    const entry=renderToStaticMarkup(React.createElement(Fullscreen,{}));
    const page=await browser.newPage({viewport:{width,height}});
    await page.setContent(`<html><head><style>*,*::before,*::after{box-sizing:border-box}body{margin:0}button{font:inherit}.hidden{display:none}.relative{position:relative}.isolate{isolation:isolate}.z-\\[10001\\]{z-index:10001}.absolute{position:absolute}.invisible{visibility:hidden}.opacity-0{opacity:0}.w-full{width:100%}.h-full{height:100%}.inset-0{inset:0}.flex{display:flex}.inline-flex{display:inline-flex}.items-center{align-items:center}.flex-1{flex:1}.block{display:block}.min-w-0{min-width:0}.h-4{height:16px}.w-4{width:16px}.shrink-0{flex-shrink:0}${css}</style></head><body><main class="fixture_page episode-page" style="padding:12px"><div class="animebox-player-root relative isolate w-full"><div><section class="animebox-premium-player"><div class="animebox-player-media relative" style="aspect-ratio:16/9;background:black">${entry}</div>${controls}</section></div></div>${quick}</main><nav class="mobile-nav">${'<a class="mobile-nav__item"><svg width="20" height="20"></svg><span>Главная</span></a>'.repeat(4)}${account}</nav></body></html>`);
    await page.locator('.mobile-nav__avatar img').waitFor({state:'attached'});
    const r=await page.evaluate(()=>{
     const avatar=document.querySelector('.mobile-nav__avatar'),img=avatar.querySelector('img'),a=avatar.getBoundingClientRect();
     const b=document.querySelector('.animebox-player-fullscreen-button'),br=b.getBoundingClientRect(),media=b.parentElement.getBoundingClientRect();
     const selectors=[...document.querySelectorAll('.premium-player-dropdown')];const sr=selectors[0].getBoundingClientRect(),toolbar=document.querySelector('.animebox-player-toolbar').getBoundingClientRect();
     const x=a.right+6,y=a.top+a.height/2;
     return {avatar:{w:a.width,h:a.height,overflow:getComputedStyle(avatar).overflow,display:getComputedStyle(avatar).display},leak:document.elementFromPoint(x,y)===img,button:{w:br.width,h:br.height,text:b.textContent.trim(),label:b.getAttribute('aria-label'),fits:br.x>=media.x&&br.right<=media.right&&br.y>=media.y&&br.bottom<=media.bottom},selectors:selectors.length,selectorWidth:sr.width,selectorHeight:sr.height,toolbarWidth:toolbar.width,episodeNative:document.querySelectorAll('select[aria-label="Серия"]').length,quick:document.querySelectorAll('.episode-quick-nav__current').length,overflow:document.documentElement.scrollWidth>innerWidth};
    });
    if(width<1180){assert(r.avatar.w>=20&&r.avatar.w<=24&&r.avatar.h<=24,JSON.stringify(r));assert.equal(r.avatar.overflow,'hidden');assert.notEqual(r.avatar.display,'inline');assert(!r.leak,'zoomed avatar must be clipped');}
    assert.equal(r.button.w,44);assert.equal(r.button.h,44);assert.equal(r.button.text,'');assert(r.button.label);assert(r.button.fits);assert.equal(r.selectors,1);assert(r.selectorHeight>=44&&r.selectorHeight<=72,`selector height ${r.selectorHeight}`);assert.equal(r.episodeNative,0);assert.equal(r.quick,1);assert(Math.abs(r.selectorWidth-r.toolbarWidth)<1);assert(!r.overflow);
    const compact=await page.evaluate(()=>{
      const nav=document.querySelector('.episode-quick-nav');
      const prev=nav.querySelector('.episode-quick-nav__previous');
      const mid=nav.querySelector('.episode-quick-nav__current');
      const next=nav.querySelector('.episode-quick-nav__next');
      const all=nav.querySelector('.episode-quick-nav__all');
      const short=next.querySelector('.episode-quick-nav__label-compact');
      const long=next.querySelector('.episode-quick-nav__label-full');
      const dot=document.querySelector('.animebox-player-source-dot');
      const chip=dot.closest('.animebox-player-source-label');
      const nr=next.getBoundingClientRect(),lr=short.getBoundingClientRect(),mr=mid.getBoundingClientRect(),pr=prev.getBoundingClientRect(),ar=all.getBoundingClientRect();
      const dr=dot.getBoundingClientRect(),cr=chip.getBoundingClientRect();
      return {navWidth:nav.getBoundingClientRect().width,shortText:short.textContent,shortVisible:getComputedStyle(short).display!=='none',longVisible:getComputedStyle(long).display!=='none',
        nav:{previous:pr.toJSON(),current:mr.toJSON(),next:nr.toJSON(),all:ar.toJSON()},shortRect:lr.toJSON(),
        dotCenter:dr.top+dr.height/2,chipCenter:cr.top+cr.height/2,stepWrap:getComputedStyle(next).whiteSpace,nextScrollWidth:next.scrollWidth};
    });
    assert(Math.abs(compact.dotCenter-compact.chipCenter)<2,'source dot must align vertically '+width+' '+JSON.stringify(compact));
    assert(compact.nav.previous.right<=compact.nav.current.left+1&&compact.nav.current.right<=compact.nav.next.left+1,'episode columns must not collide '+width+' '+JSON.stringify(compact));
    assert(compact.nav.next.right<=compact.nav.previous.left+compact.navWidth+1,'next action must stay inside nav '+width+' '+JSON.stringify(compact));
    assert(compact.nav.next.height>=44&&compact.nav.all.height>=44,'tap targets must remain 44px+ '+width+' '+JSON.stringify(compact));
    if(width<=430){
      assert(compact.shortVisible&&!compact.longVisible&&compact.shortText==='След.','phone shows semantic short label '+width+' '+JSON.stringify(compact));
      assert(compact.stepWrap==='nowrap','mobile labels must not wrap '+width);
      assert(compact.nextScrollWidth<=Math.ceil(compact.nav.next.width)+1,'right control clips content '+width+' '+JSON.stringify(compact));
    }
    if(width===390&&zoom===3)await page.screenshot({path:'/tmp/animebox-mobile-controls-hotfix.png',fullPage:true});
    // Stacking regression: the true AnimePlayer root is a separate `isolate`
    // context. The previous smoke omitted it, giving a false PASS even though
    // the following EpisodeQuickSelector covered the voice menu in production.
    const stack=await page.evaluate((checkOverlap)=>{
     const playerRoot=document.querySelector('.animebox-player-root');
     const dropdown=document.querySelector('.premium-player-dropdown');
     const trigger=dropdown.querySelector('.premium-player-dropdown-trigger');
     const menu=dropdown.lastElementChild;
     const navigation=document.querySelector('.episode-quick-nav');
     const z=()=>getComputedStyle(playerRoot).zIndex;
     const closedBefore=z();
     trigger.setAttribute('aria-expanded','true');
     trigger.classList.add('is-open');
     Object.assign(menu.style,{position:'absolute',top:'calc(100% + 10px)',left:'0',width:'100%',height:'300px',visibility:'visible',opacity:'1',zIndex:'50',background:'#222'});
     const openZ=z(),isolated=getComputedStyle(playerRoot).isolation;
     // Theater has an existing z-[10001] root; the normal-menu rule must
     // not override that with z-index:30 even if a dropdown is expanded.
     playerRoot.classList.add('z-[10001]');
     playerRoot.setAttribute('data-player-theater','true');
     const theaterZ=z();
     playerRoot.classList.remove('z-[10001]');
     playerRoot.removeAttribute('data-player-theater');
     let overlap=null,openHit=null,negativeHit=null;
     if(checkOverlap){
      window.scrollTo(0,navigation.getBoundingClientRect().top+scrollY-80);
      const nav=navigation.getBoundingClientRect(),m=menu.getBoundingClientRect();
      const x=Math.max(m.left+4,Math.min(m.right-4,nav.left+nav.width/2));
      const y=Math.max(m.top+4,nav.top+12);
      const hit=()=>document.elementFromPoint(x,y);
      // Reproduce an explicit competing sibling layer, as can happen when
      // other route styles/sticky surfaces give navigation its own z-index.
      // This is an adversarial stacking scenario, not a claim that the
      // production nav has z-index:10.
      navigation.style.zIndex='10';
      overlap=(x<m.right&&x>m.left&&x<nav.right&&x>nav.left&&y<m.bottom&&y>m.top&&y<nav.bottom&&y>nav.top);
      openHit={menu:menu.contains(hit()),navigation:navigation.contains(hit()),name:hit()?.className?.toString().slice(0,120)};
      // Negative control: emulate the previous patch's z-index:auto on the
      // isolated root. The following navigation must capture this same point.
      playerRoot.style.zIndex='auto';
      negativeHit={menu:menu.contains(hit()),navigation:navigation.contains(hit()),name:hit()?.className?.toString().slice(0,120)};
      playerRoot.style.removeProperty('z-index');
      navigation.style.removeProperty('z-index');
     }
     trigger.setAttribute('aria-expanded','false');
     trigger.classList.remove('is-open');
     const closedAfter=z();
     return {closedBefore,openZ,theaterZ,closedAfter,isolated,overlap,openHit,negativeHit};
    },width>=740);
    assert.equal(stack.isolated,'isolate','true production isolation '+width);
    assert.equal(stack.closedBefore,'auto','closed player must retain normal stacking '+width);
    assert.equal(stack.openZ,'20','open dropdown must elevate outer root below fixed site chrome '+width);
    assert.equal(stack.theaterZ,'10001','theater mode must preserve pre-existing fullscreen stacking '+width);
    assert.equal(stack.closedAfter,'auto','closing dropdown restores stacking '+width);
    if(width>=740){
     assert(stack.overlap,'fixture must create real menu/navigation overlap '+width+' '+JSON.stringify(stack));
     assert(stack.openHit?.menu&&!stack.openHit.navigation,'open menu must win pointer hit '+width+' '+JSON.stringify(stack));
     assert(stack.negativeHit?.navigation&&!stack.negativeHit.menu,'adversarial sibling layer must occlude menu without outer-root lift '+width+' '+JSON.stringify(stack));
    }
    // Embedded/Watch Together mode keeps its own selector.
    assert(renderToStaticMarkup(React.createElement(Header,{showEpisodeSelector:true})).includes('aria-label="Серия"'));
    await page.close();cases++;
   }
  }
  // 31.10.2: Site chrome is a distinct fixed stacking context. The previous
  // smoke only rendered the episode content, missing the fixed search header.
  // Use the real global and route-scoped CSS, actual player controls/episode
  // navigator JSX, and the production app-shell / topbar / sidebar ancestry.
  for(const [width,height] of [[1440,900],[1920,1080]]){
   const page=await browser.newPage({viewport:{width,height}});
   const controls=renderToStaticMarkup(React.createElement(Header,{showEpisodeSelector:false}));
   const quick=renderToStaticMarkup(React.createElement(Quick,{currentEpisode:1,totalEpisodes:28,hasNext:true,hasPrev:false,nextLabel:'Следующая серия',onPrevious:()=>{},onNext:()=>{},onSelect:()=>{}}));
   await page.setContent(`<html><head><style>*,*::before,*::after{box-sizing:border-box}.relative{position:relative}.isolate{isolation:isolate}.absolute{position:absolute}.invisible{visibility:hidden}.opacity-0{opacity:0}.w-full{width:100%}.h-full{height:100%}.inset-0{inset:0}.flex{display:flex}.inline-flex{display:inline-flex}.items-center{align-items:center}.flex-1{flex:1}.block{display:block}.min-w-0{min-width:0}.h-4{height:16px}.w-4{width:16px}.shrink-0{flex-shrink:0}${css}</style></head><body><aside class="sidebar">ANIMEBOX</aside><header class="topbar"><form class="topbar__search"><input aria-label="Найти аниме" value="Фрирен" /></form></header><div class="app-shell"><main class="fixture_page episode-page" style="padding:12px"><div class="animebox-player-root relative isolate w-full"><div><section class="animebox-premium-player"><div class="animebox-player-media relative" style="height:420px;background:#333"></div>${controls}</section></div></div>${quick}<div style="height:1600px"></div></main></div></body></html>`);
   const geometry=await page.evaluate(()=>{
    const topbar=document.querySelector('.topbar'),search=topbar.querySelector('input'),side=document.querySelector('.sidebar');
    const root=document.querySelector('.animebox-player-root'),navigation=document.querySelector('.episode-quick-nav');
    const dropdown=root.querySelector('.premium-player-dropdown'),trigger=dropdown.querySelector('.premium-player-dropdown-trigger'),menu=dropdown.lastElementChild;
    const siteZ=getComputedStyle(topbar).zIndex,sidebarZ=getComputedStyle(side).zIndex,closedRootZ=getComputedStyle(root).zIndex;
    trigger.setAttribute('aria-expanded','true');trigger.classList.add('is-open');
    Object.assign(menu.style,{position:'absolute',top:'calc(100% + 10px)',left:0,width:'100%',height:'300px',visibility:'visible',opacity:'1',zIndex:'50',background:'#222'});
    navigation.style.zIndex='10'; // adversarial sibling, not production claim
    const openRootZ=getComputedStyle(root).zIndex;
    // First validate menu is clickable on top of the next-episode controls.
    navigation.scrollIntoView({block:'center'});
    const nav=navigation.getBoundingClientRect(),m=menu.getBoundingClientRect();
    const x=Math.max(m.left+5,Math.min(m.right-5,nav.left+nav.width/2));
    const y=Math.max(m.top+5,nav.top+12);
    const overlap=x<m.right&&x>m.left&&x<nav.right&&x>nav.left&&y<m.bottom&&y>m.top&&y<nav.bottom&&y>nav.top;
    const menuHit=menu.contains(document.elementFromPoint(x,y));
    // Scroll player behind sticky search: opening dropdown must never cover it.
    const desiredY=16;
    window.scrollBy(0,root.getBoundingClientRect().top-desiredY);
    const searchRect=search.getBoundingClientRect();
    const sx=searchRect.left+searchRect.width/2,sy=searchRect.top+searchRect.height/2;
    const headerHit=topbar.contains(document.elementFromPoint(sx,sy));
    const searchHit=search.contains(document.elementFromPoint(sx,sy));
    const playerRect=root.getBoundingClientRect();
    const headerRect=topbar.getBoundingClientRect();
    const underHeader=playerRect.top<headerRect.bottom&&playerRect.bottom>headerRect.top&&playerRect.left<sx&&playerRect.right>sx;
    // Exact regression control: previous root z-index 30 ties the topbar at
    // z-index 30; later player DOM paints over the search.
    root.style.zIndex='30';
    const previousHit=topbar.contains(document.elementFromPoint(sx,sy));
    root.style.removeProperty('z-index');
    const restoredHit=topbar.contains(document.elementFromPoint(sx,sy));
    trigger.setAttribute('aria-expanded','false');trigger.classList.remove('is-open');
    const closedAfter=getComputedStyle(root).zIndex;
    return {siteZ,sidebarZ,closedRootZ,openRootZ,overlap,menuHit,headerHit,searchHit,underHeader,previousHit,restoredHit,closedAfter,playerRect:{top:playerRect.top,left:playerRect.left},searchRect:{left:searchRect.left,top:searchRect.top}};
   });
   assert.equal(geometry.siteZ,'30','fixture must keep actual fixed desktop topbar z-index '+width);
   assert.equal(geometry.sidebarZ,'40','fixture must keep desktop sidebar z-index '+width);
   assert.equal(geometry.closedRootZ,'auto','closed player uses ordinary stacking '+width);
   assert.equal(geometry.openRootZ,'20','open popup must sit between sibling navigator and chrome '+width);
   assert(geometry.overlap&&geometry.menuHit,'dropdown options above episode nav '+width+' '+JSON.stringify(geometry));
   assert(geometry.underHeader&&geometry.headerHit&&geometry.searchHit,'search must stay reachable above scrolled open player '+width+' '+JSON.stringify(geometry));
   assert(!geometry.previousHit,'old z-index:30 must reproduce search hidden behind player '+width+' '+JSON.stringify(geometry));
   assert(geometry.restoredHit,'new z-index:20 must restore topbar hit '+width);
   assert.equal(geometry.closedAfter,'auto','closed menu must restore player normal stacking '+width);
   await page.close();cases++;
  }
  console.log(`PASS ${cases} actual-source controls/nav/isolated-voice-menu cases: 360–1920px, restored z-index and negative occlusion control, avatar zoom 1–3, one episode picker, 44px fullscreen.`);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
