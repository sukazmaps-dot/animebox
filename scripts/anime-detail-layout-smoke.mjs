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
    for (const width of [320, 360, 375, 390, 430, 720, 767, 768, 1024, 1920]) {
      await page.setViewportSize({ width, height: 1200 });
      for (const scale of [1, 1.25]) {
        for (const state of ['guest', 'saved', 'resume', 'error']) {
          const label = `${theme}/${width}/${scale}/${state}`;
          await page.evaluate(({ theme, scale, state }) => {
            document.documentElement.dataset.animeboxTheme = theme;
            const saved = state === 'saved';
            document.querySelector('#fixture').innerHTML = `
              <div class="detail_layout"><header class="detail_hero detail_withPoster">
                <div class="detail_poster">Обложка</div>
                <div class="detail_heroContent">
                  <div class="detail_identity"><h1>Невероятное приключение: очень длинное название аниме и его нового сезона</h1></div>
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
                </div></header></div>`;
            // Emulate enlarged browser text without changing the viewport or button icons.
            for (const element of document.querySelectorAll('h1, p, button, .anime-detail-actions__state, .controls_resume > span')) {
              element.style.setProperty('font-size', `${parseFloat(getComputedStyle(element).fontSize) * scale}px`, 'important');
            }
          }, { theme, scale, state });
          const geometry = await page.evaluate(() => {
            const rect = selector => {
              const r = document.querySelector(selector).getBoundingClientRect();
              return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
            };
            const controls = [...document.querySelectorAll('.anime-detail-actions > *')].map(el => {
              const r = el.getBoundingClientRect();
              return { left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
            });
            return { actions: rect('.detail_actions'), description: rect('.detail_description'),
              copy: rect('.synopsis_full'), watch: rect('.anime-detail-actions__watch'), controls };
          });
          assert(geometry.description.top >= geometry.actions.bottom + 1, `${label}: synopsis overlaps actions`);
          for (const control of geometry.controls) {
            assert(control.bottom <= geometry.actions.bottom + 1, `${label}: control escapes its wrapper`);
            assert(control.left >= -1 && control.right <= width + 1, `${label}: control overflows viewport`);
          }
          assert(geometry.copy.left >= -1 && geometry.copy.right <= width + 1, `${label}: synopsis overflows viewport`);
          if (width < 768) {
            assert(geometry.watch.height >= 48, `${label}: watch touch target`);
            const favorite = geometry.controls[1];
            assert(favorite.width >= 48 && favorite.height >= 48, `${label}: favorite touch target`);
            assert(favorite.bottom > geometry.watch.bottom, `${label}: icons must occupy a separate row`);
          }
          cases++;
        }
      }
    }
  }
  console.log(`PASS: ${cases} cinematic layout fixtures (themes, widths, text scale and action states).`);
} finally {
  await browser.close();
}
