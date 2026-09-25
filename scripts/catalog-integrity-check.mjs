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
  "statuses.includes('unknown')",
  "availabilityStatus = 'unknown'",
  'refreshCatalogAvailabilityBatch',
  'refreshStaleCatalogAvailability',
  "policy: 'catalog' | 'recommendations'",
]) {
  if (!availability.includes(needle)) failures.push(`availability service missing: ${needle}`);
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
  !admin.includes("requireAdmin(['owner', 'admin'])") ||
  !admin.includes('refreshCatalogAvailability(anime')
) {
  failures.push('Catalog Health admin contract is incomplete');
}

if (failures.length) {
  console.error('[AnimeBox Catalog Integrity] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[AnimeBox Catalog Integrity] availability + rating invariants passed.');
