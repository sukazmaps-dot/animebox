import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {measurePublicRoute} from '../scripts/public-performance-audit.mjs';

const server = createServer((req, res) => {
  if (req.url.includes('timeout')) return;
  if (req.url.includes('broken')) {res.end('not-json'); return;}
  res.setHeader('Content-Type', req.url.startsWith('/api/') ? 'application/json' : 'text/html');
  if (req.url.startsWith('/api/schedule')) res.end(JSON.stringify({items: []}));
  else if (req.url.startsWith('/api/anime')) res.end(JSON.stringify({anime: [{slug: 'test-1'}], catalogMeta: {source: 'saved'}}));
  else res.end('<html><body><img src="x"><script></script></body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const catalog = await measurePublicRoute(base, '/api/anime?limit=1');
  assert.equal(catalog.valid, true);
  assert.equal(catalog.animePath, '/anime/test-1');
  assert.equal(catalog.source, 'saved');
  assert.equal((await measurePublicRoute(base, '/api/schedule')).valid, true, 'empty schedule is structurally valid');
  assert.equal((await measurePublicRoute(base, '/api/schedule?broken')).valid, false);
  assert.equal((await measurePublicRoute(base, '/api/schedule?timeout', {timeoutMs: 30})).valid, false);
  const page = await measurePublicRoute(base, '/');
  assert.equal(page.images, 1);
  assert.equal(page.scripts, 1);
  assert.ok(page.totalMs >= page.headersMs);
  console.log('PASS public audit: response shapes, empty data, invalid JSON, timeout and HTML');
} finally {server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
