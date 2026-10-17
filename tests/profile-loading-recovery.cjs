process.env.NODE_ENV='development';
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),React=require('react');
const {act,create}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
function load(file,imports={}){const mod={exports:{}};new Function('require','module','exports',compile(fs.readFileSync(file,'utf8')))(id=>id in imports?imports[id]:require(id),mod,mod.exports);return mod.exports;}
const deadline=load('lib/load-deadline.ts');
const realTimeout=global.setTimeout,realClear=global.clearTimeout;
let now=0,next=0;const timers=new Map();
global.setTimeout=(fn,ms=0)=>{const id=++next;timers.set(id,{fn,at:now+ms});return id;};
global.clearTimeout=id=>timers.delete(id);
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
async function advance(ms){now+=ms;for(const [id,t] of [...timers])if(t.at<=now){timers.delete(id);t.fn();}await flush();}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const storage=new Map(),events=new Map();
global.window={setTimeout:global.setTimeout,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},addEventListener:(k,f)=>events.set(k,f),removeEventListener:(k,f)=>{if(events.get(k)===f)events.delete(k);}};
(async()=>{
 // A permanently pending SDK lock is bounded even before its fetch observes abort.
 let signal;const wait=deadline.withLoadDeadline(s=>{signal=s;return new Promise(()=>{});});
 const timed=assert.rejects(wait,/LOAD_DEADLINE_EXCEEDED/);await flush();await advance(8000);await timed;assert(signal.aborted);
 const failed=deadline.withLoadDeadline(()=>Promise.reject(new Error('network')));await assert.rejects(failed,/network/);assert.equal(timers.size,0);
 const parent=new AbortController();const cancelled=deadline.withLoadDeadline(()=>new Promise(()=>{}),8000,parent.signal);const cancellation=assert.rejects(cancelled,{name:'AbortError'});parent.abort();await cancellation;assert.equal(timers.size,0);

 // Mount the real AuthStateProvider and read its public context through a child.
 let sessionRequest=deferred(),authCallback,authState,unsubscribed=0;
 const user={id:'A',email:'a@example.test',user_metadata:{}};
 const client={auth:{getSession:()=>sessionRequest.promise,getUser:()=>new Promise(()=>{}),onAuthStateChange:callback=>{authCallback=callback;return {data:{subscription:{unsubscribe:()=>unsubscribed++}}};}},from:()=>{throw Error('unexpected profile read');}};
 const auth=load('components/AuthStateProvider.tsx',{
  '@/lib/supabase/client':{createClient:()=>client},'@/lib/load-deadline':deadline,
  '@/lib/profile-appearance':{resolveProfileAppearance:()=>({})},'@/lib/profile-live-sync':{PROFILE_APPEARANCE_CHANGED_EVENT:'appearance'},
  '@/lib/auth-events':{AUTH_CHANGED_EVENT:'auth'},'@/lib/telegram-auto-login':{TELEGRAM_AUTOLOGIN_CHANGED_EVENT:'tg',enableTelegramAutoLogin:()=>{},isTelegramAutoLoginDisabled:()=>false,isTelegramMiniAppRuntime:()=>false},
 });
 function Probe(){authState=auth.useAuthState();return null;}
 let tree;await act(async()=>{tree=create(React.createElement(auth.AuthStateProvider,null,React.createElement(Probe)));await flush();});
 assert.equal(authState.loading,true);await act(async()=>advance(8000));assert.equal(authState.loading,false);assert(authState.sessionError);
 // A response arriving after the deadline cannot quietly restore stale identity.
 await act(async()=>{sessionRequest.resolve({data:{session:{user}},error:null});await flush();});assert.equal(authState.user,null);
 sessionRequest=deferred();await act(async()=>{authState.retrySession();await flush();});assert.equal(authState.loading,true);assert.equal(authState.sessionError,'');
 await act(async()=>{sessionRequest.resolve({data:{session:null},error:null});await flush();});assert.equal(authState.loading,false);assert.equal(authState.user,null);
 // A real sign-in event remains usable after a timed-out getSession.
 await act(async()=>{authCallback('SIGNED_IN',{user});await advance(0);});assert.equal(authState.user.id,'A');assert.equal(authState.sessionError,'');
 await act(async()=>advance(8000));assert.equal(authState.user.id,'A','background timeout must not sign out');
 await act(async()=>authCallback('SIGNED_OUT',null));assert.equal(authState.user,null);
 sessionRequest=deferred();await act(async()=>{authState.retrySession();await flush();});
 await act(async()=>authCallback('SIGNED_OUT',null));await act(async()=>{sessionRequest.resolve({data:{session:{user}},error:null});await flush();});assert.equal(authState.user,null,'stale hydrate must not undo sign-out');
 await act(async()=>tree.unmount());assert(unsubscribed>=2);assert.equal(events.size,0);assert.equal(timers.size,0);

 // Execute the actual editor loading effect, including cleanup and retry dependencies.
 const source=fs.readFileSync('components/profile/ProfileEditorClient.tsx','utf8');const ast=ts.createSourceFile('editor.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let effect;
 function visit(n){if(ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(ast)==='useEffect'&&n.getText(ast).includes(".from('profiles')"))effect=n.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert(effect);
 let state,cached=null,reads=[],redirects=[];
 const db={from:()=>{const request=deferred(),q={select:()=>q,eq:(_,id)=>{request.id=id;return q;},abortSignal:s=>{request.signal=s;return q;},single:()=>{reads.push(request);return request.promise;}};return q;}};
 const harness=`const {useState,useEffect}=React;return function Harness({id='A',authLoading=false,sessionError=''}){
 const userId=id,supabase=db,router=stableRouter;
 const [profile,setProfile]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[profileLoadAttempt,setProfileLoadAttempt]=useState(0);
 const [username,setUsername]=useState(''),[bio,setBio]=useState(''),[bannerColor,setBannerColor]=useState('#70618c'),[bannerColorMode,setBannerColorMode]=useState('auto'),[bannerStyle,setBannerStyle]=useState('soft');
 ${effect}
 expose({profile,loading,error,username,bio,bannerColor,bannerColorMode,bannerStyle,setProfileLoadAttempt,setUsername});return null;}`;
 const stableRouter={replace:url=>redirects.push(url)};
 const Harness=new Function('React','db','stableRouter','withLoadDeadline','readProfileCache','saveProfileCache','normalizeBannerStyle','expose',compile(harness))(React,db,stableRouter,deadline.withLoadDeadline,()=>cached,()=>{},v=>v??'soft',v=>state=v);
 async function mount(props){await act(async()=>{tree=create(React.createElement(Harness,props));await flush();});}
 await mount();assert.equal(state.loading,true);const old=reads.at(-1);await act(async()=>advance(8000));assert.equal(state.loading,false);assert(state.error);assert(old.signal.aborted);
 await act(async()=>{state.setProfileLoadAttempt(v=>v+1);await flush();});assert.equal(state.loading,true);const retry=reads.at(-1);
 await act(async()=>{retry.resolve({data:{id:'A',username:'Fresh',bio:'bio'},error:null});await flush();});assert.equal(state.username,'Fresh');assert.equal(state.loading,false);
 await act(async()=>{old.resolve({data:{id:'A',username:'Stale'},error:null});await flush();});assert.equal(state.username,'Fresh');
 await act(async()=>tree.unmount());
 cached={id:'A',username:'Cache',bio:'cached',banner_color:'#112233',banner_color_mode:'manual',banner_style:'solid'};
 await mount();assert.equal(state.loading,false);assert.equal(state.bannerColor,'#112233');assert.equal(state.bannerStyle,'solid');
 await act(async()=>state.setUsername('Unsaved edit'));await act(async()=>{reads.at(-1).resolve({data:{...cached,username:'Server'},error:null});await flush();});assert.equal(state.username,'Unsaved edit','cache refresh overwrites edits');
 await act(async()=>tree.unmount());
 cached=null;await mount();const accountA=reads.at(-1);await act(async()=>{tree.update(React.createElement(Harness,{id:'B'}));await flush();});assert(accountA.signal.aborted);
 await act(async()=>{accountA.resolve({data:{id:'A',username:'A'},error:null});reads.at(-1).resolve({data:{id:'B',username:'B'},error:null});await flush();});assert.equal(state.profile.id,'B');
 await act(async()=>tree.unmount());
 await mount({id:null,sessionError:'auth failed'});assert.equal(redirects.length,0,'auth timeout must not silently redirect to login');await act(async()=>tree.unmount());
 await mount();await act(async()=>{reads.at(-1).reject(new Error('offline'));await flush();});assert.equal(state.loading,false);assert(state.error);await act(async()=>tree.unmount());assert.equal(timers.size,0);

 // Concurrent parent/Studio appearance reads share one bounded fetch per account.
 const savedFetch=global.fetch;let fetches=[];
 global.fetch=(_url,options)=>{const d=deferred();d.signal=options.signal;fetches.push(d);return d.promise;};
 const reader=load('lib/profile-editor-read-client.ts',{'@/lib/load-deadline':deadline});
 const readA=reader.readProfileEditorAppearance('A'),readA2=reader.readProfileEditorAppearance('A');assert.equal(readA,readA2);await flush();assert.equal(fetches.length,1);
 fetches[0].resolve({ok:true,json:async()=>({profile:{id:'A'},allowed:true,settings:{theme:'dark'}})});assert.equal((await readA).allowed,true);
 const readB=reader.readProfileEditorAppearance('B');const readBError=assert.rejects(readB,/LOAD_DEADLINE_EXCEEDED/);await flush();await advance(8000);await readBError;assert(fetches.at(-1).signal.aborted);
 const readAgain=reader.readProfileEditorAppearance('B');await flush();fetches.at(-1).resolve({ok:true,json:async()=>({profile:{id:'A'}})});await assert.rejects(readAgain,/PROFILE_ACCOUNT_MISMATCH/);
 global.fetch=savedFetch;

 // Execute Studio's real effect: late initialSettings used to leave allowed=null forever.
 const studioSource=fs.readFileSync('components/premium/PremiumStudioClient.tsx','utf8');const studioAst=ts.createSourceFile('studio.tsx',studioSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let studioEffect;
 function findStudio(n){if(ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(studioAst)==='useEffect'&&n.getText(studioAst).includes('readProfileEditorAppearance('))studioEffect=n.getText(studioAst);ts.forEachChild(n,findStudio);}findStudio(studioAst);assert(studioEffect);
 let studioState,appearanceRequest=deferred(),appearanceCalls=0;
 const defaults={theme:'default'};
 const studioHarness=`const {useState,useEffect,useRef}=React;return function Studio({initialSettings=null,initialAllowed=null,studioUserId='A',authLoading=false,sessionError=''}){
 const [settings,setSettings]=useState(initialSettings??DEFAULT_PREMIUM_STUDIO_SETTINGS),[savedSettings,setSavedSettings]=useState(initialSettings??DEFAULT_PREMIUM_STUDIO_SETTINGS);
 const [allowed,setAllowed]=useState(initialSettings?Boolean(initialAllowed):null),[loadError,setLoadError]=useState(''),[loadAttempt,setLoadAttempt]=useState(0);
 const hydratedOwner=useRef(null);
 ${studioEffect}
 expose({settings,savedSettings,allowed,loadError,setLoadAttempt,setSettings});return null;}`;
 const Studio=new Function('React','readProfileEditorAppearance','DEFAULT_PREMIUM_STUDIO_SETTINGS','expose',compile(studioHarness))(React,()=>{appearanceCalls++;return appearanceRequest.promise;},defaults,v=>studioState=v);
 await act(async()=>{tree=create(React.createElement(Studio));await flush();});assert.equal(studioState.allowed,null);
 await act(async()=>{tree.update(React.createElement(Studio,{initialSettings:{theme:'late'},initialAllowed:true}));await flush();});assert.equal(studioState.allowed,true);assert.equal(studioState.settings.theme,'late');
 await act(async()=>{appearanceRequest.resolve({allowed:false,settings:{theme:'stale'}});await flush();});assert.equal(studioState.allowed,true,'superseded request overrides late verified props');
 await act(async()=>studioState.setSettings({theme:'unsaved'}));await act(async()=>{tree.update(React.createElement(Studio,{initialSettings:{theme:'remote'},initialAllowed:true}));await flush();});assert.equal(studioState.settings.theme,'unsaved');await act(async()=>tree.unmount());
 appearanceRequest=deferred();await act(async()=>{tree=create(React.createElement(Studio));await flush();});await act(async()=>{appearanceRequest.reject(new Error('timeout'));await flush();});assert(studioState.loadError);assert.equal(studioState.allowed,null,'network error must not mean no Premium');
 appearanceRequest=deferred();await act(async()=>{studioState.setLoadAttempt(v=>v+1);await flush();});assert.equal(studioState.loadError,'');await act(async()=>{appearanceRequest.resolve({allowed:true,settings:{theme:'recovered'}});await flush();});assert.equal(studioState.allowed,true);assert.equal(studioState.settings.theme,'recovered');await act(async()=>tree.unmount());
 assert(appearanceCalls>=3);assert.equal(timers.size,0);
 console.log('PASS actual auth and editor recovery: pending/rejected requests, deadlines, retry, late replies, sign-out, background verification, cached appearance, unsaved edits, account switch, cleanup, Studio late props, request dedupe, Premium error/retry and unsaved styles.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{global.setTimeout=realTimeout;global.clearTimeout=realClear;});
