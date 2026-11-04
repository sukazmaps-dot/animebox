const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const esbuild=require(process.env.ESBUILD_MODULE_PATH||'esbuild');

async function main(){
  const bundle=await esbuild.build({
    stdin:{contents:`
      import React,{useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import PlayerDropdown from './components/PlayerDropdown';
      function Fixture(){
        const [episode,setEpisode]=useState('1');
        const [voice,setVoice]=useState('0');
        const episodes=Array.from({length:12},(_,i)=>({id:String(i+1),label:(i+1)+' серия'}));
        const voices=[
          {id:'0',label:'Netflix.Subtitles'},
          {id:'1',label:'AniLiberty'},
          {id:'2',label:'Crunchyroll.Subtitles'},
        ];
        return <div className="player-clip"><div className="dropdown-row">
          <PlayerDropdown label="Серия" value={episode} options={episodes} onChange={setEpisode}/>
          <PlayerDropdown label="Озвучка" value={voice} options={voices} onChange={setVoice} align="right"/>
        </div></div>;
      }
      createRoot(document.getElementById('app')).render(<React.StrictMode><Fixture/></React.StrictMode>);
    `,resolveDir:process.cwd(),loader:'tsx'},
    alias:{'@':process.cwd()},
    bundle:true,write:false,outdir:'/tmp/player-dropdown-portal',format:'iife',
    define:{'process.env.NODE_ENV':'"development"'},
  });
  const js=bundle.outputFiles.find(file=>file.path.endsWith('.js')).text;
  const browser=await chromium.launch({
    headless:true,args:['--no-sandbox'],
    ...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})
  });
  try{
    for(const testCase of [
      {width:1920,height:608,clipHeight:520,expected:'top'},
      {width:1365,height:900,clipHeight:360,expected:'bottom'},
    ]){
      const page=await browser.newPage({viewport:{width:testCase.width,height:testCase.height}});
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}html,body,#app{width:100%;height:100%;margin:0}
body{background:#111018;color:#f4f0fa;font:13px Arial}
.player-clip{position:fixed;inset:0 auto auto 0;width:100%;height:${testCase.clipHeight}px;overflow:hidden;border:1px solid #494052;background:#1c1a22}
.dropdown-row{position:absolute;right:24px;bottom:18px;display:flex;align-items:center;gap:12px}
.premium-player-dropdown{position:relative;min-width:210px}
.premium-player-dropdown-trigger{display:flex;width:210px;height:48px;align-items:center;justify-content:space-between;padding:8px 12px;border:1px solid #51445e;border-radius:10px;background:#292631;color:white;cursor:pointer}
.premium-player-dropdown select{display:none}
.player-dropdown-menu{box-sizing:border-box;border:1px solid #665477;border-radius:12px;background:#26232e;color:white;box-shadow:0 16px 44px #0008}
.player-dropdown-menu>div:first-child{min-height:50px;padding:16px}
[data-player-dropdown-options]{overflow-y:auto;padding:8px}
.premium-player-dropdown-option{display:flex;width:100%;min-height:38px;align-items:center;padding:8px;border:0;border-radius:7px;background:transparent;color:white;text-align:left;cursor:pointer}
</style></head><body><div id="app"></div></body></html>`);
      await page.addScriptTag({content:js});
      const episodeTrigger=page.getByRole('button',{name:/Серия/});
      await episodeTrigger.click();
      const menu=page.locator('[data-player-dropdown-menu][aria-label="Серия"]');
      await menu.waitFor({state:'visible'});
      const geometry=await page.evaluate(()=>{
        const trigger=document.querySelector('[data-player-dropdown-trigger]');
        const menu=document.querySelector('[data-player-dropdown-menu]');
        const clip=document.querySelector('.player-clip');
        const t=trigger.getBoundingClientRect(),m=menu.getBoundingClientRect();
        const list=menu.querySelector('[data-player-dropdown-options]');
        return {
          top:m.top,bottom:m.bottom,left:m.left,right:m.right,
          triggerTop:t.top,triggerBottom:t.bottom,parentIsBody:menu.parentElement===document.body,
          clipOverflow:getComputedStyle(clip).overflow,listClientHeight:list.clientHeight,
          listScrollHeight:list.scrollHeight,placement:menu.dataset.placement,
        };
      });
      assert.equal(geometry.parentIsBody,true,'menu must escape the clipped player via portal');
      assert.equal(geometry.clipOverflow,'hidden','fixture preserves real player clipping boundary');
      assert.equal(geometry.placement,testCase.expected,'menu chooses available side');
      assert(geometry.top>=0&&geometry.bottom<=testCase.height,'menu fits viewport: '+JSON.stringify(geometry));
      assert(geometry.left>=0&&geometry.right<=testCase.width,'menu fits horizontal viewport');
      if(testCase.expected==='top')assert(geometry.bottom<=geometry.triggerTop,'short viewport opens upward');
      else assert(geometry.top>=geometry.triggerBottom,'tall viewport opens downward');
      assert(geometry.listScrollHeight>geometry.listClientHeight,'long episode list scrolls within available height');

      await page.getByRole('option',{name:'7 серия'}).scrollIntoViewIfNeeded();
      await page.getByRole('option',{name:'7 серия'}).click();
      await page.getByRole('button',{name:/7 серия/}).waitFor();
      assert.equal(await menu.count(),0,'episode selection closes menu');

      const voiceTrigger=page.getByRole('button',{name:/Озвучка/});
      await voiceTrigger.click();
      const voiceMenu=page.locator('[data-player-dropdown-menu][aria-label="Озвучка"]');
      await voiceMenu.waitFor({state:'visible'});
      const voiceGeometry=await voiceMenu.evaluate(element=>{
        const rect=element.getBoundingClientRect();
        return {left:rect.left,right:rect.right};
      });
      assert(voiceGeometry.left>=0&&voiceGeometry.right<=testCase.width,'right aligned voice menu clamps to viewport');
      await page.keyboard.press('Escape');
      assert.equal(await voiceMenu.count(),0,'Escape closes menu');
      assert.equal(await voiceTrigger.evaluate(element=>document.activeElement===element),true,'Escape returns focus');

      await episodeTrigger.click();
      await menu.waitFor({state:'visible'});
      await page.locator('#app').click({position:{x:8,y:8}});
      assert.equal(await menu.count(),0,'outside pointer closes menu');
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log('PASS player dropdown portal: clipping, up/down placement, scroll, episode/voice selection, outside close and Escape.');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exit(1);});
