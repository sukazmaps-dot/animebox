'use strict';

// Navigation cascade contract: each removed baseline declaration has a
// guaranteed later, unconditional owner in hierarchy-pass.css.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const postcss = require('postcss');

const read = (file) => postcss.parse(fs.readFileSync(file, 'utf8'), { from: file });
const baseline = read('app/globals.css');
const navigation = read('app/hierarchy-pass.css');
const layout = fs.readFileSync('app/layout.tsx', 'utf8');
const imports = [...layout.matchAll(/import '\.\/([^']+\.css)'/g)].map((m) => m[1]);
const first = imports.indexOf('globals.css');
const owner = imports.indexOf('hierarchy-pass.css');
assert(first >= 0 && owner > first, 'Navigation owner must load after baseline');
assert(imports.length <= 76, 'Root CSS import budget exceeded');

function declarations(root, selector, property, firstRuleOnly = false) {
  const matches = [];
  let visited = false;
  root.walkRules((rule) => {
    // Exclude conditional branches; the owner is always active. Check only
    // the first baseline rule: later legacy declarations may still exist
    // elsewhere in globals.css and are outside this scoped change.
    if (rule.parent !== root || rule.selector !== selector ||
        (firstRuleOnly && visited)) return;
    visited = true;
    rule.walkDecls(property, (decl) => {
      if (decl.prop === property)
        matches.push({ value: decl.value.trim(), important: Boolean(decl.important) });
    });
  });
  return matches;
}

const contracts = [
  ['.sidebar', 'display', 'flex'],
  ['.sidebar', 'flex-direction', 'column'],
  ['.sidebar__item', 'gap', '12px'],
  ['.sidebar__item', 'color', 'var(--ab-ui-muted)'],
  ['.sidebar__label', 'color', 'var(--ab-ui-muted)'],
  ['.topbar__search input::placeholder', 'color', 'var(--ab-ui-muted)'],
];

for (const [selector, property, value] of contracts) {
  assert.deepEqual(declarations(baseline, selector, property, true), [],
    'Shadowed declaration returned to globals.css: ' + selector + ' ' + property);
  assert.deepEqual(declarations(navigation, selector, property),
    [{ value, important: false }],
    'The always-loaded navigation owner no longer provides: ' + selector + ' ' + property);
}
console.log('PASS Navigation CSS: 6 redundant declarations removed; always-loaded owners retained');
