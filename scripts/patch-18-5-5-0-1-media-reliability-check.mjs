import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const sw = read('public/animebox-sw.js');
const worker = read('infra/cloudflare/media-worker.js');
const proxy = read('app/api/image/route.ts');
const imageService = read('lib/image-service.ts');
const animeCard = read('components/AnimeCard.tsx');
const smartCard = read('components/SmartRecommendationCard.tsx');

const failures = [];

for (const needle of [
  "const VERSION = 'animebox-mobile-v2'",
  'const cacheResponse = response.clone()',
  'await cache.put(request, cacheResponse)',
  'function keepCacheTaskAlive(event, task)',
  'event?.waitUntil?.(guarded)',
  "console.warn('[AnimeBox SW] background cache write failed:'",
  'networkFirst(request, DATA_CACHE, 36, event)',
  'cacheFirst(request, STATIC_CACHE, 120, event)',
  'staleWhileRevalidate(request, IMAGE_CACHE, 140, event)',
]) {
  if (!sw.includes(needle)) {
    failures.push(`service worker reliability missing: ${needle}`);
  }
}

const cloneIndex = sw.indexOf('const cacheResponse = response.clone()');
const cacheOpenIndex = sw.indexOf('const cache = await caches.open(cacheName)');
if (
  cloneIndex < 0 ||
  cacheOpenIndex < 0 ||
  cloneIndex > cacheOpenIndex
) {
  failures.push('service worker must clone the response before the first Cache Storage await');
}

if (sw.includes('await cache.put(request, response.clone())')) {
  failures.push('service worker still clones a possibly consumed response after awaiting');
}

for (const needle of [
  'ORIGIN_PIPELINE_BUDGET_MS = 5_800',
  'TRANSFORM_FETCH_TIMEOUT_MS = 2_200',
  'RAW_FETCH_TIMEOUT_MS = 3_200',
  'RAW_RETRY_TIMEOUT_MS = 1_200',
  'NEGATIVE_CACHE_TTL_SECONDS = 15',
  'runTimedOriginAttempt',
  'remainingOriginBudget(deadlineMs)',
  'fetchRawOriginWithRetry(source, deadlineMs)',
  'isRetryableRawError',
  "error === 'origin-fetch-failed'",
  'status === 408',
  'status === 425',
  'status === 429',
  'status >= 500 && status <= 599',
  "reliability: 'media-shield-v2'",
  'originPipelineBudgetMs: ORIGIN_PIPELINE_BUDGET_MS',
  'sourceNegativeCacheTtlSeconds: SOURCE_NEGATIVE_CACHE_TTL_SECONDS',
  'sourceProbeCoalescing: true',
  "'X-AnimeBox-Origin-Error'",
  "'X-AnimeBox-Transform-Error'",
  "'X-AnimeBox-Raw-Error'",
  "'X-AnimeBox-Origin-Attempts'",
  "'Retry-After': String(NEGATIVE_CACHE_TTL_SECONDS)",
  "edgeHit.ok ? 'edge-hit' : 'negative-edge-hit'",
  'cache.put(cacheKey, failureResponse.clone())',
]) {
  if (!worker.includes(needle)) {
    failures.push(`media worker reliability missing: ${needle}`);
  }
}

if (
  (worker.match(/new AbortController\(\)/g) ?? []).length !== 1 ||
  !worker.includes(
    "(signal) => fetchTransformedOrigin(source, variant, signal)",
  ) ||
  !worker.includes("(signal) => fetchRawOrigin(source, signal)")
) {
  failures.push(
    'media worker must create fresh AbortControllers through runTimedOriginAttempt for transform/raw attempts',
  );
}

if (
  worker.includes('const FETCH_TIMEOUT_MS = 8_000') ||
  worker.includes('fetchRawOrigin(source, controller.signal)')
) {
  failures.push('media worker still shares the old single origin deadline');
}

if (
  worker.includes('env.MEDIA_BUCKET.put(key, bytes') &&
  !worker.includes('if (variant && !origin.transformed)')
) {
  failures.push('failed/untransformed variant bytes can poison the R2 variant namespace');
}

for (const needle of [
  "type ImageFetchResult =",
  "'X-AnimeBox-Image-Error'",
  "'X-AnimeBox-Image-Attempts'",
  "'Retry-After': '15'",
  "error: timedOut ? 'origin-timeout' : 'origin-fetch-failed'",
  "error: `origin-${response.status}`",
]) {
  if (!proxy.includes(needle)) {
    failures.push(`legacy image proxy diagnostics missing: ${needle}`);
  }
}

for (const needle of [
  'const secondary = remote.find',
  'result.push(primary)',
  'result.push(secondary)',
  'const legacyProxy = proxyImageUrl(primary)',
  'result.push(legacyProxy)',
]) {
  if (!imageService.includes(needle)) {
    failures.push(`bounded client image fallback chain regressed: ${needle}`);
  }
}

if (
  !animeCard.includes('loading="near"') ||
  !smartCard.includes('loading="near"')
) {
  failures.push('18.5.5.0 near-viewport warmup regressed');
}

if (failures.length) {
  console.error('\n[AnimeBox 18.5.5.0.1 Media Reliability] Check failed:\n');
  failures.forEach((failure) => console.error(` - ${failure}`));
  console.error('');
  process.exit(1);
}

console.log(
  '[AnimeBox 18.5.5.0.1 Media Reliability] Service Worker clone safety, bounded origin recovery, negative-cache shield and fallback diagnostics passed.',
);
