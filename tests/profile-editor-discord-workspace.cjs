process.env.NODE_ENV='development';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server'),{act,create}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const cache=new Map();
function compile(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;}
function load(file){
 if(cache.has(file))return cache.get(file);
 if(file.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>key})};
 const mod={exports:{}};cache.set(file,mod.exports);
 new Function('require','module','exports',compile(fs.readFileSync(file,'utf8')))(id=>{
  if(id==='@/components/profile/ProfileFrameOverlay')return {__esModule:true,default:()=>null};
  if(id.startsWith('@/')){const base=id.slice(2);return load(base+(fs.existsSync(base+'.tsx')?'.tsx':'.ts'));}
  if(id.startsWith('./'))return load(path.join(path.dirname(file),id));
  return require(id);
 },mod,mod.exports);
 return mod.exports;
}
const empty={layout:[],favorites:[],watching:[],ratings:[],genres:[],activity:[],ratingSummary:{count:0,average:null}};
(async()=>{
 const Viewport=load('components/profile/ProfileEditorViewport.tsx').default;
 assert.equal(renderToStaticMarkup(React.createElement(Viewport,null,'editor')),'','SSR must not read document or render a second workspace');
 const Preview=load('components/profile/ProfileEditorLivePreview.tsx').default;
 const html=renderToStaticMarkup(React.createElement(Preview,{full:true,createdAt:'2021-02-19T00:00:00Z',username:'Имя',bio:'Полное описание',avatarUrl:'avatar.webp',bannerUrl:null,bannerColor:'#70618c',bannerStyle:'soft',premiumActive:false,onNavigate:()=>{}}));
 assert(html.includes('Обо мне')&&html.includes('Полное описание')&&html.includes('2021'));
 assert(!html.includes('✦ Premium'),'free account gets no fabricated badge');
 const Board=load('components/profile/ProfileEditorShowcasePreview.tsx').default;
 const props={loading:false,error:'',onConfigure:()=>{},onRetry:()=>{}};
 const board=renderToStaticMarkup(React.createElement(Board,{...props,data:{...empty,layout:[{key:'favorites',visible:true,position:0},{key:'ratings',visible:false,position:1}],favorites:[{animeId:1,title:'Настоящий тайтл',posterUrl:null,slug:null,genres:[],totalEpisodes:12,position:0}]}}));
 assert(board.includes('Настоящий тайтл')&&!board.includes('Мои оценки'),'board must honor saved visibility');
 assert(renderToStaticMarkup(React.createElement(Board,{...props,data:empty})).includes('Настроить витрину'));
 assert(renderToStaticMarkup(React.createElement(Board,{...props,data:null,loading:true})).includes('Загружаем витрину'));
 assert(renderToStaticMarkup(React.createElement(Board,{...props,data:null,error:'Ошибка загрузки'})).includes('role="alert"'));
 // Execute the actual workspace fetch effect, including its cleanup and cache guard.
 const client=fs.readFileSync('components/profile/ProfileEditorClient.tsx','utf8');
 const ast=ts.createSourceFile('client.tsx',client,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let effect;
 function visit(node){if(ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&node.expression.expression.getText(ast)==='useEffect'&&node.getText(ast).includes("'profile-widgets'"))effect=node.getText(ast);ts.forEachChild(node,visit);}
 visit(ast);assert(effect,'showcase fetch effect missing');
 const holder={};let calls=0,resolve;
 const pending=new Promise(done=>resolve=done);
 const harnessSource=[
  'const {useState,useEffect,useRef}=React;',
  'return function Harness(){',
  "const user={id:'account-A'};const [activeTab,setActiveTab]=useState('profile');",
  'const [showcase,setShowcase]=useState(null);const [showcaseLoading,setShowcaseLoading]=useState(false);',
  "const [showcaseError,setShowcaseError]=useState('');const [showcaseMaxFavorites,setShowcaseMaxFavorites]=useState(6);",
  'const [showcaseReloadKey,setShowcaseReloadKey]=useState(0);const showcaseRequestRef=useRef(null);',
  effect,
  'holder.current={setActiveTab,showcase,showcaseLoading,showcaseError,showcaseMaxFavorites};return null;}'
 ].join('\n');
 const Harness=new Function('React','communityRequest','holder',compile(harnessSource))(React,()=>{calls++;return pending;},holder);
 let tree;
 await act(async()=>{tree=create(React.createElement(React.StrictMode,null,React.createElement(Harness)));});
 assert.equal(calls,1,'StrictMode duplicates showcase request');
 await act(async()=>holder.current.setActiveTab('style'));
 await act(async()=>holder.current.setActiveTab('profile'));
 assert.equal(calls,1,'in-flight profile/showcase navigation duplicates request');
 await act(async()=>resolve({ok:true,widgets:empty,capabilities:{maxFavorites:12}}));
 assert.equal(holder.current.showcase,empty);assert.equal(holder.current.showcaseMaxFavorites,12);
 await act(async()=>holder.current.setActiveTab('showcase'));
 assert.equal(calls,1,'cached board is fetched again by showcase editor');
 await act(async()=>tree.unmount());
 console.log('PASS Discord profile workspace: SSR-safe portal, full identity, true status, private widget visibility, empty/error/loading and one in-flight showcase request.');
})().catch(error=>{console.error(error);process.exit(1)});
