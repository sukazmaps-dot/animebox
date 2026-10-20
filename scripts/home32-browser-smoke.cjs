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
const posterSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><defs><linearGradient id="p" x2="1" y2="1"><stop stop-color="#37304e"/><stop offset="1" stop-color="#a7a3b4"/></linearGradient></defs><path fill="url(#p)" d="M0 0h600v900H0z"/><circle cx="400" cy="240" r="110" fill="#d3c5d5"/><path d="M0 900l220-500 140 270 120-120 120 350" fill="#56536e"/></svg>';
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
    const cases = [360, 376, 390, 412, 430, 768, 1024, 1366, 1440, 1920].flatMap(width => ['dark', 'light'].map(theme => ({ width, height: width === 376 ? 869 : width === 430 ? 932 : width <= 412 ? 844 : 1080, theme, mode: 'normal' })));
    cases.push({ width: 390, height: 844, theme: 'dark', mode: 'sparse' }, { width: 1920, height: 1080, theme: 'dark', mode: 'sparse' });
    cases.push({ width: 844, height: 390, theme: 'dark', mode: 'normal' }, { width: 1366, height: 900, theme: 'dark', mode: 'poster' }, { width: 390, height: 844, theme: 'dark', mode: 'broken' });
    for (const width of [360, 390, 768, 1366]) {
      cases.push({ width, height: 900, theme: 'light', mode: 'poster' });
    }
    for (const width of [360, 390, 1366]) for (const theme of ['dark', 'light']) {
      cases.push({ width, height: 900, theme, mode: 'history' });
    }
    for (const c of cases) {
      // The phone fixture must advertise coarse pointer/no-hover. A resized
      // desktop Chromium hides hover-only bookmark controls and masks mobile bugs.
      const touchPhone = c.width <= 430 && c.height > c.width;
      const page = await browser.newPage({
        viewport: { width: c.width, height: c.height },
        isMobile: touchPhone,
        hasTouch: touchPhone,
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
      });
      const errors = [];
      let recommendationRequests = 0;
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
        if (request.resourceType() === 'image' && (url.includes('qa-images.test') || url.includes('/api/image?'))) return c.mode === 'broken' ? route.fulfill({ status: 404, body: '' }) : route.fulfill({ contentType: 'image/svg+xml', body: url.includes('cover-') ? posterSvg : svg });
        if (url.startsWith(origin + '/api/recommendations?')) {
          recommendationRequests++;
          // A normal terminal page must satisfy the production response schema.
          // The generic API stub lacks pagination fields and exercises errors,
          // leaving artificial retry rows in the normal-state screenshots.
          const params = new URL(url).searchParams;
          return route.fulfill({ json: { items: [], page: Number(params.get('page')) || 1, bucket: Number(params.get('bucket')) || 0, hasMore: false, nextPage: null, nextCursor: null } });
        }
        if (url.startsWith(origin + '/api/')) return route.fulfill({ json: { items: [], data: [], results: [], ok: true, hasMore: false } });
        if (url.startsWith(origin)) return route.continue();
        return route.abort();
      });
      const name = `${c.theme}-${c.width}-${c.mode}`;
      try {
        await page.goto(`${origin}/qa-home32-check?mode=${c.mode}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
        if (c.mode === 'history') {
          await page.waitForSelector('[data-support-empty="true"]');
          await page.waitForFunction(theme => document.documentElement.dataset.animeboxTheme === theme, c.theme);
          const panel = await page.locator('[data-support-history="true"]').evaluate(el => {
            const box = el.getBoundingClientRect();
            return { height: box.height, right: box.right, left: box.left,
              overflow: document.documentElement.scrollWidth > innerWidth + 1,
              progress: el.querySelectorAll('[role="progressbar"]').length,
              rulesOpen: el.querySelector('details')?.open,
              links: [...el.querySelectorAll('a')].map(a => a.getAttribute('href')),
              actions: [...el.querySelector('[role="group"]').children].map(action => ({ width: action.getBoundingClientRect().width, height: action.getBoundingClientRect().height })) };
          });
          assert(!panel.overflow && panel.left >= 0 && panel.right <= c.width, name + ' compact history fits viewport');
          assert(panel.height <= 430, name + ' empty history height budget');
          assert.equal(panel.progress, 0, name + ' no empty progress');
          assert.equal(panel.rulesOpen, false, name + ' rules initially collapsed');
          assert.equal(await page.getByText('Страница 1', { exact: true }).count(), 0, name + ' no fake pagination');
          assert(panel.links.includes('/support') && panel.links.includes('/supporters'));
          assert(panel.actions.every(action => action.width >= 44 && action.height >= 44), name + ' history touch targets: ' + JSON.stringify(panel.actions));
          await page.getByText('Как учитывается поддержка', { exact: true }).click();
          assert.equal(await page.locator('[data-support-history] details').evaluate(el => el.open), true, name + ' accounting rules remain accessible');
          await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
          assert.deepEqual(errors, [], name + ' history runtime errors');
          console.log('PASS', name);
          continue;
        }
        await page.waitForSelector('[data-home-hero="single"] img');
        await page.waitForFunction(theme => document.documentElement.dataset.animeboxTheme === theme, c.theme);
        await page.waitForFunction(() => document.querySelector('[data-home-hero] img')?.naturalWidth > 0);
        await page.waitForSelector('[role="radiogroup"]');
        await page.waitForSelector('.smart-card', { timeout: 60000, state: c.mode === 'sparse' ? 'attached' : 'visible' });
        if (c.mode === 'sparse') {
          // Bootstrap is viewport-gated. On a phone the recommendation slot
          // starts below the hero/schedule; bring it into range before waiting
          // for the terminal API response, even though its rows take no space.
          await page.evaluate(() => document.querySelector('#animebox-recommendations').scrollIntoView({ block: 'center' }));
          await page.waitForFunction(() => document.querySelector('.smart-feed')?.getAttribute('data-recommendation-ready-count') === '0' && !document.querySelector('[data-recommendation-rail-loading="true"]'));
          const initial = await page.evaluate(() => [...document.querySelectorAll('[data-recommendation-rail-id]')].map(row => ({
            ready: row.getAttribute('data-recommendation-rail-ready'), height: row.getBoundingClientRect().height,
            visibility: getComputedStyle(row).visibility, aria: row.getAttribute('aria-hidden'), inert: row.inert,
          })));
          assert(initial.length > 0, name + ' exercises real pending rows rather than an absent feed');
          assert(initial.every(row => row.ready === 'false' && row.height === 0 && row.visibility === 'hidden' && row.aria === 'true' && row.inert),
            name + ' incomplete initial shelves take no space and cannot receive focus');
          assert(recommendationRequests > 0 && recommendationRequests <= 3, name + ' viewport bootstrap reaches the terminal API with bounded requests');
          assert.equal(errors.length, 0, name + ' sparse runtime errors');
          console.log('PASS', name);
          continue;
        }
        await page.waitForSelector('.smart-feed__stage[aria-busy="false"]');
        if (history) await page.waitForSelector('.continue-smart-card');
        // Validate the rendered order, not just source strings. Both guest
        // history and fresh sessions run in this responsive/theme matrix.
        const composition = await page.evaluate(() => {
          const selectors = ['.continue-watching-section', '#animebox-for-you',
            '#animebox-watch-together', 'section.schedule', '#animebox-recommendations',
            '.home-catalog-section', 'aside[aria-label="Сохрани свой прогресс"]'];
          const nodes = selectors.map(selector => document.querySelector(selector)).filter(Boolean);
          return {
            ordered: nodes.every((node, index) => index === 0 ||
              Boolean(nodes[index - 1].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)),
            decisions: document.querySelectorAll('#animebox-for-you').length,
            feeds: document.querySelectorAll('#animebox-recommendations').length,
            pickerInDecision: Boolean(document.querySelector('#animebox-for-you [role="radiogroup"]')),
            feedOutsideDecision: !document.querySelector('#animebox-for-you .smart-feed__stage'),
            personalSchedules: document.querySelectorAll('.personal-schedule-section').length,
          };
        });
        assert(composition.ordered, name + ' rendered decision/social/schedule/feed/guest-prompt order');
        assert.equal(composition.decisions, 1, name + ' exactly one decision');
        assert.equal(composition.feeds, 1, name + ' exactly one ranked feed');
        assert(composition.pickerInDecision && composition.feedOutsideDecision, name + ' choice is independent of long rails');
        assert(composition.personalSchedules <= 1, name + ' no duplicated personal schedule');
        assert.equal(await page.locator('#animebox-watch-together a').filter({ hasText: 'Создать комнату' }).getAttribute('href'), '/watch-together', name + ' room entry remains available');
        const geometry = await page.evaluate(() => {
          const rect = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
          const hero = document.querySelector('[data-home-hero]');
          const pagination = hero.querySelector('[role="group"]');
          return {
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            hero: rect(hero), title: rect(hero.querySelector('h2')),
            image: rect(hero.querySelector('img')), fit: getComputedStyle(hero.querySelector('img')).objectFit,
            pagination: pagination ? rect(pagination) : null,
            actions: [...hero.querySelectorAll('a')].map(rect),
            radios: [...document.querySelectorAll('[role="radio"]')].map(rect),
            rails: [...document.querySelectorAll('.home-anime-rail__viewport')].map(e => ({ viewport: rect(e), card: rect(e.querySelector('.anime-card')), scrollWidth: e.scrollWidth })),
            titleColor: getComputedStyle(hero.querySelector('h2')).color,
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
        // Shared page grid: hero artwork and visible section container have
        // the same left/right edges, regardless of sidebar width and theme.
        const aligned = await page.evaluate(() => {
          const a = document.querySelector('#animebox-for-you')?.getBoundingClientRect();
          const b = document.querySelector('section.schedule')?.getBoundingClientRect();
          return !a || !b ? null : { left: Math.abs(a.left - b.left), right: Math.abs(a.right - b.right) };
        });
        assert(aligned && aligned.left <= 1 && aligned.right <= 1, name + ' hero/schedule gutter alignment');
        const heroContentOverflow = await page.evaluate(() => {
          const hero = document.querySelector('[data-home-hero]');
          const box = hero.getBoundingClientRect();
          return [...hero.querySelectorAll('h2, p, a, button')].filter(el => el.getClientRects().length).some(el => {
            const r = el.getBoundingClientRect();
            return r.left < box.left - 1 || r.right > box.right + 1 || r.bottom > box.bottom + 1;
          });
        });
        assert(!heroContentOverflow, name + ' hero copy/actions exceed artwork surface');
        // The new decision surface uses the real ranked provider and actual
        // media component; verify its geometry and choice in the same matrix.
        const tonight = page.locator('[data-home-tonight="ready"]');
        await tonight.waitFor();
        const tonightGeometry = await tonight.evaluate(card => {
          const box = card.getBoundingClientRect();
          const title = card.querySelector('h2').getBoundingClientRect();
          const actions = [...card.querySelectorAll('a, button')].map(el => el.getBoundingClientRect());
          return {
            width: box.width, viewport: innerWidth,
            titleContained: title.left >= box.left && title.right <= box.right + 1,
            actionsContained: actions.every(r => r.left >= box.left && r.right <= box.right + 1 && r.bottom <= box.bottom + 1),
            touchTargets: actions.every(r => r.width >= 44 && r.height >= 44),
          };
        });
        assert(tonightGeometry.width <= tonightGeometry.viewport, name + ' tonight card exceeds viewport');
        assert(tonightGeometry.titleContained && tonightGeometry.actionsContained, name + ' tonight content containment');
        assert(tonightGeometry.touchTargets, name + ' tonight touch targets');
        const firstTonightId = await tonight.getAttribute('data-tonight-anime-id');
        const anotherTonight = tonight.getByRole('button', { name: 'Другой вариант', exact: true });
        assert(await anotherTonight.isEnabled(), name + ' real fixture offers another ranked candidate');
        await anotherTonight.click();
        await page.waitForFunction(id => document.querySelector('[data-home-tonight="ready"]')?.getAttribute('data-tonight-anime-id') !== id, firstTonightId);
        assert(await anotherTonight.evaluate(button => button === document.activeElement), name + ' changing pick must retain keyboard focus');
        assert((await tonight.getByRole('link', { name: 'Смотреть', exact: true }).getAttribute('href')).includes('/watch?ep=1'), name + ' canonical watch action');
        if ([390, 1366, 1920].includes(c.width)) {
          await tonight.screenshot({ path: path.join(output, name + '-tonight.png') });
        }

        const compact = await page.evaluate(() => {
          const box = el => el.getBoundingClientRect();
          // Sparse rows retain DOM identity for recommendation-order stability,
          // but are hidden with display:none. Do not measure their 0x0 posters.
          const cards = [...document.querySelectorAll('.smart-feed__slide:not(.smart-feed__slide--skeleton) .smart-card')]
            .filter(card => card.getClientRects().length > 0 && card.closest('[data-recommendation-rail-ready]')?.getAttribute('data-recommendation-rail-ready') === 'true');
          const errors = [];
          const hiddenRails = [...document.querySelectorAll('.smart-feed__personal-rail[hidden]')];
          for (const rail of hiddenRails) {
            if (rail.getClientRects().length > 0) errors.push('hidden sparse rail occupies layout');
          }
          for (const card of cards.slice(0, 8)) {
            const poster = card.querySelector('.smart-card__poster');
            const actions = card.querySelector('.smart-card__actions');
            const title = card.querySelector('.smart-card__title');
            if (!poster || !actions || !title) continue;
            const a = box(actions), p = box(poster);
            if (a.x < p.x - 2 || a.right > p.right + 2 || a.y < p.y - 2 || a.bottom > p.bottom + 2) errors.push('poster overlay overflow');
            if (innerWidth <= 430) {
              const visible = [...actions.querySelectorAll('button')].filter(button => {
                const cs = getComputedStyle(button);
                return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || '1') > 0.1 && cs.pointerEvents !== 'none';
              });
              if (visible.length !== 2 || Number(getComputedStyle(actions).opacity) < 0.5) errors.push('mobile poster must expose bookmark and settings');
              for (const button of visible) { const target = box(button); if (target.width < 44 || target.height < 44) errors.push('mobile action smaller than 44px'); }
            }
            if (getComputedStyle(card.querySelector('.smart-card__reason') || card).getPropertyValue('display') !== 'none' && card.querySelector('.smart-card__reason')) errors.push('duplicated reason tag');
            if (innerWidth <= 412 && Math.abs(p.width - 130) > 2) errors.push(`mobile poster must be 130px (poster=${p.width.toFixed(2)} slide=${box(card.parentElement).width.toFixed(2)} card=${box(card).width.toFixed(2)} media=${box(card.querySelector('.anime-card-content__media') || poster).width.toFixed(2)})`);
          }
          // Terminal 1–2-title collections must not reserve a full-width
          // bordered shelf (especially in Chrome's desktop-site phone mode).
          for (const section of document.querySelectorAll('.smart-feed__personal-rail[data-recommendation-compact="true"]')) {
            if (section.getClientRects().length === 0) continue;
            const panel = box(section);
            const track = section.querySelector('[role="region"]');
            if (!track) { errors.push('compact collection missing poster track'); continue; }
            if (panel.width > Math.min(innerWidth - 20, 580) + 2) {
              errors.push('compact recommendation stretches beyond card-sized panel: ' + panel.width.toFixed(1));
            }
            // A visible retry CTA may be wider than a single poster. Count it
            // as genuine content rather than reporting a false empty shelf.
            const retry = section.querySelector('.smart-feed__rail-retry');
            const rightMostContent = Math.max(box(track).right,
              retry ? box(retry).right : 0);
            if (innerWidth > 768 && panel.right - rightMostContent > 40) {
              errors.push('compact recommendation leaves blank space after content');
            }
          }
          for (const row of document.querySelectorAll('.smart-feed__rail')) {
            // Session-stable sparse slots retain their child DOM after the
            // parent is hidden. Their old arrow is not a visible affordance;
            // continue to validate every row that actually occupies layout.
            if (row.getClientRects().length === 0 || row.closest('[data-recommendation-rail-ready="false"]')) continue;
            if (getComputedStyle(row, '::after').display !== 'none') errors.push('legacy dark fade over rightmost poster');
            const track = row.querySelector('[role="region"]');
            const right = row.querySelector('button[aria-label="Прокрутить вперёд"]');
            if (track && right && track.scrollWidth <= track.clientWidth + 4) {
              errors.push(`arrow without actual overflow: ${row.closest('section')?.getAttribute('data-recommendation-rail-id')} (${track.scrollWidth}/${track.clientWidth})`);
            }
          }
          const continueTrack = document.querySelector('.continue-smart-grid');
          if (continueTrack && getComputedStyle(continueTrack).display !== 'flex') errors.push('continue cards wrapped into grid');
          const links = document.querySelector('nav[aria-label="Разделы AnimeBox"]');
          if (links) errors.push('duplicate shortcuts navigation');
          return { checked: cards.length, errors };
        });
        assert(compact.checked > 0, name + ' recommendation cards were rendered');
        if (compact.errors.length) console.error('HOME32 compact geometry:', name, JSON.stringify(compact.errors));
        assert.deepEqual(compact.errors, [], name + ' compact mobile/desktop recommendation geometry');

        assert.equal(await page.locator('.continue-smart-card').count(), history ? 1 : 0, name + ' real history only');
        if (history) {
          assert((await page.locator('.continue-smart-card').getAttribute('href')).includes('ep=7'), 'Resume episode');
          const resumeGeometry = await page.locator('.continue-smart-card').first().evaluate(card => {
            const poster = card.querySelector('.continue-smart-card__poster')?.getBoundingClientRect();
            const body = card.querySelector('.continue-smart-card__body')?.getBoundingClientRect();
            return { posterRight: poster?.right ?? 0, bodyLeft: body?.left ?? 0, cardWidth: card.getBoundingClientRect().width };
          });
          assert(resumeGeometry.posterRight <= resumeGeometry.bodyLeft + 1, name + ' resume poster overlaps copy');
          assert(resumeGeometry.cardWidth <= (c.width <= 768 ? c.width * 0.86 + 5 : 321), name + ' resume card width');
        }
        if (c.mode === 'poster') {
          assert.equal(geometry.fit, 'contain'); assert(geometry.image.width < geometry.hero.width * .8, 'Poster is bounded');
          const posterLayout = await page.locator('[data-home-hero]').evaluate(hero => {
            const art = hero.querySelector('[data-hero-art="poster"]')?.getBoundingClientRect();
            const body = hero.querySelector('h2')?.parentElement.getBoundingClientRect();
            const actions = hero.querySelector('a')?.parentElement.getBoundingClientRect();
            return art && body && actions ? { ratio: art.width / art.height,
              bodySeparate: art.right <= body.left + 1 || body.right <= art.left + 1,
              actionsSeparate: art.bottom <= actions.top + 1 || actions.right <= art.left + 1 } : null;
          });
          assert(posterLayout && Math.abs(posterLayout.ratio - 2 / 3) < .01, name + ' poster keeps 2:3 slot');
          assert(posterLayout.bodySeparate && posterLayout.actionsSeparate, name + ' poster never overlaps copy or controls');
        }
        assert.equal(await page.locator('.home-anime-rail__view-all').count(), 0, name + ' catalogue ends with actual titles, not a clipped CTA tile');
        assert.equal(await page.locator('main h1').count(), 1, name + ' one page H1');
        assert.equal(await page.locator('[data-home-hero]').count(), 1, name + ' one unified hero');
        assert.equal(await page.getByRole('button', { name: 'Следующий тайтл', exact: true }).count(), 0, name + ' carousel removed');
        assert.equal(await page.getByRole('group', { name: 'Выбор рекомендации', exact: true }).count(), 0, name + ' no carousel pagination');
        if (c.mode === 'broken') await page.waitForSelector('[data-home-hero] [data-image-state="fallback"]');
        if (c.width === 1366 && c.mode === 'normal') {
          // With all catalogue IDs already represented in personalized rails,
          // the duplicate-free public row is intentionally hidden. The old
          // mandatory click assumed a duplicate catalogue was always present.
          const rail = page.locator('.home-anime-rail__viewport').first();
          if (await rail.count()) {
            const next = page.locator('.home-anime-rail__arrow--next:not([hidden])').first();
            if (await next.count()) {
              await next.click();
              await page.waitForFunction(() => document.querySelector('.home-anime-rail__viewport').scrollLeft > 0);
              assert(await rail.evaluate(e => e.scrollLeft > 0), 'Rail navigation');
            }
          } else {
            assert(await page.locator('.smart-card').count() >= 4, 'Sparse catalogue replaced by ranked cards');
          }
        }
        if ([376, 390, 430, 1366, 1920].includes(c.width)) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: path.join(output, name + '-initial.png'), fullPage: true });
        }
        if ([390, 1366].includes(c.width) && c.mode === 'normal') {
          const menu = page.locator('.smart-card__dismiss').first();
          const beforeMenuUrl = page.url();
          await menu.click();
          const dialog = page.locator('.smart-card__feedback-dialog[open]');
          await dialog.waitFor();
          assert.equal(page.url(), beforeMenuUrl, name + ' feedback does not navigate');
          await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
          assert(await menu.evaluate(button => button === document.activeElement), name + ' settings dialog returns focus');
          await menu.click();
          const targets = await dialog.locator('.smart-card__dialog-quick-actions button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().height));
          assert(targets.every(height => height >= 44), 'Taste feedback touch targets');
          await dialog.getByRole('button', { name: /^Не сейчас/ }).click();
          await page.locator('.smart-feed__feedback-undo').waitFor();
          const undoGeometry = await page.locator('.smart-feed__feedback-undo').evaluate(toast => {
            const nav = document.querySelector('nav.mobile-nav');
            const box = toast.getBoundingClientRect();
            const button = toast.querySelector('button').getBoundingClientRect();
            return { aboveNav: !nav || !nav.getClientRects().length || box.bottom <= nav.getBoundingClientRect().top, touch: button.height >= 44 };
          });
          assert(undoGeometry.aboveNav && undoGeometry.touch, name + ' undo clears mobile navigation and keeps 44px target');
          await page.locator('.smart-feed__feedback-undo button').click();
          await page.waitForFunction(() => !document.querySelector('.smart-feed__feedback-undo'));
          if (c.width === 390) {
            let guestLibraryWrites = 0;
            await page.route('**/api/community/library', route => {
              guestLibraryWrites++;
              return route.fulfill({ json: { saved: true } });
            });
            const bookmark = page.locator('.smart-card__plan').first();
            await page.waitForFunction(() => {
              const button = document.querySelector('.smart-card__plan');
              return button && !button.disabled;
            });
            await bookmark.click();
            const authModal = page.locator('.auth-modal-v2');
            await authModal.waitFor();
            assert.equal(guestLibraryWrites, 0, name + ' guest bookmark must not send a library mutation');
            assert(await page.getByRole('button', { name: 'Закрыть окно входа' }).isVisible(),
              name + ' bookmark must open actual login dialog');
            await page.getByRole('button', { name: 'Закрыть окно входа' }).click();
            await authModal.waitFor({ state: 'detached' });
            await bookmark.click();
            await authModal.waitFor();
            assert.equal(guestLibraryWrites, 0, name + ' guest retry must not send library mutations');
            await page.getByRole('button', { name: 'Закрыть окно входа' }).click();
            await authModal.waitFor({ state: 'detached' });
          }
        }
        const moods = page.getByRole('radio');
        await moods.nth(1).click();
        await page.waitForFunction(() => document.querySelectorAll('[role="radio"]')[1]?.getAttribute('aria-checked') === 'true');
        await moods.nth(1).press('End');
        assert.equal(await moods.last().getAttribute('aria-checked'), 'true', 'Mood keyboard selection');
        await page.waitForSelector('section[aria-labelledby="mood-picker-title"][aria-busy="false"]');
        await page.waitForSelector('.smart-feed__stage[aria-busy="false"]');
        await page.waitForSelector('.smart-card');
        await page.waitForSelector('[data-home-tonight="ready"][data-tonight-mood="adventure"]');
        assert.equal(await page.locator('[role="radiogroup"] img').count(), 0, 'Compact moods request no artwork');
        const after = await page.locator('[data-home-hero]').evaluate(hero => ({ title: hero.querySelector('h2').getBoundingClientRect().bottom, cta: hero.querySelector('a').getBoundingClientRect().top }));
        assert(after.title <= after.cta, 'Long title overlaps CTA');
        // Full-page screenshots captured at scrollY=0 intentionally show the
        // unmounted lazy placeholders. Inspect a scrolled, settled page too:
        // real visitors approach these sections and trigger IntersectionObserver.
        if ([390, 1366, 1920].includes(c.width) && c.mode === 'normal') {
          const mounts = page.locator('[data-home-layout="cinematic"] .deferred-mount');
          const count = await mounts.count();
          for (let i = 0; i < count; i++) {
            if (await mounts.nth(i).getAttribute('data-ready') !== 'true') await mounts.nth(i).scrollIntoViewIfNeeded();
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
            const promoErrors = [];
            for (const empty of area.querySelectorAll('.deferred-mount[data-ready="true"]:empty')) {
              if (getComputedStyle(empty).display !== 'none') promoErrors.push('empty personal host reserves a shelf gap');
            }
            const promoStrip = area.querySelector('section[aria-label="Поддержка и Telegram AnimeBox"]');
            const promoCards = [...area.querySelectorAll('.home-deferred--support > section, .home-deferred--telegram > section')];
            if (promoStrip) {
              if (promoStrip.getBoundingClientRect().height > (innerWidth <= 960 ? 200 : 130)) promoErrors.push('community strip exceeds compact height budget');
              const close = promoStrip.querySelector('button[aria-label="Скрыть блок поддержки и Telegram"]');
              const heading = promoStrip.firstElementChild;
              const headerRect = heading?.getBoundingClientRect();
              const closeRect = close?.getBoundingClientRect();
              if (!headerRect || !closeRect || closeRect.top < headerRect.top - 2 || closeRect.bottom > headerRect.bottom + 2) {
                promoErrors.push('dismiss button is detached from promo header');
              }
              if (innerWidth <= 430 && headerRect && promoCards.length) {
                const first = promoCards[0].getBoundingClientRect();
                if (first.top - headerRect.bottom > 22) promoErrors.push('mobile promo reserves empty row below close');
              }
            }
            for (const card of promoCards) {
              const box = card.getBoundingClientRect(), host = card.parentElement.getBoundingClientRect();
              if (box.bottom > host.bottom + 2) promoErrors.push('promo exceeds deferred host');
              if (innerWidth <= 430 && box.height > 180) promoErrors.push('mobile promo is taller than compact card budget');
              for (const action of card.querySelectorAll('a')) {
                const r = action.getBoundingClientRect();
                if (r.top < box.top - 2 || r.bottom > box.bottom + 2 || r.right > box.right + 2) promoErrors.push('promo action clipped');
              }
            }
            return { height: document.documentElement.scrollHeight, promoErrors,
              watchBottom: bottom(watch), navTop: top(nav), navBottom: bottom(nav),
              ready: [...area.querySelectorAll('.deferred-mount')].map(node => node.getAttribute('data-ready')) };
          });
          fs.writeFileSync(path.join(output, name + '-settled-geometry.json'), JSON.stringify(settled, null, 2));
          assert(settled.ready.every(state => state === 'true'), name + ' deferred sections never mounted');
          assert.deepEqual(settled.promoErrors, [], name + ' footer promo content containment');
          assert.equal(await page.locator('.smart-feed__rail-retry:visible').count(), 0, name + ' normal terminal page must not manufacture recommendation errors');
          await page.evaluate(() => window.scrollTo(0, 0));
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
        if ([376, 390, 430, 1366, 1920].includes(c.width) || errors.length || navigations.length > 1) {
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
