const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const esbuild = require(process.env.ESBUILD_MODULE_PATH || 'esbuild');
const postcss = require('postcss');
const local = require('next/dist/compiled/postcss-modules-local-by-default');
const scope = require('next/dist/compiled/postcss-modules-scope');
const read = p => fs.readFileSync(p, 'utf8');

(async () => {
  const density = await postcss([local(), scope({generateScopedName: n => 'fixture_' + n})])
    .process(read('components/EpisodePageDensity.module.css'), {from:undefined});
  const routeCss = ['app/layout.tsx', 'app/anime/layout.tsx'].flatMap(p =>
    [...read(p).matchAll(/import '\.\.?\/([^']+\.css)'/g)]
      .map(m => read('app/' + m[1]).replace(/@import[^;]+;/g, ''))).join('\n');
  const bundle = await esbuild.build({stdin:{contents:`
    import React,{useRef,useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import Controls from './components/WatchControls';
    import Quick from './components/EpisodeQuickSelector';
    import {usePlayerFullscreen} from './hooks/usePlayerFullscreen';
    function Fixture(){
      const media=useRef(null),{toggleFullscreen}=usePlayerFullscreen(media);
      const [episode,setEpisode]=useState(1),[source,setSource]=useState('auto'),[voice,setVoice]=useState('0'),[theater,setTheater]=useState(false);
      window.calls??=[];
      const change=(kind,set)=>(value)=>{window.calls.push([kind,value]);set(value)};
      const sparse=location.search.includes('sparse');
      return <main className="fixture_page episode-page">
        <div className="animebox-player-root" style={{position:'relative',isolation:'isolate'}} data-player-theater={theater?'true':undefined}>
          <section className="animebox-premium-player">
            <div className="animebox-player-stage-shell"><div ref={media} className="animebox-player-media" style={{aspectRatio:'16/9',position:'relative'}}>
              <iframe id="video" title="Video" src="/frame" style={{width:'100%',height:'100%',border:0}}/>
              <button data-player-action="fullscreen" className="animebox-player-fullscreen-button" onClick={toggleFullscreen}>Fullscreen</button>
            </div></div>
            <Controls identity={<section className="episode-page__identity-compact"><div><h1>Очень длинное название аниме с несколькими частями — {episode} серия</h1><span>Сезон 1</span></div><a href="#title">К тайтлу</a></section>}
              episodes={<Quick compact currentEpisode={episode} totalEpisodes={sparse?1:110} hasPrev={episode>1} hasNext={!sparse&&episode<110} onPrevious={()=>setEpisode(e=>e-1)} onNext={()=>setEpisode(e=>e+1)} onSelect={change('episode',setEpisode)}/>}
              translationLabel="Озвучка" translation={voice} translations={sparse?[]:[{id:'0',label:'FumoDub'},{id:'1',label:'Очень длинное название озвучки Crunchyroll.Subtitles'}]} onTranslation={change('voice',setVoice)}
              source={source} sources={sparse?[{id:'0',label:'Kodik'}]:[{id:'0',label:'Kodik'},{id:'1',label:'AniLiberty'}]} onSource={change('source',setSource)} quality="Качество определяется провайдером" theater={theater} onTheater={()=>setTheater(x=>!x)}
              secondary={<section className="episode-engagement-grid"><button>Библиотека</button><button>Уведомления</button></section>}/>
          </section>
        </div>
        <div style={{height:700}}/><section id="episode-browser">Полный список</section>
      </main>;
    }
    createRoot(document.getElementById('app')).render(<React.StrictMode><Fixture/></React.StrictMode>);
  `,resolveDir:process.cwd(),loader:'tsx'}, bundle:true,write:false,outdir:'/tmp/watch-compact-bundle',format:'iife',define:{'process.env.NODE_ENV':'"development"'}});
  const js = bundle.outputFiles.find(f => f.path.endsWith('.js')).text;
  const css = routeCss + '\n' + density.css + '\n' + bundle.outputFiles.find(f => f.path.endsWith('.css')).text;
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
  let cases = 0;
  try {
    for (const width of [320,360,390,430,844,1440]) {
      for (const sparse of [false,true]) {
        const page = await browser.newPage({viewport:{width,height:width===844?390:900}});
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('https://fixture.test/**', route => route.fulfill({contentType:'text/html',body:route.request().url().endsWith('/frame')?'<body>Video</body>':`<html><head><style>*,*::before,*::after{box-sizing:border-box}body{margin:0}button{font:inherit}main{padding:12px}${css}</style></head><body><div id="app"></div></body></html>`}));
        await page.goto('https://fixture.test/'+(sparse?'?sparse':''));
        await page.addScriptTag({content:js});
        await page.locator('#video').waitFor();
        await page.frameLocator('#video').getByText('Video', {exact:true}).waitFor();
        await page.evaluate(() => {
          window.originalFrame=document.querySelector('#video');window.originalWindow=originalFrame.contentWindow;window.frameLoads=0;
          originalFrame.addEventListener('load',()=>window.frameLoads++);
        });
        const menu = page.getByLabel('Ещё настройки просмотра');
        const episodes = page.locator('.episode-quick-compact__trigger');
        const layout = await page.evaluate(() => {
          const nodes=[document.querySelector('.episode-quick-compact__trigger'), document.querySelector('[aria-label="Ещё настройки просмотра"]')];
          const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};
          const toolbar=nodes[0].closest('nav').parentElement;
          const slots=[...toolbar.children].slice(0,3).map(rect);
          const select=document.querySelector('select[aria-label="Озвучка"]');
          const label=select?.closest('label');
          const arrow=document.querySelector('.episode-quick-compact__chevron');
          return {
            overflow:document.documentElement.scrollWidth>innerWidth,
            rects:nodes.map(rect),slots,episodeArrow:rect(arrow),
            nativeAppearance:select?getComputedStyle(select).appearance:null,
            selectPadding:select?parseFloat(getComputedStyle(select).paddingRight):null,
            customArrow:label?getComputedStyle(label,'::after').borderBottomWidth:null,
            settingsVisible:document.querySelector('select[aria-label="Источник видео"]').checkVisibility()
          };
        });
        assert(!layout.overflow);assert(!layout.settingsVisible);assert.equal(layout.rects[0].y,layout.rects[1].y);
        for (const [i,slot] of layout.slots.entries()) {
          assert(slot.w>=44&&slot.h>=48, 'touch target too small '+width+'/'+sparse+'/'+i);
          if (i>0) assert(slot.x-layout.slots[i-1].right>=5, 'watch toolbar controls touch '+width+'/'+sparse+'/'+i);
          assert(slot.right<=width+1, 'watch toolbar exceeds viewport '+width+'/'+sparse+'/'+i);
        }
        assert(layout.episodeArrow.x>layout.rects[0].x+14&&layout.episodeArrow.right<layout.rects[0].right,
          'episode chevron must remain inside its button '+width+'/'+sparse);
        if (!sparse) {
          assert.equal(layout.nativeAppearance,'none','native select arrow must be disabled on mobile '+width);
          assert(layout.selectPadding>=30,'translation text needs a reserved chevron area '+width);
          assert(parseFloat(layout.customArrow)>0,'translation must have a custom chevron '+width);
        }
        const identitySpacing=await page.locator('[data-watch-controls] .episode-page__identity-compact').evaluate(node=>({marginTop:getComputedStyle(node).marginTop,paddingTop:getComputedStyle(node).paddingTop}));
        assert.deepEqual(identitySpacing,{marginTop:'0px',paddingTop:'0px'},'compact identity must not inherit legacy page spacing');
        assert(layout.rects.every(r=>r.w>=44&&r.h>=44));
        await menu.click();
        await page.getByLabel('Источник видео').selectOption('0');
        await page.getByLabel('Источник видео').selectOption('auto');
        await page.keyboard.press('Escape');
        await menu.focus();await page.keyboard.press('Enter');
        await page.getByRole('button',{name:'Библиотека',exact:true}).waitFor({state:'visible'});
        await menu.click();
        if (!sparse) await page.getByLabel('Озвучка',{exact:true}).selectOption('1');
        const before = await page.evaluate(()=>scrollY);
        await episodes.click();
        const dialog=page.getByRole('dialog',{name:'Выбор серии'});
        await dialog.waitFor({state:'visible'});
        await page.waitForFunction(() => document.querySelector('[data-watch-dialog="true"] [aria-current="page"]') === document.activeElement);
        assert.equal(await page.evaluate(()=>scrollY),before,'opening episodes must not scroll document');
        const fullList = dialog.getByRole('link',{name:'Открыть полный список серий'});
        await fullList.focus();await page.keyboard.press('Tab');
        assert(await dialog.getByRole('button',{name:'Закрыть',exact:true}).evaluate(n=>document.activeElement===n),'Tab stays in dialog '+width+'/'+sparse+' '+await page.evaluate(()=>document.activeElement?.outerHTML));
        await dialog.getByRole('button',{name:'Пред.',exact:true}).isDisabled().then(value=>assert(value));
        if (sparse) assert(await dialog.getByRole('button',{name:'Следующая серия',exact:true}).isDisabled());
        // Current episode is a no-op and closes the dialog.
        await dialog.getByRole('button',{name:'1',exact:true}).click();
        await episodes.click();
        if (!sparse) {
          await dialog.getByRole('button',{name:'110',exact:true}).click();
          await episodes.click();
          assert(await dialog.getByRole('button',{name:'Следующая серия',exact:true}).isDisabled());
          await page.keyboard.press('Escape');
          assert(await episodes.evaluate(n=>document.activeElement===n),'focus returns to episode trigger');
        } else await page.keyboard.press('Escape');
        const stable=await page.evaluate(()=>({same:originalFrame===document.querySelector('#video')&&originalWindow===originalFrame.contentWindow,loads:frameLoads,calls:window.calls,overflow:document.documentElement.scrollWidth>innerWidth}));
        assert(stable.same);assert.equal(stable.loads,0);assert(!stable.overflow);
        assert.deepEqual(stable.calls,sparse?[['source','0'],['source','auto']]:[['source','0'],['source','auto'],['voice','1'],['episode',110]]);
        if(width===390&&!sparse){fs.mkdirSync('artifacts/watch-compact',{recursive:true});await page.screenshot({path:'artifacts/watch-compact/390.png',fullPage:true});}
        assert.deepEqual(errors,[]);cases++;await page.close();
      }
    }
  } finally { await browser.close(); }
  console.log('[Watch compact controls] '+cases+' responsive interaction cases passed.');
})().catch(error=>{console.error(error);process.exit(1)});
