import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];

function read(path) {
  const full = join(root, path);
  if (!existsSync(full)) {
    failures.push(`${path}: required file is missing.`);
    return '';
  }
  return readFileSync(full, 'utf8');
}

const proxy = read('proxy.ts');
const cachePolicy = read('lib/edge-cache-policy.ts');
const animeApi = read('app/api/anime/route.ts');
const scheduleApi = read('app/api/schedule/route.ts');
const migration = read(
  'supabase/migrations/20260923173000_edge_cache_rate_limit_offload_v1.sql',
);

for (const [label, source, needle] of [
  ['public API allowlist', cachePolicy, "PUBLIC_CACHEABLE_API_PATHS"],
  ['anime catalog allowlist', cachePolicy, "'/api/anime'"],
  ['schedule allowlist', cachePolicy, "'/api/schedule'"],
  ['Cloudflare cache header', cachePolicy, "'Cloudflare-CDN-Cache-Control'"],
  ['Vercel cache header', cachePolicy, "'Vercel-CDN-Cache-Control'"],
  ['private no-store helper', cachePolicy, 'privateNoStoreHeaders'],
  ['proxy public cache exception', proxy, 'isPublicCacheableApiRequest'],
  ['anime edge cache policy', animeApi, 'publicApiCacheHeaders'],
  ['anime error no-store', animeApi, 'privateNoStoreHeaders'],
  ['schedule edge cache policy', scheduleApi, 'publicApiCacheHeaders'],
  ['schedule error no-store', scheduleApi, 'privateNoStoreHeaders'],
  ['rate bucket cleanup function', migration, 'cleanup_api_rate_buckets'],
  ['rate bucket cleanup cron', migration, 'animebox-api-rate-bucket-cleanup'],
]) {
  if (!source.includes(needle)) {
    failures.push(`Edge cache offload: missing ${label}.`);
  }
}

if (animeApi.includes("consumeIpRateLimit(")) {
  failures.push(
    'Edge cache offload: public anime catalog must not write a Postgres rate bucket per GET.',
  );
}

if (proxy.includes("if (isApi) {\n    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');\n    response.headers.set('Cache-Control', 'private, no-store');")) {
  failures.push(
    'Edge cache offload: proxy still forces private no-store on every API response.',
  );
}

if (failures.length) {
  console.error('\n[AnimeBox Edge Cache] Check failed:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log('[AnimeBox Edge Cache] public-cache invariants passed.');
