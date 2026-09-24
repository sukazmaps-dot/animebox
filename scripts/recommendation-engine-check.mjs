import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const taste = read('app/api/recommendations/taste/route.ts');
const tasteGraph = read('lib/taste-graph.ts');
const feedback = read('app/api/recommendations/feedback/route.ts');
const card = read('components/SmartRecommendationCard.tsx');
const feed = read('components/SmartRecommendationFeed.tsx');
const rails = read('lib/recommendation-rails.ts');
const productEvents = read('lib/product-event-names.ts');
const watch = read('components/useWatchSession.ts');
const personalization = read('lib/personalization.ts');
const productClient = read('lib/product-events-client.ts');
const productServer = read('lib/product-events-server.ts');
const productRoute = read('app/api/analytics/product/route.ts');
const foundationMigration = read(
  'supabase/migrations/20260925010000_discovery_data_foundation_v1.sql',
);
const migration = read(
  'supabase/migrations/20260924162438_recommendation_feedback_v1.sql',
);

const failures = [];

if (!migration.includes('recommendation_feedback')) {
  failures.push('persistent recommendation feedback migration is missing');
}
if (!feedback.includes('recommendation_feedback_user')) {
  failures.push('recommendation feedback endpoint has no user rate limit');
}
if (
  !foundationMigration.includes('anonymous_id') ||
  !foundationMigration.includes('recommendation_id') ||
  !foundationMigration.includes('recommendation_session_id') ||
  !foundationMigration.includes('algorithm_version')
) {
  failures.push('17.8 recommendation attribution columns are missing');
}
if (
  !personalization.includes("RECOMMENDATION_ALGORITHM_VERSION = '17.8-v1'") ||
  !personalization.includes('createRecommendationId') ||
  !personalization.includes('row_id')
) {
  failures.push('17.8 recommendation event contract is incomplete');
}
if (
  !productClient.includes('getProductAnalyticsAnonymousId') ||
  !productClient.includes('recommendationId') ||
  !productClient.includes('algorithmVersion')
) {
  failures.push('client analytics does not preserve anonymous/recommendation attribution');
}
if (
  !productRoute.includes('recommendationSessionId') ||
  !productServer.includes('recommendation_session_id')
) {
  failures.push('product event ingestion does not preserve recommendation context');
}
if (
  !card.includes('createRecommendationId') ||
  !card.includes('recommendationIdRef.current') ||
  !feed.includes('rowId={rail.id}')
) {
  failures.push('recommendation cards do not emit stable per-impression context');
}
if (!taste.includes('recommendation_feedback')) {
  failures.push('Taste Graph does not consume explicit feedback');
}
if (
  !tasteGraph.includes("TASTE_GRAPH_VERSION = 'taste-v6'") ||
  !tasteGraph.includes('averageRating') ||
  !tasteGraph.includes('explorationRate') ||
  !tasteGraph.includes('moodWeights') ||
  !tasteGraph.includes('signalBreakdown')
) {
  failures.push('17.8.2 Taste Graph v6 contract is incomplete');
}
if (
  !taste.includes(".from('anime_ratings')") ||
  !taste.includes("score >= 9") ||
  !taste.includes("score <= 4")
) {
  failures.push('Taste Graph does not weight explicit 1-10 ratings');
}
if (
  !taste.includes("status === 'completed' || status === 'dropped'") ||
  !taste.includes('completedTitles / resolvedStatuses.length')
) {
  failures.push('Taste Graph completion rate does not use resolved titles');
}
if (
  !taste.includes("recommendation_mood_change") ||
  !taste.includes('normalizeMoodWeights') ||
  !taste.includes("item.signal === 'less_like_this'") ||
  !taste.includes("item.signal === 'hidden'")
) {
  failures.push('Taste Graph is missing mood or negative-feedback signals');
}
if (
  !taste.includes('Math.LN2') ||
  !taste.includes('effectiveSample') ||
  !taste.includes('0.2 - confidence * 0.1')
) {
  failures.push('Taste Graph is missing decay/confidence/exploration modelling');
}
if (!feed.includes('buildRecommendationRails')) {
  failures.push('Netflix-style recommendation rails are not wired');
}
if (
  !rails.includes("id: 'endless'") ||
  !rails.includes("source: 'smart_feed_endless'") ||
  !feed.includes("rail.id === 'endless' ? hasMore : false") ||
  !feed.includes("rail.id === 'endless'")
) {
  failures.push('endless recommendation pagination rail is not preserved');
}
if (!card.includes('already_watched') || !card.includes('like_more')) {
  failures.push('recommendation card is missing explicit preference controls');
}
if (
  !productEvents.includes('recommendation_watch_15m') ||
  !productEvents.includes('recommendation_watch_30m')
) {
  failures.push('recommendation watch milestones are not registered');
}
if (!watch.includes('trackRecommendationWatchProgress')) {
  failures.push('player progress is not linked to recommendation attribution');
}

if (failures.length) {
  console.error('Recommendation engine invariant failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Recommendation engine invariants passed.');
