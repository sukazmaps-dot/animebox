const fs=require('node:fs'),assert=require('node:assert/strict');
const esbuild=require('esbuild');
const {chromium}=require('playwright');
(async()=>{
 const bundle=await esbuild.build({stdin:{contents:`
 import React,{useState} from 'react';import{createRoot}from'react-dom/client';
 import Controls from './components/WatchControls';import Library from './components/LibraryStatusControl';
 function Fixture(){const[voice,setVoice]=useState('0'),[source,setSource]=useState('auto'),[theater,setTheater]=useState(false);
 window.changes??=[];return <main><h1>Обещанный Неверленд — 1 серия</h1><div style={{isolation:'isolate',overflow:'hidden',position:'relative'}}>
 <iframe id="frame" title="Плеер" src="about:blank" style={{height:180,width:'100%',border:0,background:'#080810'}}/>
 <Controls identity={null} episodes={<button>Серия 1 ▾</button>} secondary={<Library animeId={1} initialStatus="watching" variant="inline"/>}
 translationLabel="Озвучка" translation={voice} translations={[{id:'0',label:'Studio Band'},{id:'1',label:'AniDUB'}]} onTranslation={v=>{setVoice(v);window.changes.push(v)}}
 source={source} sources={[{id:'0',label:'Kodik'},{id:'1',label:'AniLiberty'}]} onSource={setSource} quality="Качество контролирует источник" theater={theater} onTheater={()=>setTheater(!theater)}/>
 </div><section style={{position:'relative',zIndex:100,marginTop:12,background:'#24212d',padding:16}}>Смотреть вместе <button>Создать комнату</button></section></main>}
 createRoot(document.getElementById('app')).render(<React.StrictMode><Fixture/></React.StrictMode>);
 `,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,outdir:'/tmp/episode-controls',format:'iife',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'auth-fixture',setup(build){build.onResolve({filter:/^@\/components\/Auth(Modal|State)Provider$|^@\/lib\/community-client$/},args=>({path:args.path,namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const useAuthState=()=>({user:{id:'fixture'},loading:false});export const useAuthModal=()=>({openAuth(){}});export const statusLabels={watching:'Смотрю',planned:'В планах',completed:'Просмотрено',dropped:'Брошено'};export const communityRequest=async()=>({});`,loader:'js'}));}}]});
 const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).text,css=bundle.outputFiles.find(f=>f.path.endsWith('.css')).text;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
 try{for(const[width,height]of[[1920,1080],[1366,768],[376,869]]){
 const page=await browser.newPage({viewport:{width,height}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://fixture.test/**', route=>{const url=new URL(route.request().url()); const file='public'+url.pathname; if(url.pathname.startsWith('/brand/icons/')&&fs.existsSync(file))return route.fulfill({contentType:'image/svg+xml',body:fs.readFileSync(file)});return route.fulfill({contentType:'text/html',body:'<body></body>'});});await page.goto('https://fixture.test/');
 await page.setContent(`<html><style>:root{--ab-ui-text:#eee;--ab-ui-muted:#aaa;--ab-ui-border:#47414f;--ab-ui-raised:#292530;--ab-ui-surface:#1c1922;--ab-ui-accent:#b7a1df}*{box-sizing:border-box}body{margin:0;background:#121016;color:#eee;font:14px sans-serif}main{max-width:1100px;margin:auto;padding:12px}h1{font-size:20px}button{font:inherit;min-height:44px;background:#292530;color:inherit;border:1px solid #47414f;border-radius:8px}button img{width:20px;height:20px}${css}</style><div id="app"></div></html>`);
 await page.addScriptTag({content:js});await page.getByLabel('Озвучка',{exact:true}).waitFor();
 if(process.env.EPISODE_BASELINE){await page.getByRole('button',{name:'Ещё настройки просмотра'}).click();await page.getByRole('button',{name:'Статус аниме в библиотеке'}).click();await page.screenshot({path:'/tmp/episode-controls-before-'+width+'.png',fullPage:true});await page.close();continue;}
 assert.equal(await page.locator('select').count(),0);
 await page.evaluate(()=>window.frame=document.querySelector('#frame'));
 const voice=page.getByRole('button',{name:'Озвучка',exact:true});await voice.click();
 await page.getByRole('listbox',{name:'Озвучка'}).waitFor();await page.keyboard.press('a');
 await page.getByRole('option',{name:'AniDUB'}).click();assert(await voice.textContent().then(x=>x.includes('AniDUB')));
 await voice.click();await page.keyboard.press('Escape');assert(await voice.evaluate(n=>n===document.activeElement));
 const settings=page.getByRole('button',{name:'Ещё настройки просмотра'});await settings.click();
 await page.getByRole('button',{name:'Источник видео',exact:true}).click();await page.getByRole('option',{name:'Kodik',exact:true}).click();
 const library=page.getByRole('button',{name:'Статус аниме в библиотеке'});await library.click();
 const dropped=page.getByRole('menuitemradio',{name:'Брошено'});await dropped.waitFor();
 assert(await dropped.evaluate(n=>{const r=n.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('[role=menuitemradio]')===n;}),'menu remains above overlapping card');
 await page.screenshot({path:'/tmp/episode-controls-'+width+'.png',fullPage:true});
 await page.keyboard.press('End');await page.keyboard.press('ArrowUp');await page.keyboard.press('Escape');
 assert(await library.evaluate(n=>n===document.activeElement));
 assert(await page.evaluate(()=>frame===document.querySelector('#frame')),'controls preserve iframe');
 assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'no horizontal overflow');
 assert.deepEqual(errors,[]);await page.close();}
 }finally{await browser.close();}console.log('PASS E1/E2: portal stacking, custom choices, Esc/focus, iframe continuity, responsive 1920/1366/376');
})().catch(e=>{console.error(e);process.exitCode=1});
