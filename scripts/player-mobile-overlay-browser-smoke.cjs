const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const rq = require('module').createRequire(path.join(process.cwd(), 'package.json'));
const postcss = rq('postcss');
const local = rq('next/dist/compiled/postcss-modules-local-by-default');
const scope = rq('next/dist/compiled/postcss-modules-scope');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

async function main() {
  const cssPath = 'components/EpisodePageDensity.module.css';
  const cssText = fs.readFileSync(cssPath, 'utf8');
  const parsed = await postcss([
    local(),
    scope({ generateScopedName: name => 'e_' + name }),
  ]).process(cssText, { from: cssPath });
  parsed.root.walkRules(':export', node => node.remove());

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox'],
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  try {
    const page = await browser.newPage();
    let cases = 0;
    for (const width of [320, 360, 390, 430, 767, 768, 1024]) {
      for (const activeCinema of [false, true]) {
        await page.setViewportSize({ width, height: 820 });
        await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:#13131b;color:white;font:12px Arial}
.e_page{width:100%;padding:12px}
.animebox-player-toolbar{display:flex;flex-wrap:wrap;gap:8px;width:100%}
.animebox-player-source-switcher{display:flex;gap:6px;min-height:44px;min-width:0}
.premium-player-source{border:0;border-radius:8px;padding:8px;white-space:nowrap}
.premium-player-dropdown{min-width:105px;min-height:48px;width:125px}
.premium-player-dropdown-trigger{width:100%;height:48px;display:flex;align-items:center;padding:6px}
.animebox-player-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px}
.premium-player-toolbar-button{height:44px;min-width:44px}
</style><style>${parsed.root.toString()}</style></head><body>
<div class="e_page episode-page">
 <div class="animebox-player-toolbar">
  <div class="animebox-player-source-switcher">
   <button class="premium-player-source">Авто</button>
   <button class="premium-player-source is-active">Kodik</button>
   <button class="premium-player-source">AniLiberty</button>
  </div>
  <div class="premium-player-dropdown"><button class="premium-player-dropdown-trigger">Серия</button></div>
  <div class="premium-player-dropdown"><button class="premium-player-dropdown-trigger">Озвучка</button></div>
  <div class="animebox-player-actions">
   <button class="premium-player-toolbar-button" data-player-action="theater" aria-pressed="${activeCinema}"><span>Кинотеатр</span></button>
  </div>
 </div>
</div></body></html>`);

        const geometry = await page.evaluate(() => {
          const rect = selector => {
            const element = document.querySelector(selector);
            const r = element.getBoundingClientRect();
            return { x:r.x, right:r.right, y:r.y, bottom:r.bottom, width:r.width, height:r.height,
              display:getComputedStyle(element).display };
          };
          return { viewport:innerWidth, scroll:document.documentElement.scrollWidth,
            toolbar:rect('.animebox-player-toolbar'),
            first:rect('.premium-player-dropdown'),
            second:rect('.premium-player-dropdown + .premium-player-dropdown'),
            actions:rect('.animebox-player-actions'),
            theater:rect('[data-player-action="theater"]') };
        });

        assert(geometry.scroll <= geometry.viewport + 1,
          'horizontal overflow at '+width+': '+JSON.stringify(geometry));
        if (width <= 767) {
          assert.equal(geometry.theater.display === 'none', !activeCinema,
            'mobile inactive cinema visibility at '+width);
          assert(geometry.first.right <= geometry.second.x + 1,
            'mobile dropdowns not side-by-side at '+width);
          assert(geometry.actions.y >= Math.max(geometry.first.bottom, geometry.second.bottom) - 1,
            'action group must follow dropdown row at '+width);
          assert(geometry.actions.width >= geometry.toolbar.width - 1,
            'action group must span all grid columns at '+width);
        } else {
          assert(geometry.theater.display !== 'none', 'desktop cinema must stay visible');
        }
        cases++;
      }
    }
    console.log('PASS player mobile layout:',cases,'compiled CSS Module geometry cases, 320–1024px, inactive/active cinema.');
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
