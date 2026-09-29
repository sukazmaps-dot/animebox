import fs from 'node:fs';
import ts from 'typescript';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const failures = [];
const policy = read('lib/recommendation-feedback-policy.ts');
const client = read('lib/recommendation-feedback-client.ts');
const route = read('app/api/recommendations/feedback/route.ts');
const tasteRoute = read('app/api/recommendations/taste/route.ts');
const tasteGraph = read('lib/taste-graph.ts');
const ranking = read('lib/recommendation-ranking-config.ts');
const recommendations = read('lib/recommendations.ts');
const personalization = read('lib/personalization.ts');
const card = read('components/SmartRecommendationCard.tsx');
const feed = read('components/SmartRecommendationFeed.tsx');
const css = read('app/patch17-6-home-recommendation-actions.css');
const migration = read(
  'supabase/migrations/20260929234000_recommendation_feedback_v2.sql',
);

for (const [label, source, needle] of [
  ['feedback policy version', policy, "RECOMMENDATION_FEEDBACK_POLICY_VERSION = '22.4-feedback-v2'"],
  ['not-now policy', policy, "not_now: {"],
  ['14-day snooze', policy, 'exclusionDays: 14'],
  ['genre-dislike policy', policy, "dislike_genre: {"],
  ['setting-dislike policy', policy, "dislike_setting: {"],
  ['too-long policy', policy, "too_long: {"],
  ['signal migration too-long', migration, "'too_long'"],
  ['signal migration dislike genre', migration, "'dislike_genre'"],
  ['signal migration dislike setting', migration, "'dislike_setting'"],
  ['signal migration not-now', migration, "'not_now'"],
  ['signal index', migration, 'recommendation_feedback_user_signal_updated_idx'],
  ['API policy validator', route, 'isRecommendationFeedbackSignal(signal)'],
  ['API policy metadata', route, 'feedback_policy_version: RECOMMENDATION_FEEDBACK_POLICY_VERSION'],
  ['API undo', route, 'export async function DELETE(request: Request)'],
  ['client undo', client, 'clearRecommendationFeedback'],
  ['client Taste Graph refresh', client, 'refreshTasteGraphAfterFeedback'],
  ['algorithm version', personalization, "RECOMMENDATION_ALGORITHM_VERSION = '22.4-v1'"],
  ['ranking version', ranking, "RECOMMENDATION_RANKING_VERSION = '22.4-v1'"],
  ['local snooze state', personalization, 'snoozedAnimeUntil: Record<string, number>'],
  ['structured local feedback', personalization, 'applyRecommendationFeedbackLocally'],
  ['feedback event telemetry', personalization, 'feedback_signal: event.feedbackSignal ?? null'],
  ['feedback policy telemetry', personalization, 'feedback_policy_version: event.feedbackSignal'],
  ['local feedback event undo', personalization, 'removeLatestRecommendationFeedbackEvent'],
  ['not-now server event', personalization, "not_now: 'recommendation_dismiss'"],
  ['selective Taste Graph policy', tasteRoute, 'recommendationFeedbackPolicy(item.signal)'],
  ['structured telemetry not double counted', tasteRoute, 'if (!isRecommendationFeedbackSignal(structuredSignal))'],
  ['temporary server exclusion', tasteRoute, 'recommendationFeedbackExclusionActive('],
  ['axis-aware feedback', tasteRoute, 'const addTasteAxes = ('],
  ['too-long threshold', tasteRoute, 'tooLongEpisodeCountThreshold: lowerQuantile('],
  ['Taste Graph too-long field', tasteGraph, 'tooLongEpisodeCountThreshold: number | null'],
  ['length negative affinity', tasteGraph, 'episodeLengthNegativeAffinity'],
  ['length negative weight', ranking, 'episodeLengthNegative: 0.18'],
  ['length negative score', ranking, '-finite(signals.episodeLengthNegative)'],
  ['local snooze ranking filter', recommendations, '!snoozedIds.has(anime.id)'],
  ['structured engagement scores', recommendations, 'recommendationFeedbackPolicy(feedbackSignal).engagementScore'],
  ['length aversion ranking input', recommendations, 'episodeLengthNegative: lengthNegativeAffinity'],
  ['structured dialog', card, 'smart-card__feedback-dialog'],
  ['structured menu source', card, 'STRUCTURED_FEEDBACK_MENU.map'],
  ['not-interested no longer one-click', card, 'onClick={openFeedbackMenu}'],
  ['feedback undo race shield', card, 'void persistence.finally(() => {'],
  ['feedback undo removes local event', card, 'removeLatestRecommendationFeedbackEvent(anime.id, signal)'],
  ['feed undo state', feed, 'RecommendationFeedbackUndoPayload | null'],
  ['feed undo handler', feed, 'handleUndoFeedback'],
  ['feed undo snackbar', feed, 'smart-feed__feedback-undo'],
  ['dialog CSS', css, '.home-page .smart-card__feedback-dialog'],
  ['mobile feedback dialog', css, '@media (max-width: 560px)'],
  ['light feedback dialog', css, "html[data-animebox-theme='light'] .home-page .smart-card__feedback-dialog"],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

if (!failures.length) {
  try {
    const compiled = ts.transpileModule(policy, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;

    const runtime = await import(
      `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
    );

    const notNow = runtime.recommendationFeedbackPolicy('not_now');
    const genre = runtime.recommendationFeedbackPolicy('dislike_genre');
    const setting = runtime.recommendationFeedbackPolicy('dislike_setting');
    const tooLong = runtime.recommendationFeedbackPolicy('too_long');
    const watched = runtime.recommendationFeedbackPolicy('already_watched');
    const generic = runtime.recommendationFeedbackPolicy('not_interested');

    if (
      notNow.polarity !== 'neutral' ||
      notNow.exclusionDays !== 14 ||
      notNow.genreWeight !== 0 ||
      notNow.engagementScore <= -0.25
    ) {
      failures.push('not_now no longer behaves as a short-lived neutral snooze');
    }

    if (
      genre.polarity !== 'negative' ||
      genre.genreWeight <= generic.genreWeight ||
      genre.studioWeight !== 0 ||
      genre.formatWeight !== 0
    ) {
      failures.push('dislike_genre no longer isolates a strong genre-only signal');
    }

    if (
      setting.genreWeight !== 0 ||
      setting.studioWeight <= 0 ||
      setting.formatWeight <= 0 ||
      setting.eraWeight <= 0
    ) {
      failures.push('dislike_setting no longer targets metadata/style axes');
    }

    if (
      tooLong.lengthWeight <= 0 ||
      tooLong.genreWeight !== 0 ||
      tooLong.studioWeight !== 0
    ) {
      failures.push('too_long leaked into genre/studio taste');
    }

    if (
      watched.polarity !== 'neutral' ||
      watched.engagementScore !== 0 ||
      watched.genreWeight !== 0
    ) {
      failures.push('already_watched incorrectly damages taste');
    }

    const now = Date.now();
    const tenDaysAgo = new Date(now - 10 * 86_400_000).toISOString();
    const twentyDaysAgo = new Date(now - 20 * 86_400_000).toISOString();

    if (
      !runtime.recommendationFeedbackExclusionActive(
        'not_now',
        tenDaysAgo,
        now,
      )
    ) {
      failures.push('not_now stopped excluding within its 14-day window');
    }

    if (
      runtime.recommendationFeedbackExclusionActive(
        'not_now',
        twentyDaysAgo,
        now,
      )
    ) {
      failures.push('not_now no longer expires after the short-term window');
    }

    const menuSignals = runtime
      .recommendationFeedbackMenuItems()
      .map((item) => item.signal);

    for (const signal of [
      'not_interested',
      'less_like_this',
      'too_long',
      'dislike_genre',
      'dislike_setting',
      'not_now',
    ]) {
      if (!menuSignals.includes(signal)) {
        failures.push(`structured menu is missing ${signal}`);
      }
    }

    if (menuSignals.includes('already_watched')) {
      failures.push('already_watched duplicated the dedicated quick action');
    }
  } catch (error) {
    failures.push(
      `feedback policy runtime matrix failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

if (failures.length) {
  console.error('[AnimeBox Patch 22 Phase H] Structured feedback check failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  '[AnimeBox Patch 22 Phase H] structured reasons, short-term snooze, axis-aware taste, length aversion, undo and telemetry passed.',
);
