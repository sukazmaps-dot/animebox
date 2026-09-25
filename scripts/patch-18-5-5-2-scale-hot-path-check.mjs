import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const failures = [];

const watchRoute = read('app/api/watch/route.ts');
const watchServer = read('lib/watch-server.ts');
const availability = read('lib/catalog-availability-server.ts');
const community = read('lib/community-server.ts');
const cachePolicy = read('lib/edge-cache-policy.ts');
const recommendations = read('app/api/recommendations/route.ts');
const discovery = read('app/api/discovery/route.ts');
const migration = read(
  'supabase/migrations/20260925205500_scale_hot_paths_v1.sql',
);

function must(label, source, needle) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

for (const needle of [
  "if (action === 'start' || action === 'end')",
  "scope: 'watch_session_ip'",
  "scope: 'watch_session_user'",
  "if (action === 'heartbeat')",
]) {
  must('watch route', watchRoute, needle);
}

if ((watchRoute.match(/enforceIpAndUserRateLimit\(/g) ?? []).length !== 1) {
  failures.push(
    'watch route: durable dual rate limiting must exist exactly once and guard lifecycle actions only',
  );
}

for (const needle of [
  'MIN_HEARTBEAT_PERSIST_INTERVAL_MS = 2_000',
  'wallDelta < MIN_HEARTBEAT_PERSIST_INTERVAL_MS',
  'new ApiError(',
  "429,",
  "input.seq <= Number(session.last_seq ?? 0)",
]) {
  must('watch heartbeat cadence', watchServer, needle);
}

const heartbeatStart = watchServer.indexOf(
  'export async function recordWatchHeartbeat',
);
const cadenceIndex = watchServer.indexOf(
  'wallDelta < MIN_HEARTBEAT_PERSIST_INTERVAL_MS',
  heartbeatStart,
);
const episodeReadIndex = watchServer.indexOf(
  ".from('episodes')",
  heartbeatStart,
);
const progressReadIndex = watchServer.indexOf(
  ".from('progress')",
  heartbeatStart,
);

if (
  heartbeatStart < 0 ||
  cadenceIndex < heartbeatStart ||
  episodeReadIndex < 0 ||
  progressReadIndex < 0 ||
  cadenceIndex > episodeReadIndex ||
  cadenceIndex > progressReadIndex
) {
  failures.push(
    'watch heartbeat cadence: too-fast heartbeat must be rejected before episode/progress reads',
  );
}

for (const needle of [
  'REGISTRY_READ_TTL_MS = 60_000',
  'REGISTRY_MISSING_TTL_MS = 20_000',
  'REGISTRY_READ_CACHE_LIMIT = 4_000',
  'const registryReadCache = new Map',
  'const registryReadInFlight = new Map',
  "const batchKey = misses.join(',')",
  'rememberRegistryRead(animeId, null)',
  'Never cache registry outage misses',
  'rememberRegistryRead(saved.anime_id, saved)',
]) {
  must('availability burst cache', availability, needle);
}

for (const needle of [
  'ANIME_CATALOG_READ_TTL_MS = 60_000',
  'ANIME_CATALOG_READ_CACHE_LIMIT = 2_000',
  'const animeCatalogReadCache = new Map',
  'const animeCatalogReadInFlight = new Map',
  "const batchKey = sorted.join(',')",
  'cachedAnimeCatalogRow(animeId, now)',
  'now - Date.parse(row.updated_at) >= 86_400_000',
  'rememberAnimeCatalogRow(row)',
]) {
  must('anime catalog burst cache', community, needle);
}

must(
  'edge cache policy',
  cachePolicy,
  "'/api/recommendations'",
);
if (cachePolicy.includes("'/api/discovery'")) {
  failures.push(
    'edge cache policy: arbitrary natural-language discovery must not enter the public CDN allowlist in 18.5.5.2',
  );
}

for (const needle of [
  'publicApiCacheHeaders',
  'browserSeconds: 30',
  'edgeSeconds: FILTERED_RESPONSE_CACHE_SECONDS',
  'staleWhileRevalidateSeconds: STALE_SECONDS',
  "'X-AnimeBox-Cache-Profile': 'recommendations-public-v1'",
  'privateNoStoreHeaders()',
]) {
  must('recommendation edge cache', recommendations, needle);
}

if (!discovery.includes("classifySearchQuery(rawQuery)")) {
  failures.push('discovery route contract changed unexpectedly');
}

for (const needle of [
  'create index if not exists comment_reports_reporter_id_idx',
  'on public.comment_reports (reporter_id)',
  'create index if not exists comment_reports_resolved_by_idx',
  'on public.comment_reports (resolved_by)',
  'create index if not exists profile_favorite_anime_anime_id_idx',
  'on public.profile_favorite_anime (anime_id)',
]) {
  must('scale migration', migration.toLowerCase(), needle);
}

if (/\bdrop\s+(index|table|column)\b/i.test(migration)) {
  failures.push('scale migration: destructive DROP statement is forbidden');
}

if (/\bdelete\s+from\b|\btruncate\b/i.test(migration)) {
  failures.push('scale migration: destructive data mutation is forbidden');
}

if (failures.length) {
  console.error('\n[AnimeBox 18.5.5.2 Scale Hot Paths] Check failed:\n');
  for (const failure of failures) console.error(` - ${failure}`);
  console.error('');
  process.exit(1);
}

console.log(
  '[AnimeBox 18.5.5.2 Scale Hot Paths] watch write amplification, burst caches, recommendation edge caching and additive advisor indexes passed.',
);
