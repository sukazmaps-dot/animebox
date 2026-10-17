/** Actual React cards, scroll hook and preview; optional browser tooling stays outside app dependencies. */
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const esbuild=require(process.env.ESBUILD_MODULE_PATH||'esbuild');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=process.cwd();
(async()=>{
 // Mount the exported fixture through a generated entry, using the actual components and hook.
 const entry="import React from 'react';import {createRoot} from 'react-dom/client';import Fixture from '"+root+"/tests/fixtures/profile-editor-unified.fixture';createRoot(document.getElementById('root')).render(React.createElement(Fixture));";
 const bundled=await esbuild.build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},loader:{'.fixture':'tsx'},bundle:true,write:false,outdir:'/tmp/unified-bundle',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},alias:{'@':root},plugins:[{name:'frame-stub',setup(b){b.onResolve({filter:/^@\/components\/profile\/ProfileFrameOverlay$/},()=>({path:'frame-stub',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export default function Frame(){return null}'}));}}]});
 let css=[...fs.readFileSync('app/layout.tsx','utf8').matchAll(/import '\.\/([^']+\.css)'/g)].map(m=>fs.readFileSync('app/'+m[1],'utf8').replace(/@import[^;]+;/g,'')).join('\n');
 css+='\n'+[...fs.readFileSync('app/profile/layout.tsx','utf8').matchAll(/import '\.\.\/([^']+\.css)'/g)].map(m=>fs.readFileSync('app/'+m[1],'utf8')).join('\n')+'\n'+bundled.outputFiles.find(f=>f.path.endsWith('.css')).text;
 const js=bundled.outputFiles.find(f=>f.path.endsWith('.js')).text;
 const html='<style>'+css+'</style><div id="root"></div><script>'+js.replace(/<\/script/g,'<\\/script')+'</script>';
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
 try{const page=await browser.newPage();let requests=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://editor-fixture.test/**',async r=>{
  if(r.request().url().includes('/api/')){requests++;await new Promise(resolve=>setTimeout(resolve,50));return r.fulfill({json:{selectedFrame:null,unlockedLevelFrames:[],unlockedFrames:[]}});}
  return r.fulfill({contentType:'text/html',body:html});
 });
 for(const width of [320,390,560,768,900,1180,1440,1920]){
  requests=0;await page.setViewportSize({width,height:1000});await page.goto('http://editor-fixture.test/');await page.waitForSelector('#profile-editor-banner');await page.waitForTimeout(150);
  assert.equal(await page.locator('[data-profile-anchor]').count(),4);assert.equal(requests,1,'one StrictMode frame request');
  assert.equal(await page.evaluate(()=>document.activeElement.tagName),'BODY','no autofocus');
  assert(await page.evaluate(()=>document.querySelector('.profile-editor-v13').scrollWidth<=innerWidth+1),'overflow '+width);
  assert(await page.locator('[data-profile-anchor] button').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).every(n=>{const r=n.getBoundingClientRect();return r.width>=43.9&&r.height>=43.9;})),'44px card touch targets '+width);
  if(process.env.PROFILE_EDITOR_SCREENSHOT&&width===390)await page.screenshot({path:process.env.PROFILE_EDITOR_SCREENSHOT});
  if(width>=900){const below=await page.locator('.profile-editor-v31__expand').evaluate(button=>button.getBoundingClientRect().top>=document.querySelector('[aria-label="Живой предпросмотр профиля"]').getBoundingClientRect().bottom);assert(below,'expand button covers desktop preview '+width);}
  const cards=await page.locator('[data-profile-anchor]').evaluateAll(nodes=>nodes.filter(n=>n.tagName==='SECTION').map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,overflow:getComputedStyle(n).overflowY})));
  assert.equal(cards.length,3);assert(cards.every(c=>c.height>100&&c.overflow==='visible'),'stacked cards '+JSON.stringify(cards));
  for(const anchor of ['avatar','frame','banner','name']){
   await page.locator('[data-profile-anchor-nav] button').filter({hasText:new RegExp('^'+anchor+'$')}).click();await page.waitForTimeout(700);
   const g=await page.locator('[data-profile-anchor="'+anchor+'"]').evaluate(el=>({top:el.getBoundingClientRect().top,offset:parseFloat(document.querySelector('.profile-editor-v13').style.getPropertyValue('--profile-editor-anchor-offset'))}));
   assert(g.top>=g.offset-4&&g.top<1000,'anchor covered '+width+' '+anchor+' '+JSON.stringify(g));
   assert.equal(await page.locator('[data-profile-anchor-nav] [aria-current]').textContent(),anchor,'scroll spy '+width);
  }
  await page.getByRole('button',{name:'Настроить баннер',exact:true}).click();await page.waitForTimeout(700);assert.equal(await page.locator('[data-profile-anchor-nav] [aria-current]').textContent(),'banner');
  await page.locator('[data-section=style]').click();await page.locator('[data-section=profile]').click();await page.waitForTimeout(100);assert.equal(requests,1,'tab switch remounts frames');
  console.log('PASS actual cards/anchors/preview/StrictMode/one fetch '+width);
 }
 for(const anchor of ['avatar','banner','frame']){
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('http://editor-fixture.test/?tab='+anchor);await page.waitForTimeout(180);
  assert.equal(await page.locator('[data-profile-anchor-nav] [aria-current]').textContent(),anchor,'legacy deep link '+anchor);
 }
 assert.deepEqual(errors,[]);
 console.log('PASS legacy aliases and reduced motion, no runtime errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
