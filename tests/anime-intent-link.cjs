const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const calls = [];
const timers = new Map();
let timerId = 0;
let fail = false;
const navigator = { onLine: true, connection: {} };
const document = { visibilityState: 'visible' };
const moduleRef = { exports: {} };
const source = fs.readFileSync('components/AnimeIntentLink.tsx', 'utf8');
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, {
  exports: moduleRef.exports, module: moduleRef, navigator, document,
  setTimeout: (fn, delay) => { assert.equal(delay, 180); timers.set(++timerId, fn); return timerId; },
  clearTimeout: id => timers.delete(id),
  require: name => name === 'next/link' ? function Link(props) { return React.createElement('a', props); }
    : name === 'next/navigation' ? { useRouter: () => ({ prefetch: href => { if (fail) throw Error('offline'); calls.push(href); } }) }
    : require(name),
});
const Component = moduleRef.exports.default;
const event = (extra = {}) => ({ defaultPrevented: false, pointerType: 'mouse', currentTarget: { matches: () => true }, ...extra });
const flush = async () => act(async () => { const jobs = [...timers.values()]; timers.clear(); jobs.forEach(fn => fn()); });
(async () => {
  let tree;
  let clicks = 0;
  let enters = 0;
  async function mount(href = '/anime/1') {
    await act(async () => { tree = create(React.createElement(Component, {
      href, target: '_blank', 'aria-label': 'Title', onClick: () => clicks++, onPointerEnter: () => enters++, children: 'Title',
    })); });
  }
  const props = () => tree.root.findByType('a').props;
  await mount();
  assert.equal(props().prefetch, false);
  assert.equal(props().href, '/anime/1');
  assert.equal(props().target, '_blank');
  assert.equal(props()['aria-label'], 'Title');
  await flush(); assert.equal(calls.length, 0, 'mount/viewport alone must not prefetch');
  props().onPointerEnter(event()); props().onPointerLeave(event());
  await flush(); assert.equal(calls.length, 0, 'fast pointer crossing cancels');
  props().onPointerEnter(event({ pointerType: 'touch' }));
  props().onFocus(event({ currentTarget: { matches: () => false } }));
  await flush(); assert.equal(calls.length, 0, 'touch/focus from tapping must not warm');
  props().onPointerEnter(event()); await flush();
  assert.deepEqual(calls, ['/anime/1']);
  props().onFocus(event()); assert.equal(calls.length, 1, 'same link deduplicates');
  props().onClick(); assert.equal(clicks, 1, 'analytics callback survives'); assert.equal(enters, 3);
  props().onPointerEnter(event());
  await act(async () => tree.update(React.createElement(Component, { href: '/anime/2' })));
  await flush(); assert.equal(calls.length, 1, 'href change cancels old route timer');
  props().onFocus(event()); assert.equal(calls.at(-1), '/anime/2', 'new href resets intent');
  await act(async () => tree.unmount());
  for (const blocked of ['saveData', 'slow-2g', '2g', '3g', 'hidden', 'offline']) {
    navigator.connection = blocked === 'saveData' ? { saveData: true } : { effectiveType: blocked };
    navigator.onLine = blocked !== 'offline'; document.visibilityState = blocked === 'hidden' ? 'hidden' : 'visible';
    await mount('/anime/blocked'); const before = calls.length;
    props().onFocus(event()); assert.equal(calls.length, before, blocked);
    await act(async () => tree.unmount());
  }
  navigator.connection = {}; navigator.onLine = true; document.visibilityState = 'visible';
  await mount(); props().onPointerEnter(event()); await act(async () => tree.unmount());
  await flush(); assert.equal(timers.size, 0, 'unmount cancels pending work');
  await mount();
  for (const cancel of ['onPointerCancel', 'onBlur']) {
    props().onPointerEnter(event()); props()[cancel](event());
    const before = calls.length; await flush(); assert.equal(calls.length, before, cancel);
  }
  await act(async () => tree.unmount());
  await mount(); fail = true; assert.doesNotThrow(() => props().onFocus(event()));
  fail = false; const before = calls.length; props().onFocus(event()); assert.equal(calls.length, before + 1, 'failed speculation can retry');
  props().onPointerEnter(event({ defaultPrevented: true })); assert.equal(timers.size, 0);
  await act(async () => tree.unmount());
  console.log('PASS intent prefetch: idle, dwell, cancellation, touch, keyboard, network policy, callbacks, href changes and cleanup');
})().catch(error => { console.error(error); process.exitCode = 1; });
