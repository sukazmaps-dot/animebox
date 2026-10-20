'use strict';

// Regression: an end/visibility flush must not disappear when a heartbeat
// is in flight. Run against the real hook, with only its network/React host
// environment substituted. No external provider or database is contacted.
process.env.NODE_ENV = 'development';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const {create} = require('react-test-renderer');
const {act} = React;

const source = fs.readFileSync('components/useWatchSession.ts','utf8');
const output = ts.transpileModule(source,{
  fileName:'components/useWatchSession.ts',
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
}).outputText;
const mocks={
  '@/lib/tracker-client':{invalidateTrackerSnapshot(){}},
  '@/lib/community-profile-cache':{invalidateCommunityProfile(){}},
  '@/lib/product-events-client':{trackRecommendationWatchProgress(){}},
};
const exportsModule={exports:{}};
new Function('require','module','exports',output)(
  id=>mocks[id]||require(id),exportsModule,exportsModule.exports,
);
const {useWatchSession}=exportsModule.exports;

const response=value=>({ok:true,json:async()=>value});
const previous={
  window:global.window,
  document:global.document,
  fetch:global.fetch,
  CustomEvent:global.CustomEvent,
};
global.CustomEvent=class CustomEvent{
  constructor(type,options){this.type=type;this.detail=options?.detail;}
};
global.document={
  visibilityState:'visible',
  addEventListener(){},
  removeEventListener(){},
};
global.window={
  setInterval:()=>1,clearInterval(){},
  addEventListener(){},removeEventListener(){},
  dispatchEvent(){},
};
let resolveFirst;
const requests=[];
global.fetch=async(_url,options)=>{
  const body=JSON.parse(options.body);
  requests.push(body);
  if(body.action==='start')return response({sessionId:'test-session'});
  if(body.action==='end')return response({});
  if(body.action==='heartbeat'){
    if(body.seq===1){
      return new Promise(resolve=>{resolveFirst=resolve;});
    }
    return response({
      coverageMs:body.positionMs,
      activeMs:body.positionMs,
      durationMs:100000,
      completed:false,
      newlyCompleted:false,
    });
  }
  throw new Error('Unexpected watch request: '+body.action);
};

async function main(){
  let hook;
  function Harness(){
    hook=useWatchSession({
      enabled:true,userId:'user-test',animeId:123,
      episode:1,requiredEpisodes:12,sourceUrl:'https://kodik.fixture/embed',
    });
    return null;
  }
  let view;
  await act(async()=>{
    view=create(React.createElement(Harness));
  });
  await act(async()=>{
    hook.onSample({positionSeconds:0,durationSeconds:100});
    hook.onSample({positionSeconds:2,durationSeconds:100});
    await Promise.resolve();
  });
  assert.equal(requests.filter(x=>x.action==='start').length,1,'one session start');

  let first;
  await act(async()=>{
    hook.onSample({positionSeconds:3,durationSeconds:100});
    first=hook.flushProgress();
    await Promise.resolve();
  });
  assert.equal(requests.filter(x=>x.action==='heartbeat').length,1,'first sync is in flight');

  let final;
  await act(async()=>{
    hook.onSample({positionSeconds:5,durationSeconds:100});
    final=hook.flushProgress();
    await Promise.resolve();
  });
  assert.equal(requests.filter(x=>x.action==='heartbeat').length,1,'must serialize heartbeat sequence');
  assert.equal(typeof resolveFirst,'function','first heartbeat can be released');

  await act(async()=>{
    resolveFirst(response({
      coverageMs:3000,activeMs:3000,durationMs:100000,
      completed:false,newlyCompleted:false,
    }));
    await Promise.all([first,final]);
  });
  const heartbeats=requests.filter(x=>x.action==='heartbeat');
  assert.equal(heartbeats.length,2,'final position must be synced after in-flight heartbeat');
  assert.deepEqual(heartbeats.map(x=>x.seq),[1,2],'sequence must remain consecutive');
  assert.deepEqual(heartbeats.map(x=>x.positionMs),[3000,5000],'send latest final position');

  await act(async()=>view.unmount());
  assert.equal(requests.filter(x=>x.action==='end').length,1,'end session once');
  console.log('PASS watch session: in-flight heartbeat + forced final flush preserves ordered last position');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{
  for(const [key,value] of Object.entries(previous)){
    if(value===undefined)delete global[key];else global[key]=value;
  }
});
