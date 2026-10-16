const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const fixture='app/qa-patch31-4-check';
if(fs.existsSync(fixture))throw Error('Refusing to overwrite '+fixture);
fs.mkdirSync(fixture);fs.copyFileSync('tests/fixtures/patch31-4-hero.fixture',fixture+'/page.tsx');
const logPath=path.join(os.tmpdir(),'hero-recovery-'+process.pid+'.log');
const log=fs.openSync(logPath,'w');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3104'],{env:{...process.env,NEXT_PUBLIC_MEDIA_ORIGIN:'https://media.youranimebox.com'},stdio:['ignore',log,log]});
(async()=>{let browser;try{
 for(let i=0;i<120;i++){if(fs.readFileSync(logPath,'utf8').includes('Ready in'))break;await new Promise(r=>setTimeout(r,500));}
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="800"><rect width="100%" height="100%" fill="#8972aa"/></svg>';
 let checks=0;
 for(const width of [360,412,1440,2560])for(const mode of ['cdn-fail','proxy-fail','all-fail','slow-old',...(width===360?['watchdog']:[])]){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});const requests=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const request=route.request(),url=request.url();
   if(request.resourceType()==='image'&&(url.includes('qa-images.test')||url.includes('/api/image?'))){
    requests.push(url);
    if(mode==='all-fail')return route.abort();
    if(mode==='slow-old'&&url.includes('normal')){await new Promise(r=>setTimeout(r,500));return route.abort().catch(()=>{});}
    if(url.includes('media.youranimebox.com')){if(mode==='watchdog'){await new Promise(r=>setTimeout(r,10000));return route.abort().catch(()=>{});}return route.fulfill({status:204});}
    if(mode==='proxy-fail'&&url.includes('/api/image?'))return route.fulfill({status:502});
    // Ultra-wide direct attempt is deliberately blocked to test CDN/proxy rescue.
    if(width>=2400&&url.startsWith('https://qa-images.test')&&mode==='cdn-fail')return route.abort();
    return route.fulfill({contentType:'image/svg+xml',body:svg});
   }
   if(url.startsWith('http://127.0.0.1:3104/api/'))return route.fulfill({json:{items:[],ok:true}});
   if(url.startsWith('http://127.0.0.1:3104'))return route.continue();
   return route.abort();
  });
  await page.goto('http://127.0.0.1:3104/qa-patch31-4-check',{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForSelector('.home-hero-carousel');
  await page.waitForFunction(()=>document.documentElement.dataset.heroFixtureReady==='true');
  // Next client hydration is observable via an actual state update.
  if(mode==='slow-old'){await page.locator('[data-update]').click();await page.waitForSelector('[data-fixture-mode="updated"]');}
  if(mode==='all-fail'){
   await page.waitForFunction(()=>{const img=document.querySelector('.home-hero-carousel picture img');return !img||img.currentSrc.startsWith('data:');});const count=requests.length;await page.waitForTimeout(300);
   assert.equal(requests.length,count,'exhausted chain must settle');assert(new Set(requests).size<=14,'bounded unique recovery URLs');assert(count<=40,'browser retries must also stay bounded');
   assert(await page.locator('.home-hero-carousel .hero-actions a').count()===2,'actions survive total media failure');
  }else{
   await page.waitForFunction(()=>{const img=document.querySelector('.home-hero-carousel picture img');return img?.complete&&img.naturalWidth>0&&!img.currentSrc.startsWith('data:');});
   const data=await page.evaluate(()=>{const img=document.querySelector('.home-hero-carousel picture img');return {src:decodeURIComponent(img.currentSrc),position:getComputedStyle(img).objectPosition,overflow:document.documentElement.scrollWidth>innerWidth+1};});
   assert(data.src.includes(width<=768?'portrait-':'banner-'),'viewport art selection');
   if(mode==='cdn-fail'||mode==='watchdog')assert(data.src.includes('/api/image?'),'CDN fails over to server');
   if(mode==='proxy-fail')assert(data.src.startsWith('https://qa-images.test'),'server failure falls back to original');
   if(mode==='slow-old'){assert(data.src.includes('updated'),'old response must not corrupt new art');await page.waitForTimeout(700);assert((await page.locator('.home-hero-carousel picture img').evaluate(e=>e.currentSrc)).includes('updated'));}
   if(width<=768)assert.equal(data.position,'60% 15%');assert(!data.overflow,'horizontal overflow');
  }
  assert.deepEqual(errors,[]);console.log('PASS hero',width,mode,{requests:requests.length,unique:new Set(requests).size});await page.close();checks++;
 }
 // Poster-only desktop must not be enlarged to the whole landscape hero.
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.route('**/*',route=>{const u=route.request().url();if(route.request().resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:svg});if(u.startsWith('http://127.0.0.1:3104/api/'))return route.fulfill({json:{items:[]}});return u.startsWith('http://127.0.0.1:3104')?route.continue():route.abort();});
 await page.goto('http://127.0.0.1:3104/qa-patch31-4-check');await page.waitForFunction(()=>document.documentElement.dataset.heroFixtureReady==='true');await page.locator('[data-poster]').click();await page.waitForSelector('picture[data-hero-desktop-kind="poster"]');
 const layout=await page.locator('.home-hero-carousel').evaluate(hero=>{const img=hero.querySelector('picture img');return {fit:getComputedStyle(img).objectFit,ratio:img.getBoundingClientRect().width/hero.getBoundingClientRect().width}});
 assert.equal(layout.fit,'contain');assert(layout.ratio<0.5,'poster width bounded');await page.close();
 console.log(`PASS ${checks+1} actual React hero recovery/viewport/source-update/poster scenarios.`);
}finally{
 if(browser)await browser.close();
 server.kill('SIGTERM');
 if(server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>server.once('exit',resolve));
 fs.rmSync(fixture,{recursive:true,force:true});
 // Generated Next validators import the temporary page even after its removal.
 fs.rmSync('.next/dev/types',{recursive:true,force:true});
 fs.closeSync(log);
}})().catch(error=>{console.error(error);console.error('Next log:',logPath);process.exitCode=1});
