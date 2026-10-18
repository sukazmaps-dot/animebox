const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const postcss = require('postcss');
const read = f => fs.readFileSync(f, 'utf8');
const shell = read('components/home/HomePageShell.tsx');
assert(!shell.includes("'use client'"), 'Server shell retained');
assert(shell.includes('data-home-layout="cinematic"'));
assert(!shell.includes('<HomeRightRail') && !shell.includes('<HomeShortcuts'), 'No duplicate side panels');
let previous = -1;
for (const slot of ['HomeHeroSection', 'HomeContinueSection', 'HomeDiscoverySection', 'HomeCatalogSections', 'HomeScheduleSection', 'HomeWatchTogetherSection', 'HomeRetentionSections', 'HomeDeferredChat', 'HomeDeferredSupport']) {
  const matches = [...shell.matchAll(new RegExp('<' + slot + ' \\/>', 'g'))];
  assert.equal(matches.length, 1, 'Exactly one ' + slot);
  assert(matches[0].index > previous, 'Order ' + slot); previous = matches[0].index;
}
const page = read('app/page.tsx');
assert(page.includes('revalidate = 900') && page.includes('canonical: SITE_URL'));
assert(!/import '\.\/(home-visual-repair|patch29-1|patch30-)/.test(page), 'Legacy home replays detached');
for (const file of ['components/home/HomePageShell.module.css', 'components/home/HomeCinematicHero.module.css', 'components/HomeMoodPicker.module.css']) {
  const css = postcss.parse(read(file));
  css.walkDecls(decl => assert(!decl.important, file + ' introduces !important'));
  assert(Buffer.byteLength(read(file)) < 16000, 'CSS module budget');
}
// Render the actual compact picker. Decorative image paths must not enter SSR.
function load(file, imports) {
  const module = { exports: {} };
  const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('module', 'exports', 'require', code)(module, module.exports, name => {
    if (name in imports) return imports[name];
    if (name.endsWith('.module.css')) return { default: {} };
    if (name.startsWith('@/lib/')) return load(name.replace('@/', '') + '.ts', {});
    return require(name);
  });
  return module.exports;
}
const moods = load('lib/recommendation-moods.ts', {});
const Picker = load('components/HomeMoodPicker.tsx', {
  '@/lib/recommendation-moods': moods,
  '@/components/Icon': { default: () => null },
  '@/lib/media-warmup-client': { observeNearViewportMedia: () => { throw Error('SSR media observer'); } },
}).default;
for (const selected of moods.HOME_MOOD_OPTIONS) {
  const html = renderToStaticMarkup(React.createElement(Picker, { compact: true, value: selected.value, onChange() {}, busy: true }));
  assert.equal((html.match(/role="radio"/g) || []).length, 5);
  assert.equal((html.match(/aria-checked="true"/g) || []).length, 1);
  assert.equal((html.match(/tabindex="0"/g) || []).length, 1);
  assert(html.includes('aria-busy="true"') && html.includes('aria-live="polite"'));
  assert(!html.includes('<img'), 'No compact mood illustration request');
  for (const option of moods.HOME_MOOD_OPTIONS) assert(html.includes(option.label));
}
const actions = postcss.parse(read('app/patch17-6-home-recommendation-actions.css'));
actions.walkRules(rule => {
  if (rule.selector.includes('.home-page')) assert(rule.selector.includes('[data-home-layout="cinematic"]'), 'Action/dialog ownership not migrated: ' + rule.selector);
});
console.log('PASS Home 32: production composition, CSS ownership/budget, ISR/SEO, all SSR mood states and shared feedback styling');
