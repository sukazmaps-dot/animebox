const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
const refs = [], states = [], effects = [], frames = [];
let refIndex = 0, stateIndex = 0;
const react = {
  Children: { toArray: x => x },
  useRef(value) { return refs[refIndex++] ??= { current: value }; },
  useState(value) {
    const index = stateIndex++;
    if (!(index in states)) states[index] = typeof value === 'function' ? value() : value;
    return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
  },
  useMemo: fn => fn(), useCallback: fn => fn,
  useEffect: fn => effects.push(fn),
};
const jsx = (type, props) => ({ type, props });
const styles = new Proxy({}, { get: (_, key) => key });
const code = ts.transpileModule(fs.readFileSync('components/ui/ScrollRow.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const mod = { exports: {} };
new Function('require', 'exports', 'module', code)(name => {
  if (name === 'react') return react;
  if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
  if (name.endsWith('.module.css')) return { default: styles };
  throw Error(name);
}, mod.exports, mod);
let offset = 0, width = 200, positionWrites = 0;
const moves = [];
const listeners = new Map();
const card = { hasAttribute: () => false, getBoundingClientRect: () => ({ width }) };
const track = {
  children: [card], clientWidth: 800, scrollWidth: 21000,
  addEventListener(name, fn) { listeners.set(name, fn); },
  removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
  scrollTo(options) { moves.push(options.left); },
};
Object.defineProperty(track, 'scrollLeft', { get: () => offset, set: value => { positionWrites++; offset = value; } });
global.window = {
  getComputedStyle: () => ({ columnGap: '10px' }),
  requestAnimationFrame: fn => { frames.push(fn); return frames.length; },
  cancelAnimationFrame() {},
};
global.ResizeObserver = class { observe() {} disconnect() {} };
function render(count) {
  refIndex = stateIndex = 0; effects.length = 0;
  return mod.exports.default({ children: Array.from({ length: count }, (_, id) => ({ id })),
    virtualize: true, virtualMaxItems: 36 });
}
function measure(count) {
  render(count); refs[0].current = track;
  effects[0]();
  while (frames.length) frames.shift()();
  return render(count);
}
let tree = measure(30);
let viewport = tree.props.children[0];
assert.match(viewport.props.className, /stableTrack/, 'snap protection must start before the first virtual append');
assert.equal(positionWrites, 0);
offset = 3500;
tree = measure(60);
viewport = tree.props.children[0];
assert.equal(positionWrites, 0, 'threshold transition cannot write the user offset');
assert(viewport.props.children[0], 'known geometry must produce the left spacer at first virtual render');
width = 190;
measure(60);
assert.equal(positionWrites, 0, 'card measurement during momentum cannot move the row backward');
offset = 9000;
measure(100);
assert.equal(positionWrites, 0, 'fast jump and appended items cannot rewrite scrollLeft');
offset = 0;
tree = measure(100);
const next = tree.props.children.find(x => x?.type === 'button' && x.props['aria-label'] === 'Прокрутить вперёд');
next.props.onClick(); next.props.onClick();
assert.deepEqual(moves, [640, 1280], 'rapid arrow clicks advance the pending target rather than the animated current offset');
const css = fs.readFileSync('components/ui/ScrollRow.module.css', 'utf8');
assert.match(css, /\.stableTrack\s*\{[^}]*scroll-snap-type:\s*none;[^}]*overflow-anchor:\s*none;/s);
console.log('Scroll row momentum: no offset writes, pre-virtual snap policy, append geometry and rapid arrow targets passed.');

// Mobile: touchend does not end inertia; keep the window until scroll settles.
offset = 0;
let mobileTree = measure(100);
const beforeTouchCount = mobileTree.props['data-scroll-row-rendered'];
effects[1]();
const realTimeout = global.setTimeout, realClear = global.clearTimeout;
const timers = new Map(); let timerId = 0;
global.setTimeout = fn => { timers.set(++timerId, fn); return timerId; };
global.clearTimeout = id => timers.delete(id);
const cleanupTouch = effects[2]();
listeners.get('touchstart')();
offset = 400;
mobileTree = measure(100);
assert.equal(mobileTree.props['data-scroll-row-rendered'], beforeTouchCount,
  'mobile swipe retains the current window while it covers visible cards');
listeners.get('touchend')();
assert.equal(timers.size, 1);
offset = 800;
listeners.get('scroll')();
mobileTree = measure(100);
assert.equal(mobileTree.props['data-scroll-row-rendered'], beforeTouchCount,
  'inertia after lifting the finger must not churn DOM');
assert.equal(timers.size, 1, 'inertial scroll rearms one settling timer');
const settle = [...timers.values()][0]; timers.clear(); settle();
mobileTree = measure(100);
assert(mobileTree.props['data-scroll-row-rendered'] > beforeTouchCount,
  'window catches up after momentum settles');
listeners.get('touchstart')();
offset = 15000;
mobileTree = measure(100);
assert(mobileTree.props.children[0].props.children[0], 'fast fling still advances the window before visible cards run out');
assert.equal(positionWrites, 0, 'touch lifecycle must never write the scroll offset');
listeners.get('touchend')(); cleanupTouch();
assert.equal(timers.size, 0, 'unmount clears the settling timer');
global.setTimeout = realTimeout; global.clearTimeout = realClear;
console.log('Mobile momentum: gesture window, touchend inertia, fast-fling coverage and cleanup passed.');
