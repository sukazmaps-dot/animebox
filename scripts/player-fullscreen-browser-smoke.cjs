const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const esbuild = require(process.env.ESBUILD_MODULE_PATH || 'esbuild');
const postcss = require('postcss');
const local = require('next/dist/compiled/postcss-modules-local-by-default');
const scope = require('next/dist/compiled/postcss-modules-scope');
const read = p => fs.readFileSync(p, 'utf8');

(async () => {
  const moduleCss = await postcss([local(), scope({generateScopedName: n => 'fixture_' + n})]).process(read('components/EpisodePageDensity.module.css')+'\n'+read('components/AnimeQuickActions.module.css'), {from:undefined});
  const css = ['app/layout.tsx','app/anime/layout.tsx'].flatMap(p => [...read(p).matchAll(/import '\.\.?\/([^']+\.css)'/g)].map(m => read('app/' + m[1]).replace(/@import[^;]+;/g,''))).join('\n') + '\n' + moduleCss.css;
  const bundle = await esbuild.build({stdin:{contents:`
    import React, {useRef} from 'react';
    import {createRoot} from 'react-dom/client';
    import {usePlayerFullscreen} from './hooks/usePlayerFullscreen';
    import QuickSelector from './components/EpisodeQuickSelector';
    function Fixture(){
      const ref=useRef(null);
      const {fullscreen,pseudoFullscreen,toggleFullscreen}=usePlayerFullscreen(ref);
      return <div className="fixture_page episode-page" style={{transform:'translateZ(0)',contain:'paint',isolation:'isolate'}}>
        <section className="animebox-premium-player">
          <div className="animebox-player-stage-shell">
            <div ref={ref} className={'animebox-player-media '+(pseudoFullscreen?'animebox-telegram-player-viewport':'animebox-player-viewport')} style={{position:'relative',aspectRatio:'16/9'}}>
              <span id="internal-hidden" style={{visibility:"hidden"}}>Internal hidden control</span><iframe id="media" title="test media" src="/frame" style={{width:'100%',height:'100%',border:0}} />
              <button data-player-action="fullscreen" className="animebox-player-fullscreen-button" onClick={toggleFullscreen}>{pseudoFullscreen||fullscreen?'Выйти':'На весь экран'}</button>
            </div>
          </div>
          <div className="animebox-player-header"><div className="animebox-player-titleblock"><h1>Провожающая в последний путь Фрирен — очень длинное название тайтла</h1><p>Серия 1 из 28</p></div>
            <div className="animebox-player-toolbar"><div className="animebox-player-source-switcher">{['Авто','Kodik','AniLiberty'].map(n=><button key={n} className="premium-player-source">{n}</button>)}</div>
              {['Серия','Озвучка'].map(n=><div className="premium-player-dropdown" key={n}><button className="premium-player-dropdown-trigger">{n}</button></div>)}
            </div>
          </div>
        </section>
        <QuickSelector currentEpisode={1} totalEpisodes={28} hasPrev={false} hasNext={true} nextLabel="След." onPrevious={()=>{}} onNext={()=>{}} onSelect={()=>{}} />
        <section className="episode-engagement-grid"><section className="fixture_library episode-library-compact"><button className="episode-library-compact__trigger">Смотрю</button></section><section className="fixture_notifications episode-notification-compact"><button>Тайтл завершён</button></section></section>
      </div>;
    }
    createRoot(document.getElementById('app')).render(<React.StrictMode><Fixture /></React.StrictMode>);
  `,resolveDir:process.cwd(),loader:'tsx'}, bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"development"'}});
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
  let cases = 0;
  try {
    for (const width of [320,360,390,412,430,844,1920]) {
      const page = await browser.newPage({viewport:{width,height:width===844?390:900}});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('https://fixture.test/**', route => route.fulfill({contentType:'text/html',body:route.request().url().endsWith('/frame')?'<body style="background:black;color:white">Video</body>':`<html><head><style>*,*::before,*::after{box-sizing:border-box}body{margin:0}button{font:inherit}#app{padding:12px}.animebox-player-source-switcher{display:flex}.premium-player-dropdown-trigger{width:100%}${css}</style></head><body><div id="app"></div></body></html>`}));
      await page.goto('https://fixture.test/');
      await page.evaluate(() => {
        window.calls=[];window.events={};window.backListeners=new Set();window.frameLoads=0;
        window.Telegram={WebApp:{initData:'fixture',version:'8.0',platform:'android',isFullscreen:false,isVerticalSwipesEnabled:true,
          safeAreaInset:{top:24,right:0,bottom:16,left:0},contentSafeAreaInset:{top:44,right:0,bottom:0,left:0},
          isVersionAtLeast:v=>Number(v)<=8, expand:()=>calls.push('expand'),
          requestFullscreen:()=>calls.push('requestFullscreen'),exitFullscreen:()=>calls.push('exitFullscreen'),
          disableVerticalSwipes:()=>calls.push('disableVerticalSwipes'),enableVerticalSwipes:()=>calls.push('enableVerticalSwipes'),
          lockOrientation:()=>calls.push('lockOrientation'),unlockOrientation:()=>calls.push('unlockOrientation'),
          onEvent:(e,f)=>(events[e]??=new Set()).add(f),offEvent:(e,f)=>events[e]?.delete(f),
          BackButton:{isVisible:false,show:()=>calls.push('showBack'),hide:()=>calls.push('hideBack'),onClick:f=>backListeners.add(f),offClick:f=>backListeners.delete(f)}}};
      });
      await page.addScriptTag({content:bundle.outputFiles[0].text});
      await page.waitForSelector('#media');
      await page.evaluate(()=>{window.originalFrame=document.querySelector('#media');window.frameWindow=originalFrame.contentWindow;originalFrame.addEventListener('load',()=>window.frameLoads++);});
      const normal=await page.evaluate(()=>{
        const r=s=>{const x=document.querySelector(s).getBoundingClientRect();return {x:x.x,y:x.y,w:x.width,h:x.height,right:x.right,bottom:x.bottom}};
        return {video:r('#media'),head:r('.animebox-player-header'),sels:[...document.querySelectorAll('.premium-player-dropdown')].map(x=>{const r=x.getBoundingClientRect();return {y:r.y,w:r.width}}),prev:r('.episode-quick-nav__previous'),current:r('.episode-quick-nav__current'),next:r('.episode-quick-nav__next'),all:r('.episode-quick-nav__all'),actions:r('.episode-engagement-grid'),overflow:document.documentElement.scrollWidth>innerWidth};
      });
      if(width===390)await page.screenshot({path:'/tmp/animebox-watch-layout.png',fullPage:true});
      assert(!normal.overflow,`no overflow ${width}`);
      assert(normal.head.y>=normal.video.bottom-1,`header after video ${width}`);
      assert(Math.abs(normal.video.w/normal.video.h-16/9)<.02,`16:9 ${width}`);
      assert.equal(normal.sels[0].y,normal.sels[1].y,`two selectors ${width}`);
      assert(Math.abs(normal.prev.h-normal.next.h)<1&&Math.abs(normal.prev.h-normal.current.h)<1,`equal navigation ${width}`);
      assert(normal.all.y>=normal.current.bottom,`all episodes below ${width}`);
      for(const fallback of [false,true]) {
        await page.evaluate(fallback=>{if(fallback)document.querySelector('.animebox-player-media').showPopover=undefined;},fallback);
        await page.locator('[data-player-action=fullscreen]').click();
        await page.waitForFunction(()=>document.documentElement.classList.contains('animebox-player-telegram-fullscreen'));
        const full=await page.evaluate(()=>{
          const node=document.querySelector('.animebox-player-media'),r=node.getBoundingClientRect();
          const button=document.querySelector('[data-player-action=fullscreen]'),b=button.getBoundingClientRect();
          return {x:r.x,y:r.y,w:r.width,h:r.height,vw:innerWidth,vh:visualViewport.height,bodyOverflow:getComputedStyle(document.body).overflow,hidden:getComputedStyle(document.querySelector('.animebox-player-header')).visibility,frameSame:originalFrame===document.querySelector('#media')&&frameWindow===originalFrame.contentWindow,buttonVisible:document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===button,buttonTop:b.y,loads:frameLoads};
        });
        assert(Math.abs(full.x)<1&&Math.abs(full.y)<1&&Math.abs(full.w-full.vw)<1&&Math.abs(full.h-full.vh)<1,`fills viewport ${width}/${fallback}: ${JSON.stringify(full)}`);
        assert.equal(full.hidden,'hidden');assert.equal(await page.locator('#internal-hidden').evaluate(n=>getComputedStyle(n).visibility),'hidden');assert.equal(full.bodyOverflow,'hidden');assert(full.frameSame);assert.equal(full.loads,0);assert(full.buttonVisible);assert(full.buttonTop>=68);
        if(fallback)await page.evaluate(()=>history.back());else await page.locator('[data-player-action=fullscreen]').click();
        await page.waitForFunction(()=>!document.documentElement.classList.contains('animebox-player-telegram-fullscreen'));
        await page.waitForTimeout(30);
        assert(await page.evaluate(()=>originalFrame===document.querySelector('#media')&&frameWindow===originalFrame.contentWindow&&frameLoads===0));
        cases++;
      }
      // Telegram BackButton must consume fullscreen, leaving the route intact.
      await page.locator('[data-player-action=fullscreen]').click();
      await page.waitForFunction(()=>backListeners.size===1);
      await page.evaluate(()=>backListeners.forEach(f=>f()));
      await page.waitForFunction(()=>!document.documentElement.classList.contains('animebox-player-telegram-fullscreen'));
      assert.equal(await page.evaluate(()=>backListeners.size),0);
      if(width===390) {
        for(const version of [6.0,7.6,7.7,8.0]) {
          await page.evaluate(version=>{calls.length=0;Telegram.WebApp.isVersionAtLeast=v=>Number(v)<=version;},version);
          await page.locator('[data-player-action=fullscreen]').click();
          await page.waitForFunction(()=>document.documentElement.classList.contains('animebox-player-telegram-fullscreen'));
          const calls=await page.evaluate(()=>window.calls);
          assert.equal(calls.includes('requestFullscreen'),version>=8);
          assert.equal(calls.includes('disableVerticalSwipes'),version>=7.7);
          await page.keyboard.press('Escape');
          await page.waitForFunction(()=>!document.documentElement.classList.contains('animebox-player-telegram-fullscreen'));
          await page.waitForTimeout(30);
          cases++;
        }
        await page.evaluate(()=>{
          calls.length=0;Telegram.WebApp.isVersionAtLeast=()=>true;
          Telegram.WebApp.isFullscreen=true;Telegram.WebApp.isVerticalSwipesEnabled=false;Telegram.WebApp.isOrientationLocked=true;
        });
        await page.locator('[data-player-action=fullscreen]').click();
        await page.waitForFunction(()=>document.documentElement.classList.contains('animebox-player-telegram-fullscreen'));
        await page.keyboard.press('Escape');
        await page.waitForFunction(()=>!document.documentElement.classList.contains('animebox-player-telegram-fullscreen'));
        const preserved=await page.evaluate(()=>calls);
        assert(!preserved.includes('exitFullscreen')&&!preserved.includes('enableVerticalSwipes')&&!preserved.includes('unlockOrientation'));
        await page.waitForTimeout(30);
        // Rejected SDK methods and an asynchronous fullscreenFailed event keep CSS usable.
        await page.evaluate(()=>{
          Telegram.WebApp.isFullscreen=false;Telegram.WebApp.isVerticalSwipesEnabled=true;Telegram.WebApp.isOrientationLocked=false;
          Telegram.WebApp.requestFullscreen=()=>{throw Error('UNSUPPORTED')};
          Telegram.WebApp.disableVerticalSwipes=()=>{throw Error('UNSUPPORTED')};
        });
        await page.locator('[data-player-action=fullscreen]').click();
        await page.waitForFunction(()=>document.documentElement.classList.contains('animebox-player-telegram-fullscreen'));
        await page.evaluate(()=>events.fullscreenFailed?.forEach(f=>f({error:'UNSUPPORTED'})));
        assert(await page.evaluate(()=>document.documentElement.classList.contains('animebox-player-telegram-fullscreen')));
        await page.setViewportSize({width:844,height:390});
        await page.waitForTimeout(50);
        assert.equal(await page.locator('.animebox-player-media').evaluate(n=>n.getBoundingClientRect().height),390);
        await page.keyboard.press('Escape');
        await page.waitForFunction(()=>!document.documentElement.classList.contains('animebox-player-telegram-fullscreen'));
        assert(await page.evaluate(()=>originalFrame===document.querySelector('#media')&&frameLoads===0));
        cases+=2;
      }
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log(`PASS ${cases} fullscreen geometry/identity cases: 320–1920px, API 6.0/7.6/7.7/8.0, SDK failure/owned-state preservation, rotation, transformed ancestor, top-layer and old-WebView fallback, safe area, browser/Telegram Back and cleanup.`);
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
