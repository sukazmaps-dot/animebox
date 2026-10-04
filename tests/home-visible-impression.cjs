const ts = require('typescript');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const effects = [];
const refs = [];
const cleanups = [];
const listeners = new Map();
let observerCallback;
let disconnected = false;
let count = 0;
global.document = {
  visibilityState: 'visible',
  addEventListener: (name, fn) => listeners.set(name, fn),
  removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
};
global.IntersectionObserver = class {
  constructor(callback, options) { observerCallback = callback; assert.equal(options.threshold, .25); }
  observe(element) { assert.equal(element.id, 'surface'); }
  disconnect() { disconnected = true; }
};
const react = {
  useRef(value) { const ref = { current: value }; refs.push(ref); return ref; },
  useEffect(callback) { effects.push(callback); },
};
const code = ts.transpileModule(fs.readFileSync('components/home/useVisibleHomeImpression.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const target = { exports: {} };
new Function('require', 'exports', 'module', code)(() => react, target.exports, target);
const surface = target.exports.useVisibleHomeImpression('1:3:resume', () => count++);
surface.current = { id: 'surface' };
for (const effect of effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
assert.equal(count, 0, 'mount is not an impression');
observerCallback([{ isIntersecting: true, intersectionRatio: .1 }]);
assert.equal(count, 0, 'insufficient visibility is not an impression');
document.visibilityState = 'hidden';
observerCallback([{ isIntersecting: true, intersectionRatio: .5 }]);
assert.equal(count, 0, 'background visibility is not an impression');
document.visibilityState = 'visible';
listeners.get('visibilitychange')();
assert.equal(count, 1);
observerCallback([{ isIntersecting: true, intersectionRatio: 1 }]);
listeners.get('visibilitychange')();
assert.equal(count, 1, 'repeat observer and foreground transitions cannot duplicate');
for (const cleanup of cleanups) cleanup();
assert.equal(disconnected, true);
assert.equal(listeners.size, 0);
console.log('Visible home impressions: viewport threshold, hidden tab, dedupe, cleanup passed.');
