/** Real production components with deterministic upstream failures. Run after build. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ||
  (process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright-core') : 'playwright'));
const html = await fs.readFile('.next/server/app/index.html', 'utf8');
const raster = await fs.readFile('public/brand/brand-mark.webp');
const now = Math.floor(Date.now() / 1000);
const items = Array.from({ length: 4 }, (_, index) => ({
  id: index + 1, airingAt: now, episode: 2, timingKind: 'planned',
  media: { id: 100 + index, idMal: 200 + index, slug: `fixture-${100 + index}`,
    title: { russian: `Тестовый тайтл ${index + 1}` },
    coverImage: { large: `https://s4.anilist.co/thumbnail-${index}.jpg`,
      extraLarge: `https://s4.anilist.co/original-${index}.jpg`, medium: `https://s4.anilist.co/small-${index}.jpg` } },
}));
const rescued = new Set();
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
  args: ['--no-sandbox', '--single-process', '--no-zygote', '--disable-gpu'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'animebox.test') return route.abort();
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (url.pathname === '/api/schedule') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ generatedAt: now, count: 4, items }) });
    if (url.pathname === '/api/image') {
      assert.equal(url.searchParams.get('fallback'), 'error');
      const source = url.searchParams.get('url') || '';
      if (!source.includes('/original-')) return route.fulfill({ status: 502, body: '' });
      rescued.add(source);
      return route.fulfill({ contentType: 'image/webp', body: raster });
    }
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, body: '{}' });
    const base = url.pathname.startsWith('/_next/static/') ? '.next/static' : 'public';
    const relative = url.pathname.startsWith('/_next/static/') ? url.pathname.slice(14) : url.pathname.slice(1);
    const file = path.resolve(base, relative);
    if (!file.startsWith(path.resolve(base) + path.sep)) return route.abort();
    try {
      return route.fulfill({ body: await fs.readFile(file), contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.webp') ? 'image/webp' : 'application/octet-stream' });
    } catch { return route.abort(); }
  });
  await page.goto('http://animebox.test/', { waitUntil: 'load' });
  await page.locator('.schedule').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => {
    const posters = [...document.querySelectorAll('.schedule__card .anime-schedule-image')];
    return posters.length === 4 && posters.every(poster => poster.closest('[data-image-state]')?.dataset.imageState === 'loaded' && poster.currentSrc.includes('/api/image?'));
  });
  assert.equal(rescued.size, 4, 'each schedule poster must reach its original server relay');
  console.log('PASS: four real Schedule/AnimeImage components recover original posters after edge/browser failure; SVG is not accepted as success.');
} finally { await browser.close(); }
