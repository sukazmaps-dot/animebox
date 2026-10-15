/** Hydrated real Hero/Rail components in Next.js with deterministic media.
 * No production API/data/CWV assertions; the temporary route is removed on exit.
 * Run with PLAYWRIGHT_MODULE_PATH / CHROMIUM_PATH when supplied externally. */
const {
  chromium
} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const {
  spawn
} = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const fixtureDir = 'app/qa-patch30-check';
if (fs.existsSync(fixtureDir)) throw new Error('Refusing to overwrite ' + fixtureDir);
fs.mkdirSync(fixtureDir);
fs.copyFileSync('tests/fixtures/patch30-home-page.fixture', fixtureDir + '/page.tsx');
const logPath = path.join(os.tmpdir(), 'animebox30-browser-' + process.pid + '.log');
(async () => {
  const log = fs.openSync(logPath, 'w');
  const srv = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3100'], {
    env: {
      ...process.env,
      NEXT_PUBLIC_MEDIA_ORIGIN: 'https://media.youranimebox.com'
    },
    stdio: ['ignore', log, log]
  });
  let b;
  try {
    for (let n = 0; n < 120; n++) {
      if (fs.readFileSync(logPath, 'utf8').includes('Ready in')) break;
      await new Promise(r => setTimeout(r, 500));
    }
    b = await chromium.launch({
      headless: true,
      ...(process.env.CHROMIUM_PATH ? {
        executablePath: process.env.CHROMIUM_PATH
      } : {}),
      args: ['--no-sandbox']
    });
    const assert = require('assert/strict');
    let cases = 0;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1500"><rect width="100%" height="100%" fill="#78558a"/><circle cx="500" cy="400" r="240" fill="#caa76f"/></svg>';
    for (const theme of ['dark', 'light']) for (const [width, height] of [[320, 700], [360, 800], [390, 844], [430, 932], [768, 1024], [844, 390], [1024, 900], [1440, 900], [1920, 1080], [2560, 1440], [3840, 2160]]) {
      const p = await b.newPage({
        viewport: {
          width,
          height
        }
      });
      const errors = [];
      const media = [];
      p.on('console', m => {
        if (m.type() === 'warning' && m.text().includes('invalid \"position\"')) errors.push(m.text());
      });
      await p.addInitScript(theme => localStorage.setItem('animebox:user-preferences:v1', JSON.stringify({
        theme,
        reduceMotion: true,
        autoNextEpisode: true
      })), theme);
      p.on('pageerror', e => errors.push(e.message));
      await p.route('**/*', async r => {
        const u = r.request().url();
        if (u.startsWith('http://127.0.0.1:3100')) return r.continue();
        if (r.request().resourceType() === 'image') {
          if (u.includes('portrait-0') || u.includes('banner-0')) media.push(u);
          return r.fulfill({
            contentType: 'image/svg+xml',
            body: svg
          });
        }
        return r.abort();
      });
      await p.goto('http://127.0.0.1:3100/qa-patch30-check', {
        waitUntil: 'domcontentloaded',
        timeout: 120000
      });
      await p.waitForSelector('.home-hero-carousel picture img');
      await p.waitForFunction(theme => document.documentElement.dataset.animeboxTheme === theme, theme);
      await p.waitForTimeout(500);
      const data = await p.evaluate(() => {
        const r = e => {
          const x = e.getBoundingClientRect();
          return {
            x: x.x,
            y: x.y,
            w: x.width,
            h: x.height,
            right: x.right,
            bottom: x.bottom
          };
        };
        const hero = document.querySelector('.home-hero-carousel'),
          img = hero.querySelector('img'),
          vp = document.querySelector('.home-anime-rail__viewport');
        return {
          theme: document.documentElement.dataset.animeboxTheme,
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          hero: r(hero),
          img: r(img),
          src: img.currentSrc,
          loaded: img.naturalWidth > 0,
          rail: r(vp),
          card: r(vp.querySelector('.anime-card')),
          scrollWidth: vp.scrollWidth,
          columns: getComputedStyle(vp).gridAutoColumns,
          buttons: [...hero.querySelectorAll('a,button')].filter(e => e.offsetWidth).map(e => ({
            text: e.textContent,
            r: r(e)
          })),
          progress: vp.firstElementChild.textContent
        };
      });
      console.log(theme, width, JSON.stringify({
        theme: data.theme,
        overflow: data.overflow,
        src: data.src,
        cardWidth: data.card.w,
        buttonHeights: data.buttons.map(b => b.r.h)
      }));
      assert(!data.overflow, 'page overflow');
      assert(data.loaded, 'image missing');
      assert(data.img.w > 0, 'empty art');
      assert(data.card.w >= 120, 'tiny cards');
      assert(data.scrollWidth > data.rail.w, 'rail does not overflow');
      assert(data.progress.includes('7'), 'progress missing');
      for (const button of data.buttons) {
        assert(button.r.h >= 44, 'Touch target smaller than 44px: ' + button.text);
        assert(button.r.right <= data.hero.right + 1 && button.r.bottom <= data.hero.bottom + 1, 'button outside hero ' + button.text);
      }
      assert.equal(errors.length, 0, errors.join(';'));
      assert(media.length <= 1, 'duplicate hero download before screenshot ' + media.join(';'));
      if (process.env.HOME_SCREENSHOT_DIR && (width === 390 || width === 1920)) {
        fs.mkdirSync(process.env.HOME_SCREENSHOT_DIR, {
          recursive: true
        });
        await p.screenshot({
          path: path.join(process.env.HOME_SCREENSHOT_DIR, 'home-' + theme + '-' + width + '.png')
        });
      }
      if (width === 1440) {
        await p.locator('.home-anime-rail__arrow--next').click();
        await p.waitForTimeout(500);
        assert(await p.locator('.home-anime-rail__viewport').evaluate(e => e.scrollLeft > 0), 'arrow did not scroll');
      }
      await p.close();
      cases++;
    }
    console.log('PASS matrix', cases);
    for (const [width, mode] of [[390, 'edge-fail'], [1440, 'edge-fail'], [2560, 'origin-fail'], [390, 'all-fail']]) {
      const p = await b.newPage({
        viewport: {
          width,
          height: 900
        }
      });
      let hits = [];
      await p.route('**/*', async r => {
        const u = r.request().url();
        if (u.startsWith('http://127.0.0.1:3100')) return r.continue();
        if (r.request().resourceType() === 'image') {
          if (u.includes('banner-') || u.includes('portrait-')) hits.push(u);
          const fail = mode === 'all-fail' || mode === 'edge-fail' && u.includes('media.youranimebox.com') || mode === 'origin-fail' && u.startsWith('https://qa-images.test/');
          return fail ? r.fulfill({
            status: 403,
            body: 'blocked'
          }) : r.fulfill({
            contentType: 'image/svg+xml',
            body: svg
          });
        }
        return r.abort();
      });
      await p.goto('http://127.0.0.1:3100/qa-patch30-check', {
        waitUntil: 'domcontentloaded',
        timeout: 120000
      });
      await p.waitForFunction(mode => {
        const hero = document.querySelector('.home-hero-carousel');
        if (!hero) return false;
        const image = hero.querySelector('img');
        return mode === 'all-fail' ? !image : (image?.naturalWidth ?? 0) > 0;
      }, mode, { timeout: 15000 });
      const result = await p.locator('.home-hero-carousel').evaluate(e => ({
        image: !!e.querySelector('img'),
        loaded: (e.querySelector('img')?.naturalWidth ?? 0) > 0,
        src: e.querySelector('img')?.currentSrc,
        actions: e.querySelectorAll('.hero-actions a').length
      }));
      console.log('RECOVERY', width, mode, result, hits);
      assert.equal(result.actions, 2);
      if (mode !== 'all-fail') assert(result.loaded, 'fallback did not recover');
      else assert(!result.image, 'exhausted image must be removed');
      assert(hits.length < 20, 'unbounded retries');
      await p.close();
    }
  } finally {
    if (b) await b.close();
    srv.kill('SIGTERM');
    if (srv.exitCode === null) await new Promise(resolve => srv.once('exit', resolve));
    fs.rmSync(fixtureDir, {
      recursive: true,
      force: true
    });
    // Next's generated dev validators still import the temporary route.
    // Remove those generated types before subsequent tsc/production build.
    fs.rmSync('.next/dev/types', { recursive: true, force: true });
    fs.closeSync(log);
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
