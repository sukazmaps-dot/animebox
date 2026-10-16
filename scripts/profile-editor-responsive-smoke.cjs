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
const preview=renderToStaticMarkup(React.createElement(Preview,{username:'Длинное имя пользователя',bio:'Описание профиля, которое должно оставаться внутри карточки',avatarUrl:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',bannerUrl:null,bannerColor:'#70618c',bannerStyle:'soft',premiumActive:true,onNavigate:()=>{}}));
const colors=['Основной цвет','Акцент','Текст и иконки'].map(label=>renderToStaticMarkup(React.createElement(Color,{label,value:'#70618C',hint:'Пояснение назначения цвета, которое раньше сжималось в очень узкую колонку',onChange:()=>{}}))).join('');
let css=[...read('app/layout.tsx').matchAll(/import '\.\/([^']+\.css)'/g)].map(m=>read('app/'+m[1]).replace(/@import[^;]+;/g,'')).join('\n');
css+='\n'+[...read('app/profile/layout.tsx').matchAll(/import '\.\.\/([^']+\.css)'/g)].map(m=>read('app/'+m[1])).join('\n')+'\n'+moduleSheets.join('\n');
const dockSource=ts.transpileModule(read('lib/profile-editor-dock.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const nav=`<nav class="profile-editor-v13__tabs profile-editor-v18__rail" aria-label="Разделы">${['profile','avatar','banner','frame','style'].map(s=>`<button data-section="${s}"><svg width="17" height="17"></svg><span>${s}</span></button>`).join('')}<details class="profile-editor-v31__more"><summary>Ещё</summary><div class="profile-editor-v31__more-items"><button class="profile-editor-v31__mobile-frame">Рамка</button><button>Витрина</button><button>Награды</button></div></details></nav>`;
const premium=`<div class="profile-editor-v13__premium-tab"><div class="premium-studio premium-studio-v12 is-embedded"><div class="premium-studio-v15__layout"><div class="premium-studio-v15__hero"><div class="premium-studio-v15__hero-main"><div class="premium-studio-v15__color-list">${colors}</div></div><aside class="premium-studio-v12__preview-wrap premium-studio-v15__preview-wrap"><div class="premium-studio-v15__sticky"><div class="premium-studio-v23__preview-tabs"><button>Профиль</button><button>Мини</button><button>Комментарий</button><button>Комната</button></div><div class="premium-studio-v15__preview"><div class="premium-studio-v15__preview-banner"></div><div class="premium-studio-v15__preview-body" style="height:250px">Premium profile</div></div></div></aside></div><div class="premium-studio-v16__section-nav"><button>Оформление</button><button>Атмосфера</button></div><div class="premium-studio-v15__sections"><section style="height:1200px">Длинный набор настроек</section><button class="lastControl">Последняя настройка</button></div></div><button class="premium-studio-v22__preview-fab">Превью</button></div></div>`;
function fixture(tab){return `<style>${css}</style><style>body{margin:0}.lastControl{min-height:44px}.profile-editor-v31__header-title h1{margin:0}</style><main class="profile-editor-v13" data-editor-tab="${tab}"><section class="profile-editor-v13__shell"><header class="profile-editor-v13__header"><div class="profile-editor-v31__header-title"><button>×</button><h1>Редактор профиля</h1></div><span class="profile-editor-v31__status">Не сохранено</span></header><div class="profile-editor-v31__live-preview">${preview}</div>${nav}<fieldset class="profile-editor-v31__settings">${tab==='style'?premium:`<div class="profile-editor-v19__direct-tab"><label>Имя<input value="Профиль" /></label><div style="height:1400px">Форма</div><button class="lastControl">Убрать баннер</button></div>`}</fieldset><div class="profile-editor-v13__mobile-save profile-editor-v18__savebar"><span class="profile-editor-v18__savebar-copy"><strong>Правки видны в превью</strong></span><button>Сбросить</button><button>Сохранить</button></div></section></main>`;}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});try{
 const page=await browser.newPage();let count=0;
 for(const theme of ['dark','light'])for(const tab of ['profile','style'])for(const [width,height] of [[320,900],[360,900],[390,900],[412,900],[466,869],[768,900],[899,900],[900,900],[1040,900],[1180,900],[1440,900],[1920,1080],[2560,1440],[3840,2160],[844,390]]){
  await page.setViewportSize({width,height});await page.setContent(fixture(tab));await page.evaluate(theme=>{document.documentElement.setAttribute('data-animebox-theme',theme);document.documentElement.classList.add('ab-profile-editor-open');},theme);
  await page.addScriptTag({content:`(()=>{const exports={};${dockSource};window.stopDock=exports.observeProfileEditorDock(document.querySelector('.profile-editor-v18__savebar'));})()`});await page.waitForTimeout(20);
  const geometry=await page.evaluate(()=>{
   const q=s=>document.querySelector(s),box=s=>{const r=q(s).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
   return {rootOverflow:getComputedStyle(q('.profile-editor-v13')).overflowY,documentOverflow:document.documentElement.scrollWidth>innerWidth+1,rootOverflowX:q('.profile-editor-v13').scrollWidth>innerWidth+1,settings:box('.profile-editor-v31__settings'),preview:box('.profile-editor-v31__live-preview'),nav:box('nav'),bar:box('.profile-editor-v18__savebar'),header:box('header'),buttons:[...document.querySelectorAll('nav > button')].filter(n=>getComputedStyle(n).display!=='none').map(n=>n.getBoundingClientRect().height),fields:[...document.querySelectorAll('input[type=text]')].map(n=>({right:n.getBoundingClientRect().right,parent:n.parentElement.getBoundingClientRect().right,width:n.getBoundingClientRect().width})),nestedScroll:[...document.querySelectorAll('.premium-studio-v15__sticky')].some(n=>['auto','scroll'].includes(getComputedStyle(n).overflowY))};
  });
  const label=`${theme} ${tab} ${width}x${height}`;
  assert.equal(geometry.rootOverflow,'auto',label+' main scroll root');assert(!geometry.documentOverflow&&!geometry.rootOverflowX,label+' horizontal overflow');assert(geometry.buttons.every(h=>h>=44&&h<=60),label+' menu button size');assert(!geometry.nestedScroll,label+' nested preview wheel trap');
  if(width<900){assert(geometry.nav.bottom<=height+1,label+' nav viewport');assert(geometry.bar.bottom<=geometry.nav.top+1,label+' save/nav overlap');if(tab==='profile')assert(geometry.settings.top>=geometry.preview.bottom-1,label+' preview/form overlap');}
  else if(tab==='profile'){assert(geometry.preview.left>=geometry.settings.right-1,label+' desktop right column');assert(geometry.preview.top<geometry.settings.top+60,label+' preview must start alongside form');}
  if(width>=1180)assert(geometry.nav.right<=geometry.settings.left+1,label+' compact desktop rail');
  if(width>=1440)assert(geometry.settings.width>600,label+' use wide screen');
  assert(geometry.fields.every(f=>f.right<=f.parent+1&&f.width>=80),label+' HEX field clipped');
  await page.evaluate(()=>{const root=document.querySelector('.profile-editor-v13');root.scrollTop=600;});await page.waitForTimeout(15);
  if(width>=900&&tab==='profile'){const top=await page.locator('.profile-editor-v31__live-preview').evaluate(n=>n.getBoundingClientRect().top);assert(top>=geometry.header.height-1&&top<geometry.header.height+80,label+' sticky preview');}
  if(tab==='style'&&width>=900){const top=await page.locator('.premium-studio-v15__sticky').evaluate(n=>n.getBoundingClientRect().top);assert(top>=geometry.header.height-1&&top<geometry.header.height+80,label+' sticky Premium preview');}
  await page.evaluate(()=>{const root=document.querySelector('.profile-editor-v13');root.scrollTop=root.scrollHeight;});await page.waitForTimeout(15);
  const last=await page.locator('.lastControl').boundingBox(),bar=await page.locator('.profile-editor-v18__savebar').boundingBox();assert(last.y+last.height<=bar.y+1,label+' last control hidden under dock');
  await page.evaluate(()=>window.stopDock());count++;
 }
 // Simulate a keyboard shrinking visualViewport while the layout viewport stays tall.
 await page.setViewportSize({width:390,height:900});await page.setContent(fixture('profile'));
 await page.evaluate(()=>{
  document.documentElement.setAttribute('data-profile-editor-keyboard','');
  document.documentElement.style.setProperty('--ab-editor-viewport-height','400px');
  document.documentElement.style.setProperty('--ab-editor-keyboard-inset','500px');
 });
 const keyboard=await page.evaluate(()=>({root:document.querySelector('.profile-editor-v13').getBoundingClientRect().height,preview:getComputedStyle(document.querySelector('.profile-editor-v31__live-preview')).display,bar:document.querySelector('.profile-editor-v18__savebar').getBoundingClientRect().bottom,nav:document.querySelector('nav').getBoundingClientRect().top}));
 assert.equal(keyboard.root,400,'legacy min-height must not override visualViewport');assert.equal(keyboard.preview,'none','keyboard leaves room for editing');assert(keyboard.bar<=keyboard.nav+1,'keyboard save controls overlap navigation');
 await page.evaluate(()=>{document.documentElement.removeAttribute('data-profile-editor-keyboard');document.documentElement.style.removeProperty('--ab-editor-viewport-height');document.documentElement.style.removeProperty('--ab-editor-keyboard-inset');});
 // A long save failure must stay visible in the fixed dock and reserve its new height.
 await page.setViewportSize({width:360,height:900});await page.setContent(fixture('profile'));
 await page.addScriptTag({content:`(()=>{const exports={};${dockSource};window.stopDock=exports.observeProfileEditorDock(document.querySelector('.profile-editor-v18__savebar'));})()`});
 await page.evaluate(()=>{document.querySelector('.profile-editor-v18__savebar-copy').innerHTML='<strong>Правки видны в превью</strong><small class="profile-editor-v31__error" role="alert">Не удалось сохранить профиль. Проверь соединение и повтори попытку. Черновик остаётся на устройстве.</small>';});
 await page.waitForTimeout(60);
 const saveError=await page.locator('.profile-editor-v18__savebar-copy .profile-editor-v31__error').boundingBox();assert(saveError&&saveError.height>0,'save error is hidden by an old small-text rule');
 await page.evaluate(()=>{const root=document.querySelector('.profile-editor-v13');root.scrollTop=root.scrollHeight;});
 const finalControl=await page.locator('.lastControl').boundingBox(),errorDock=await page.locator('.profile-editor-v18__savebar').boundingBox();assert(finalControl.y+finalControl.height<=errorDock.y+1,'resized error dock hides the last setting');
 await page.evaluate(()=>window.stopDock());
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
 console.log(`PASS ${count} editor layout cases: both themes, 320–3840px, short landscape, sticky/right preview, 44px menu, HEX containment, single scroll root, last control above dock; IndexedDB file recovery, account isolation and expiry.`);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
