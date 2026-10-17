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
 const html='<style>'+css+'</style><div style="width:100%;overflow:hidden"><div id="root" style="transform:translateX(-160px);margin-left:230px;overflow:hidden;width:700px"></div></div><script>'+js.replace(/<\/script/g,'<\\/script')+'</script>';
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
 try {const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let requests=0;
 await page.route('http://editor-fixture.test/**',async route=>{
  if(route.request().url().includes('/api/')){requests++;return route.fulfill({json:{selectedFrame:null,unlockedLevelFrames:[],unlockedFrames:[]}});}
  return route.fulfill({contentType:'text/html',body:html});
 });
 let checks=0;
 for(const theme of ['dark','light'])for(const width of [320,390,560,768,900,1180,1440,1920]){
  requests=0;await page.setViewportSize({width,height:900});
  await page.goto('http://editor-fixture.test/');
  await page.waitForSelector('.profile-editor-v40__stage');
  await page.evaluate(theme=>document.documentElement.dataset.animeboxTheme=theme,theme);
  await page.waitForTimeout(70);
  assert.equal(await page.locator('.profile-editor-v40__tiles button').count(),7,'seven compact sidebar tiles');
  assert.equal(await page.locator('.profile-editor-v40__savebar').count(),0,'clean editor must not show savebar');
  assert.equal(await page.locator('.profile-editor-v40__popover').isVisible(),false,'no inspector on fresh load');
  assert.equal(await page.locator('[aria-label="Живой предпросмотр профиля"]').isVisible(),true,'shared live card visible');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'document overflow '+width);
  if(width>=900){
   const geometry=await page.evaluate(()=>['.profile-editor-v40__tiles','.profile-editor-v40__stage','.profile-editor-v40__board'].map(selector=>{
    const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,right:r.right};}));
   assert(geometry[0].right<=geometry[1].left+2&&geometry[1].right<=geometry[2].left+2,'three-column modal geometry '+width);
  }else assert.equal(await page.locator('.profile-editor-v40__board').isVisible(),false,'mobile board folded');
  if(process.env.PROFILE_EDITOR_SCREENSHOT&&[390,1440].includes(width)){
   await page.screenshot({path:process.env.PROFILE_EDITOR_SCREENSHOT.replace('.png','-'+theme+'-'+width+'.png')});
  }
  await page.getByRole('button',{name:'Имя',exact:true}).click();
  assert(await page.locator('.profile-editor-v40__popover').isVisible(),'name inspector opens '+width);
  assert.equal(await page.locator('[data-profile-anchor]').count(),1,'focused section only');
  const nameInput=page.locator('#profile-editor-name input');
  assert(await nameInput.isVisible());
  await nameInput.fill('Персональный профиль');
  assert.equal(await page.locator('.profile-editor-v40__savebar').count(),1,'savebar appears on edit');
  assert((await page.locator('[aria-label="Живой предпросмотр профиля"]').innerText()).includes('Персональный профиль'),'live card updates');
  await page.getByRole('button',{name:'Баннер',exact:true}).click();
  assert.equal(await page.locator('[data-profile-anchor]').count(),1,'name inspector no longer rendered');
  assert(await page.locator('#profile-editor-banner').isVisible(),'banner inspector opens');
  await page.getByText('Палитра и эффекты',{exact:true}).click();
  assert.equal(await page.locator('[aria-label="Цвета баннера"] button').count(),12,'12 banner presets');
  await page.getByRole('button',{name:'Сакура',exact:true}).click();
  assert((await page.getByRole('button',{name:/Свой цвет/}).innerText()).includes('#DB91AE'),'color preview and draft update');
  await page.getByRole('button',{name:'Рамка',exact:true}).click();
  assert(await page.locator('#profile-editor-frame').isVisible(),'frame section opens');
  assert.equal(await page.locator('#profile-editor-frame').evaluate(n=>n.open),true,'frame inventory expanded');
  await page.getByRole('button',{name:'Имя',exact:true}).click();
  assert.equal(await page.locator('#profile-editor-name input').inputValue(),'Персональный профиль','tile switches retain draft');
  await page.getByRole('button',{name:'Закрыть настройки'}).click();
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
 console.log('PASS '+checks+' actual React modal editor layouts: inline profile, tiles, banner presets, frame, draft/save and old URL links.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
