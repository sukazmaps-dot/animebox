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
// Patch 32.0.1: schedule is promoted above discovery; chat precedes secondary retention.
// Keep the exactly-once and strict-order guard rather than removing it.
let previous = -1;
for (const slot of ['HomeHeroSection', 'HomeContinueSection', 'HomeScheduleSection', 'HomeDiscoverySection', 'HomeCatalogSections', 'HomeWatchTogetherSection', 'HomeDeferredChat', 'HomeRetentionSections', 'HomeDeferredSupport']) {
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
const loaded = new Map();
// Render the actual compact picker. Decorative image paths must not enter SSR.
function load(file, imports) {
  if (loaded.has(file)) return loaded.get(file).exports;
  const module = { exports: {} };
  loaded.set(file, module);
  const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('module', 'exports', 'require', code)(module, module.exports, name => {
    if (name in imports) return imports[name];
    if (name.endsWith('.css')) return { default: {} };
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

// A visual fixture must produce real cards, including when resume history
// excludes the first title. Otherwise a skeleton-only screenshot can pass.
(async () => {
  const Fixture = load('tests/fixtures/home32.fixture', {
    '@/components/home/HomePageShell': { default: () => null },
  }).default;
  const element = await Fixture({ searchParams: Promise.resolve({}) });
  const candidates = element.props.initialPopular;
  const data = new Map();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    const { getPersonalizedRecommendations } = load('lib/recommendations.ts', {});
    for (const history of [false, true]) {
      if (history) storage.setItem('anime_watch_history', JSON.stringify([{ ...candidates[0], lastViewedAt: Date.now(), viewCount: 1 }]));
      for (const mood of ['any', 'adventure']) {
        const ranked = getPersonalizedRecommendations(candidates, { mood, limit: 24 });
        assert(ranked.length >= 8, 'Fixture must fill real recommendation shelves');
        if (history) assert(!ranked.some(item => item.anime.id === candidates[0].id), 'History exclusion must remain real');
      }
    }
  } finally {
    for (const [key, descriptor] of [['window', originalWindow], ['localStorage', originalStorage]]) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
  console.log('PASS Home 32 fixture: real ranking produces cards for guests/history and mood changes');
})().catch(error => { console.error(error); process.exitCode = 1; });
