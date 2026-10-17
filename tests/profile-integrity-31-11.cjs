// Patch 31.11 — exercise real per-account persistence and editor Save contracts.
// Safe offline test; it never touches real IndexedDB, profile data or Supabase.
process.env.NODE_ENV = 'development';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const React=require('react');
const {create,act}=require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT=true;

function transpile(file,customRequire=require) {
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const mod={exports:{}};
 new Function('require','module','exports',code)(customRequire,mod,mod.exports);
 return mod.exports;
}
const draftLib=transpile('lib/profile-editor-draft.ts');
const {runProfileDraftOperation,draftKey}=draftLib;
const base={username:'original',bio:'initial',bannerColor:'#70618c',bannerColorMode:'auto',bannerStyle:'soft',frame:null,premium:null,avatar:null,banner:null,removeAvatar:false,removeBanner:false};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function testQueue() {
 const sequence=[];
 let unblock;
 const gate=new Promise(resolve=>{unblock=resolve;});
 let current='initial';
 const old=runProfileDraftOperation('account-A',async()=>{sequence.push('old-start');await gate;current='old';sequence.push('old-done');});
 const clear=runProfileDraftOperation('account-A',async()=>{sequence.push('clear');current=null;});
 const updated=runProfileDraftOperation('account-A',async()=>{sequence.push('updated');current='updated';});
 let other=false;
 await runProfileDraftOperation('account-B',async()=>{other=true;});
 assert.equal(other,true,'unrelated account must not wait on A');
 assert.deepEqual(sequence,['old-start'],'serialized operations must not overlap');
 unblock();
 await Promise.all([old,clear,updated]);
 assert.equal(current,'updated','later changes must win over earlier clear/write');
 assert.deepEqual(sequence,['old-start','old-done','clear','updated']);
 await assert.rejects(runProfileDraftOperation('account-A',async()=>{throw Error('simulated failed storage');}),/simulated failed/);
 assert.equal(await runProfileDraftOperation('account-A',async()=>42),42,'queue must recover after rejection');
}

async function testHook() {
 global.window={addEventListener(){},removeEventListener(){}};
 global.document={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
 global.requestAnimationFrame=fn=>setTimeout(fn,0);
 global.cancelAnimationFrame=clearTimeout;
 let persisted=null,writeStarted;
 let releaseWrite;
 const holdWrite=new Promise(resolve=>{releaseWrite=resolve;});
 const onStart=new Promise(resolve=>{writeStarted=resolve;});
 let firstWrite=true;
 const fakeStorage=async (id,operation,value)=>{
   assert.equal(id,'test-user');
   if(operation==='read')return persisted;
   if(operation==='write'){
     if(firstWrite){firstWrite=false;writeStarted();await holdWrite;}
     persisted={version:1,userId:id,updatedAt:Date.now(),draft:value};
   }
   if(operation==='delete')persisted=null;
   return null;
 };
 const hook=transpile('hooks/useProfileEditorHistory.ts',id=>
   id==='react'?React:
   id==='@/lib/profile-editor-draft'?{...draftLib,profileDraftStorage:fakeStorage}:
   require(id));
 let api,current,setDraft;
 function Harness(){
   const [value,change]=React.useState(base);
   setDraft=change;current=value;
   api=hook.useProfileEditorHistory({userId:'test-user',ready:true,baseline:'server',draft:value,dirty:draftKey(value)!==draftKey(base),onApply:change});
   return null;
 }
 let tree;
 await act(async()=>{tree=create(React.createElement(Harness));await delay(20);});
 await act(async()=>{setDraft({...base,bio:'unsaved'});});
 await act(async()=>{await onStart;});
 // An old IndexedDB write is still in flight as the user presses Save.
 // Commit boundary invalidates queued stale writes and orders delete last.
 await act(async()=>{api.discard();setDraft(base);});
 releaseWrite();
 await act(async()=>{await delay(70);});
 assert.equal(persisted,null,'successful save clears even after in-flight older write');
 await act(async()=>{setDraft({...base,bio:'new edit after save'});});
 await act(async()=>{await delay(690);});
 assert.equal(persisted?.draft.bio,'new edit after save','new edits after Save persist normally');
 await act(async()=>tree.unmount());
 delete global.window;delete global.document;
 delete global.requestAnimationFrame;delete global.cancelAnimationFrame;
}

(async()=>{
 const src=fs.readFileSync('components/profile/ProfileEditorClient.tsx','utf8');
 assert(src.includes('const savingRef = useRef(false)'),'requires synchronous Save lock');
 assert(src.includes('if (!profile || !user || savingRef.current || editorBusy || !dirty) return;'),'Save must reject simultaneous call');
 assert(src.includes('savingRef.current = true;'),'Save must acquire mutex before upload');
 assert(/finally\s*\{\s*savingRef\.current = false;\s*setSaving\(false\);/s.test(src),'mutex always released in finally');
 assert(src.includes('data-editor-save disabled={(!dirty && !needsPremiumCTA) || editorBusy}'),'Save disabled while crop/modal/busy');
 assert.equal((src.match(/await discardPrivateProfileMedia\(pendingMedia\)/g)||[]).length,1,'only one cleanup path on profile POST errors');
 await testQueue();
 await testHook();
 console.log('PASS Profile 31.11 integrity: synchronous Save lock, deterministic per-user storage, in-flight stale draft deletion, new edit persistence and storage failure recovery.');
})().catch(err=>{console.error(err);process.exitCode=1;});
