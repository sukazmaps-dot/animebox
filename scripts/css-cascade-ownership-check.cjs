/** CSS ownership contract: detect selector creep before it reaches the browser. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const postcss = require('postcss');

const foundation = postcss.parse(fs.readFileSync('app/patch17-4-2-ui-precision.css', 'utf8'));
let mobileActive = 0;
let desktopActive = 0;
foundation.walkRules((rule) => {
  const selectors = rule.selectors || rule.selector.split(',');
  if (selectors.some((part) => part.includes('.mobile-nav__item.is-active'))) {
    mobileActive += 1;
    // Source order gave Foundation v2 a second, incompatible ownership of
    // the dock. Only text color is allowed here: Patch 14.2 owns its marker.
    assert(!selectors.some((part) => part.includes('.sidebar__item.is-active')),
      'Foundation v2 must not group desktop + mobile active nav treatments.');
    rule.walkDecls((decl) => {
      assert(!/^(background(?:-.+)?|box-shadow|border(?:-.+)?|outline|transform|padding|height|width|left|right|top|bottom)$/i.test(decl.prop),
        'Mobile active dock cannot inherit Foundation v2 ' + decl.prop);
    });
  }
  if (selectors.some((part) => part.includes('.sidebar__item.is-active'))) {
    desktopActive += 1;
    assert(selectors.every((part) => !part.includes('.mobile-nav__item.is-active')),
      'Desktop selected treatment must not include mobile nav.');
    assert(rule.nodes.some((node) => node.type === 'decl' && node.prop === 'box-shadow' && node.value.includes('inset')),
      'Desktop selected item must retain its left inset marker.');
  }
});
assert(mobileActive > 0, 'Missing independent mobile active nav color contract');
assert(desktopActive > 0, 'Missing independent desktop sidebar selection contract');
const rootLayout = fs.readFileSync('app/layout.tsx', 'utf8');
const imports = [...rootLayout.matchAll(/import '\.\/([^']+\.css)'/g)].map((x) => x[1]);
assert(imports.indexOf('patch14-2-mobile-shell.css') >= 0, 'Mobile shell import missing');
assert(imports.indexOf('patch14-2-mobile-shell.css') < imports.indexOf('patch17-4-2-ui-precision.css'),
  'Unexpected CSS order; audit the browser cascade.');
assert(imports.length <= 76, 'Root CSS import budget exceeded');
console.log('[Patch 29.13] CSS ownership: desktop selection and mobile dock are isolated.');
