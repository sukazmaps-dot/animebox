/** Phase 3D: exact pre/post CSS parity with the real anime page import order. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import postcss from 'postcss';
import localByDefault from 'next/dist/compiled/postcss-modules-local-by-default/index.js';
import scope from 'next/dist/compiled/postcss-modules-scope/index.js';
import tailwind from '@tailwindcss/postcss';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE_PATH || 'playwright'
);
const baselineSha = '0c557678cd2a623e37f141c64538fba63bdf38bb';
const oldText = file => execFileSync('git', ['show', baselineSha + ':' + file], { encoding: 'utf8' });
const paths = ['app/anime-page-v3.css', 'components/AnimeFranchise.module.css'];
const before = Object.fromEntries(paths.map(file => [file, oldText(file)]));
const after = Object.fromEntries(await Promise.all(paths.map(async file =>
  [file, await fs.readFile(file, 'utf8')]
)));
for (const file of paths) assert.notEqual(before[file], after[file], file + ' was not migrated');

const root = await fs.readFile('app/layout.tsx', 'utf8');
const detail = await fs.readFile('app/anime/[slug]/layout.tsx', 'utf8');
const imports = [
  ...[...root.matchAll(/import ['"]\.\/(.*?\.css)['"]/g)].map(m => 'app/' + m[1]),
  ...[...detail.matchAll(/import ['"]\.\.\/\.\.\/(.*?\.css)['"]/g)].map(m => 'app/' + m[1]),
];
assert(imports.includes('app/anime-page-v3.css'), 'Anime page CSS missing');
const sources = await Promise.all(imports.map(async file => {
  const css = await fs.readFile(file, 'utf8');
  return file === 'app/globals.css'
    ? (await postcss([tailwind({ optimize: false })]).process(css, { from: file })).css
    : css;
}));
async function moduleCss(css, prefix) {
  const result = await postcss([
    localByDefault(), scope({ generateScopedName: name => prefix + '_' + name })
  ]).process(css, { from: prefix + '.module.css' });
  result.root.walkRules(':export', rule => rule.remove());
  return result.root.toString();
}
const navigation = await moduleCss(
  await fs.readFile('components/ui/HorizontalNavRail.module.css', 'utf8'), 'navrail');
const renderCss = {};
for (const phase of ['before', 'after']) {
  const replacement = phase === 'before' ? before : after;
  const globalCss = sources.map((css, i) => imports[i] === 'app/anime-page-v3.css'
    ? replacement['app/anime-page-v3.css'] : css).join('\n');
  renderCss[phase] = globalCss + '\n' + navigation + '\n' +
    await moduleCss(replacement['components/AnimeFranchise.module.css'], 'franchise');
}
function renderItems() {
  return Array.from({ length: 10 }, (_, i) => {
    const active = i === 2;
    const idx = String(i + 1).padStart(2, '0');
    return '<a class="franchise_season anime-franchise-v3__season ' +
      (active ? 'is-current ' : '') +
      'min-w-[150px] w-[190px] shrink-0 snap-start md:w-[210px]" ' +
      (active ? 'aria-current="page" ' : '') + 'href="#s' + i + '">' +
      '<span class="anime-franchise-v3__step">' + idx + '</span>' +
      '<span class="anime-franchise-v3__season-label">Сезон ' + idx + '</span>' +
      '<span class="anime-franchise-v3__season-title">ОченьДлинноеНазваниеБезПробеловИПродолжение' + idx + '</span>' +
      '<span class="anime-franchise-v3__year">2026</span>' +
      (active ? '<span class="anime-franchise-v3__current">Сейчас</span>' : '') +
      '</a>';
  }).join('');
}
const fixture = (phase, theme) =>
  '<!DOCTYPE html><html lang="ru" data-animebox-theme="' + theme + '">' +
  '<head><meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<style>' + renderCss[phase] + '</style><style>' +
  'body{margin:0}.franchise-fixture{max-width:1100px;margin:auto;padding:18px}' +
  '.franchise-fixture h2{margin:0 0 12px;font-size:20px}' +
  '</style></head><body><main class="anime-detail-v3 anime-detail-v4">' +
  '<div class="franchise-fixture"><h2>Порядок частей</h2>' +
  '<section class="anime-franchise-v3"><div class="anime-franchise-v3__inner">' +
  '<div class="navrail_wrapper franchise_seasonsRail">' +
  '<div class="navrail_track" role="region" aria-label="Сезоны и части франшизы">' +
  renderItems() + '</div></div></div></section></div></main></body></html>';
const props = ['color','fontSize','fontWeight','lineHeight','fontVariantNumeric',
  'display','position','gridRow','gridColumn','alignSelf','justifySelf',
  'whiteSpace','overflow','textOverflow','webkitLineClamp','padding',
  'marginTop','borderRadius','backgroundColor','height','minHeight','width'];
const descendants = ['step','season-label','season-title','year','current'];
const cases = [
  [320,'dark'], [360,'light'], [390,'dark'], [412,'light'],
  [720,'dark'], [767,'light'], [768,'dark'], [1024,'light'],
  [1366,'light'], [1920,'dark']
];
const dest = process.env.FRANCHISE_PARITY_SCREENSHOT_DIR;
if (dest) await fs.mkdir(dest, {recursive:true});
const browser = await chromium.launch({ headless:true,
  args:process.platform === 'linux' ? ['--no-sandbox'] : [],
  ...(process.env.CHROMIUM_EXECUTABLE_PATH
    ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {}) });
try {
  const page = await browser.newPage();
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('**/*', route => route.abort());
  for (const [width,theme] of cases) {
    await page.setViewportSize({width,height:900});
    const snapshots = [];
    for (const phase of ['before','after']) {
      await page.setContent(fixture(phase,theme), {waitUntil:'domcontentloaded'});
      const metrics = await page.evaluate(({props,descendants}) => {
        const get = node => {
          if (!node || !node.getBoundingClientRect().width)
            throw new Error('Missing or invisible season card descendant');
          const s = getComputedStyle(node),r = node.getBoundingClientRect();
          return {style:Object.fromEntries(props.map(p => [p,s[p]])),
            bounds:[r.left,r.top,r.width,r.height]};
        };
        const cards = [...document.querySelectorAll('.anime-franchise-v3__season')];
        return {cards:[cards[0],cards[2]].map(card => {
          const result = {root:get(card)};
          for(const name of descendants){
            const child = card.querySelector('.anime-franchise-v3__' + name);
            if(child)result[name] = get(child);
          }
          return result;
        }),rail:{
          clientWidth:document.querySelector('.navrail_track').clientWidth,
          scrollWidth:document.querySelector('.navrail_track').scrollWidth
        }};
      }, {props,descendants});
      let shot = null;
      if (dest && (width === 390 || width === 1366)) {
        const filename = dest + '/' + theme + '-' + width + '-' + phase + '.png';
        await page.screenshot({path:filename,fullPage:true,animations:'disabled'});
        shot = await fs.readFile(filename);
      }
      snapshots.push({metrics,shot});
    }
    assert.deepEqual(snapshots[1].metrics,snapshots[0].metrics,
      'Computed style or geometry changed: ' + theme + '/' + width);
    if (snapshots[0].shot)
      assert(snapshots[0].shot.equals(snapshots[1].shot),
        'PNG pixel parity failed: ' + theme + '/' + width);
    assert(snapshots[1].metrics.rail.scrollWidth > snapshots[1].metrics.rail.clientWidth,
      'Season strip does not scroll: ' + theme + '/' + width);
    console.log('PASS before/after ' + theme + '/' + width);
  }
} finally { await browser.close(); }
console.log('PASS Phase 3D: 10 viewport/theme comparisons plus 2 screenshot pairs.');
