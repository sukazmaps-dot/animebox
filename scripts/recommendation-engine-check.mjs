import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const candidates = read('app/api/recommendations/route.ts');
const ranking = read('lib/recommendation-ranking-config.ts');
const diversity = read('lib/recommendation-diversity.ts');
const recommendations = read('lib/recommendations.ts');
const recommendationTypes = read('types/recommendations.ts');
const taste = read('app/api/recommendations/taste/route.ts');
const tasteGraph = read('lib/taste-graph.ts');
const feedback = read('app/api/recommendations/feedback/route.ts');
const card = read('components/SmartRecommendationCard.tsx');
const feed = read('components/SmartRecommendationFeed.tsx');
const rails = read('lib/recommendation-rails.ts');
const smartHomeStyles = read('app/smart-home.css');
const productEvents = read('lib/product-event-names.ts');
const watch = read('components/useWatchSession.ts');
const personalization = read('lib/personalization.ts');
const productClient = read('lib/product-events-client.ts');
const productServer = read('lib/product-events-server.ts');
const recommendationAnalytics = read('lib/recommendation-analytics-server.ts');
const recommendationAnalyticsTypes = read('lib/recommendation-analytics.ts');
const recommendationAnalyticsUi = read('components/admin/RecommendationAnalyticsDashboard.tsx');
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
  !candidates.includes("'preferred_genre'") ||
  !candidates.includes("'ongoing'") ||
  !candidates.includes("'mood'") ||
  !candidates.includes('findAnimeGenre') ||
  !candidates.includes('selectCandidateSource')
) {
  failures.push('17.8.3 multi-source candidate retrieval is incomplete');
}
if (
  !candidates.includes('animebox-recommendation-candidates-v6-cursor') ||
  !candidates.includes('tasteGenre') ||
  !candidates.includes('bucket')
) {
  failures.push('candidate retrieval does not preserve finite shared cache keys');
}
if (
  !candidates.includes('encodeRecommendationCursor') ||
  !candidates.includes('decodeRecommendationCursor') ||
  !candidates.includes("error: 'invalid_cursor'") ||
  !candidates.includes('nextCursor') ||
  !candidates.includes('fallbackSource') ||
  !recommendationTypes.includes('nextCursor: string | null') ||
  !feed.includes("params.set('cursor', pointer.cursor)") ||
  !feed.includes('data.nextCursor ?? null')
) {
  failures.push('17.8.8 cursor/fallback hardening is incomplete');
}
if (
  !feed.includes('readCachedTasteGraph') ||
  !feed.includes('getCandidateContext') ||
  !feed.includes("params.set('genre', context.genre)") ||
  !feed.includes('mood: context.mood')
) {
  failures.push('Smart Feed does not provide finite taste context to retrieval');
}
if (
  !recommendationTypes.includes('RecommendationCandidateSource') ||
  !recommendationTypes.includes('preferred_genre')
) {
  failures.push('candidate source response contract is missing');
}
if (
  !ranking.includes("RECOMMENDATION_RANKING_VERSION = '17.8-v1'") ||
  !ranking.includes('RECOMMENDATION_RANKING_WEIGHTS') ||
  !ranking.includes('RecommendationScoreComponents') ||
  !ranking.includes('scoreRecommendation') ||
  !ranking.includes('recommendationMatchBasis')
) {
  failures.push('17.8.4 versioned ranking configuration is incomplete');
}
if (
  !recommendations.includes('scoreRecommendation(') ||
  !recommendations.includes('ranking.total') ||
  !recommendations.includes('ranking,') ||
  !recommendations.includes('RECOMMENDATION_ENGAGEMENT_SIGNALS')
) {
  failures.push('recommendation scoring bypasses the 17.8.4 ranking engine');
}
if (
  recommendations.includes('graphAffinity.positive * 0.25') ||
  recommendations.includes('graphAffinity.negative * 0.32') ||
  recommendations.includes('negativeEngagement * 0.9')
) {
  failures.push('ranking magic weights leaked back into recommendations.ts');
}
if (
  !diversity.includes("RECOMMENDATION_DIVERSITY_VERSION = '17.8-diversity-v1'") ||
  !diversity.includes('normalizeRecommendationExplorationRate') ||
  !diversity.includes('targetExploration') ||
  !diversity.includes('maxFamilyPerFeed') ||
  !diversity.includes('genreConcentrationPenalty')
) {
  failures.push('17.8.5 diversity/exploration policy is incomplete');
}
if (
  !recommendations.includes('diversifyRecommendations(scored') ||
  !recommendations.includes('explorationRate: tasteGraph?.explorationRate')
) {
  failures.push('ranked recommendations bypass the 17.8.5 diversity policy');
}
if (recommendations.includes('Small maximal-marginal-relevance pass')) {
  failures.push('legacy inline MMR logic remains in recommendations.ts');
}
if (
  !rails.includes("'mood_lane'") ||
  !rails.includes("source: 'smart_feed_mood_lane'") ||
  !rails.includes("badge: 'НАСТРОЕНИЕ'") ||
  !rails.includes("'Стартовый микс AnimeBox'") ||
  !feed.includes('smart-feed__rail-titleline') ||
  !feed.includes('rail.badge') ||
  !smartHomeStyles.includes('.smart-feed__rail-badge')
) {
  failures.push('17.8.6 home discovery presentation is incomplete');
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
if (
  !recommendationAnalytics.includes('recommendation_id,recommendation_session_id,algorithm_version') ||
  !recommendationAnalytics.includes('fullyAttributedPct') ||
  !recommendationAnalytics.includes('rowBreakdown') ||
  !recommendationAnalytics.includes('positionBucket') ||
  !recommendationAnalyticsTypes.includes('RecommendationFunnelSlice') ||
  !recommendationAnalyticsUi.includes('DISCOVERY ENGINE · 17.8') ||
  !recommendationAnalyticsUi.includes('Algorithm version')
) {
  failures.push('17.8.7 recommendation attribution analytics is incomplete');
}

if (failures.length) {
  console.error('Recommendation engine invariant failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Recommendation engine invariants passed.');
