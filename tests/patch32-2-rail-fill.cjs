const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('components/SmartRecommendationFeed.tsx', 'utf8');
const start = source.indexOf('function getVisibleRailFillTarget(');
const end = source.indexOf('\ntype CachedPage', start);
assert.ok(start > 0 && end > start, 'measure the production fill target, not a test clone');
const context = vm.createContext({
  MIN_INITIAL_RAIL_ITEMS: 5,
  MAX_VISIBLE_RAIL_FILL_ITEMS: 12,
  window: { getComputedStyle: () => ({ columnGap: '12px' }) },
});
vm.runInContext(
  ts.transpile(source.slice(start, end), { target: ts.ScriptTarget.ES2022 }) +
    '\nglobalThis.measure = getVisibleRailFillTarget;',
  context,
);
const mockRail = (viewport, poster) => ({
  querySelector: () => ({
    clientWidth: viewport,
    querySelector: () => ({ getBoundingClientRect: () => ({ width: poster }) }),
  }),
});
assert.equal(context.measure(undefined), 5, 'unmounted row uses safe mobile baseline');
assert.equal(context.measure(mockRail(1460, 170)), 10, 'wide desktop fills past five posters');
assert.equal(context.measure(mockRail(390, 154)), 5, 'mobile avoids desktop overfetch');
assert.equal(context.measure(mockRail(6000, 180)), 12, 'one viewport does not trigger an unbounded crawl');
assert.equal(context.measure(mockRail(0, 170)), 5, 'hidden container never invents a width');
assert.equal(context.measure(mockRail(1460, 0)), 5, 'unmeasured poster keeps a safe baseline');
context.window.getComputedStyle = () => ({ columnGap: '12.5px' });
assert.equal(context.measure(mockRail(1460, 170.5)), 10, 'zoom/fractional widths use real measured capacity');
context.window.getComputedStyle = () => ({ columnGap: 'normal' });
assert.equal(context.measure(mockRail(1460, 170)), 10, 'non-numeric gap uses a finite fallback');

assert.match(source, /targetCount\?: number/);
assert.match(source, /Math\.max\(0, bootstrapTarget - rail\.items\.length\)/);
assert.match(source, /remaining > 0 &&\s*hasMoreRef\.current/);
assert.match(source, /sparseRailPrimedTargetRef\.current\.set\(railId, target\)/);
assert.match(source, /!exhaustedRails\.has\(rail\.id\)/);
assert.match(source, /!railErrors\.has\(rail\.id\)/);
assert.match(source, /getVisibleRailFillTarget\(sparseRailSectionRefs\.current\.get\(rail\.id\)\)/);
assert.match(source, /endReachedRequiresInteraction/);
assert.match(source, /virtualMaxItems=\{MAX_RAIL_DOM_ITEMS\}/);
assert.match(source, /reconcileHomeRails/);

console.log('PASS Patch 32.2: viewport-aware rail fill, capped retries, sticky ownership and interaction-only far-end pagination');
