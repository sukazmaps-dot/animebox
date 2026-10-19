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
const layout = fs.readFileSync('app/layout.tsx', 'utf8');
const cssCount = [...layout.matchAll(/import '\.\/([^']+\.css)'/g)].length;
assert(cssCount > 0 && cssCount <= 76, 'Root CSS import budget exceeded');
console.log('PASS Franchise CSS: season geometry belongs to Module; legacy interactive states retained.');
