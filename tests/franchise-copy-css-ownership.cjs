'use strict';

// Phase 3D: Season rail copy must be locally owned while all page/theme
// compatibility hooks and active marker behavior remain globally available.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const postcss = require('postcss');

const globalFile = 'app/anime-page-v3.css';
const localFile = 'components/AnimeFranchise.module.css';
const globalCss = postcss.parse(fs.readFileSync(globalFile, 'utf8'), { from: globalFile });
const localCss = postcss.parse(fs.readFileSync(localFile, 'utf8'), { from: localFile });
const component = fs.readFileSync('components/AnimeFranchise.tsx', 'utf8');

function rootRules(root, selector) {
  const out = [];
  root.walkRules((rule) => {
    if (rule.parent !== root || rule.selector !== selector) return;
    const values = new Map();
    rule.walkDecls((decl) => values.set(decl.prop, {
      value: decl.value.trim(), important: Boolean(decl.important),
    }));
    out.push(values);
  });
  return out;
}
function expectRule(root, selector, properties) {
  const matches = rootRules(root, selector);
  assert.equal(matches.length, 1, 'One unconditional owner required: ' + selector);
  for (const [property, value] of Object.entries(properties)) {
    const actual = matches[0].get(property);
    assert(actual, 'Missing ' + property + ' in ' + selector);
    assert.equal(actual.value, value, selector + ' ' + property + ' changed');
  }
  return matches[0];
}
const migrated = {
  step: ['.season :global(.anime-franchise-v3__step)', {
    'grid-row': '1 / span 3', 'align-self': 'start',
    color: 'var(--ab-ui-accent)', 'font-size': '11px',
    'font-weight': '760', 'font-variant-numeric': 'tabular-nums',
  }],
  label: ['.season :global(.anime-franchise-v3__season-label)', {
    color: 'var(--ab-ui-text)', 'font-size': '12px',
    'font-weight': '720', 'line-height': '1.4',
  }],
  title: ['.season :global(.anime-franchise-v3__season-title)', {
    'white-space': 'normal', 'display': '-webkit-box',
    '-webkit-box-orient': 'vertical', '-webkit-line-clamp': '2',
    overflow: 'hidden', color: 'var(--ab-ui-muted)',
    'font-size': '12px', 'line-height': '1.45',
    'text-overflow': 'ellipsis', 'overflow-wrap': 'anywhere',
  }],
  year: ['.season :global(.anime-franchise-v3__year)', {
    color: 'var(--ab-ui-muted)', 'font-size': '9px',
  }],
};
for (const [kind, [selector, rules]] of Object.entries(migrated)) {
  const local = expectRule(localCss, selector, rules);
  const global = '.anime-franchise-v3__' +
    ({ step: 'step', label: 'season-label', title: 'season-title', year: 'year' })[kind];
  assert.equal(rootRules(globalCss, global).length, 0,
    'Unscoped legacy copy rule returned: ' + global);
  assert(component.includes('className="anime-franchise-v3__step"') || kind !== 'step');
  assert(component.includes('className="anime-franchise-v3__season-label"') || kind !== 'label');
  assert(component.includes('className="anime-franchise-v3__season-title"') || kind !== 'title');
  assert(component.includes('className="anime-franchise-v3__year"') || kind !== 'year'
    || component.includes('anime-franchise-v3__year'));
  assert(local.size >= Object.keys(rules).length, 'Missing local declarations');
}
const title = rootRules(localCss, migrated.title[0])[0];
for (const property of ['font-size', 'line-height', 'white-space'])
  assert(title.get(property)?.important, 'Do not weaken clamped title override: ' + property);
const current = expectRule(globalCss, '.anime-franchise-v3__current', {
  position: 'absolute', right: '10px', top: '9px',
  color: 'var(--ab-ui-accent)', 'font-size': '9px', 'font-weight': '720',
});
assert.equal(current.size, 6, 'Global active marker changed unexpectedly');
const currentLocal = expectRule(localCss, '.season :global(.anime-franchise-v3__current)', {
  position: 'static', 'grid-column': '2', 'justify-self': 'start',
  color: 'var(--ab-ui-accent)', 'font-size': '10px',
});
assert(currentLocal.size >= 6);
for (const prefix of ['app/patch16-4-readability-theme.css','app/patch12-4-1-mobile-anime-flow.css']) {
  assert(fs.readFileSync(prefix,'utf8').includes('.anime-franchise-v3__season-title'),
    'Important responsive/readability theme hook disappeared: ' + prefix);
}
const layout = fs.readFileSync('app/layout.tsx', 'utf8');
assert(layout.includes("import './styles/hero-interactions.css';"));
console.log('PASS Franchise copy ownership: step, label, title and year are local; active and theme hooks retained.');
