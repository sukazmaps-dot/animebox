import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const taste = read('app/api/recommendations/taste/route.ts');
const feedback = read('app/api/recommendations/feedback/route.ts');
const card = read('components/SmartRecommendationCard.tsx');
const feed = read('components/SmartRecommendationFeed.tsx');
const productEvents = read('lib/product-event-names.ts');
const watch = read('components/useWatchSession.ts');
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
if (!taste.includes('recommendation_feedback')) {
  failures.push('Taste Graph does not consume explicit feedback');
}
if (!feed.includes('buildRecommendationRails')) {
  failures.push('Netflix-style recommendation rails are not wired');
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
