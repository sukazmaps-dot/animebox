const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const rq=require('module').createRequire(path.join(process.cwd(),'package.json'));
const postcss=rq('postcss'),local=rq('next/dist/compiled/postcss-modules-local-by-default'),scope=rq('next/dist/compiled/postcss-modules-scope');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const Module=require('node:module'),ts=rq('typescript'),originalResolve=Module._resolveFilename;
Module._resolveFilename=function(name,...args){return originalResolve.call(this,name.startsWith('@/')?path.resolve(name.slice(2)):name,...args);};
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {resolveAvatarIdentityVisuals}=require(path.join(process.cwd(),'lib/avatar-identity.ts'));
const casesInput=[{}, {role:'owner'}, ...['supporter','premium','patron'].map(tier=>({sponsor:{tier}})), {profileFrameKey:'milestone-lv50-crimson-sigil'},{profileFrameKey:'league-top10'}];
(async()=>{
let css='';for(const [file,prefix] of [['components/chat/GlobalChatV11Client.module.css','c'],['components/profile/ProfilePreview.module.css','p']]){
const r=await postcss([local(),scope({generateScopedName:n=>prefix+'_'+n})]).process(fs.readFileSync(file,'utf8'),{from:file});r.root.walkRules(':export',n=>n.remove());css+=r.root.toString();}
const browser=await chromium.launch({...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {}),args:['--no-sandbox'],headless:true});
try{const page=await browser.newPage();let cases=0;
for(const width of [320,390,768,1440,1920])for(const zoom of [1,1.25,1.5])for(const input of casesInput){
const visual=resolveAvatarIdentityVisuals(input),kind=visual.dataFrameKey,avatarScale=visual.avatarScale,frameScale=visual.identityFrameScale;
await page.setViewportSize({width,height:900});
await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;zoom:${zoom}}${css}</style><div class="c_messages"><article class="c_message"><button class="p_trigger c_avatarWrap"><span class="c_avatarCanvas"><span class="c_avatarCrop" style="inset:${(1-avatarScale)*50}%"><img class="c_avatar" style="transform:scale(1.5)"></span>${kind==='none'?'':`<img class="c_frame" style="transform:translate(-50%,-50%) scale(${frameScale})">`}</span></button><div class="c_messageBody"><div class="c_meta">ghoul cat · Владелец</div><p>Текст сообщения с цитатой и длинной строкой</p></div></article></div>`);
const g=await page.evaluate(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,cx:r.x+r.width/2,cy:r.y+r.height/2}};return{root:box('.c_avatarCanvas'),crop:box('.c_avatarCrop'),frame:document.querySelector('.c_frame')?box('.c_frame'):null,text:box('.c_messageBody'),overflow:document.documentElement.scrollWidth>innerWidth}});
assert(Math.abs(g.root.cx-g.crop.cx)<.6&&Math.abs(g.root.cy-g.crop.cy)<.6,'avatar off-center');
if(g.frame){assert(Math.abs(g.root.cx-g.frame.cx)<.6&&Math.abs(g.root.cy-g.frame.cy)<.6,'frame off-center');assert(g.frame.right<g.text.x,'frame overlaps text');}
assert(!g.overflow,'horizontal overflow');cases++;
}
console.log('PASS:',cases,'chat geometry fixtures: 7 frame types, 5 widths, 3 zooms; aligned centers, crop-independent frame, no overlap');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
