import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const failures = [];
const api = read('app/api/recommendations/route.ts');
const feed = read('components/SmartRecommendationFeed.tsx');
const types = read('types/recommendations.ts');
const rails = read('lib/recommendation-rails.ts');
const discovery = read('components/home/HomeDiscoverySection.tsx');
const shell = read('components/home/HomePageShell.tsx');
const docs = read('docs/PATCH-22-DISCOVERY-RECOMMENDATIONS-3.md');

for (const [label, source, needle] of [
  ['candidate contract version', api, "RECOMMENDATION_CANDIDATE_CONTRACT_VERSION = '24.1-mood-candidate-v1'"],
  ['candidate contract response', api, 'contractVersion: RECOMMENDATION_CANDIDATE_CONTRACT_VERSION'],
  ['candidate contract type', types, 'contractVersion?: string'],
  ['request timeout', feed, 'CANDIDATE_REQUEST_TIMEOUT_MS = 7_000'],
  ['bounded attempts', feed, 'CANDIDATE_MAX_ATTEMPTS = 2'],
  ['transient status set', feed, '429, 502, 503, 504'],
  ['payload validator', feed, 'isValidRecommendationPage'],
  ['payload cache guard', feed, '!isValidRecommendationPage(parsed.data)'],
  ['shared request dedupe', feed, 'inFlightPageRequests'],
  ['abort controller', feed, 'AbortController'],
  ['bounded empty page hops', feed, 'MAX_EMPTY_PAGE_HOPS = 6'],
  ['bounded rail DOM', feed, 'MAX_RAIL_DOM_ITEMS = 36'],
  ['single-runtime schedule slot', discovery, 'midFeedSlot={<HomePersonalScheduleSection />}'],
  ['composition version', rails, "HOME_COMPOSITION_VERSION = '22.8-home-v1'"],
  ['release docs', docs, 'Release contract: `22.9-release-v1`'],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

for (const forbidden of [
  "params.get('user",
  "params.get('session",
  "params.get('anonymous",
]) {
  if (api.includes(forbidden)) {
    failures.push(`public candidate endpoint must not accept private cache key input: ${forbidden}`);
  }
}

if (
  !api.includes('publicApiCacheHeaders') ||
  !api.includes('filterAnimeByAvailability') ||
  !api.includes("runtimeFeatureDecision(\n    'recommendations'") ||
  !api.includes("'Retry-After': '30'")
) {
  failures.push('candidate API cache / availability / brownout protection regressed');
}

if (
  shell.includes('<HomePersonalScheduleSection />') ||
  (shell.match(/<HomeDiscoverySection \/>/g) ?? []).length !== 1
) {
  failures.push('Home must keep exactly one recommendation/discovery runtime and no standalone personal schedule mount');
}

if (
  !feed.includes('writeCachedPage(key, data)') ||
  feed.indexOf('isValidRecommendationPage(payload)') >
    feed.indexOf('writeCachedPage(key, data)')
) {
  failures.push('candidate payload can reach cache before validation');
}

if (failures.length) {
  console.error('[AnimeBox Patch 22 Phase M] Production hardening check failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  '[AnimeBox Patch 22 Phase M] transport, cache, degradation, runtime and single-feed release invariants passed.',
);
