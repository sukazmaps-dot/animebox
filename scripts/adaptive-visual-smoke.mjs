/** Offline browser geometry check against the real production HTML/CSS/JS.
 * Run after npm run build. Requires Playwright and an installed Chromium.
 * No external API requests, authentication or production writes are performed.
 * Schedule data is an explicit fixture; this does not test media availability.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const runtimeModules = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const playwright = process.env.PLAYWRIGHT_MODULE_PATH ||
  (runtimeModules ? path.join(runtimeModules, 'playwright-core') : 'playwright');
const { chromium } = require(playwright);
const root = process.cwd();
const output = process.env.VISUAL_OUTPUT_DIR || '/tmp/animebox-adaptive-visual';
await fs.mkdir(output, { recursive: true });
const html = await fs.readFile(path.join(root, '.next/server/app/index.html'), 'utf8');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
  args: process.platform === 'linux' ? ['--no-sandbox', '--single-process', '--no-zygote', '--disable-gpu'] : [],
});
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1270, height: 900 } });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'animebox.test') return route.abort();
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"offline visual fixture"}' });
    const base = url.pathname.startsWith('/_next/static/') ? '.next/static' : 'public';
    const relative = url.pathname.startsWith('/_next/static/') ? url.pathname.slice('/_next/static/'.length) : url.pathname.slice(1);
    const file = path.resolve(root, base, relative);
    if (!file.startsWith(path.resolve(root, base) + path.sep)) return route.abort();
    try {
      const body = await fs.readFile(file);
      const contentType = file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.webp') ? 'image/webp' : 'application/octet-stream';
      return route.fulfill({ body, contentType });
    } catch { return route.abort(); }
  });
  await page.goto('http://animebox.test/', { waitUntil: 'load' });
  // Scrolling alone must release the artwork, including on touch devices.
  await page.locator('.mood-picker').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const icons = [...document.querySelectorAll('.mood-chip__image')];
    return icons.length === 5 && icons.every((icon) => icon.complete && icon.naturalWidth === 128 && icon.src.includes('/compact/'));
  });
  await page.locator('.home-utility-grid').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll('.home-service-card').length === 3);
  if (process.env.VISUAL_SOURCE_OVERRIDE === '1') {
    for (const file of ['app/patch17-4-2-ui-precision.css', 'app/home-visual-repair.css']) {
      await page.addStyleTag({ content: await fs.readFile(path.join(root, file), 'utf8') });
    }
  }
  // Keep real loaded components, replacing only unavailable remote schedule data.
  await page.evaluate(() => {
    const schedule = document.querySelector('.schedule');
    const old = schedule.querySelector('.schedule__cards, .empty-state');
    const grid = document.createElement('div');
    grid.className = 'schedule__cards';
    grid.innerHTML = Array.from({ length: 4 }, (_, i) => `<a class="schedule__card" href="/schedule"><img class="anime-schedule-image" src="/brand/brand-mark.webp" alt=""><div><strong>Невероятное приключение ДжоДжо: Гонка «Стальной шар» ${i + 1}</strong><span>Эпизод 37 · план</span></div><span class="schedule__time">04:30</span></a>`).join('');
    if (old) old.replaceWith(grid); else schedule.append(grid);
  });
  for (const theme of ['dark', 'light']) {
    for (const width of [320, 360, 390, 768, 979, 1024, 1270, 1440, 1920, 2560, 3840]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate((theme) => document.documentElement.setAttribute('data-animebox-theme', theme), theme);
      await page.locator('.home-utility-grid').scrollIntoViewIfNeeded();
      const geometry = await page.evaluate(() => {
        const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right }; };
        const utility = document.querySelector('.home-utility-grid');
        const main = document.querySelector('.main-column');
        return {
          viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
          main: rect(main), home: rect(document.querySelector('.home-page')),
          grid: getComputedStyle(document.querySelector('.home-grid')).gridTemplateColumns,
          utility: getComputedStyle(utility).gridTemplateColumns,
          cards: [...document.querySelectorAll('.home-service-card')].map(rect),
          actions: [...utility.querySelectorAll('.home-service-card__action')].map(rect),
          schedule: [...document.querySelectorAll('.schedule__card strong')].map(rect),
          background: getComputedStyle(document.body).backgroundColor,
          surface: getComputedStyle(document.querySelector('.home-service-card')).backgroundColor,
        };
      });
      assert(geometry.scrollWidth <= width + 1, `${theme}/${width}: page overflow`);
      for (const card of geometry.cards) {
        assert(card.w >= Math.min(250, geometry.main.w) - 1, `${theme}/${width}: cramped card ${card.w}`);
        assert(card.right <= width + 1 && card.x >= -1, `${theme}/${width}: card outside viewport`);
      }
      for (const action of geometry.actions) assert(action.h >= 43 && action.right <= width + 1, `${theme}/${width}: CTA size/overflow ${JSON.stringify(action)}`);
      const promo = await page.locator('.home-deferred--telegram > section').evaluate(root => {
        const head = root.querySelector('.home-service-card__head').getBoundingClientRect();
        const copy = root.querySelector('.home-service-card__copy').getBoundingClientRect();
        const close = root.querySelector('button').getBoundingClientRect();
        return { gap: copy.top - head.bottom, headRight: head.right, closeLeft: close.left,
          label: root.querySelector('.home-service-card__eyebrow')?.textContent,
          bottom: root.querySelector('.home-service-card__action').getBoundingClientRect().bottom };
      });
      assert(promo.gap >= 12, `${theme}/${width}: Telegram header/copy gap collapsed: ${promo.gap}`);
      assert.equal(promo.label, 'TELEGRAM-КАНАЛ');
      if (geometry.utility.split(' ').length === 3) {
        const bottoms = geometry.actions.map(action => action.y + action.h);
        assert(Math.max(...bottoms) - Math.min(...bottoms) <= 1, `${theme}/${width}: service CTA baseline differs`);
      }
      for (const title of geometry.schedule) assert(title.w >= 125, `${theme}/${width}: schedule copy too narrow: ${title.w}`);
      const expectedBackground = theme === 'dark' ? 'rgb(19, 18, 23)' : 'rgb(247, 245, 248)';
      assert.equal(geometry.background, expectedBackground, `${theme}/${width}: theme canvas`);
      results.push({ theme, width, ...geometry });
      if ([390, 1270, 1920].includes(width)) {
        const style = '.topbar, .sidebar, .mobile-nav { visibility: hidden !important; }';
        await page.locator('.home-utility-grid').evaluate(el => el.scrollIntoView({ block: 'center' }));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.locator('.home-utility-grid').screenshot({ path: path.join(output, `${theme}-${width}-utility.png`), style });
        await page.locator('.schedule').evaluate(el => el.scrollIntoView({ block: 'center' }));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.locator('.schedule').screenshot({ path: path.join(output, `${theme}-${width}-schedule.png`), style });
        for (const action of await page.locator('.home-service-card__action').all()) await action.click({ trial: true, timeout: 5000 });
      }
    }
  }
  // Reflow equivalent of 200% zoom at a 1440px screen: 720 CSS px.
  await page.setViewportSize({ width: 720, height: 500 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.home-service-card__action').first().focus();
  const outline = await page.locator('.home-service-card__action').first().evaluate(el => getComputedStyle(el).outlineWidth);
  assert.equal(outline, '2px', 'keyboard CTA focus');
  await page.setViewportSize({ width: 1440, height: 1000 });
  const dismiss = page.locator('.home-deferred--telegram button');
  const dismissBox = await dismiss.boundingBox();
  assert(dismissBox.width >= 44 && dismissBox.height >= 44, 'Telegram close touch target');
  await dismiss.click();
  await page.waitForFunction(() => document.querySelectorAll('.home-service-card').length === 2);
  const hiddenPromo = await page.locator('.home-deferred--telegram').evaluate(el => getComputedStyle(el).display);
  assert.equal(hiddenPromo, 'none', 'dismissed promo must not reserve a grid cell');
  await fs.writeFile(path.join(output, 'geometry.json'), JSON.stringify(results, null, 2));
  const cascade = process.env.VISUAL_SOURCE_OVERRIDE === '1' ? 'production cascade + source overrides' : 'production cascade';
  console.log(`PASS: ${results.length} theme/viewport combinations, ${cascade}, long-title schedule fixture, CTA focus. Screenshots: ${output}`);
} finally { await browser.close(); }
