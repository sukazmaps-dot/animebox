import {performance} from 'node:perf_hooks';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export async function measurePublicRoute(base, path, {timeoutMs = 20000} = {}) {
  const started = performance.now();
  try {
    const response = await fetch(new URL(path, base), {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {accept: path.startsWith('/api/') ? 'application/json' : 'text/html'},
    });
    const headersMs = performance.now() - started;
    const body = await response.text();
    const result = {
      path, status: response.status, headersMs: Math.round(headersMs),
      totalMs: Math.round(performance.now() - started), bytes: Buffer.byteLength(body),
      contentType: response.headers.get('content-type'),
      cacheControl: response.headers.get('cache-control'),
      cacheStatus: response.headers.get('x-nextjs-cache') ?? response.headers.get('cf-cache-status'),
      valid: response.ok,
    };
    if (path.startsWith('/api/')) {
      try {
        const data = JSON.parse(body);
        if (path.startsWith('/api/anime?')) {
          result.count = Array.isArray(data.anime) ? data.anime.length : null;
          result.source = data.catalogMeta?.source ?? null;
          result.valid &&= result.count !== null && !data.error;
          result.animePath = data.anime?.[0]?.slug ? `/anime/${encodeURIComponent(data.anime[0].slug)}` : null;
        } else if (path.startsWith('/api/schedule')) {
          result.count = Array.isArray(data.items) ? data.items.length : null;
          result.valid &&= result.count !== null && !data.error;
        }
      } catch { result.valid = false; result.error = 'Invalid JSON'; }
    } else {
      result.valid &&= /text\/html/i.test(result.contentType ?? '') && /<html[\s>]/i.test(body);
      result.scripts = (body.match(/<script\b/gi) ?? []).length;
      result.images = (body.match(/<img\b/gi) ?? []).length;
    }
    return result;
  } catch (error) {
    return {path, valid: false, totalMs: Math.round(performance.now() - started), error: error.name};
  }
}

async function main() {
  const base = new URL(process.argv[2] ?? 'https://animebox-production.up.railway.app');
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password) throw new Error('Expected a public HTTP(S) origin without credentials');
  const output = process.argv[3];
  const samples = [];
  const catalog = await measurePublicRoute(base, '/api/anime?limit=1');
  samples.push({...catalog, pass: 1});
  const paths = ['/', '/search', '/chat', '/schedule', '/login', '/api/schedule?limit=60'];
  if (catalog.animePath) paths.splice(2, 0, catalog.animePath);
  // Sequential requests: a smoke audit, not a load test. No retry amplification.
  for (const pass of [1, 2]) {
    for (const path of paths) samples.push({...await measurePublicRoute(base, path), pass});
  }
  const report = {
    generatedAt: new Date().toISOString(), origin: base.origin,
    scope: 'Anonymous HTTP responses from the audit runner; not browser LCP/INP/CLS or guaranteed cold/warm cache',
    samples,
  };
  if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.table(samples.map(({path, pass, status, headersMs, totalMs, count, valid}) => ({path, pass, status, headersMs, totalMs, count, valid})));
  if (samples.some(sample => !sample.valid)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
