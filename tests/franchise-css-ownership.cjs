'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const postcss = require('postcss');

const globalStyles = postcss.parse(fs.readFileSync('app/anime-page-v3.css', 'utf8'));
const moduleStyles = postcss.parse(fs.readFileSync('components/AnimeFranchise.module.css', 'utf8'));
const tsx = fs.readFileSync('components/AnimeFranchise.tsx', 'utf8');

function declarations(sheet, selector) {
  const rules = [];
  sheet.walkRules((rule) => {
    if (rule.parent !== sheet || rule.selector !== selector) return;
    const props = new Map();
    rule.walkDecls((decl) => props.set(decl.prop, decl.value.trim()));
    rules.push(props);
  });
  assert.equal(rules.length, 1, 'Expected exactly one root rule: ' + selector);
  return rules[0];
}

const legacy = declarations(globalStyles, '.anime-franchise-v3__season');
const owner = declarations(moduleStyles, '.seasonsRail .season');

for (const [prop, expected] of Object.entries({
  position: 'relative',
  display: 'grid',
  gap: '2px 10px',
  'text-decoration': 'none',
  'grid-template-columns': '24px minmax(0, 1fr)',
  'min-height': '112px',
  padding: '14px',
  'border-radius': '12px',
})) {
  assert.equal(owner.get(prop), expected, 'CSS Module lost geometry: ' + prop);
  assert(!legacy.has(prop), 'Shadowed property returned to global CSS: ' + prop);
}
assert.deepEqual([...legacy.keys()], ['border', 'background', 'transition'],
  'Global franchise state/surface contract changed');

const bothBranches = tsx.match(/className=\{.*styles\.season.*anime-franchise-v3__season(?=\s)/g) || [];
assert.equal(bothBranches.length, 2, 'Both season variants must have CSS Module ownership');
assert.equal((tsx.match(/anime-franchise-v3__season(?=\s)/g) || []).length, 2,
  'Unowned season element: inspect component usage');
for (const selector of [
  '.anime-franchise-v3__season::after',
  '.anime-franchise-v3__season:hover',
  '.anime-franchise-v3__season.is-current',
]) {
  let present = false;
  globalStyles.walkRules((rule) => { if (rule.selector === selector) present = true; });
  assert(present, 'Missing legacy franchise state rule: ' + selector);
}
// Phase 3D: the five real season-rail children are owned by scoped
// CSS Module selectors. They retain legacy class names for theme and route
// rules elsewhere, but cannot fall back to app/anime-page-v3.css.
const ownership = new Map([
  ['.season :global(.anime-franchise-v3__step)', {
    'grid-row': '1 / span 3', 'align-self': 'start',
    color: 'var(--ab-ui-accent)', 'font-size': '11px',
    'font-weight': '760', 'font-variant-numeric': 'tabular-nums',
  }],
  ['.season :global(.anime-franchise-v3__season-label)', {
    color: 'var(--ab-ui-text)', 'font-size': '12px',
    'font-weight': '720', 'line-height': '1.4',
  }],
  ['.season :global(.anime-franchise-v3__season-title)', {
    color: 'var(--ab-ui-muted)', 'text-overflow': 'ellipsis',
    overflow: 'hidden', 'white-space': 'normal',
    'font-size': '12px', 'line-height': '1.45',
    '-webkit-line-clamp': '2',
  }],
  ['.season :global(.anime-franchise-v3__year)', {
    color: 'var(--ab-ui-muted)', 'font-size': '9px',
  }],
  ['.season :global(.anime-franchise-v3__current)', {
    'font-weight': '720', position: 'static', 'grid-column': '2',
    color: 'var(--ab-ui-accent)', 'font-size': '10px',
  }],
]);
for (const [selector, expectedProps] of ownership) {
  const styles = declarations(moduleStyles, selector);
  for (const [name, expected] of Object.entries(expectedProps)) {
    assert.equal(styles.get(name), expected, 'Missing owned property: ' + selector + ' / ' + name);
  }
}
const formerGlobals = [
  '.anime-franchise-v3__step',
  '.anime-franchise-v3__season-label',
  '.anime-franchise-v3__season-title',
  '.anime-franchise-v3__year',
  '.anime-franchise-v3__current',
];
globalStyles.walkRules((rule) => {
  const selectors = rule.selectors || [rule.selector];
  for (const selector of formerGlobals) {
    assert(!selectors.includes(selector),
      'Former child style leaked back into global CSS: ' + selector);
  }
});
for (const name of ['step', 'season-label', 'season-title', 'year', 'current']) {
  assert.equal((tsx.match(new RegExp('anime-franchise-v3__' + name + '(?=["\\s])', 'g')) || []).length, 1,
    'Franchise child class usage changed: ' + name);
}
assert.equal(
  fs.readFileSync('components/AnimeFranchise.tsx', 'utf8'),
  tsx, 'Franchise component source contract mismatch'
);

const layout = fs.readFileSync('app/layout.tsx', 'utf8');
const cssCount = [...layout.matchAll(/import '\.\/([^']+\.css)'/g)].length;
assert(cssCount > 0 && cssCount <= 76, 'Root CSS import budget exceeded');
console.log('PASS Franchise CSS: season geometry belongs to Module; legacy interactive states retained.');
