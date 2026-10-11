import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const load = async (file) => {
  const output = ts.transpileModule(await readFile(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const fixtureModule = { exports: {} };
  new Function('module', 'exports', output)(fixtureModule, fixtureModule.exports);
  return fixtureModule.exports;
};
const assets = (await load('lib/mood-icon-assets.ts')).MOOD_ICON_ASSETS;
const headers = await (await load('next.config.ts')).default.headers();
const ruleIndex = headers.findIndex((rule) => rule.source === '/brand/emojis/moods/compact/:path*');
assert(ruleIndex > headers.findIndex((rule) => rule.source === '/brand/:path*'));
const cacheControl = headers[ruleIndex].headers.find((header) => header.key === 'Cache-Control').value;
assert.equal(cacheControl, 'public, max-age=31536000, immutable');
let total = 0;
for (const url of Object.values(assets)) {
  const pathname = new URL(url, 'http://animebox.test').pathname;
  const bytes = await readFile(`public${pathname}`);
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  assert(pathname.endsWith(`.${hash}.webp`), `stale content hash: ${url}`);
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.width, 128);
  assert.equal(metadata.height, 128);
  assert(bytes.length < 8_000, `oversized icon: ${url}`);
  total += bytes.length;
}
assert(total < 40_000);

// Real HTTP server: Playwright route interception disables the browser HTTP cache.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ||
  (process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'playwright-core') : 'playwright'));
let assetRequests = 0;
const server = createServer(async (request, response) => {
  if (request.url === '/') {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'text/html');
    response.end(Object.values(assets).map((url) => `<img src="${url}" width="38" height="38">`).join(''));
  } else if (Object.values(assets).includes(request.url)) {
    assetRequests++;
    response.setHeader('Cache-Control', cacheControl);
    response.setHeader('Content-Type', 'image/webp');
    response.end(await readFile(`public${new URL(request.url, 'http://animebox.test').pathname}`));
  } else { response.writeHead(404); response.end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
    args: ['--no-sandbox', '--single-process', '--no-zygote', '--disable-gpu', '--no-proxy-server'],
  });
  const page = await browser.newPage();
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url);
  await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth === 128));
  assert.equal(assetRequests, Object.keys(assets).length);
  await page.goto(url);
  await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth === 128));
  assert.equal(assetRequests, Object.keys(assets).length, 'repeat visit fetched icons again');
  console.log(`PASS: ${Object.keys(assets).length} valid compact assets (${total} bytes), scoped immutable headers, repeat visit makes zero additional icon requests.`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
