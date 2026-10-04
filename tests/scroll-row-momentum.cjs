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
const card = { hasAttribute: () => false, getBoundingClientRect: () => ({ width }) };
const track = {
  children: [card], clientWidth: 800, scrollWidth: 21000,
  addEventListener() {}, removeEventListener() {},
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
