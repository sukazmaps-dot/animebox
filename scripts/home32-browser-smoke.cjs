/** Production home shell and real providers, isolated catalogue and network.
 * No requests reach production APIs. Screenshots are fixture geometry, not CWV. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fixture = 'app/qa-home32-check';
const output = process.env.HOME32_SCREENSHOT_DIR || path.join(os.tmpdir(), 'animebox-home32');
const logPath = path.join(os.tmpdir(), 'animebox-home32-' + process.pid + '.log');
const port = 3106;
const origin = `http://127.0.0.1:${port}`;
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="s"><stop stop-color="#37304e"/><stop offset="1" stop-color="#a7a3b4"/></linearGradient></defs><path fill="url(#s)" d="M0 0h1920v1080H0z"/><circle cx="1380" cy="310" r="190" fill="#d3c5d5"/><path d="M650 1080l500-700 350 400 230-250 190 550" fill="#56536e"/></svg>';
if (fs.existsSync(fixture)) throw Error('Refusing to overwrite ' + fixture);
fs.mkdirSync(fixture);
fs.copyFileSync('tests/fixtures/home32.fixture', fixture + '/page.tsx');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const log = fs.openSync(logPath, 'w');
  // NODE_ENV remains production. Use the existing preview origin policy for
  // localhost; production's canonical-host lock is covered by security tests.
  const environment = { ...process.env, VERCEL_ENV: 'preview', NEXT_PUBLIC_MEDIA_ORIGIN: 'https://media.youranimebox.com' };
  let builder;
  let server;
  let browser;
  const results = [];
  try {
    // Test production hydration. Dev/HMR can dispatch a refresh before the
    // router initializes when many fresh browser contexts attach in a row.
    // Keep every pageerror assertion; do not filter framework exceptions.
    await new Promise((resolve, reject) => {
      builder = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
        env: environment, stdio: ['ignore', log, log],
      });
      builder.once('error', reject);
      builder.once('exit', code => code === 0 ? resolve() : reject(Error('Fixture production build failed: ' + fs.readFileSync(logPath, 'utf8'))));
    });
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
      env: environment, stdio: ['ignore', log, log],
    });
    let ready = false;
    for (let n = 0; n < 120; n++) {
      if (fs.readFileSync(logPath, 'utf8').includes('Ready in')) { ready = true; break; }
      if (server.exitCode !== null) throw Error('Next exited: ' + fs.readFileSync(logPath, 'utf8'));
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert(ready, 'Next did not start: ' + logPath);
    const preflight = await fetch(origin + '/qa-home32-check?mode=normal', { redirect: 'manual' });
    assert.equal(preflight.status, 200, 'Local production fixture must not redirect: ' + preflight.status + ' ' + preflight.headers.get('location'));
    await preflight.body?.cancel();
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    const cases = [360, 390, 412, 768, 1024, 1366, 1920].flatMap(width => ['dark', 'light'].map(theme => ({ width, height: width <= 412 ? 844 : 1080, theme, mode: 'normal' })));
    cases.push({ width: 844, height: 390, theme: 'dark', mode: 'normal' }, { width: 1366, height: 900, theme: 'dark', mode: 'poster' });
    for (const c of cases) {
      const page = await browser.newPage({ viewport: { width: c.width, height: c.height }, reducedMotion: 'reduce' });
      const errors = [];
      const navigations = [];
      page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
      page.on('pageerror', error => errors.push(error.stack || error.message));
      const history = c.width === 390 || c.width === 1366;
      await page.addInitScript(({ theme, history }) => {
        localStorage.setItem('animebox:user-preferences:v1', JSON.stringify({ theme, reduceMotion: true, autoNextEpisode: true }));
        if (history) {
          const anime = { id: 100, title: { russian: 'Провожающая в последний путь Фрирен' }, genres: ['Adventure'], episodes: 24, coverImage: { extraLarge: 'https://qa-images.test/cover-0.jpg' }, lastViewedAt: Date.now(), viewCount: 1 };
          localStorage.setItem('anime_watch_history', JSON.stringify([anime]));
          localStorage.setItem('anime_progress', JSON.stringify({ 100: 6 }));
          localStorage.setItem('anime-tracker-watch-progress', JSON.stringify([{ animeId: 100, episode: 7, currentTime: 33, duration: 1440, updatedAt: Date.now(), viewerKey: 'guest' }]));
        }
      }, { theme: c.theme, history });
      await page.route('**/*', route => {
        const request = route.request(), url = request.url();
        if (request.resourceType() === 'image' && (url.includes('qa-images.test') || url.includes('/api/image?'))) return route.fulfill({ contentType: 'image/svg+xml', body: svg });
        if (url.startsWith(origin + '/api/')) return route.fulfill({ json: { items: [], data: [], results: [], ok: true, hasMore: false } });
        if (url.startsWith(origin)) return route.continue();
        return route.abort();
      });
      const name = `${c.theme}-${c.width}-${c.mode}`;
      try {
        await page.goto(`${origin}/qa-home32-check?mode=${c.mode}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForSelector('[data-home-hero="cinematic"] picture img');
        await page.waitForFunction(theme => document.documentElement.dataset.animeboxTheme === theme, c.theme);
        await page.waitForFunction(() => document.querySelector('[data-home-hero] img')?.naturalWidth > 0);
        await page.waitForSelector('[role="radiogroup"]');
        await page.waitForSelector('.smart-card', { timeout: 60000 });
        await page.waitForSelector('.smart-feed__stage[aria-busy="false"]');
        if (history) await page.waitForSelector('.continue-smart-card');
        const geometry = await page.evaluate(() => {
          const rect = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
          const hero = document.querySelector('[data-home-hero]');
          const pagination = hero.querySelector('[role="group"]');
          return {
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            hero: rect(hero), title: rect(hero.querySelector('h1')),
            image: rect(hero.querySelector('img')), fit: getComputedStyle(hero.querySelector('img')).objectFit,
            pagination: pagination ? rect(pagination) : null,
            actions: [...hero.querySelectorAll('a')].map(rect),
            radios: [...document.querySelectorAll('[role="radio"]')].map(rect),
            rails: [...document.querySelectorAll('.home-anime-rail__viewport')].map(e => ({ viewport: rect(e), card: rect(e.querySelector('.anime-card')), scrollWidth: e.scrollWidth })),
            titleColor: getComputedStyle(hero.querySelector('h1')).color,
          };
        });
        results.push({ ...c, history, ...geometry });
        fs.writeFileSync(path.join(output, 'geometry.json'), JSON.stringify(results, null, 2));
        assert(!geometry.overflow, name + ' page overflow');
        assert.equal(geometry.titleColor, 'rgb(255, 255, 255)', name + ' artwork headline contrast');
        assert(geometry.title.width > 0 && geometry.title.height > 0, name + ' title visible');
        assert.equal(geometry.actions.length, 2, 'Hero retains two destinations');
        for (const r of geometry.actions) {
          assert(r.height >= 44 && r.width >= 44, name + ' action target');
          assert(r.x >= geometry.hero.x - 1 && r.right <= geometry.hero.right + 1 && r.bottom <= geometry.hero.bottom, name + ' action contained');
          assert(!geometry.pagination || r.bottom <= geometry.pagination.y, name + ' pagination overlaps action');
        }
        for (const r of geometry.radios) assert(r.height >= 44 && r.width >= 44, name + ' mood touch target');
        assert.equal(geometry.radios.length, 5, 'All five moods retained');
        // Patch 32.0.1: detect the real mobile bug reported in the field:
        // poster cards used to carry a tall duplicated reason + wide buttons
        // which overhung the last partially visible card.
        const compact = await page.evaluate(() => {
          const box = el => el.getBoundingClientRect();
          const cards = [...document.querySelectorAll('.smart-feed__slide:not(.smart-feed__slide--skeleton) .smart-card')];
          const errors = [];
          for (const card of cards.slice(0, 8)) {
            const poster = card.querySelector('.smart-card__poster');
            const actions = card.querySelector('.smart-card__actions');
            const title = card.querySelector('.smart-card__title');
            if (!poster || !actions || !title) continue;
            const a = box(actions), p = box(poster);
            if (a.x < p.x - 2 || a.right > p.right + 2 || a.y < p.y - 2 || a.bottom > p.bottom + 2) errors.push('poster overlay overflow');
            if (getComputedStyle(card.querySelector('.smart-card__reason') || card).getPropertyValue('display') !== 'none' && card.querySelector('.smart-card__reason')) errors.push('duplicated reason tag');
            if (innerWidth <= 412 && Math.abs(p.width - 130) > 2) errors.push('mobile poster must be 130px');
          }
          for (const row of document.querySelectorAll('.smart-feed__rail')) {
            if (getComputedStyle(row, '::after').display !== 'none') errors.push('legacy dark fade over rightmost poster');
            const track = row.querySelector('[role="region"]');
            const right = row.querySelector('button[aria-label="Прокрутить вперёд"]');
            if (track && right && track.scrollWidth <= track.clientWidth + 4) errors.push('arrow without actual overflow');
          }
          const continueTrack = document.querySelector('.continue-smart-grid');
          if (continueTrack && getComputedStyle(continueTrack).display !== 'flex') errors.push('continue cards wrapped into grid');
          const links = document.querySelector('nav[aria-label="Разделы AnimeBox"]');
          if (links) errors.push('duplicate shortcuts navigation');
          return { checked: cards.length, errors };
        });
        assert(compact.checked > 0, name + ' recommendation cards were rendered');
        assert.deepEqual(compact.errors, [], name + ' compact mobile/desktop recommendation geometry');

        assert.equal(await page.locator('.continue-smart-card').count(), history ? 1 : 0, name + ' real history only');
        if (history) assert((await page.locator('.continue-smart-card').getAttribute('href')).includes('ep=7'), 'Resume episode');
        if (c.mode === 'poster') { assert.equal(geometry.fit, 'contain'); assert(geometry.image.width < geometry.hero.width * .6, 'Poster is bounded'); }
        if (c.width === 1366 && c.mode === 'normal') {
          const rail = page.locator('.home-anime-rail__viewport').first();
          await page.locator('.home-anime-rail__arrow--next').first().click();
          await page.waitForFunction(() => document.querySelector('.home-anime-rail__viewport').scrollLeft > 0);
          assert(await rail.evaluate(e => e.scrollLeft > 0), 'Rail navigation');
        }
        if ([390, 1366, 1920].includes(c.width)) await page.screenshot({ path: path.join(output, name + '-initial.png'), fullPage: true });
        if (c.width === 1366 && c.mode === 'normal') {
          const menu = page.locator('.smart-card__dismiss').first();
          await menu.click();
          const dialog = page.locator('.smart-card__feedback-dialog[open]');
          await dialog.waitFor();
          const targets = await dialog.locator('.smart-card__dialog-quick-actions button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().height));
          assert(targets.every(height => height >= 44), 'Taste feedback touch targets');
          await dialog.getByRole('button', { name: /^Не сейчас/ }).click();
          await page.locator('.smart-feed__feedback-undo').waitFor();
          await page.locator('.smart-feed__feedback-undo button').click();
          await page.waitForFunction(() => !document.querySelector('.smart-feed__feedback-undo'));
        }
        const moods = page.getByRole('radio');
        await moods.nth(1).click();
        await page.waitForFunction(() => document.querySelectorAll('[role="radio"]')[1]?.getAttribute('aria-checked') === 'true');
        await moods.nth(1).press('End');
        assert.equal(await moods.last().getAttribute('aria-checked'), 'true', 'Mood keyboard selection');
        await page.waitForSelector('section[aria-labelledby="mood-picker-title"][aria-busy="false"]');
        await page.waitForSelector('.smart-feed__stage[aria-busy="false"]');
        await page.waitForSelector('.smart-card');
        assert.equal(await page.locator('[role="radiogroup"] img').count(), 0, 'Compact moods request no artwork');
        const position = page.getByRole('button', { name: /^Показать:/ }).nth(1);
        const title = (await position.getAttribute('aria-label')).replace('Показать: ', '');
        await position.click();
        await page.waitForFunction(title => document.querySelector('[data-home-hero] h1')?.textContent === title, title);
        assert.equal(await position.getAttribute('aria-pressed'), 'true');
        const after = await page.locator('[data-home-hero]').evaluate(hero => ({ title: hero.querySelector('h1').getBoundingClientRect().bottom, cta: hero.querySelector('a').getBoundingClientRect().top }));
        assert(after.title <= after.cta, 'Long title overlaps CTA');
        // Full-page screenshots captured at scrollY=0 intentionally show the
        // unmounted lazy placeholders. Inspect a scrolled, settled page too:
        // real visitors approach these sections and trigger IntersectionObserver.
        if ((c.width === 390 || c.width === 1366) && c.mode === 'normal') {
          const mounts = page.locator('[data-home-layout="cinematic"] .deferred-mount');
          const count = await mounts.count();
          for (let i = 0; i < count; i++) {
            await mounts.nth(i).scrollIntoViewIfNeeded();
            await page.waitForFunction(index => {
              const elements = document.querySelectorAll('[data-home-layout="cinematic"] .deferred-mount');
              return elements[index]?.getAttribute('data-ready') === 'true';
            }, i, { timeout: 20000 });
          }
          // Allow dynamic components to render after the mount becomes ready.
          await page.waitForTimeout(400);
          const settled = await page.evaluate(() => {
            const top = el => el ? Math.round(el.getBoundingClientRect().top + scrollY) : null;
            const bottom = el => el ? Math.round(el.getBoundingClientRect().bottom + scrollY) : null;
            const area = document.querySelector('[data-home-layout="cinematic"]');
            const watch = area.querySelector('[id="animebox-watch-together"]');
            const nav = area.querySelector('nav[aria-label="Разделы AnimeBox"]');
            return { height: document.documentElement.scrollHeight,
              watchBottom: bottom(watch), navTop: top(nav), navBottom: bottom(nav),
              ready: [...area.querySelectorAll('.deferred-mount')].map(node => node.getAttribute('data-ready')) };
          });
          fs.writeFileSync(path.join(output, name + '-settled-geometry.json'), JSON.stringify(settled, null, 2));
          assert(settled.ready.every(state => state === 'true'), name + ' deferred sections never mounted');
          await page.screenshot({ path: path.join(output, name + '-settled.png'), fullPage: true });
        }
        assert.deepEqual(errors, [], name + ' browser errors');
        console.log('PASS', name);
      } catch (error) {
        console.error('CASE', name, error);
        fs.writeFileSync(path.join(output, name + '-error.json'), JSON.stringify({ error: error.stack || String(error), errors, navigations }, null, 2));
        throw error;
      } finally {
        await page.evaluate(() => scrollTo(0, 0)).catch(() => {});
        if ([390, 1366, 1920].includes(c.width) || errors.length || navigations.length > 1) {
          await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true }).catch(error => console.error('Screenshot cleanup:', error.message));
        }
        await page.close();
      }
    }
    console.log(`PASS ${results.length} Home 32 production-shell geometry cases; screenshots: ${output}`);
  } finally {
    if (browser) await browser.close();
    builder?.kill('SIGTERM');
    server?.kill('SIGTERM');
    if (server && server.exitCode === null && server.signalCode === null) await new Promise(resolve => server.once('exit', resolve));
    fs.rmSync(fixture, { recursive: true, force: true });
    fs.rmSync('.next/dev/types', { recursive: true, force: true });
    fs.rmSync('.next/types', { recursive: true, force: true });
    fs.closeSync(log);
    fs.copyFileSync(logPath, path.join(output, 'next.log'));
  }
})().catch(error => { console.error(error); console.error('Next log:', logPath); process.exitCode = 1; });
