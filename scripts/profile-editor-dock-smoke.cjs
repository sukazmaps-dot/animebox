const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const read=p=>fs.readFileSync(p,'utf8');
const source=ts.transpileModule(read('lib/profile-editor-dock.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let css=[...read('app/layout.tsx').matchAll(/import '\.\/([^']+\.css)'/g)].map(m=>read('app/'+m[1]).replace(/@import[^;]+;/g,'')).join('\n');
css+='\n'+[...read('app/profile/layout.tsx').matchAll(/import '\.\.\/([^']+\.css)'/g)].map(m=>read('app/'+m[1])).join('\n');
function fixture(font,navHeight){
 return `<style>${css}</style>
 <style>body{margin:0}.profile-editor-v40__savebar :is(button,strong){font-size:${font}px!important}
 .lastCard{min-height:140px;padding:10px}</style>
 <main class="profile-editor-v13" data-editor-tab="profile" data-editor-layout="modal">
 <section class="profile-editor-v13__shell profile-editor-v40__shell">
 <header class="profile-editor-v13__header profile-editor-v40__header"><h1>Редактор</h1></header>
 <div class="profile-editor-v40__workbench"><nav class="profile-editor-v40__tiles"><button>Имя</button></nav>
 <div class="profile-editor-v40__stage">Профиль</div>
 <aside class="profile-editor-v40__popover"><header><h2>Настройки</h2></header>
 <fieldset class="profile-editor-v31__settings profile-editor-v40__panel-content">
 <div style="height:1450px">Настройки и цвета</div>
 <button class="lastCard">Последний пресет — доступен для нажатия</button>
 </fieldset></aside></div>
 <div class="profile-editor-v13__mobile-save profile-editor-v18__savebar profile-editor-v40__savebar is-dirty">
 <span class="profile-editor-v18__savebar-copy"><strong>Несохранённые изменения</strong></span>
 <button class="profile-editor-v18__reset">Сбросить</button><button>Сохранить изменения</button></div>
 </section></main>`;
}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});try{
const page=await browser.newPage();let checks=0;
for(const theme of ['dark','light'])for(const width of [320,360,390,412,560,768])
for(const font of [14,22])for(const navHeight of [70,94]){
 await page.setViewportSize({width,height:900});await page.setContent(fixture(font,navHeight));
 await page.evaluate(theme=>{document.documentElement.setAttribute('data-animebox-theme',theme);document.documentElement.classList.add('ab-profile-editor-open');},theme);
 await page.addScriptTag({content:`(()=>{const exports={};${source};window.stopDock=exports.observeProfileEditorDock(document.querySelector('.profile-editor-v40__savebar'));})()`});
 await page.waitForTimeout(50);
 await page.locator('.lastCard').scrollIntoViewIfNeeded();
 const boxes=await page.evaluate(()=>{
  const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,left:r.left,right:r.right}};
  const bar=document.querySelector('.profile-editor-v40__savebar');
  return {bar:box('.profile-editor-v40__savebar'),navPresent:document.querySelector('.mobile-nav')!==null,
  panel:box('.profile-editor-v40__popover'),last:box('.lastCard'),
  barVar:parseFloat(document.querySelector('.profile-editor-v13').style.getPropertyValue('--profile-editor-savebar-height')),
  position:getComputedStyle(bar).position,overflow:document.documentElement.scrollWidth>innerWidth+1};
 });
 const label=`${theme} ${width}px font=${font} nav=${navHeight}`;
 assert.equal(boxes.position,'absolute',label+' dock anchored within modal');
 assert.equal(boxes.navPresent,false,label+' real route unmounts the site navigation');
 assert(boxes.bar.bottom<=900+1&&boxes.bar.top>=0,label+' savebar within visible modal');
 assert(boxes.last.bottom<=boxes.bar.top+2,label+' last setting hidden behind savebar');
 assert(boxes.panel.bottom<=boxes.bar.top+2,label+' popover intersects savebar');
 assert(boxes.barVar>=boxes.bar.height-1,label+' measured dock height');
 assert(!boxes.overflow,label+' horizontal overflow');
 await page.evaluate(()=>window.stopDock());checks++;
}
console.log(`PASS: ${checks} modal dock layout combinations, settings scroll clearance, hidden global nav and measured height.`);
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
