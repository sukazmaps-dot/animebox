/** Actual React cards, scroll hook and preview; optional browser tooling stays outside app dependencies. */
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const esbuild=require(process.env.ESBUILD_MODULE_PATH||'esbuild');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=process.cwd();
(async()=>{
 // Mount the exported fixture through a generated entry, using the actual components and hook.
 const entry="import React from 'react';import {createRoot} from 'react-dom/client';import Fixture from '"+root+"/tests/fixtures/profile-editor-unified.fixture';createRoot(document.getElementById('root')).render(React.createElement(Fixture));";
 const bundled=await esbuild.build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},loader:{'.fixture':'tsx','.webp':'dataurl'},bundle:true,write:false,outdir:'/tmp/unified-bundle',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},alias:{'@':root},plugins:[{name:'frame-stub',setup(b){b.onResolve({filter:/^@\/components\/profile\/ProfileFrameOverlay$/},()=>({path:'frame-stub',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export default function Frame(){return null}'}));}}]});
 let css=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import '\.\/([^']+\.css)'/g)].map(m=>fs.readFileSync('app/'+m[1],'utf8').replace(/@import[^;]+;/g,'')).join('\n');
 css+='\n'+[...fs.readFileSync('app/profile/layout.tsx','utf8').matchAll(/import '\.\.\/([^']+\.css)'/g)].map(m=>fs.readFileSync('app/'+m[1],'utf8')).join('\n')+'\n'+bundled.outputFiles.find(f=>f.path.endsWith('.css')).text;
 const js=bundled.outputFiles.find(f=>f.path.endsWith('.js')).text;
 const html='<style>'+css+'</style><div id="root"></div><script>'+js.replace(/<\/script/g,'<\\/script')+'</script>';
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
 try {const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let requests=0;
 await page.route('http://editor-fixture.test/**',async route=>{
  if(route.request().url().includes('/api/')){requests++;return route.fulfill({json:{selectedFrame:null,unlockedLevelFrames:[],unlockedFrames:[]}});}
  return route.fulfill({contentType:'text/html',body:html});
 });
 let checks=0, screenshotCount=0;
 const screenshotSizes={390:844,1024:768,1366:768,1680:900,1920:1080};
 async function capture(theme,width,tab){
  if(theme!=='dark'||!process.env.PROFILE_EDITOR_SCREENSHOT_DIR||!Object.hasOwn(screenshotSizes,width))return;
  const dir=process.env.PROFILE_EDITOR_SCREENSHOT_DIR;fs.mkdirSync(dir,{recursive:true});
  await page.screenshot({path:path.join(dir,width+'x'+screenshotSizes[width]+'-'+tab+'.png'),fullPage:false});
  screenshotCount++;
 }
 for(const theme of ['dark','light'])for(const width of [320,390,560,768,900,1024,1180,1366,1680,1920]){
  requests=0;await page.setViewportSize({width,height:screenshotSizes[width]||900});
  await page.goto('http://editor-fixture.test/');
  await page.waitForSelector('.profile-editor-v40__stage');
  await page.evaluate(theme=>document.documentElement.dataset.animeboxTheme=theme,theme);
  await page.waitForTimeout(70);
  assert.equal(await page.locator('.profile-editor-v40__tiles button').count(),8,'eight compact sidebar tiles');
  const initial=await page.evaluate(()=>{
   const modal=document.querySelector('.profile-editor-v40__shell').getBoundingClientRect();
   const tiles=[...document.querySelectorAll('.profile-editor-v40__tiles button small')];
   return {modalTop:modal.top,modalBottom:modal.bottom,viewport:innerHeight,
    labels:tiles.map(n=>({client:n.clientWidth,scroll:n.scrollWidth}))};
  });
  assert(initial.modalTop>=-1&&initial.modalBottom<=initial.viewport+1,'modal stays entirely in viewport '+width);
  assert(initial.labels.every(v=>v.scroll<=v.client+1),'rail tile labels should ellipsize without overflow '+width);
  assert.equal(await page.locator('.profile-editor-v40__savebar').count(),0,'clean editor must not show savebar');
  assert.equal(await page.locator('.profile-editor-v40__popover').isVisible(),false,'no inspector on fresh load');
  assert.equal(await page.locator('[aria-label="Живой предпросмотр профиля"]').isVisible(),true,'shared live card visible');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'document overflow '+width);
  if(width>=1280){
   const geometry=await page.evaluate(()=>{
    const box=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,top:r.top,bottom:r.bottom};};
    return {shell:box('.profile-editor-v40__shell'),workbench:box('.profile-editor-v40__workbench'),
      rail:box('.profile-editor-v40__tiles'),stage:box('.profile-editor-v40__stage'),
      board:box('.profile-editor-v40__board'),card:box('[aria-label="Живой предпросмотр профиля"]')};
   });
   assert(geometry.workbench.width>=geometry.shell.width-4,'workbench must span full modal shell '+width);
   assert(geometry.rail.width>=68,'rail must be full 72px rather than clipped '+width);
   assert(geometry.stage.width>=360&&geometry.board.width>=310,'card and 340px board tracks must be nonzero '+width);
   assert(geometry.rail.right<=geometry.stage.left+2&&geometry.stage.right<=geometry.board.left+2,'four-track modal geometry '+width);
   assert(geometry.card.width>=250&&geometry.card.left>=geometry.stage.left-1&&geometry.card.right<=geometry.stage.right+1,'real preview visible within its track '+width);
   assert(geometry.board.right<=geometry.shell.right+2,'board must not be clipped by old 190px shell column '+width);
   const showcase=await page.evaluate(()=>{
    const header=document.querySelector('.profile-editor-v40__board header');
    const h=header.querySelector('h2').getBoundingClientRect(),b=header.querySelector('button').getBoundingClientRect();
    return {sameRow:Math.abs(h.top-b.top)<20,posters:[...document.querySelectorAll('.profile-editor-v40__board [aria-label="Предпросмотр витрины"] img')].map(n=>n.getBoundingClientRect().width)};
   });
   assert(showcase.sameRow,'showcase configure button must be alongside the heading');
   assert(showcase.posters.length>0&&showcase.posters.every(w=>w>=71),'showcase poster width >=72 px');
  }else assert.equal(await page.locator('.profile-editor-v40__board').isVisible(),false,'showcase moves to rail below 1280');
  await page.getByRole('button',{name:'Имя',exact:true}).click();
  assert(await page.locator('.profile-editor-v40__popover').isVisible(),'name inspector opens '+width);
  assert.equal(await page.locator('[data-profile-anchor]').count(),1,'focused section only');
  const nameInput=page.locator('#profile-editor-name input');
  assert(await nameInput.isVisible());
  if(width>=1100){
   const overlap=await page.evaluate(()=>{
    const a=document.querySelector('.profile-editor-v40__popover').getBoundingClientRect();
    const b=document.querySelector('[aria-label="Живой предпросмотр профиля"]').getBoundingClientRect();
    return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
   });
   assert(!overlap,'inspector and live profile must not overlap at '+width);
   const actual=await page.evaluate(()=>{
     const b=s=>document.querySelector(s).getBoundingClientRect();
     const p=b('.profile-editor-v40__popover'),w=b('.profile-editor-v40__workbench'),t=b('.profile-editor-v40__stage');
     return {panelLeft:p.left,panelRight:p.right,panelWidth:p.width,workbenchLeft:w.left,workbenchWidth:w.width,stageLeft:t.left};
   });
   assert(actual.panelWidth>=296&&actual.panelRight<=actual.stageLeft+2,
     '300px inspector visible in separate track '+width+' '+JSON.stringify(actual));
  }
  await nameInput.fill('Персональный профиль');
  assert.equal(await page.locator('.profile-editor-v40__savebar').count(),1,'savebar appears on edit');
  const dock=await page.evaluate(()=>{
   const a=document.querySelector('.profile-editor-v40__savebar').getBoundingClientRect();
   const b=document.querySelector('.profile-editor-v40__shell').getBoundingClientRect();
   return {top:a.top,bottom:a.bottom,left:a.left,right:a.right,modalLeft:b.left,modalRight:b.right,modalBottom:b.bottom};
  });
  assert(dock.top>=-1&&dock.bottom<=dock.modalBottom+1,'dirty savebar inside shell '+width);
  assert(dock.left>=dock.modalLeft-1&&dock.right<=dock.modalRight+1,
    'dirty savebar horizontally inside shell '+width+' '+JSON.stringify(dock));
  await capture(theme,width,'name');
  assert((await page.locator('[aria-label="Живой предпросмотр профиля"]').innerText()).includes('Персональный профиль'),'live card updates');
  await page.getByRole('button',{name:'Баннер',exact:true}).click();
  assert.equal(await page.locator('[data-profile-anchor]').count(),1,'name inspector no longer rendered');
  assert(await page.locator('#profile-editor-banner').isVisible(),'banner inspector opens');
  await page.getByText('Палитра и эффекты',{exact:true}).click();
  assert.equal(await page.locator('[aria-label="Цвета баннера"] button').count(),12,'12 banner presets');
  await page.getByRole('button',{name:'Сакура',exact:true}).click();
  assert((await page.getByRole('button',{name:/Свой цвет/}).innerText()).includes('#DB91AE'),'color preview and draft update');
  await capture(theme,width,'banner');
  await page.getByRole('button',{name:'Рамка',exact:true}).click();
  assert(await page.locator('#profile-editor-frame').isVisible(),'frame section opens');
  assert.equal(await page.locator('#profile-editor-frame').evaluate(n=>n.open),true,'frame inventory expanded');
  await page.getByRole('button',{name:'Тема',exact:true}).click();
  await capture(theme,width,'theme');
  await page.getByRole('button',{name:'Витрина',exact:true}).click();
  await capture(theme,width,'showcase');
  await page.getByRole('button',{name:'Имя',exact:true}).click();
  assert.equal(await page.locator('#profile-editor-name input').inputValue(),'Персональный профиль','tile switches retain draft');
  if(width<1100)await page.getByRole('button',{name:'Закрыть настройки'}).click();
  else await page.getByRole('button',{name:'Имя',exact:true}).click();
  assert.equal(await page.locator('.profile-editor-v40__popover').isVisible(),false,'popover closes without resetting draft');
  await page.locator('[data-editor-save]').click();
  assert.equal(await page.locator('.profile-editor-v40__savebar').count(),0,'savebar disappears after successful save');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow after edits');
  assert(requests>=1 && requests<=2,'no runaway frames requests '+requests);
  checks++;
 }
 for(const anchor of ['avatar','banner','frame']){
  await page.setViewportSize({width:390,height:700});
  await page.goto('http://editor-fixture.test/?tab='+anchor);
  await page.waitForSelector('.profile-editor-v40__popover:not([hidden])');
  assert(await page.locator('#profile-editor-'+anchor).isVisible(),'legacy URL deep-link '+anchor);
 }
 assert.deepEqual(errors,[],'React browser errors');
 console.log('PASS '+checks+' actual React modal editor layouts: inspector isolation, bounded modal and savebar, inline profile, tiles, banner presets, frame, draft/save and old URL links; '+screenshotCount+' fixture screenshots.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
