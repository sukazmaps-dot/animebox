/** Hydrated production /settings + real AuthModalProvider. No login is submitted.
 * The viewport mock verifies lifecycle/geometry; it is not a physical keyboard. */
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
 let cases=0,authWrites=0;
 try{
  const context=await browser.newContext();
  await context.addInitScript(()=>{
   // Real browser events still drive window resize; explicit mock events cover
   // the offset a mobile keyboard can introduce without resizing layout viewport.
   const viewport=new EventTarget(),listeners=new Map();
   const add=viewport.addEventListener.bind(viewport),remove=viewport.removeEventListener.bind(viewport);
   viewport.addEventListener=(type,fn,options)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);add(type,fn,options);};
   viewport.removeEventListener=(type,fn,options)=>{listeners.get(type)?.delete(fn);remove(type,fn,options);};
   Object.defineProperties(viewport,{
    height:{get:()=>window.__authViewportHeight??innerHeight},width:{get:()=>innerWidth},
    offsetTop:{get:()=>window.__authViewportTop??0},offsetLeft:{value:0},scale:{value:1},
   });
   Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
   window.__authViewport=viewport;
   window.__authViewportListeners=()=>[...listeners.values()].reduce((n,set)=>n+set.size,0);
  });
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.hostname!=='animebox.test')return route.abort();
   if(url.pathname==='/settings')return route.fulfill({contentType:'text/html',body:await fs.readFile('.next/server/app/settings.html')});
   if(url.pathname.startsWith('/_next/static/')){
    const file=path.resolve('.next/static',url.pathname.slice('/_next/static/'.length));
    if(!file.startsWith(path.resolve('.next/static')+path.sep))return route.abort();
    try{return route.fulfill({body:await fs.readFile(file),contentType:file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':'application/javascript'});}catch{return route.abort();}
   }
   if(url.pathname==='/logo.png'||(url.pathname==='/_next/image'&&url.searchParams.get('url')==='/logo.png')){
    return route.fulfill({contentType:'image/png',body:await fs.readFile('public/logo.png')});
   }
   if(url.pathname.startsWith('/api/')){
    if(request.method()!=='GET'&&/\/api\/auth\//.test(url.pathname))authWrites++;
    return route.fulfill({status:401,json:{ok:false}});
   }
   return route.abort();
  });
  const page=await context.newPage();
  await page.emulateMedia({reducedMotion:'reduce'});
  const screens=[[320,568],[390,844],[768,1024],[844,390],[1024,768],[1440,900]];
  for(const [width,height] of screens)for(const theme of ['dark','light']){
   await page.setViewportSize({width,height});
   await page.goto('http://animebox.test/settings',{waitUntil:'load'});
   await page.getByText('Гостевой режим',{exact:true}).waitFor({timeout:20000});
   await page.getByRole('button',{name:theme==='dark'?'Тёмная':'Светлая',exact:false}).click();
   await page.waitForFunction(t=>document.documentElement.dataset.animeboxTheme===t,theme);
   const trigger=page.getByRole('link',{name:'Войти',exact:true}).first();
   for(const mode of ['login','register']){
    const baseline=await page.evaluate(()=>window.__authViewportListeners());
    await trigger.click();
    const dialog=page.getByRole('dialog');await dialog.waitFor();
    if(width<=760||(width<=1100&&height<=600)){
     await page.waitForFunction(()=>{const image=document.querySelector('.auth-modal-v2__mobile-header img');return image?.complete&&image.naturalWidth>0;});
    }
    if(mode==='register')await dialog.getByRole('tab',{name:'Регистрация',exact:true}).click();
    const tag=`${theme}/${width}x${height}/${mode}`;
    await page.waitForFunction(()=>document.querySelector('.auth-modal-v2')?.style.getPropertyValue('--auth-viewport-height'));
    await page.evaluate(()=>{for(const animation of document.getAnimations())if(Number.isFinite(animation.effect?.getComputedTiming().endTime))animation.finish();});
    if(process.env.AUTH_SCREENSHOT_DIR&&width===390){
     await fs.mkdir(process.env.AUTH_SCREENSHOT_DIR,{recursive:true});
     await page.screenshot({path:path.join(process.env.AUTH_SCREENSHOT_DIR,`${theme}-${mode}.png`)});
    }
    const metrics=await dialog.evaluate(el=>{
     for(const animation of document.getAnimations())if(Number.isFinite(animation.effect?.getComputedTiming().endTime))animation.finish();
     const r=e=>{const b=e.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};
     const form=el.querySelector('.auth-modal-v2__form-side'),header=el.querySelector('.auth-modal-v2__mobile-header');
     const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
     const lum=()=>[...ctx.getImageData(0,0,1,1).data].slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
     const contrasts=[...el.querySelectorAll('.auth-modal-v2__mode .is-active,.auth-modal-v2__submit')].map(button=>{
      const css=getComputedStyle(button),ancestors=[];
      for(let node=button;node;node=node.parentElement)ancestors.unshift(node);
      // Foundation's selected tabs use a translucent gradient. Check both
      // resolved color stops composited over the real ancestor backgrounds.
      const stops=css.backgroundImage.match(/rgba?\([^)]*\)|color\([^)]*\)/g)||['transparent'];
      return Math.min(...stops.map(stop=>{
       ctx.fillStyle='#fff';ctx.fillRect(0,0,1,1);
       for(const node of ancestors){ctx.fillStyle=getComputedStyle(node).backgroundColor;ctx.fillRect(0,0,1,1);}
       ctx.fillStyle=stop;ctx.fillRect(0,0,1,1);const bg=lum();
       ctx.fillStyle=css.color;ctx.fillRect(0,0,1,1);const fg=lum();
       return(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);
      }));
     });
     return {dialog:r(el),header:r(header),form:r(form),close:r(el.querySelector('.auth-modal-v2__close')),
      contrasts,
      story:getComputedStyle(el.querySelector('.auth-modal-v2__story')).display,
      formOverflow:getComputedStyle(form).overflowY,formScroll:form.scrollHeight,formClient:form.clientHeight,
      inputPx:[...el.querySelectorAll('input')].map(e=>parseFloat(getComputedStyle(e).fontSize)),
      controls:[...el.querySelectorAll('input,.auth-modal-v2__mode,.auth-modal-v2__submit')].map(r),
      bodyLocked:document.body.style.overflow==='hidden',width:innerWidth,height:innerHeight};
    });
    const mobile=width<=760||(width<=1100&&height<=600);
    assert(metrics.bodyLocked,tag+': body scroll not locked');
    assert(metrics.contrasts.every(n=>n>=4.5),tag+': primary auth text contrast '+metrics.contrasts.join(','));
    assert(metrics.dialog.left>=-1&&metrics.dialog.right<=width+1,tag+': dialog clipped horizontally');
    assert(metrics.dialog.top>=-1&&metrics.dialog.bottom<=height+1,tag+': dialog outside viewport');
    assert(metrics.close.width>=44&&metrics.close.height>=44,tag+': close target');
    assert(metrics.close.top>=0&&metrics.close.bottom<=height,tag+': close outside viewport');
    for(const box of metrics.controls)assert(box.left>=-1&&box.right<=width+1,tag+': control clipped horizontally');
    if(mobile){
     assert.equal(metrics.story,'none',tag+': marketing story should not squeeze the form');
     assert(metrics.header.height>=72,tag+': compact header collapsed');
     assert(metrics.form.top>=metrics.header.bottom-1,tag+': header/form overlap');
     assert.equal(metrics.formOverflow,'auto',tag+': form must own scrolling');
     assert(metrics.inputPx.every(n=>n>=16),tag+': mobile input can trigger zoom');
     const button=dialog.locator('.auth-modal-v2__submit');await button.scrollIntoViewIfNeeded();
     const reachable=await button.evaluate(el=>{const b=el.getBoundingClientRect(),f=el.closest('.auth-modal-v2__form-side').getBoundingClientRect();return b.top>=f.top-1&&b.bottom<=f.bottom+1;});
     assert(reachable,tag+': submit cannot be reached by form scrolling');
     const close=dialog.getByRole('button',{name:'Закрыть окно входа'});
     assert(await close.isVisible(),tag+': close vanished after scrolling');
    }else assert.notEqual(metrics.story,'none',tag+': desktop story unexpectedly hidden');
    // Escape must close and return focus to the real trigger on /settings.
    await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
    assert(await trigger.evaluate(el=>el===document.activeElement),tag+': focus not restored');
    assert.equal(await page.evaluate(()=>document.body.style.overflow),'',tag+': body lock leaked');
    assert.equal(await page.evaluate(()=>window.__authViewportListeners()),baseline,tag+': viewport listener leak');
    assert.equal(new URL(page.url()).pathname,'/settings',tag+': auth opening navigated away');
    cases++;
   }
  }
  // Explicit visual-viewport keyboard displacement and cleanup. No native
  // keyboard claim: this is a controlled EventTarget + actual rendered modal.
  await page.setViewportSize({width:390,height:844});
  const trigger=page.getByRole('link',{name:'Войти',exact:true}).first();
  await trigger.click();
  await page.evaluate(()=>{window.__authViewportHeight=350;window.__authViewportTop=80;window.__authViewport.dispatchEvent(new Event('resize'));});
  await page.waitForFunction(()=>document.querySelector('.auth-modal-v2')?.style.getPropertyValue('--auth-viewport-height')==='350px');
  const vp=await page.locator('.auth-modal-v2').boundingBox();
  assert(Math.abs(vp.y-80)<1&&Math.abs(vp.height-350)<1,'visualViewport height/offset not applied');
  await page.getByRole('dialog').getByRole('button',{name:'Закрыть окно входа'}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
  await page.evaluate(()=>{window.__authViewportHeight=844;window.__authViewportTop=0;window.__authViewport.dispatchEvent(new Event('resize'));});
  assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--auth-viewport-height')),'','viewport vars leaked to html');
  await trigger.click();
  await page.waitForFunction(()=>document.querySelector('.auth-modal-v2')?.style.getPropertyValue('--auth-viewport-height')==='844px');
  await page.keyboard.press('Escape');
  assert.equal(authWrites,0,'test sent an auth write');
  console.log(`PASS ${cases} hydrated auth cases + visualViewport height/offset lifecycle; guest settings, login/register, themes, scroll, close target, focus restore, body lock cleanup. No auth writes or physical keyboard E2E.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
