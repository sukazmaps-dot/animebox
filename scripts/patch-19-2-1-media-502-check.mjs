import fs from 'node:fs';

const animeImage = fs.readFileSync('components/AnimeImage.tsx', 'utf8');
const health = fs.readFileSync('lib/media-edge-health-client.ts', 'utf8');
const worker = fs.readFileSync('infra/cloudflare/media-worker.js', 'utf8');

for (const needle of [
  'FAILURE_WINDOW_MS = 8_000',
  'DISTINCT_SOURCE_THRESHOLD = 4',
  'MEDIA_EDGE_COOLDOWN_MS = 60_000',
  'failedSources: Set<string>',
  'state.failedSources.add(sourceKeyForRequest(value))',
  'state.failedSources.size < DISTINCT_SOURCE_THRESHOLD',
  'subscribeMediaEdgeHealth',
  'getMediaEdgeHealthRevision',
]) {
  if (!health.includes(needle)) {
    throw new Error(`Patch 19.2.1 media circuit breaker missing: ${needle}`);
  }
}

if (health.includes('sessionStorage')) {
  throw new Error('Patch 19.2.1 circuit breaker must remain hydration-safe.');
}

for (const needle of [
  'useSyncExternalStore',
  'reportMediaEdgeFailure(current)',
  'reportMediaEdgeSuccess(current)',
  'firstUsableSourceIndex(sources, 0)',
  'isMediaEdgeBlocked(current)',
]) {
  if (!animeImage.includes(needle)) {
    throw new Error(`Patch 19.2.1 AnimeImage integration missing: ${needle}`);
  }
}

if (animeImage.includes('sourceIndex: 0,\n        loaded: false,\n      });\n    };')) {
  throw new Error('Patch 19.2.1 transient retry still blindly re-hits media source 0.');
}

for (const needle of [
  "const MEDIA_WORKER_VERSION = 'media-shield-v5-shikimori-io'",
  'reliability: MEDIA_WORKER_VERSION',
  'softFail: true',
  "'X-AnimeBox-Media-Version': MEDIA_WORKER_VERSION",
  "'X-AnimeBox-Failure-Stage': 'worker-exception'",
  "status: 204",
  'unexpectedWorkerSoftFailure',
  'return await handleRequest(request, env, ctx)',
  'object = await env.MEDIA_BUCKET.get(key)',
  'Cache API failures must not take the image route down',
]) {
  if (!worker.includes(needle)) {
    throw new Error(`Patch 19.2.1 worker hardening missing: ${needle}`);
  }
}

if (/status\s*:\s*502/.test(worker)) {
  throw new Error('Patch 19.2.1 /image worker must not explicitly surface HTTP 502.');
}

if (!worker.includes("pathname === '/image'")) {
  throw new Error('Patch 19.2.1 top-level soft-fail is not scoped to /image.');
}

console.log('Patch 19.2.1 media 502 circuit breaker invariants OK');
