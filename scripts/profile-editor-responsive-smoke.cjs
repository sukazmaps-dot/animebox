const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const read=p=>fs.readFileSync(p,'utf8');
const cache=new Map(),moduleSheets=[];
function load(path){
 if(cache.has(path))return cache.get(path);
 if(path.endsWith('.css')){
  const prefix='fixture'+moduleSheets.length+'_';const names={};
  let css=read(path).replace(/:global\(([^)]+)\)/g,'$1').replace(/\.([a-zA-Z_][\w-]*)/g,(_,name)=>'.'+(names[name]=prefix+name));
  moduleSheets.push(css);return {__esModule:true,default:names};
 }
 const mod={exports:{}};cache.set(path,mod.exports);
 const code=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(id=>{
  if(id==='@/components/profile/ProfileFrameOverlay')return {__esModule:true,default:()=>null};
  if(id.startsWith('@/'))return load(id.slice(2)+'.ts');
  if(id.startsWith('./'))return load(require('node:path').join(require('node:path').dirname(path),id));
  return require(id);
 },mod,mod.exports);cache.set(path,mod.exports);return mod.exports;
}
const Preview=load('components/profile/ProfileEditorLivePreview.tsx').default;
const Color=load('components/profile/ProfileColorField.tsx').default;
const preview=renderToStaticMarkup(React.createElement(Preview,{username:'Длинное имя пользователя',bio:'Описание профиля, которое должно оставаться внутри карточки',avatarUrl:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',bannerUrl:null,bannerColor:'#70618c',bannerStyle:'soft',premiumActive:true,full:true,createdAt:'2021-02-19T00:00:00Z',onNavigate:()=>{}}));
const colors=['Основной цвет','Акцент','Текст и иконки'].map(label=>renderToStaticMarkup(React.createElement(Color,{label,value:'#70618C',hint:'Пояснение назначения цвета, которое раньше сжималось в очень узкую колонку',onChange:()=>{}}))).join('');
let css=[...read('app/layout.tsx').matchAll(/import '\.\/([^']+\.css)'/g)].map(m=>read('app/'+m[1]).replace(/@import[^;]+;/g,'')).join('\n');
css+='\n'+[...read('app/profile/layout.tsx').matchAll(/import '\.\.\/([^']+\.css)'/g)].map(m=>read('app/'+m[1])).join('\n')+'\n'+moduleSheets.join('\n');
const dockSource=ts.transpileModule(read('lib/profile-editor-dock.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
// Browser fixture uses the actual modal layout classes and real shared profile card.
function fixture(dirty,panelOpen){
 const tiles=['Имя','Аватар','Баннер','Рамка','Оформление','Витрина','Награды']
   .map((t,i)=>`<button data-selected="${panelOpen&&i===0}"><span>◇</span><small>${t}</small></button>`).join('');
 return `<style>${css}</style><style>body{margin:0}.profile-editor-v31__header-title h1{margin:0}</style>
 <main class="profile-editor-v13" data-editor-tab="profile" data-editor-layout="modal">
 <section class="profile-editor-v13__shell profile-editor-v40__shell">
 <header class="profile-editor-v13__header profile-editor-v40__header">
 <div class="profile-editor-v31__header-title"><button>×</button><h1>Редактор профиля</h1></div>
 <span class="profile-editor-v31__status">${dirty?'● Не сохранено':'✓ Сохранено'}</span></header>
 <div class="profile-editor-v40__workbench">
 <nav class="profile-editor-v40__tiles" aria-label="Настройки профиля">${tiles}</nav>
 <section class="profile-editor-v40__stage"><div class="profile-editor-v40__stage-header">ТВОЙ ПРОФИЛЬ</div>${preview}<p class="profile-editor-v40__hint">Нажми на элемент</p></section>
 <aside class="profile-editor-v40__board"><h2>Витрина</h2><p>Настоящие аниме</p></aside>
 <aside class="profile-editor-v40__popover" ${panelOpen?'':'hidden'}><header><h2>Имя и описание</h2><button>×</button></header>
 <fieldset class="profile-editor-v31__settings profile-editor-v40__panel-content">
 <label>Имя<input type="text" value="AnimeBox" /></label><label>Описание<textarea>Мой профиль</textarea></label>
 <button>Применить</button></fieldset></aside></div>
 ${dirty?'<div class="profile-editor-v13__mobile-save profile-editor-v18__savebar profile-editor-v40__savebar"><span class="profile-editor-v18__savebar-copy"><strong>Несохранённые изменения</strong></span><button>Сбросить</button><button>Сохранить</button></div>':''}
 </section></main>`;
}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});try{
 const page=await browser.newPage();let count=0;
 for(const theme of ['dark','light'])for(const dirty of [false,true])for(const panelOpen of [false,true])
 for(const [width,height] of [[320,900],[390,900],[560,900],[768,900],[900,900],[1180,900],[1440,900],[1920,1080]]){
  await page.setViewportSize({width,height});await page.setContent(fixture(dirty,panelOpen));
  await page.evaluate(theme=>{document.documentElement.setAttribute('data-animebox-theme',theme);document.documentElement.classList.add('ab-profile-editor-open');},theme);
  const g=await page.evaluate(()=>{
   const q=s=>document.querySelector(s),rect=s=>{const r=q(s).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
   return {root:rect('.profile-editor-v13'),shell:rect('.profile-editor-v40__shell'),nav:rect('.profile-editor-v40__tiles'),
     stage:rect('.profile-editor-v40__stage'),board:rect('.profile-editor-v40__board'),
     pop:rect('.profile-editor-v40__popover'),bar:document.querySelector('.profile-editor-v40__savebar')?rect('.profile-editor-v40__savebar'):null,
     boardDisplay:getComputedStyle(q('.profile-editor-v40__board')).display,
     popDisplay:getComputedStyle(q('.profile-editor-v40__popover')).display,
     overflow:document.documentElement.scrollWidth>innerWidth+1,
     tileHeights:[...q('.profile-editor-v40__tiles').children].map(n=>n.getBoundingClientRect().height)};
  });
  const label=`${theme} ${width}x${height} dirty=${dirty} panel=${panelOpen}`;
  assert.equal(Math.round(g.root.width),width,label+' fullscreen portal');
  assert.equal(Math.round(g.root.height),height,label+' viewport height');
  assert(g.shell.width<=width+1&&g.shell.height<=height+1,label+' modal bounded');
  assert(!g.overflow,label+' no horizontal overflow');
  assert(g.nav.right<=g.stage.left+2,label+' tile/sidebar collision');
  assert(g.tileHeights.every(h=>h>=59),label+' accessible tile targets');
  assert.equal(g.bar!==null,dirty,label+' dirty-only savebar');
  assert.equal(g.popDisplay!=='none',panelOpen,label+' tile popover');
  if(width>=851){assert(g.board.left>=g.stage.right-2,label+' showcase right');assert(g.boardDisplay!=='none',label+' desktop showcase');}
  else assert.equal(g.boardDisplay,'none',label+' folded mobile showcase');
  if(panelOpen){assert(g.pop.left>=g.shell.left-1&&g.pop.right<=g.shell.right+1,label+' popover horizontal bounds');
    if(dirty)assert(g.pop.bottom<=g.bar.top+2,label+' savebar obscures inspector');}
  if(dirty)assert(g.bar.bottom<=g.shell.bottom+1,label+' savebar outside modal');
  count++;
 }
 await page.setViewportSize({width:390,height:900});await page.setContent(fixture(true,true));
 await page.evaluate(()=>document.documentElement.style.setProperty('--ab-editor-viewport-height','400px'));
 const keyboard=await page.locator('.profile-editor-v13').evaluate(n=>n.getBoundingClientRect().height);
 assert.equal(keyboard,400,'editor must track visualViewport keyboard height');
 await page.evaluate(()=>document.documentElement.style.removeProperty('--ab-editor-viewport-height'));
 // Real browser IndexedDB: staged files survive a reload and accounts stay separate.
 await page.route('http://editor-fixture.test/**',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}));
 await page.goto('http://editor-fixture.test/');
 const storageCode=ts.transpileModule(read('lib/profile-editor-draft.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 await page.addScriptTag({content:`(()=>{const exports={};${storageCode};window.draftApi=exports;})()`});
 await page.evaluate(async()=>{
  const a=window.draftApi;const draft={username:'Черновик',bio:'Текст',bannerColor:'#112233',bannerColorMode:'manual',bannerStyle:'soft',frame:null,premium:null,avatar:new File(['actual image bytes'],'avatar.webp',{type:'image/webp'}),banner:null,removeAvatar:false,removeBanner:false};
  await a.profileDraftStorage('account-A','write',draft);
  const read=await a.profileDraftStorage('account-A','read');
  if(read.draft.avatar.name!=='avatar.webp'||await read.draft.avatar.text()!=='actual image bytes')throw Error('staged File did not survive IndexedDB');
  if(await a.profileDraftStorage('account-B','read')!==null)throw Error('draft leaked across accounts');
  const now=Date.now;Date.now=()=>now()+a.DRAFT_TTL+1000;
  if(await a.profileDraftStorage('account-A','read')!==null)throw Error('expired draft restored');
  Date.now=now;await a.profileDraftStorage('account-A','delete');
  if(await a.profileDraftStorage('account-A','read')!==null)throw Error('deleted draft still present');
 });
 console.log(`PASS ${count} editor layout cases: both themes, 320–1920px, compact modal, sidebar tiles, popup bounds, dirty-only savebar and mobile keyboard height; IndexedDB file recovery, account isolation and expiry.`);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
