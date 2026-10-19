'use strict';

// CSS ownership contract: this structural merge must not change computed styles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const postcss = require('postcss');

const cssFile = 'app/styles/hero-interactions.css';
const css = fs.readFileSync(cssFile, 'utf8');
const layout = fs.readFileSync('app/layout.tsx', 'utf8');
const stripComments = (content) => content.replace(/\/\*[\s\S]*?\*\//g, '');
function fingerprint(content) {
  let hash = 2166136261;
  for (let i = 0; i < content.length; i += 1) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
const expectedFingerprint = '6684cea6';
assert.equal(fingerprint(stripComments(css)), expectedFingerprint,
  'Hero CSS rules changed; update the equivalence contract only after browser review');
const rootImports = [...layout.matchAll(/import '\.\/([^']+\.css)'/g)].map((match) => match[1]);
assert.equal(rootImports.length, 74, 'Hero merge must reduce root CSS imports from 76 to 74');
const heroIndex = rootImports.indexOf('styles/hero-interactions.css');
assert(heroIndex > rootImports.indexOf('mobile-moderate-v4.css'),
  'Hero styles moved before their original cascade location');
assert(heroIndex < rootImports.indexOf('ad-layout-v8.css'),
  'Hero styles moved after their original cascade location');
assert.equal(rootImports.filter((name) => name === 'styles/hero-interactions.css').length, 1);
for (const obsolete of ['hero-controls-v5.css', 'hero-teaser-v6.css', 'hero-swipe-v7.css']) {
  assert(!rootImports.includes(obsolete), 'Legacy stylesheet import remains: ' + obsolete);
  assert(!fs.existsSync('app/' + obsolete), 'Legacy stylesheet remains: ' + obsolete);
}
const root = postcss.parse(css, { from: cssFile });
let rules = 0;
let declarations = 0;
let important = 0;
root.walkRules(() => { rules += 1; });
root.walkDecls((decl) => { declarations += 1; if (decl.important) important += 1; });
assert.equal(rules, 29, 'Unexpected number of Hero CSS rules');
assert.equal(declarations, 101, 'Unexpected Hero CSS declarations');
assert.equal(important, 76, 'Unexpected Hero CSS important declarations');
for (const selector of [
  '.home-hero-carousel__nav',
  '.home-hero-carousel__description',
  '.home-hero-carousel',
]) {
  let present = false;
  root.walkRules((rule) => { if ((rule.selectors || []).includes(selector)) present = true; });
  assert(present, 'Hero CSS selector missing: ' + selector);
}
console.log('PASS hero CSS: 3 legacy layers merged, all CSS text preserved, 74 root imports');
