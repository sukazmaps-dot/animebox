import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const feed = read('components/SmartRecommendationFeed.tsx');
const row = read('components/ui/ScrollRow.tsx');
const rowCss = read('components/ui/ScrollRow.module.css');
const card = read('components/SmartRecommendationCard.tsx');
const personalization = read('lib/personalization.ts');
const ranking = read('lib/recommendation-ranking-config.ts');
const diversity = read('lib/recommendation-diversity.ts');
const analytics = read('lib/recommendation-analytics-server.ts');
const analyticsUi = read('components/admin/RecommendationAnalyticsDashboard.tsx');

const failures = [];

for (const needle of [
  'DEFAULT_VIRTUAL_MAX_ITEMS = 36',
  'data-scroll-row-spacer',
  'renderedChildren',
  'virtualSpacer',
  'ResizeObserver',
  'requestAnimationFrame',
]) {
  if (!row.includes(needle) && !rowCss.includes(needle)) {
    failures.push(`ScrollRow virtualization missing: ${needle}`);
  }
}

if (row.includes('MutationObserver')) {
  failures.push('ScrollRow still installs MutationObserver per rail.');
}

for (const needle of [
  'MAX_RAIL_DOM_ITEMS = 36',
  'virtualMaxItems={MAX_RAIL_DOM_ITEMS}',
  'consumedPointerKeysRef',
  'sharedBatchPromiseRef',
  'AbortController',
  'virtual_window_max',
  'rendered_items',
  'handleHiddenRecommendation',
]) {
  if (!feed.includes(needle)) {
    failures.push(`Smart Feed runtime contract missing: ${needle}`);
  }
}

if (
  !card.includes('recommendationCardIdentityCache') ||
  !card.includes('impressionSent = true')
) {
  failures.push('Virtual card remounts can duplicate recommendation identity/impressions.');
}

if (
  !personalization.includes("RECOMMENDATION_ALGORITHM_VERSION = '18.3-v1'") ||
  !personalization.includes('negativeGenreWeights') ||
  !ranking.includes('sessionNegativeAffinity')
) {
  failures.push('18.3 same-session feedback ranking contract is incomplete.');
}

for (const needle of [
  "RECOMMENDATION_DIVERSITY_VERSION = '18.3-diversity-v2'",
  'maxRecentGenreShare',
  'formatRepeatPenalty',
  'yearBucketRepeatPenalty',
]) {
  if (!diversity.includes(needle)) {
    failures.push(`Diversity v2 missing: ${needle}`);
  }
}

if (
  !analytics.includes('maxRenderedItems') ||
  !analytics.includes('maxRailItems') ||
  !analyticsUi.includes('DOM / Rail')
) {
  failures.push('Feed runtime diagnostics are not exposed in admin analytics.');
}

if (failures.length) {
  console.error('[AnimeBox 18.3 Feed Runtime] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[AnimeBox 18.3 Feed Runtime] bounded DOM/backpressure invariants passed.');
