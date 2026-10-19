/** Offline geometry regression using source CSS and an explicit cinematic DOM fixture.
 * Checks layout only: no API, authentication, player or React interactions.
 * CSS Modules use Next's own scoping plugins; global CSS follows layout.tsx order.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import postcss from 'postcss';
import localByDefault from 'next/dist/compiled/postcss-modules-local-by-default/index.js';
import scope from 'next/dist/compiled/postcss-modules-scope/index.js';
import tailwind from '@tailwindcss/postcss';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

const rootLayout = await fs.readFile('app/layout.tsx', 'utf8');
const imports = [...rootLayout.matchAll(/import ['"]\.\/(.*?\.css)['"]/g)].map(match => `app/${match[1]}`);
const animeLayout = await fs.readFile('app/anime/[slug]/layout.tsx', 'utf8');
imports.push(...[...animeLayout.matchAll(/import ['"]\.\.\/\.\.\/(.*?\.css)['"]/g)].map(match => `app/${match[1]}`));
const globals = [];
for (const file of imports) {
  const source = await fs.readFile(file, 'utf8');
  globals.push(file === 'app/globals.css'
    ? (await postcss([tailwind({ optimize: false })]).process(source, { from: file })).css
    : source);
}
async function cssModule(file, prefix) {
  const result = await postcss([localByDefault(), scope({ generateScopedName: name => `${prefix}_${name}` })])
    .process(await fs.readFile(file, 'utf8'), { from: file });
  // :export contains module bindings, not browser rules.
  result.root.walkRules(':export', rule => rule.remove());
  return result.root.toString();
}
const modules = await Promise.all([
  cssModule('app/anime/[slug]/page.module.css', 'page'),
  cssModule('app/anime/[slug]/detail-layout.module.css', 'detail'),
  cssModule('components/AnimeDetailControls.module.css', 'controls'),
  cssModule('components/AnimeSynopsis.module.css', 'synopsis'),
  cssModule('components/ui/HorizontalNavRail.module.css', 'navrail'),
  cssModule('components/AnimeFranchise.module.css', 'franchise'),
]);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
  args: process.platform === 'linux' ? ['--no-sandbox'] : [],
});
let cases = 0;
try {
  const page = await browser.newPage();
  await page.route('**/*', route => route.abort());
  await page.setContent(`<html><head><style>${globals.join('\n')}\n${modules.join('\n')}</style></head><body><main id="fixture" class="page_page anime-detail-v3 anime-detail-v4 min-h-screen overflow-hidden text-white" style="--anime-page-accent:#bba2e3"></main></body></html>`);
  for (const theme of ['dark', 'light']) {
    for (const width of [320, 360, 375, 390, 430, 720, 767, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1200 });
      for (const scale of [1, 1.25]) {
        for (const state of ['guest', 'saved', 'resume', 'error']) {
         for (const art of ['poster', 'banner']) {
          const label = `${theme}/${width}/${scale}/${state}/${art}`;
          await page.evaluate(({ theme, scale, state, art }) => {
            document.documentElement.dataset.animeboxTheme = theme;
            const saved = state === 'saved';
            document.querySelector('#fixture').innerHTML = `
              <div class="detail_layout"><header class="detail_hero ${art === 'poster' ? 'detail_withPoster' : ''}">
                ${art === 'poster' ? '<div class="detail_poster">Обложка</div>' : '<div class="detail_backdrop"><div style="background:linear-gradient(90deg,#101010,#ffffff)"></div></div>'}
                <div class="detail_heroContent">
                  <div class="detail_identity"><h1>${state === 'error' ? 'ОченьДлинноеНепрерывноеНазвание'.repeat(4) : 'Невероятное приключение: очень длинное название аниме и его нового сезона'}</h1></div>
                  <div class="detail_facts"><span>2026</span><span>TV</span><span>24 серии</span></div>
                  <div class="detail_actions">
                    ${state === 'error' ? '<p class="anime-detail-actions__message" role="status">Не удалось сохранить. Попробуй ещё раз чуть позже.</p>' : ''}
                    <div class="controls_actions anime-detail-actions mt-7 flex flex-wrap gap-3">
                      <button class="btn btn--primary anime-detail-actions__watch">${state === 'resume' ? 'Продолжить · серия 123' : 'Источник временно недоступен'}</button>
                      <button class="btn btn--ghost anime-detail-actions__favorite" aria-label="Добавить в избранное">♡</button>
                      ${!saved ? '<button class="btn btn--ghost anime-detail-actions__tracker" aria-label="Добавить в трекер">＋</button>' : '<span class="anime-detail-actions__state">Сохранено в трекере</span>'}
                    </div>
                    ${state === 'resume' ? '<div class="controls_resume"><div class="controls_resumeTrack"><span style="width:45%"></span></div><span>Серия 123 · продолжить с 12:34</span></div>' : ''}
                  </div>
                  <section class="detail_description"><div class="synopsis_synopsis synopsis_hero"><p class="synopsis_full">Умэ Мидзуноэ — первокурсник, который начинает новую жизнь. Длинное описание должно оставаться под кнопками даже при увеличенном тексте и переносах.</p><button>Полное описание ↓</button></div></section>
                </div></header>
                <div class="detail_mainColumn">
                  <details open class="detail_franchise">
                    <summary>Порядок частей</summary>
                    <section class="anime-franchise-v3 w-full min-w-0 max-w-full pb-6 pt-2">
                      <div class="anime-franchise-v3__inner min-w-0 max-w-full pt-3">
                        <div class="navrail_wrapper franchise_seasonsRail">
                          <div class="navrail_track" role="region" aria-label="Сезоны и части франшизы" tabindex="0">
                            ${Array.from({length: 12}, (_, index) => `<a class="franchise_season anime-franchise-v3__season min-w-[150px] w-[190px] shrink-0 snap-start md:w-[210px]" href="#season-${index}"><span class="anime-franchise-v3__step">${index + 1}</span><span class="anime-franchise-v3__season-label">Сезон ${index + 1}</span><span class="anime-franchise-v3__season-title">ОченьДлинноеНазваниеСвязаннойЧастиБезПробелов${index}</span><span class="anime-franchise-v3__year">2026</span></a>`).join('')}
                          </div>
                        </div>
                      </div>
                    </section>
                  </details>
                  <section class="detail_discussion"><h2>Обсуждение</h2><p>Обсуждение должно оставаться в пределах экрана.</p></section>
                </div></div>`;
            // Emulate enlarged browser text without changing the viewport or button icons.
            for (const element of document.querySelectorAll('h1, p, button, .anime-detail-actions__state, .controls_resume > span')) {
              element.style.setProperty('font-size', `${parseFloat(getComputedStyle(element).fontSize) * scale}px`, 'important');
            }
          }, { theme, scale, state, art });
          const geometry = await page.evaluate(() => {
            const rect = selector => {
              const r = document.querySelector(selector).getBoundingClientRect();
              return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
            };
            const controls = [...document.querySelectorAll('.anime-detail-actions > *')].map(el => {
              const r = el.getBoundingClientRect();
              return { left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
            });
            const watchStyle = getComputedStyle(document.querySelector('.anime-detail-actions__watch'));
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
            const ctx = canvas.getContext('2d');
            const luminance = color => {
              ctx.fillStyle = color; ctx.fillRect(0,0,1,1);
              return [...ctx.getImageData(0,0,1,1).data].slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;})
                .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
            };
            const fg=luminance(watchStyle.color),bg=luminance(watchStyle.backgroundColor);
            const ctaContrast=(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);
            const title=document.querySelector('.detail_identity h1');
            const track = document.querySelector('.navrail_track');
            track.scrollTo({ left: track.scrollWidth, behavior: 'instant' });
            // Phase 3D: sample the actual scoped module selectors in Chromium
            // alongside the existing responsive geometry matrix.
            const seasonCard = document.querySelector('.franchise_season');
            const seasonChild = (name) => {
              const node = seasonCard.querySelector('.anime-franchise-v3__' + name);
              const style = getComputedStyle(node);
              return { fontWeight: style.fontWeight, fontSize: style.fontSize,
                gridRow: style.gridRow, whiteSpace: style.whiteSpace,
                lineClamp: style.webkitLineClamp, color: style.color };
            };
            const seasonTypography = {
              step: seasonChild('step'),
              label: seasonChild('season-label'),
              title: seasonChild('season-title'),
              year: seasonChild('year'),
            };
            const currentTag = document.createElement('span');
            currentTag.className = 'anime-franchise-v3__current';
            currentTag.textContent = 'Сейчас';
            seasonCard.append(currentTag);
            const currentStyle = getComputedStyle(currentTag);
            const currentGeometry = { position: currentStyle.position,
              gridColumnStart: currentStyle.gridColumnStart,
              fontWeight: currentStyle.fontWeight };
            currentTag.remove();
            return { franchise: rect('.detail_franchise'), discussion: rect('.detail_discussion'), track: rect('.navrail_track'), trackWidth: track.clientWidth, trackScrollWidth: track.scrollWidth, trackScrollLeft: track.scrollLeft, title:rect('.detail_identity h1'),titleScroll:title.scrollWidth,titleWidth:title.clientWidth,ctaContrast, overlay:getComputedStyle(document.querySelector('.detail_hero'),'::after').backgroundImage, hero: rect('.detail_hero'), identity: rect('.detail_identity'), poster: document.querySelector('.detail_poster') && rect('.detail_poster'), actions: rect('.detail_actions'), description: rect('.detail_description'),
              copy: rect('.synopsis_full'), watch: rect('.anime-detail-actions__watch'), controls,
              seasonTypography, currentGeometry };
          });
          assert.equal(geometry.seasonTypography.step.fontWeight, '760', `${label}: step weight regressed`);
          assert.equal(geometry.seasonTypography.label.fontWeight, '720', `${label}: season label weight regressed`);
          assert.equal(geometry.seasonTypography.title.whiteSpace, 'normal', `${label}: season title must wrap`);
          assert.equal(geometry.seasonTypography.title.lineClamp, '2', `${label}: two-line season title clamp missing`);
          assert.equal(geometry.currentGeometry.position, 'static', `${label}: active season should remain in grid`);
          assert.equal(geometry.currentGeometry.gridColumnStart, '2', `${label}: active season grid column changed`);
          assert.equal(geometry.currentGeometry.fontWeight, '720', `${label}: active season emphasis missing`);
          assert(geometry.ctaContrast>=4.5, `${label}: watch text contrast ${geometry.ctaContrast}`);
          for (const key of ['franchise', 'discussion', 'track']) {
            assert(geometry[key].width > 0 && geometry[key].left >= -1 && geometry[key].right <= width + 1, `${label}: ${key} escapes viewport`);
          }
          assert(geometry.trackScrollWidth > geometry.trackWidth, `${label}: franchise fixture must overflow inside its track`);
          assert(geometry.trackScrollLeft > 0, `${label}: franchise track must scroll internally`);
          assert(geometry.title.left>=-1&&geometry.title.right<=width+1&&geometry.titleScroll<=geometry.titleWidth+1,`${label}: title text overflows`);
          if (theme === 'light') assert(!geometry.overlay.includes('17, 16, 22'), `${label}: fixed dark overlay in light theme`);
          assert(geometry.description.top >= geometry.actions.bottom + 1, `${label}: synopsis overlaps actions`);
          for (const control of geometry.controls) {
            assert(control.bottom <= geometry.actions.bottom + 1, `${label}: control escapes its wrapper`);
            assert(control.left >= -1 && control.right <= width + 1, `${label}: control overflows viewport`);
          }
          assert(geometry.copy.left >= -1 && geometry.copy.right <= width + 1, `${label}: synopsis overflows viewport`);
          if (width < 768) {
            assert(geometry.watch.height >= 48, `${label}: watch touch target`);
            if (art === 'poster') {
            assert(geometry.identity.top <= geometry.hero.top + 32, `${label}: poster fallback wastes upper hero space`);
            assert(geometry.identity.right - 100 <= geometry.poster.left + 1, `${label}: poster reservation missing`);
            }
            const favorite = geometry.controls[1];
            assert(favorite.width >= 48 && favorite.height >= 48, `${label}: favorite touch target`);
            if (state !== 'saved') {
              const tracker = geometry.controls[2];
              assert(Math.abs(tracker.bottom - favorite.bottom) < 2, `${label}: icon actions wrap separately`);
              assert(tracker.left - favorite.right <= 16, `${label}: icon actions spread apart`);
            }
            assert(favorite.bottom > geometry.watch.bottom, `${label}: icons must occupy a separate row`);
          }
          if (process.env.ANIME_LAYOUT_SCREENSHOT_DIR && width === 390 && scale === 1 && state === 'guest') {
            await fs.mkdir(process.env.ANIME_LAYOUT_SCREENSHOT_DIR,{recursive:true});
            await page.screenshot({path:`${process.env.ANIME_LAYOUT_SCREENSHOT_DIR}/${theme}-${art}.png`,fullPage:true});
          }
          cases++;
         }
        }
      }
    }
  }
  console.log(`PASS: ${cases} cinematic layout fixtures (themes, widths, text scale and action states).`);
} finally {
  await browser.close();
}

