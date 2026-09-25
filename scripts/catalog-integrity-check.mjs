import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read('supabase/migrations/20260925050000_catalog_availability_v1.sql');
const availability = read('lib/catalog-availability-server.ts');
const animeRoute = read('app/api/anime/route.ts');
const recommendations = read('app/api/recommendations/route.ts');
const suggestions = read('app/api/search/suggestions/route.ts');
const discovery = read('app/api/discovery/route.ts');
const related = read('components/RelatedAnime.tsx');
const animeImage = read('components/AnimeImage.tsx');
const card = read('components/SmartRecommendationCard.tsx');
const smartHome = read('app/smart-home.css');
const contentFirst = read('app/design-v2-content-first.css');
const cron = read('app/api/cron/catalog-availability/route.ts');
const admin = read('app/api/admin/catalog-health/route.ts');
const vercel = read('vercel.json');
const homeFeed = read('lib/home-feed-server.ts');
const recommendationRoute = read('app/api/recommendations/route.ts');
const detailControls = read('components/AnimeDetailControls.tsx');
const episodeList = read('components/EpisodeList.tsx');

const failures = [];

for (const needle of [
  'create table if not exists public.anime_availability',
  "availability_status in ('playable', 'unknown', 'unavailable')",
  'consecutive_misses integer not null default 0',
  'alter table public.anime_availability enable row level security',
]) {
  if (!migration.includes(needle)) failures.push(`migration missing: ${needle}`);
}

for (const needle of [
  'CONFIRMED_MISS_THRESHOLD = 3',
  'PROBE_CONCURRENCY = 4',
  'DEGRADED_ONGOING_GRACE_MS',
  'DEGRADED_FINISHED_GRACE_MS',
  "type ExposureState = 'playable' | 'degraded' | 'pending' | 'unavailable'",
  "statuses.includes('unknown')",
  "availabilityStatus = 'unknown'",
  "previous?.availability_status === 'playable'",
  "!wasEverPlayable || consecutiveMisses >= CONFIRMED_MISS_THRESHOLD",
  'verifiedSnapshot',
  'registryHealthy: registry.healthy',
  'refreshCatalogAvailabilityBatch',
  'refreshStaleCatalogAvailability',
  "policy: 'catalog' | 'recommendations'",
]) {
  if (!availability.includes(needle)) failures.push(`availability service missing: ${needle}`);
}

if (
  !availability.includes("state === 'playable' || state === 'degraded'") ||
  availability.includes('...playable, ...unknown') ||
  availability.includes('strictTarget')
) {
  failures.push('public surfaces still fail open to never-verified UNKNOWN titles');
}

if (
  !availability.includes("if (!row) return 'pending'") ||
  !availability.includes("if (row.availability_status === 'unavailable') return 'unavailable'") ||
  !availability.includes("if (lastSuccessWithinGrace(row, anime, now)) return 'degraded'")
) {
  failures.push('verified playback exposure state machine is incomplete');
}

if (
  !availability.includes("registry read failed:") ||
  !availability.includes('const snapshot = verifiedSnapshot.get(id)') ||
  availability.includes('return { rows, healthy: false };') === false
) {
  failures.push('registry outage does not fail closed to verified snapshot data');
}

if (
  !animeRoute.includes("status !== 'upcoming'") ||
  !animeRoute.includes("filterAnimeByAvailability(\n        candidates,\n        'catalog'")
) {
  failures.push('catalog/search availability policy is incomplete');
}

if (
  !recommendations.includes("filterAnimeByAvailability(\n      result.items,\n      'recommendations'") ||
  !recommendations.includes('availability.items')
) {
  failures.push('recommendation availability filtering is incomplete');
}

if (!suggestions.includes('filterAnimeIdsByAvailability')) {
  failures.push('search suggestions do not suppress confirmed unavailable titles');
}

if (
  !discovery.includes("filterAnimeByAvailability(\n      candidates,\n      'catalog'") ||
  !related.includes("filterAnimeByAvailability(\n      filtered,\n      'catalog'")
) {
  failures.push('contextual discovery / related titles bypass availability filtering');
}

if (
  !animeImage.includes("export type AnimeImageLoadState = 'loading' | 'loaded' | 'fallback'") ||
  !animeImage.includes('onStateChange?.(publicState)')
) {
  failures.push('AnimeImage does not expose reliable poster state');
}

if (
  !card.includes("posterState === 'loaded' && ratingLabel") ||
  !card.includes('formatAnimeScore(anime)') ||
  !card.includes('onStateChange={setPosterState}')
) {
  failures.push('rating badge still floats independently of poster state');
}

if (
  !smartHome.includes('top: 8px;') ||
  contentFirst.includes('.smart-card__rating {\n  top:')
) {
  failures.push('rating position still has competing CSS ownership');
}

if (
  !cron.includes('refreshStaleCatalogAvailability(24)') ||
  !cron.includes('isCronAuthorized')
) {
  failures.push('bounded catalog availability cron is incomplete');
}

if (
  !vercel.includes('"path": "/api/cron/catalog-availability"') ||
  !vercel.includes('"schedule": "23 * * * *"')
) {
  failures.push('catalog availability verification is not scheduled hourly');
}

if (
  !homeFeed.includes('refreshCatalogAvailabilityBatch(') ||
  !homeFeed.includes("animebox-home-initial-feed-v4-verified-playback")
) {
  failures.push('home feed does not warm hidden/stale playback candidates');
}

if (
  !recommendationRoute.includes('FILTERED_RESPONSE_CACHE_SECONDS = 5 * 60') ||
  !recommendationRoute.includes("animebox-recommendation-candidates-v7-verified-playback") ||
  !recommendationRoute.includes('{ limit: 8 }')
) {
  failures.push('recommendation verification/cache rollout is incomplete');
}

if (
  !admin.includes("requireAdmin(['owner', 'admin'])") ||
  !admin.includes('refreshCatalogAvailability(anime')
) {
  failures.push('Catalog Health admin contract is incomplete');
}

if (
  !detailControls.includes('playable: playbackReady') ||
  !detailControls.includes('disabled={!playbackReady}') ||
  !detailControls.includes("if (!playbackReady) return;") ||
  detailControls.includes("availability?.status === 'unavailable'\n        ? null\n        : metadataCount")
) {
  failures.push('detail watch action can still open unverified metadata episodes');
}

if (
  !episodeList.includes("if (availability?.status !== 'available') return []") ||
  !episodeList.includes("availability?.status === 'unknown'") ||
  episodeList.includes('return metadataEpisodeNumbers')
) {
  failures.push('episode list still creates playback links from unverified metadata');
}

if (failures.length) {
  console.error('[AnimeBox Catalog Integrity] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[AnimeBox Catalog Integrity] availability + rating invariants passed.');
