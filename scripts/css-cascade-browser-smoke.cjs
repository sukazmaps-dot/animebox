/** Offline Chromium fixture: computed values from the real layout CSS import order. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

const read = (file) => fs.readFileSync(file, 'utf8');
const root = read('app/layout.tsx');
const imported = [...root.matchAll(/import '\.\/([^']+\.css)'/g)].map((match) => match[1]);
assert(imported.length > 40, 'Expected the real app-level CSS import order');
const css = imported.map((name) => read('app/' + name).replace(/@import[^;]+;/g, '')).join('\n');
const svg = '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10h16" stroke="currentColor"/></svg>';
const links = ['Главная', 'Каталог', 'Список', 'Комнаты', 'Профиль']
  .map((label, i) => '<a href="#" class="mobile-nav__item' + (i === 0 ? ' is-active' : '') +
    '" ' + (i === 0 ? 'aria-current="page"' : '') + '>' + svg + '<span>' + label + '</span></a>').join('');
const cards = Array.from({ length: 6 }, (_, i) =>
  '<article class="anime-card"><div class="anime-card__body"><h3>Невероятно длинное название аниме с продолжением сезона ' +
  (i + 1) + '</h3><p class="anime-card__meta">Сериал · 2026</p></div></article>').join('');
const html = (theme) => '<!doctype html><html data-animebox-theme="' + theme +
  '"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
  css + '</style><style>.cascade-fixture-title{margin:8px 0}.anime-card{min-width:0}.anime-card__body{min-width:0}</style></head>' +
  '<body><aside class="sidebar"><a href="#" class="sidebar__item is-active">Главная</a></aside>' +
  '<header class="topbar"><div class="topbar__search"><input aria-label="Поиск" /></div></header>' +
  '<div class="app-shell"><main class="page-content"><section class="search-page">' +
  '<h2 class="cascade-fixture-title">Каталог</h2><div class="anime-grid">' + cards + '</div></section>' +
  '<section class="tracker-page"><h2 class="cascade-fixture-title">Трекер</h2>' +
  '<div class="anime-grid">' + cards + '</div></section></main></div>' +
  '<nav class="mobile-nav" aria-label="Мобильная навигация">' + links + '</nav></body></html>';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--no-sandbox'],
  });
  let checks = 0;
  try {
    const page = await browser.newPage();
    const screens = [
      { w: 320, h: 700, mode: 'portrait' },
      { w: 360, h: 800, mode: 'portrait' },
      { w: 390, h: 844, mode: 'portrait' },
      { w: 600, h: 900, mode: 'portrait' },
      { w: 768, h: 1024, mode: 'portrait' },
      { w: 769, h: 1024, mode: 'desktop' },
      { w: 1024, h: 900, mode: 'desktop' },
      { w: 1270, h: 900, mode: 'desktop' },
      { w: 1440, h: 900, mode: 'desktop' },
      { w: 844, h: 390, mode: 'landscape' },
      { w: 1024, h: 520, mode: 'landscape' },
    ];
    for (const theme of ['dark', 'light']) {
      for (const screen of screens) {
        await page.setViewportSize({ width: screen.w, height: screen.h });
        await page.setContent(html(theme), { waitUntil: 'domcontentloaded' });
        const metrics = await page.evaluate(() => {
          const nav = document.querySelector('.mobile-nav');
          const selected = nav.querySelector('.mobile-nav__item.is-active');
          const sidebar = document.querySelector('.sidebar');
          const desktopSelected = sidebar.querySelector('.sidebar__item.is-active');
          const rect = (el) => {
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
          };
          const gridMetrics = [...document.querySelectorAll('.search-page .anime-grid, .tracker-page .anime-grid')].map((grid) => ({
            rect: rect(grid),
            cards: [...grid.querySelectorAll('.anime-card')].map(rect),
            display: getComputedStyle(grid).display,
          }));
          return {
            nav: rect(nav),
            navDisplay: getComputedStyle(nav).display,
            navPointer: getComputedStyle(nav).pointerEvents,
            selected: rect(selected),
            selectedShadow: getComputedStyle(selected).boxShadow,
            selectedBackground: getComputedStyle(selected).backgroundColor,
            selectedMarker: getComputedStyle(selected, '::after').backgroundColor,
            selectedMarkerHeight: getComputedStyle(selected, '::after').height,
            sidebarDisplay: getComputedStyle(sidebar).display,
            sidebarShadow: getComputedStyle(desktopSelected).boxShadow,
            sidebarBackground: getComputedStyle(desktopSelected).backgroundColor,
            grids: gridMetrics,
            width: innerWidth,
          };
        });
        const ctx = theme + '/' + screen.w + 'x' + screen.h + '/' + screen.mode;
        const mobile = screen.mode !== 'desktop';
        if (mobile) {
          assert.notEqual(metrics.navDisplay, 'none', ctx + ': mobile dock not displayed');
          assert(metrics.nav.width > 200 && metrics.nav.x >= -1 && metrics.nav.right <= screen.w + 1,
            ctx + ': dock clipped horizontally: ' + JSON.stringify(metrics.nav));
          assert(metrics.nav.y >= -1 && metrics.nav.bottom <= screen.h + 2 && metrics.nav.height >= 44,
            ctx + ': dock outside visible viewport: ' + JSON.stringify(metrics.nav));
          assert(metrics.selected.height >= 44, ctx + ': mobile selected touch target too small');
          assert.equal(metrics.selectedShadow, 'none', ctx + ': desktop inset shadow leaked into mobile nav');
          assert(/^(rgba?\()/i.test(metrics.selectedMarker), ctx + ': missing mobile top marker');
          assert(!metrics.selectedMarker.includes('0, 0, 0, 0)'), ctx + ': marker transparent');
          assert(parseFloat(metrics.selectedMarkerHeight) >= 2, ctx + ': missing mobile marker geometry');
          assert.equal(metrics.sidebarDisplay, 'none', ctx + ': sidebar visible over mobile dock');
          assert.equal(metrics.navPointer, 'auto', ctx + ': mobile dock not interactive');
          await page.locator('.mobile-nav').evaluate((node) => node.classList.add('is-hidden'));
          const hidden = await page.locator('.mobile-nav').evaluate((node) => {
            const s = getComputedStyle(node);
            return { pointer: s.pointerEvents, transform: s.transform, display: s.display };
          });
          if (screen.mode === 'portrait') {
            assert.equal(hidden.pointer, 'none', ctx + ': portrait hidden dock catches clicks');
            assert.notEqual(hidden.transform, 'matrix(1, 0, 0, 1, 0, 0)', ctx + ': hidden dock has identity transform');
            assert.notEqual(hidden.transform, 'none', ctx + ': hidden dock did not slide away');
          } else {
            assert.equal(hidden.pointer, 'auto', ctx + ': compact landscape dock must stay interactive');
            assert.notEqual(hidden.display, 'none', ctx + ': landscape dock disappeared');
          }
        } else {
          assert.equal(metrics.navDisplay, 'none', ctx + ': mobile dock visible on desktop');
          assert.notEqual(metrics.sidebarDisplay, 'none', ctx + ': desktop sidebar missing');
          assert(metrics.sidebarShadow.includes('inset'), ctx + ': desktop selected inset marker missing');
        }
        for (const [i, grid] of metrics.grids.entries()) {
          assert.equal(grid.display, 'grid', ctx + ': anime-grid ' + i + ' ceased to be a grid');
          assert(grid.rect.x >= -1 && grid.rect.right <= screen.w + 1, ctx + ': grid ' + i + ' outside screen');
          for (const item of grid.cards) {
            assert(item.width >= 1 && item.height >= 1, ctx + ': empty anime card cell');
            assert(item.x >= -1 && item.right <= screen.w + 1, ctx + ': anime card outside screen');
          }
        }
        checks++;
      }
    }
    console.log('[Patch 29.13] PASS ' + checks +
      ' real-CSS Chromium fixtures: dark/light, portrait, desktop, short landscape, selected/hidden nav and anime grids.');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
