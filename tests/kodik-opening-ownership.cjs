'use strict';

// Production Next prebuild inherits NODE_ENV=production, where React disables
// act/test-renderer. This isolated, non-shipping regression runs the React
// development renderer intentionally before importing any React modules.
process.env.NODE_ENV = 'development';

// Runtime regression for Kodik's provider-owned opening skip and late
// episode metadata. No network, iframe navigation or external player needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const {create} = require('react-test-renderer');
const {act} = React; // React 19: act is exposed by react, not react-test-renderer

const player = fs.readFileSync('components/AnimePlayer.tsx', 'utf8');
const kodik = fs.readFileSync('components/KodikPlayer.tsx', 'utf8');

// The host must never enqueue a second OP seek while Kodik owns its native
// skip control. Preserve automation for native HLS/direct video.
const requestStart = player.indexOf('const requestOpeningSkip = useCallback');
const requestEnd = player.indexOf('const registerExplicitSeek = useCallback', requestStart);
assert(requestStart > -1 && requestEnd > requestStart);
const requestBlock = player.slice(requestStart, requestEnd);
const ownerGuard = requestBlock.indexOf("if (mode === 'auto' && isKodik) return false;");
assert(ownerGuard >= 0 && ownerGuard < requestBlock.indexOf('player.seek(targetSeconds)'), 'Kodik auto-seek must be blocked before issuing provider command');
const sampleStart = player.indexOf('const handleTimeSample = useCallback');
const sampleEnd = player.indexOf('const skipOpening = useCallback', sampleStart);
const autoBranch = player.slice(sampleStart, sampleEnd).match(/if\s*\(\s*!watchTogetherMode\s*&&\s*smartSeekSupported\s*&&\s*!isKodik\s*&&\s*autoOpeningDecision\.safe/);
assert(autoBranch, 'time sample auto opening skip must exclude Kodik');
assert(player.includes('skipOpeningVisible && !watchTogetherMode && !isKodik'), 'Kodik already owns its native skip button');
assert(player.includes('onProviderSkip={watchSession.onProviderSkip}'), 'Kodik provider skip telemetry must remain attached');
assert(kodik.includes('if ((currentPositionRef.current ?? 0) > 5) return;'), 'late episode correction should never interrupt playing video');

const js = ts.transpileModule(kodik, {
  fileName: 'KodikPlayer.tsx',
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;
const mod = {exports:{}};
new Function('require', 'module', 'exports', js)(require,mod,mod.exports);
const KodikPlayer = mod.exports.default;

async function fixture(label, {beforePlayback}) {
  const subscribers = new Map();
  const commands = [];
  const providerSkips = [];
  const frameWindow = {postMessage(data, targetOrigin) {
    commands.push({method:data?.value?.method,params:data?.value,origin:targetOrigin});
  }};
  global.window = {
    addEventListener(type,handler) {subscribers.set(type,handler);},
    removeEventListener(type,handler) {if(subscribers.get(type)===handler) subscribers.delete(type);},
    setTimeout,clearTimeout,
  };
  const ref = React.createRef();
  let view;
  await act(async()=>{
    view = create(
      React.createElement(KodikPlayer,{
        src:'https://kodik.fixture/watch', episodeNumber:1, resumeSeconds:0,
        ref,
        onProviderSkip:signal=>providerSkips.push(signal),
      }),
      {createNodeMock: node => node.type==='iframe' ? {contentWindow:frameWindow} : null},
    );
  });
  const send=async(key,value)=>{
    const handler=subscribers.get('message');
    assert(handler, 'message listener attached');
    await act(async()=>handler({
      source:frameWindow,
      origin:'https://kodik.fixture',
      data:{key,value},
    }));
  };
  if(!beforePlayback) {
    await send('kodik_player_time_update',{currentTime:90,duration:1440});
    await send('kodik_player_skip_opening',{kind:'opening'});
    assert.equal(providerSkips.length,1,label+': native skip telemetry');
    assert.equal(providerSkips[0].kind,'opening');
    assert.equal(commands.filter(x=>x.method==='seek').length,0,label+': host must not seek upon native provider skip');
  }
  await send('kodik_player_current_episode',{episode:2});
  const forced=commands.filter(x=>x.method==='change_episode');
  assert.equal(forced.length,beforePlayback?1:0,label+': must reconcile only at startup, never during playback');
  if(beforePlayback) {
    assert.equal(forced[0].params.episode,1);
    await send('kodik_player_current_episode',{episode:2});
    assert.equal(commands.filter(x=>x.method==='change_episode').length,1,label+': initial correction only once');
  }
  await act(async()=>view.unmount());
  assert.equal(subscribers.has('message'),false,label+': cleanup');
  delete global.window;
}

(async()=>{
  await fixture('late opening skip', {beforePlayback:false});
  await fixture('startup mismatch', {beforePlayback:true});
  console.log('PASS Kodik opening ownership: no competing host OP seek; provider skip is telemetry-only; late mismatch cannot restart; initial correction once.');
})().catch(err=>{console.error(err);process.exitCode=1;});
