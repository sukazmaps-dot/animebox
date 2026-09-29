import fs from 'node:fs';
import ts from 'typescript';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const failures = [];
const types = read('lib/recommendation-analytics.ts');
const core = read('lib/recommendation-analytics-core.ts');
const server = read('lib/recommendation-analytics-server.ts');
const ui = read('components/admin/RecommendationAnalyticsDashboard.tsx');
const productNames = read('lib/product-event-names.ts');
const productClient = read('lib/product-events-client.ts');
const personalization = read('lib/personalization.ts');
const migration = read(
  'supabase/migrations/20260929221500_recommendation_analytics_v3.sql',
);
const docs = read('docs/PATCH-22-DISCOVERY-RECOMMENDATIONS-3.md');

for (const [label, source, needle] of [
  ['analytics version', types, "RECOMMENDATION_ANALYTICS_VERSION = '22.7-analytics-v3'"],
  ['unique exposure funnel', types, "funnelMode: 'unique_recommendation_id'"],
  ['multi-episode KPI', types, 'startedToMultiEpisodePct'],
  ['repeat exposure KPI', types, 'repeatedImpressionRatePct'],
  ['explanation breakdown', types, 'explanations: Array'],
  ['fatigue breakdown', types, 'fatigue: Array'],
  ['taste-confidence breakdown', types, 'tasteConfidence: Array'],
  ['exploration breakdown', types, 'exploration: Array'],
  ['match calibration', types, 'matchScoreCalibration'],
  ['completion calibration', types, 'completionScoreCalibration'],
  ['diversity diagnostics', types, 'avgAbsoluteMove'],
  ['feedback reason analytics', types, 'feedbackReasons'],
  ['pure exposure aggregator', core, 'aggregateRecommendationAnalyticsRows'],
  ['impression cohort guard', core, 'exposure.impression'],
  ['repeat exposure source', core, 'exposure.exposureCount7d'],
  ['match score bucketing', core, 'function matchScoreBucket'],
  ['completion score bucketing', core, 'function completionScoreBucket'],
  ['fatigue bucketing', core, 'function fatigueBucket'],
  ['taste confidence bucketing', core, 'function tasteConfidenceBucket'],
  ['diversity movement', core, 'diversityAbsoluteMoveTotal'],
  ['feedback signal source', core, "metadataText(row, 'feedback_signal')"],
  ['server multi episode event', server, "'recommendation_multi_episode'"],
  ['server core aggregation', server, 'aggregateRecommendationAnalyticsRows'],
  ['newest-event bounded scan', server, ".order('created_at', { ascending: false })"],
  ['multi episode event name', productNames, "'recommendation_multi_episode'"],
  ['forward episode gate', productClient, 'input.episode > firstEpisode'],
  ['meaningful continuation gate', productClient, 'currentActiveMs >= 90_000'],
  ['multi episode emission', productClient, "trackProductClientEvent('recommendation_multi_episode'"],
  ['watch completion-score attribution', productClient, 'completion_score: parsed.completionScore ?? null'],
  ['watch exploration attribution', productClient, 'exploration_class: parsed.explorationClass ?? null'],
  ['watch fatigue attribution', productClient, 'fatigue_score: parsed.fatigueScore ?? null'],
  ['taste confidence attribution', personalization, 'taste_confidence: event.tasteConfidence ?? null'],
  ['analytics DB index', migration, 'product_events_recommendation_analytics_v3_idx'],
  ['admin analytics 3.0 UI', ui, 'Recommendation Analytics 3.0'],
  ['match calibration UI', ui, 'Match Score vs реальные outcomes'],
  ['completion calibration UI', ui, 'Completion Score calibration'],
  ['diversity analytics UI', ui, 'Цена и польза reranking'],
  ['phase K docs', docs, '# 14. Phase K — Recommendation Analytics 3.0'],
]) {
  if (!source.includes(needle)) {
    failures.push(`${label}: missing ${needle}`);
  }
}

if (!failures.length) {
  try {
    const runtimeSource = core.replace(
      /import \{[\s\S]*?\} from '@\/lib\/recommendation-analytics';\n/,
      "const RECOMMENDATION_ANALYTICS_VERSION = '22.7-analytics-v3';\n",
    );

    const compiled = ts.transpileModule(runtimeSource, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;

    const runtime = await import(
      `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
    );

    const at = (minutes) =>
      new Date(Date.UTC(2026, 8, 29, 10, minutes, 0)).toISOString();

    const metadata = ({
      row = 'top_match',
      position = 1,
      explanation = 'taste_genres',
      fatigue = 0.1,
      confidence = 0.8,
      match = 92,
      completion = 0.8,
      exploration = 'safe',
      hiddenGem = 0,
      exposure7d = 0,
      originalRank = 1,
      rerankedRank = 1,
      relaxed = false,
      feedback = null,
    } = {}) => ({
      row_id: row,
      position,
      explanation_key: explanation,
      fatigue_score: fatigue,
      taste_confidence: confidence,
      match_score: match,
      completion_score: completion,
      exploration_class: exploration,
      hidden_gem_score: hiddenGem,
      exposure_count_7d: exposure7d,
      diversity_version: '22.6-diversity-v3',
      diversity_original_rank: originalRank,
      diversity_reranked_rank: rerankedRank,
      diversity_relaxed: relaxed,
      feedback_signal: feedback,
      recommendation_session_id: 'rec-session-1234',
      algorithm_version: '22.6-v1',
    });

    const row = (
      eventName,
      recommendationId,
      minute,
      meta = metadata(),
      source = 'taste_graph',
      entityId = '101',
    ) => ({
      event_name: eventName,
      user_id: 'user-analytics-test',
      anonymous_id: null,
      session_id: 'product-session-1234',
      source,
      entity_id: entityId,
      recommendation_id: recommendationId,
      recommendation_session_id: 'rec-session-1234',
      algorithm_version: '22.6-v1',
      metadata: {
        recommendation_id: recommendationId,
        ...meta,
      },
      created_at: at(minute),
    });

    const rows = [
      row(
        'recommendation_impression',
        'rec-a-12345678',
        0,
        metadata({
          explanation: 'liked_reference',
          hiddenGem: 0.72,
          exposure7d: 2,
          originalRank: 4,
          rerankedRank: 2,
        }),
      ),
      // Duplicate impression for the same exposure must not inflate KPI.
      row(
        'recommendation_impression',
        'rec-a-12345678',
        1,
        metadata({
          explanation: 'liked_reference',
          hiddenGem: 0.72,
          exposure7d: 2,
          originalRank: 4,
          rerankedRank: 2,
        }),
      ),
      row('recommendation_click', 'rec-a-12345678', 2),
      row('recommendation_started', 'rec-a-12345678', 3),
      row('recommendation_watch_15m', 'rec-a-12345678', 18),
      row('recommendation_watch_15m', 'rec-a-12345678', 19),
      row('recommendation_watch_30m', 'rec-a-12345678', 34),
      row('recommendation_multi_episode', 'rec-a-12345678', 42),
      row('recommendation_completed', 'rec-a-12345678', 44),
      row('recommendation_like', 'rec-a-12345678', 45),

      row(
        'recommendation_impression',
        'rec-b-12345678',
        4,
        metadata({
          row: 'explore',
          position: 5,
          explanation: 'exploration_bridge',
          fatigue: 0.82,
          confidence: 0.1,
          match: 64,
          completion: 0.28,
          exploration: 'explore',
          hiddenGem: 0.65,
          originalRank: 2,
          rerankedRank: 4,
          relaxed: true,
        }),
        'discovery',
        '202',
      ),
      row(
        'recommendation_dismiss',
        'rec-b-12345678',
        5,
        metadata({
          row: 'explore',
          position: 5,
          explanation: 'exploration_bridge',
          fatigue: 0.82,
          confidence: 0.1,
          match: 64,
          completion: 0.28,
          exploration: 'explore',
          hiddenGem: 0.65,
          originalRank: 2,
          rerankedRank: 4,
          relaxed: true,
          feedback: 'too_long',
        }),
        'discovery',
        '202',
      ),

      row(
        'recommendation_impression',
        'rec-c-12345678',
        6,
        metadata({
          row: 'taste_lane',
          position: 3,
          explanation: 'completed_taste',
          fatigue: 0.28,
          confidence: 0.38,
          match: 84,
          completion: 0.66,
          exploration: 'adjacent',
          hiddenGem: 0,
          originalRank: 3,
          rerankedRank: 3,
        }),
        'watch_history',
        '303',
      ),
      row(
        'recommendation_click',
        'rec-c-12345678',
        7,
        metadata({
          row: 'taste_lane',
          position: 3,
          explanation: 'completed_taste',
          fatigue: 0.28,
          confidence: 0.38,
          match: 84,
          completion: 0.66,
          exploration: 'adjacent',
          originalRank: 3,
          rerankedRank: 3,
        }),
        'watch_history',
        '303',
      ),
      row(
        'recommendation_started',
        'rec-c-12345678',
        8,
        metadata({
          row: 'taste_lane',
          position: 3,
          explanation: 'completed_taste',
          fatigue: 0.28,
          confidence: 0.38,
          match: 84,
          completion: 0.66,
          exploration: 'adjacent',
          originalRank: 3,
          rerankedRank: 3,
        }),
        'watch_history',
        '303',
      ),
      row(
        'recommendation_watch_15m',
        'rec-c-12345678',
        23,
        metadata({
          row: 'taste_lane',
          position: 3,
          explanation: 'completed_taste',
          fatigue: 0.28,
          confidence: 0.38,
          match: 84,
          completion: 0.66,
          exploration: 'adjacent',
          originalRank: 3,
          rerankedRank: 3,
        }),
        'watch_history',
        '303',
      ),

      // Downstream event without an in-window impression is not a funnel cohort.
      row('recommendation_click', 'rec-legacy-1234', 9),

      {
        event_name: 'recommendation_rail_load_result',
        user_id: null,
        anonymous_id: null,
        session_id: 'product-session-1234',
        source: 'smart_feed_top_match',
        entity_id: 'top_match',
        recommendation_id: null,
        recommendation_session_id: null,
        algorithm_version: null,
        metadata: {
          row_id: 'top_match',
          claimed: 6,
          rail_items: 18,
          rendered_items: 12,
          pages_scanned: 2,
          virtualized: true,
        },
        created_at: at(46),
      },
    ];

    const dashboard = runtime.aggregateRecommendationAnalyticsRows(
      rows,
      7,
      false,
    );

    if (dashboard.analyticsVersion !== '22.7-analytics-v3') {
      failures.push('analytics contract version was not emitted');
    }

    if (
      dashboard.attributedExposures !== 3 ||
      dashboard.kpis.impressions !== 3 ||
      dashboard.kpis.clicks !== 2 ||
      dashboard.kpis.started !== 2 ||
      dashboard.kpis.watch15m !== 2 ||
      dashboard.kpis.watch30m !== 1 ||
      dashboard.kpis.multiEpisode !== 1 ||
      dashboard.kpis.completed !== 1
    ) {
      failures.push('unique recommendation exposure funnel is double-counting or leaking non-cohort events');
    }

    if (
      dashboard.kpis.ctrPct !== 66.67 ||
      dashboard.kpis.startedToMultiEpisodePct !== 50 ||
      dashboard.kpis.startedToCompletedPct !== 50
    ) {
      failures.push('core funnel conversion rates are incorrect');
    }

    if (
      dashboard.kpis.repeatedImpressions !== 1 ||
      dashboard.kpis.repeatedImpressionRatePct !== 33.33
    ) {
      failures.push('repeat-exposure KPI is not based on prior exposure count');
    }

    if (
      dashboard.kpis.hiddenGemImpressions !== 2 ||
      dashboard.kpis.hiddenGemStarted !== 1 ||
      dashboard.kpis.hiddenGemStartRatePct !== 50
    ) {
      failures.push('hidden-gem conversion is incorrect');
    }

    if (
      dashboard.kpis.explorationImpressions !== 1 ||
      dashboard.kpis.explorationStarted !== 0
    ) {
      failures.push('exploration conversion segment is incorrect');
    }

    const feedback = dashboard.feedbackReasons.find(
      (item) => item.signal === 'too_long',
    );
    if (!feedback || feedback.count !== 1 || feedback.shareOfDismissalsPct !== 100) {
      failures.push('structured feedback reason breakdown is incorrect');
    }

    const highFatigue = dashboard.fatigue.find(
      (item) => item.bucket === 'high',
    );
    if (!highFatigue || highFatigue.dismissRatePct !== 100) {
      failures.push('fatigue bucket does not preserve dismiss outcomes');
    }

    if (
      !dashboard.tasteConfidence.some(
        (item) => item.bucket === 'cold' && item.impressions === 1,
      ) ||
      !dashboard.tasteConfidence.some(
        (item) => item.bucket === 'learning' && item.impressions === 1,
      ) ||
      !dashboard.tasteConfidence.some(
        (item) => item.bucket === 'high' && item.impressions === 1,
      )
    ) {
      failures.push('taste-confidence buckets are incomplete');
    }

    if (
      !dashboard.matchScoreCalibration.some(
        (item) => item.bucket === '90+' && item.impressions === 1,
      ) ||
      !dashboard.matchScoreCalibration.some(
        (item) => item.bucket === '80–89' && item.impressions === 1,
      ) ||
      !dashboard.matchScoreCalibration.some(
        (item) => item.bucket === '58–69' && item.impressions === 1,
      )
    ) {
      failures.push('match-score calibration buckets are incorrect');
    }

    if (
      !dashboard.completionScoreCalibration.some(
        (item) => item.bucket === '0.75+' && item.completed === 1,
      ) ||
      !dashboard.completionScoreCalibration.some(
        (item) => item.bucket === '0.60–0.74' && item.watch15m === 1,
      )
    ) {
      failures.push('completion-score calibration buckets are incorrect');
    }

    if (
      dashboard.diversity.eligible !== 3 ||
      dashboard.diversity.moved !== 2 ||
      dashboard.diversity.promoted !== 1 ||
      dashboard.diversity.demoted !== 1 ||
      dashboard.diversity.unchanged !== 1 ||
      dashboard.diversity.relaxed !== 1
    ) {
      failures.push('diversity movement analytics are incorrect');
    }

    const likedReason = dashboard.explanations.find(
      (item) => item.explanationKey === 'liked_reference',
    );
    if (!likedReason || likedReason.multiEpisode !== 1) {
      failures.push('explanation family did not retain deep-watch attribution');
    }

    const topRow = dashboard.rows.find(
      (item) => item.rowId === 'top_match',
    );
    if (
      !topRow ||
      topRow.loadRequests !== 1 ||
      topRow.loadAdded !== 6 ||
      topRow.maxRailItems !== 18 ||
      topRow.maxRenderedItems !== 12 ||
      topRow.virtualizedLoads !== 1
    ) {
      failures.push('rail runtime health was lost during funnel aggregation');
    }

    if (
      dashboard.attribution.recommendationIdPct <= 0 ||
      dashboard.attribution.explanationPct <= 0 ||
      dashboard.attribution.diversityPct <= 0 ||
      dashboard.attribution.tasteConfidencePct <= 0
    ) {
      failures.push('new attribution coverage metrics are not populated');
    }
  } catch (error) {
    failures.push(
      `analytics runtime matrix failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

if (failures.length) {
  console.error('[AnimeBox Patch 22 Phase K] Recommendation Analytics 3.0 check failed:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(
  '[AnimeBox Patch 22 Phase K] exposure funnel, calibration, multi-episode outcome, fatigue, exploration, diversity and feedback analytics passed.',
);
