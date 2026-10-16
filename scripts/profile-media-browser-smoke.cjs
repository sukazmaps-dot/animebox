/** Real normalization/canvas functions + native crop dialog in a Next fixture. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const dir='app/qa-profile-media-check',port=3101;
if(fs.existsSync(dir))throw Error('Refusing to overwrite '+dir);
fs.mkdirSync(dir);
const profileCSS=[...fs.readFileSync('app/profile/layout.tsx','utf8').matchAll(/import '(\.\.\/[^']+\.css)'/g)].map(m=>`import '${m[1]}';`).join('\n');
fs.writeFileSync(dir+'/page.tsx',fs.readFileSync('tests/fixtures/profile-media-v309.fixture','utf8').replace("'use client';","'use client';\n"+profileCSS));
const logPath=path.join(os.tmpdir(),'animebox-profile-media-'+process.pid+'.log'),log=fs.openSync(logPath,'w');
(async()=>{let browser;const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--port',String(port),'--hostname','127.0.0.1'],{stdio:['ignore',log,log]});
try{
 for(let i=0;i<120;i++){if(fs.readFileSync(logPath,'utf8').includes('Ready in'))break;await new Promise(r=>setTimeout(r,500));}
 browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:'+port)?r.continue():r.abort());
 await page.goto('http://127.0.0.1:'+port+'/qa-profile-media-check',{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>Boolean(window.__profileMediaQA));
 const result=await page.evaluate(async()=>{
  const q=window.__profileMediaQA,canvas=document.createElement('canvas');
  canvas.width=4096;canvas.height=3072;const ctx=canvas.getContext('2d');
  const pixels=ctx.createImageData(canvas.width,canvas.height);
  // Deterministic noise creates a real high-resolution phone-size JPEG.
  let seed=7;for(let i=0;i<pixels.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)|0;pixels.data[i]=seed>>>24;pixels.data[i+1]=seed>>>16;pixels.data[i+2]=seed>>>8;pixels.data[i+3]=255;}
  ctx.putImageData(pixels,0,0);
  const raw=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.98));
  let phone=new File([raw],'phone.jpg',{type:'application/octet-stream'});
  // Reproduce the reported Android arrayBuffer failure; native FileReader
  // still reads the File's internal bytes, independently of this method.
  Object.defineProperty(phone,'arrayBuffer',{value:()=>Promise.reject(new DOMException('Picker provider unavailable','NotReadableError'))});
  const source=await q.normalizePickedImage(phone);
  const regular=await q.compressImage(source,'avatar',{x:50,y:50,zoom:1},false);
  const premium=await q.compressImage(source,'avatar',{x:60,y:40,zoom:1.5},true);
  const banner=await q.compressImage(source,'banner',{x:50,y:50,zoom:1},true);
  const inspect=async f=>{const b=await createImageBitmap(f);const r={width:b.width,height:b.height,bytes:f.size,type:f.type};b.close();return r;};
  canvas.width=canvas.height=64;ctx.fillStyle='#cc4422';ctx.fillRect(0,0,64,64);
  const red=new File([await new Promise(r=>canvas.toBlob(r,'image/png'))],'red.png',{type:'image/png'});
  const color=await q.extractDominantColor(red);
  const original=HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob=function(callback,type,quality){return original.call(this,callback,type==='image/webp'?'image/png':type,quality);};
  let jpeg;try{jpeg=await q.compressImage(red,'avatar',{x:50,y:50,zoom:1},false);}finally{HTMLCanvasElement.prototype.toBlob=original;}
  const corrupt=await q.normalizePickedImage(new File([new Uint8Array([1,2,3])],'bad.jpg',{type:'image/jpeg'})).then(()=>false,()=>true);
  return {sourceBytes:raw.size,source:await inspect(source),regular:await inspect(regular),premium:await inspect(premium),banner:await inspect(banner),jpeg:await inspect(jpeg),color,corrupt};
 });
 assert(result.sourceBytes>10*1024*1024,'fixture must exercise 10+ MiB input');
 assert(result.source.width<=2048&&result.source.height<=2048,'editor downsample missing');
 assert.equal(result.regular.width,256);assert.equal(result.regular.height,256);assert(result.regular.bytes<=200*1024);
 assert.equal(result.premium.width,512);assert.equal(result.premium.height,512);assert(result.premium.bytes<=200*1024);
 assert.equal(result.banner.width,960);assert.equal(result.banner.height,320);assert(result.banner.bytes<=300*1024);
 assert.equal(result.jpeg.type,'image/jpeg');assert.equal(result.color,'#cc4422');assert(result.corrupt);
 console.log('PASS actual canvas/FileReader pipeline',JSON.stringify(result));
 const heic=await page.evaluate(async base64=>{
   const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
   const normalized=await window.__profileMediaQA.normalizePickedImage(new File([bytes],'phone.heic',{type:'image/heic'}));
   const bitmap=await createImageBitmap(normalized);const result={width:bitmap.width,height:bitmap.height,type:normalized.type};bitmap.close();return result;
 },fs.readFileSync('tests/fixtures/profile-media-sample.heic.base64','utf8').trim());
 assert.equal(heic.width,128);assert.equal(heic.height,96);console.log('PASS real HEIC decode',JSON.stringify(heic));

 let cases=0;
 for(const theme of ['dark','light'])for(const [width,height] of [[360,740],[390,844],[412,915],[844,390]]){
  await page.setViewportSize({width,height});await page.evaluate(theme=>document.documentElement.dataset.animeboxTheme=theme,theme);
  await page.locator('#open-crop').click();await page.waitForSelector('dialog[open]');
  const apply=page.locator('#apply-crop');await apply.scrollIntoViewIfNeeded();
  const g=await apply.evaluate(el=>{const r=el.getBoundingClientRect(),d=document.querySelector('dialog');return {width:r.width,height:r.height,top:r.top,bottom:r.bottom,hit:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===el,modal:d.matches(':modal'),overflow:document.documentElement.scrollWidth>innerWidth+1};});
  assert(g.modal&&g.hit,'crop action blocked by fixed navigation '+JSON.stringify({theme,width,g}));
  assert(g.top>=0&&g.bottom<=height&&g.height>=44&&!g.overflow,'crop actions outside viewport '+JSON.stringify({theme,width,g}));
  if(process.env.PROFILE_MEDIA_SCREENSHOT_DIR&&width===390){fs.mkdirSync(process.env.PROFILE_MEDIA_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PROFILE_MEDIA_SCREENSHOT_DIR,'crop-'+theme+'.png')});}
  await page.keyboard.press('Escape');await page.waitForSelector('dialog',{state:'detached'});
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'','scroll lock leaked');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'open-crop','focus not restored');cases++;
 }
 console.log('PASS',cases,'real native dialog/theme/viewport cases; actions above max-z fixed navigation, Escape, focus and scroll restoration.');
}finally{
 if(browser)await browser.close();server.kill('SIGTERM');if(server.exitCode===null)await new Promise(r=>server.once('exit',r));
 fs.rmSync(dir,{recursive:true,force:true});fs.rmSync('.next/dev/types',{recursive:true,force:true});fs.closeSync(log);
}})().catch(e=>{console.error(e);process.exitCode=1;});
