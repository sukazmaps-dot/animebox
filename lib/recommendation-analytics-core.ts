import {
  RECOMMENDATION_ANALYTICS_VERSION,
  type RecommendationAnalyticsDashboard,
  type RecommendationAnalyticsRange,
  type RecommendationFunnelSlice,
} from '@/lib/recommendation-analytics';

export type RecommendationAnalyticsEventRow = {
  event_name: string;
  user_id?: string | null;
  anonymous_id?: string | null;
  session_id: string | null;
  source: string | null;
  entity_id?: string | null;
  recommendation_id?: string | null;
  recommendation_session_id?: string | null;
  algorithm_version?: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type FunnelAccumulator = {
  impressions: number;
  clicks: number;
  started: number;
  watch15m: number;
  watch30m: number;
  multiEpisode: number;
  completed: number;
};

type Exposure = {
  recommendationId: string;
  animeId: number | null;
  algorithmVersion: string;
  rowId: string;
  source: string;
  position: number | null;
  explanationKey: string;
  fatigueScore: number | null;
  tasteConfidence: number | null;
  matchScore: number | null;
  completionScore: number | null;
  explorationClass: 'safe' | 'adjacent' | 'explore' | 'unknown';
  hiddenGemScore: number | null;
  exposureCount7d: number | null;
  diversityOriginalRank: number | null;
  diversityRerankedRank: number | null;
  diversityRelaxed: boolean | null;
  feedbackSignal: string | null;
  dwellMaxMs: number;
  impression: boolean;
  click: boolean;
  started: boolean;
  watch15m: boolean;
  watch30m: boolean;
  multiEpisode: boolean;
  completed: boolean;
  planned: boolean;
  liked: boolean;
  dismissed: boolean;
  alreadyWatched: boolean;
  impressionDate: string | null;
  clickDate: string | null;
  startedDate: string | null;
  watch15mDate: string | null;
  watch30mDate: string | null;
  multiEpisodeDate: string | null;
  completedDate: string | null;
  dismissedDate: string | null;
};

type RailHealth = {
  endReached: number;
  loadRequests: number;
  loadAdded: number;
  loadEmpty: number;
  loadErrors: number;
  maxRailItems: number;
  maxRenderedItems: number;
  virtualizedLoads: number;
  pagesScanned: number;
};

const EMPTY_RAIL_HEALTH: RailHealth = {
  endReached: 0,
  loadRequests: 0,
  loadAdded: 0,
  loadEmpty: 0,
  loadErrors: 0,
  maxRailItems: 0,
  maxRenderedItems: 0,
  virtualizedLoads: 0,
  pagesScanned: 0,
};

function emptyFunnel(): FunnelAccumulator {
  return {
    impressions: 0,
    clicks: 0,
    started: 0,
    watch15m: 0,
    watch30m: 0,
    multiEpisode: 0,
    completed: 0,
  };
}

function pct(numerator: number, denominator: number) {
  return denominator > 0
    ? Math.round((numerator / denominator) * 10_000) / 100
    : 0;
}

function rounded(value: number, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function metadataText(
  row: RecommendationAnalyticsEventRow,
  key: string,
  fallbackKey?: string,
) {
  const primary = row.metadata?.[key];
  if (typeof primary === 'string' && primary.trim()) {
    return primary.trim().slice(0, 120);
  }

  if (fallbackKey) {
    const fallback = row.metadata?.[fallbackKey];
    if (typeof fallback === 'string' && fallback.trim()) {
      return fallback.trim().slice(0, 120);
    }
  }

  return null;
}

function metadataNumber(
  row: RecommendationAnalyticsEventRow,
  key: string,
) {
  const value = Number(row.metadata?.[key]);
  return Number.isFinite(value) ? value : null;
}

function metadataBoolean(
  row: RecommendationAnalyticsEventRow,
  key: string,
) {
  const value = row.metadata?.[key];
  return typeof value === 'boolean' ? value : null;
}

function metadataPosition(row: RecommendationAnalyticsEventRow) {
  const value = metadataNumber(row, 'position');
  return value != null && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function recommendationId(row: RecommendationAnalyticsEventRow) {
  return (
    row.recommendation_id?.trim() ||
    metadataText(row, 'recommendation_id')
  );
}

function recommendationSessionId(row: RecommendationAnalyticsEventRow) {
  return (
    row.recommendation_session_id?.trim() ||
    metadataText(row, 'recommendation_session_id')
  );
}

function algorithmVersion(row: RecommendationAnalyticsEventRow) {
  return (
    row.algorithm_version?.trim() ||
    metadataText(row, 'algorithm_version', 'model_version')
  );
}

function rowId(row: RecommendationAnalyticsEventRow) {
  return metadataText(row, 'row_id');
}

function eventSource(row: RecommendationAnalyticsEventRow) {
  const source = row.source?.trim() || 'smart_feed';
  return source.slice(0, 64);
}

function dateOnly(value: string) {
  return value.slice(0, 10);
}

function animeId(row: RecommendationAnalyticsEventRow) {
  const raw = row.entity_id?.trim() || '';
  const value = Number.parseInt(raw.split(':')[0] ?? '', 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function explorationClass(
  row: RecommendationAnalyticsEventRow,
): Exposure['explorationClass'] | null {
  const value = metadataText(row, 'exploration_class');
  return value === 'safe' || value === 'adjacent' || value === 'explore'
    ? value
    : value
      ? 'unknown'
      : null;
}

function applyEvent(exposure: Exposure, row: RecommendationAnalyticsEventRow) {
  const date = dateOnly(row.created_at);

  if (row.event_name === 'recommendation_impression') {
    exposure.impression = true;
    exposure.impressionDate ??= date;
  } else if (row.event_name === 'recommendation_click') {
    exposure.click = true;
    exposure.clickDate ??= date;
  } else if (row.event_name === 'recommendation_started') {
    exposure.started = true;
    exposure.startedDate ??= date;
  } else if (row.event_name === 'recommendation_watch_15m') {
    exposure.watch15m = true;
    exposure.watch15mDate ??= date;
  } else if (row.event_name === 'recommendation_watch_30m') {
    exposure.watch30m = true;
    exposure.watch30mDate ??= date;
  } else if (row.event_name === 'recommendation_multi_episode') {
    exposure.multiEpisode = true;
    exposure.multiEpisodeDate ??= date;
  } else if (row.event_name === 'recommendation_completed') {
    exposure.completed = true;
    exposure.completedDate ??= date;
  } else if (row.event_name === 'recommendation_planned') {
    exposure.planned = true;
  } else if (row.event_name === 'recommendation_like') {
    exposure.liked = true;
  } else if (row.event_name === 'recommendation_dismiss') {
    exposure.dismissed = true;
    exposure.dismissedDate ??= date;
  } else if (row.event_name === 'recommendation_already_watched') {
    exposure.alreadyWatched = true;
  }

  if (row.event_name === 'recommendation_dwell') {
    const dwellMs = metadataNumber(row, 'dwell_ms');
    if (dwellMs != null && dwellMs >= 0 && dwellMs <= 120_000) {
      exposure.dwellMaxMs = Math.max(
        exposure.dwellMaxMs,
        Math.round(dwellMs),
      );
    }
  }
}

function hydrateExposure(
  exposure: Exposure,
  row: RecommendationAnalyticsEventRow,
) {
  exposure.animeId ??= animeId(row);
  if (exposure.algorithmVersion === 'unknown') {
    exposure.algorithmVersion = (algorithmVersion(row) || 'unknown').slice(
      0,
      80,
    );
  }
  if (exposure.rowId === 'unknown') {
    exposure.rowId = (rowId(row) || 'unknown').slice(0, 80);
  }
  if (exposure.source === 'unknown') {
    exposure.source = eventSource(row) || 'unknown';
  }
  exposure.position ??= metadataPosition(row);
  if (exposure.explanationKey === 'unknown') {
    exposure.explanationKey = (
      metadataText(row, 'explanation_key') || 'unknown'
    ).slice(0, 80);
  }
  exposure.fatigueScore ??= metadataNumber(row, 'fatigue_score');
  exposure.tasteConfidence ??= metadataNumber(row, 'taste_confidence');
  exposure.matchScore ??= metadataNumber(row, 'match_score');
  exposure.completionScore ??= metadataNumber(row, 'completion_score');
  exposure.hiddenGemScore ??= metadataNumber(row, 'hidden_gem_score');
  exposure.exposureCount7d ??= metadataNumber(row, 'exposure_count_7d');
  exposure.diversityOriginalRank ??= metadataNumber(
    row,
    'diversity_original_rank',
  );
  exposure.diversityRerankedRank ??= metadataNumber(
    row,
    'diversity_reranked_rank',
  );
  exposure.diversityRelaxed ??= metadataBoolean(row, 'diversity_relaxed');

  if (exposure.explorationClass === 'unknown') {
    exposure.explorationClass = explorationClass(row) ?? 'unknown';
  }

  exposure.feedbackSignal ??= metadataText(row, 'feedback_signal');
}

function createExposure(
  recommendationIdValue: string,
  row: RecommendationAnalyticsEventRow,
): Exposure {
  const exposure: Exposure = {
    recommendationId: recommendationIdValue.slice(0, 120),
    animeId: null,
    algorithmVersion: 'unknown',
    rowId: 'unknown',
    source: 'unknown',
    position: null,
    explanationKey: 'unknown',
    fatigueScore: null,
    tasteConfidence: null,
    matchScore: null,
    completionScore: null,
    explorationClass: 'unknown',
    hiddenGemScore: null,
    exposureCount7d: null,
    diversityOriginalRank: null,
    diversityRerankedRank: null,
    diversityRelaxed: null,
    feedbackSignal: null,
    dwellMaxMs: 0,
    impression: false,
    click: false,
    started: false,
    watch15m: false,
    watch30m: false,
    multiEpisode: false,
    completed: false,
    planned: false,
    liked: false,
    dismissed: false,
    alreadyWatched: false,
    impressionDate: null,
    clickDate: null,
    startedDate: null,
    watch15mDate: null,
    watch30mDate: null,
    multiEpisodeDate: null,
    completedDate: null,
    dismissedDate: null,
  };

  hydrateExposure(exposure, row);
  applyEvent(exposure, row);
  return exposure;
}

function addExposure(
  target: FunnelAccumulator,
  exposure: Exposure,
) {
  target.impressions += exposure.impression ? 1 : 0;
  target.clicks += exposure.click ? 1 : 0;
  target.started += exposure.started ? 1 : 0;
  target.watch15m += exposure.watch15m ? 1 : 0;
  target.watch30m += exposure.watch30m ? 1 : 0;
  target.multiEpisode += exposure.multiEpisode ? 1 : 0;
  target.completed += exposure.completed ? 1 : 0;
}

function funnelSlice(
  target: FunnelAccumulator,
): RecommendationFunnelSlice {
  return {
    ...target,
    ctrPct: pct(target.clicks, target.impressions),
    clickToPlayPct: pct(target.started, target.clicks),
    clickTo15mPct: pct(target.watch15m, target.clicks),
    startedTo15mPct: pct(target.watch15m, target.started),
    startedTo30mPct: pct(target.watch30m, target.started),
    startedToMultiEpisodePct: pct(
      target.multiEpisode,
      target.started,
    ),
    startedToCompletedPct: pct(target.completed, target.started),
  };
}

function getFunnel<K extends string>(
  map: Map<K, FunnelAccumulator>,
  key: K,
) {
  const current = map.get(key) ?? emptyFunnel();
  map.set(key, current);
  return current;
}

function fatigueBucket(
  value: number | null,
): 'fresh' | 'light' | 'medium' | 'high' | 'unknown' {
  if (value == null || !Number.isFinite(value)) return 'unknown';
  if (value < 0.12) return 'fresh';
  if (value < 0.35) return 'light';
  if (value < 0.65) return 'medium';
  return 'high';
}

function tasteConfidenceBucket(
  value: number | null,
): 'cold' | 'learning' | 'confident' | 'high' | 'unknown' {
  if (value == null || !Number.isFinite(value)) return 'unknown';
  if (value < 0.2) return 'cold';
  if (value < 0.45) return 'learning';
  if (value < 0.7) return 'confident';
  return 'high';
}

function matchScoreBucket(value: number | null) {
  if (value == null || !Number.isFinite(value)) return 'unknown';
  if (value < 70) return '58–69';
  if (value < 80) return '70–79';
  if (value < 90) return '80–89';
  return '90+';
}

function completionScoreBucket(value: number | null) {
  if (value == null || !Number.isFinite(value)) return 'unknown';
  if (value < 0.4) return '<0.40';
  if (value < 0.6) return '0.40–0.59';
  if (value < 0.75) return '0.60–0.74';
  return '0.75+';
}

function positionBucket(
  position: number | null,
): '1–3' | '4–7' | '8+' | 'unknown' {
  if (position == null) return 'unknown';
  if (position <= 3) return '1–3';
  if (position <= 7) return '4–7';
  return '8+';
}

function dailyRow(
  daily: Map<
    string,
    RecommendationAnalyticsDashboard['daily'][number]
  >,
  date: string,
) {
  const existing = daily.get(date);
  if (existing) return existing;

  const created: RecommendationAnalyticsDashboard['daily'][number] = {
    date,
    impressions: 0,
    clicks: 0,
    started: 0,
    watch15m: 0,
    watch30m: 0,
    multiEpisode: 0,
    completed: 0,
    dismissed: 0,
  };
  daily.set(date, created);
  return created;
}

export function aggregateRecommendationAnalyticsRows(
  inputRows: RecommendationAnalyticsEventRow[],
  rangeDays: RecommendationAnalyticsRange,
  truncated = false,
): RecommendationAnalyticsDashboard {
  const rows = [...inputRows].sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  );
  const exposures = new Map<string, Exposure>();
  const railHealth = new Map<string, RailHealth>();

  let recommendationEvents = 0;
  let recommendationIdEvents = 0;
  let recommendationSessionEvents = 0;
  let algorithmVersionEvents = 0;
  let rowIdEvents = 0;
  let positionEvents = 0;
  let explanationEvents = 0;
  let diversityEvents = 0;
  let tasteConfidenceEvents = 0;
  let matchScoreEvents = 0;
  let completionScoreEvents = 0;
  let explorationClassEvents = 0;
  let fullyAttributedEvents = 0;

  for (const row of rows) {
    const isRailHealthEvent = row.event_name.startsWith(
      'recommendation_rail_',
    );

    if (isRailHealthEvent) {
      const key = (rowId(row) || 'unknown').slice(0, 80);
      const health = railHealth.get(key) ?? { ...EMPTY_RAIL_HEALTH };

      if (row.event_name === 'recommendation_rail_end_reached') {
        health.endReached += 1;
      } else if (row.event_name === 'recommendation_rail_load_result') {
        health.loadRequests += 1;
        const claimed = metadataNumber(row, 'claimed') ?? 0;
        if (claimed > 0) {
          health.loadAdded += Math.round(claimed);
        } else {
          health.loadEmpty += 1;
        }

        const railItems =
          metadataNumber(row, 'rail_items') ??
          metadataNumber(row, 'target_limit') ??
          0;
        const renderedItems =
          metadataNumber(row, 'rendered_items') ?? 0;
        const pagesScanned =
          metadataNumber(row, 'pages_scanned') ?? 0;

        if (railItems > 0) {
          health.maxRailItems = Math.max(
            health.maxRailItems,
            Math.round(railItems),
          );
        }
        if (renderedItems > 0) {
          health.maxRenderedItems = Math.max(
            health.maxRenderedItems,
            Math.round(renderedItems),
          );
        }
        if (metadataBoolean(row, 'virtualized') === true) {
          health.virtualizedLoads += 1;
        }
        if (pagesScanned > 0) {
          health.pagesScanned += Math.round(pagesScanned);
        }
      } else if (
        row.event_name === 'recommendation_rail_load_error'
      ) {
        health.loadErrors += 1;
      }

      railHealth.set(key, health);
      continue;
    }

    recommendationEvents += 1;

    const recId = recommendationId(row);
    const recSessionId = recommendationSessionId(row);
    const version = algorithmVersion(row);
    const rail = rowId(row);
    const position = metadataPosition(row);
    const explanation = metadataText(row, 'explanation_key');
    const diversityVersion = metadataText(row, 'diversity_version');
    const tasteConfidence = metadataNumber(row, 'taste_confidence');
    const matchScore = metadataNumber(row, 'match_score');
    const completionScore = metadataNumber(row, 'completion_score');
    const exploration = explorationClass(row);

    if (recId) recommendationIdEvents += 1;
    if (recSessionId) recommendationSessionEvents += 1;
    if (version) algorithmVersionEvents += 1;
    if (rail) rowIdEvents += 1;
    if (position) positionEvents += 1;
    if (explanation) explanationEvents += 1;
    if (diversityVersion) diversityEvents += 1;
    if (tasteConfidence != null) tasteConfidenceEvents += 1;
    if (matchScore != null) matchScoreEvents += 1;
    if (completionScore != null) completionScoreEvents += 1;
    if (exploration != null) explorationClassEvents += 1;

    if (recId && recSessionId && version && rail && position) {
      fullyAttributedEvents += 1;
    }

    if (!recId) continue;

    const exposure =
      exposures.get(recId) ?? createExposure(recId, row);
    hydrateExposure(exposure, row);
    applyEvent(exposure, row);
    exposures.set(recId, exposure);
  }

  // Funnel conversion uses unique recommendation exposures whose impression
  // happened inside the selected window. Downstream events without a matching
  // in-window impression are intentionally excluded from conversion rates.
  const cohort = [...exposures.values()].filter(
    (exposure) => exposure.impression,
  );

  const versions = new Map<string, FunnelAccumulator>();
  const rowFunnels = new Map<string, FunnelAccumulator>();
  const sources = new Map<string, FunnelAccumulator>();
  const positions = new Map<
    '1–3' | '4–7' | '8+' | 'unknown',
    FunnelAccumulator
  >();
  const explanations = new Map<string, FunnelAccumulator>();
  const fatigue = new Map<
    'fresh' | 'light' | 'medium' | 'high' | 'unknown',
    FunnelAccumulator
  >();
  const fatigueDismissed = new Map<
    'fresh' | 'light' | 'medium' | 'high' | 'unknown',
    number
  >();
  const tasteConfidence = new Map<
    'cold' | 'learning' | 'confident' | 'high' | 'unknown',
    FunnelAccumulator
  >();
  const exploration = new Map<
    'safe' | 'adjacent' | 'explore' | 'unknown',
    FunnelAccumulator
  >();
  const matchCalibration = new Map<string, FunnelAccumulator>();
  const completionCalibration = new Map<string, FunnelAccumulator>();
  const diversitySlices = new Map<
    'promoted' | 'unchanged' | 'demoted' | 'relaxed',
    FunnelAccumulator
  >();
  const feedbackReasons = new Map<string, number>();
  const daily = new Map<
    string,
    RecommendationAnalyticsDashboard['daily'][number]
  >();

  const total = emptyFunnel();
  const dwell: number[] = [];

  let planned = 0;
  let liked = 0;
  let dismissed = 0;
  let alreadyWatched = 0;
  let repeatedImpressions = 0;
  let hiddenGemImpressions = 0;
  let hiddenGemStarted = 0;
  let explorationImpressions = 0;
  let explorationStarted = 0;

  let diversityEligible = 0;
  let diversityMoved = 0;
  let diversityPromoted = 0;
  let diversityDemoted = 0;
  let diversityUnchanged = 0;
  let diversityRelaxed = 0;
  let diversityAbsoluteMoveTotal = 0;

  for (const exposure of cohort) {
    addExposure(total, exposure);

    planned += exposure.planned ? 1 : 0;
    liked += exposure.liked ? 1 : 0;
    dismissed += exposure.dismissed ? 1 : 0;
    alreadyWatched += exposure.alreadyWatched ? 1 : 0;

    if ((exposure.exposureCount7d ?? 0) >= 1) {
      repeatedImpressions += 1;
    }

    if (exposure.dwellMaxMs > 0) {
      dwell.push(exposure.dwellMaxMs);
    }

    if ((exposure.hiddenGemScore ?? 0) >= 0.58) {
      hiddenGemImpressions += 1;
      hiddenGemStarted += exposure.started ? 1 : 0;
    }

    if (exposure.explorationClass === 'explore') {
      explorationImpressions += 1;
      explorationStarted += exposure.started ? 1 : 0;
    }

    addExposure(
      getFunnel(versions, exposure.algorithmVersion),
      exposure,
    );
    addExposure(getFunnel(rowFunnels, exposure.rowId), exposure);
    addExposure(getFunnel(sources, exposure.source), exposure);
    addExposure(
      getFunnel(positions, positionBucket(exposure.position)),
      exposure,
    );
    addExposure(
      getFunnel(explanations, exposure.explanationKey),
      exposure,
    );

    const fatigueKey = fatigueBucket(exposure.fatigueScore);
    addExposure(getFunnel(fatigue, fatigueKey), exposure);
    if (exposure.dismissed) {
      fatigueDismissed.set(
        fatigueKey,
        (fatigueDismissed.get(fatigueKey) ?? 0) + 1,
      );
    }

    addExposure(
      getFunnel(
        tasteConfidence,
        tasteConfidenceBucket(exposure.tasteConfidence),
      ),
      exposure,
    );
    addExposure(
      getFunnel(exploration, exposure.explorationClass),
      exposure,
    );
    addExposure(
      getFunnel(
        matchCalibration,
        matchScoreBucket(exposure.matchScore),
      ),
      exposure,
    );
    addExposure(
      getFunnel(
        completionCalibration,
        completionScoreBucket(exposure.completionScore),
      ),
      exposure,
    );

    if (exposure.dismissed) {
      const signal = (exposure.feedbackSignal || 'unknown').slice(
        0,
        80,
      );
      feedbackReasons.set(
        signal,
        (feedbackReasons.get(signal) ?? 0) + 1,
      );
    }

    const original = exposure.diversityOriginalRank;
    const reranked = exposure.diversityRerankedRank;
    if (
      original != null &&
      reranked != null &&
      Number.isFinite(original) &&
      Number.isFinite(reranked)
    ) {
      diversityEligible += 1;
      const move = Math.round(original) - Math.round(reranked);
      diversityAbsoluteMoveTotal += Math.abs(move);

      let bucket: 'promoted' | 'unchanged' | 'demoted';
      if (move > 0) {
        bucket = 'promoted';
        diversityPromoted += 1;
        diversityMoved += 1;
      } else if (move < 0) {
        bucket = 'demoted';
        diversityDemoted += 1;
        diversityMoved += 1;
      } else {
        bucket = 'unchanged';
        diversityUnchanged += 1;
      }
      addExposure(getFunnel(diversitySlices, bucket), exposure);

      if (exposure.diversityRelaxed === true) {
        diversityRelaxed += 1;
        addExposure(
          getFunnel(diversitySlices, 'relaxed'),
          exposure,
        );
      }
    }

    if (exposure.impressionDate) {
      dailyRow(daily, exposure.impressionDate).impressions += 1;
    }
    if (exposure.clickDate) {
      dailyRow(daily, exposure.clickDate).clicks += 1;
    }
    if (exposure.startedDate) {
      dailyRow(daily, exposure.startedDate).started += 1;
    }
    if (exposure.watch15mDate) {
      dailyRow(daily, exposure.watch15mDate).watch15m += 1;
    }
    if (exposure.watch30mDate) {
      dailyRow(daily, exposure.watch30mDate).watch30m += 1;
    }
    if (exposure.multiEpisodeDate) {
      dailyRow(daily, exposure.multiEpisodeDate).multiEpisode += 1;
    }
    if (exposure.completedDate) {
      dailyRow(daily, exposure.completedDate).completed += 1;
    }
    if (exposure.dismissedDate) {
      dailyRow(daily, exposure.dismissedDate).dismissed += 1;
    }
  }

  const totalSlice = funnelSlice(total);
  const positionOrder = ['1–3', '4–7', '8+', 'unknown'] as const;
  const fatigueOrder = [
    'fresh',
    'light',
    'medium',
    'high',
    'unknown',
  ] as const;
  const confidenceOrder = [
    'cold',
    'learning',
    'confident',
    'high',
    'unknown',
  ] as const;
  const explorationOrder = [
    'safe',
    'adjacent',
    'explore',
    'unknown',
  ] as const;
  const matchOrder = [
    '90+',
    '80–89',
    '70–79',
    '58–69',
    'unknown',
  ];
  const completionOrder = [
    '0.75+',
    '0.60–0.74',
    '0.40–0.59',
    '<0.40',
    'unknown',
  ];

  return {
    analyticsVersion: RECOMMENDATION_ANALYTICS_VERSION,
    rangeDays,
    generatedAt: new Date().toISOString(),
    sampledEvents: rows.length,
    attributedExposures: cohort.length,
    truncated,
    funnelMode: 'unique_recommendation_id',
    kpis: {
      impressions: total.impressions,
      clicks: total.clicks,
      ctrPct: totalSlice.ctrPct,
      planned,
      liked,
      dismissed,
      alreadyWatched,
      dismissRatePct: pct(dismissed, total.impressions),
      started: total.started,
      clickToPlayPct: totalSlice.clickToPlayPct,
      watch15m: total.watch15m,
      watch30m: total.watch30m,
      clickTo15mPct: totalSlice.clickTo15mPct,
      startedTo15mPct: totalSlice.startedTo15mPct,
      watch15To30Pct: pct(total.watch30m, total.watch15m),
      completed: total.completed,
      startedToCompletedPct: totalSlice.startedToCompletedPct,
      multiEpisode: total.multiEpisode,
      startedToMultiEpisodePct:
        totalSlice.startedToMultiEpisodePct,
      repeatedImpressions,
      repeatedImpressionRatePct: pct(
        repeatedImpressions,
        total.impressions,
      ),
      hiddenGemImpressions,
      hiddenGemStarted,
      hiddenGemStartRatePct: pct(
        hiddenGemStarted,
        hiddenGemImpressions,
      ),
      explorationImpressions,
      explorationStarted,
      explorationStartRatePct: pct(
        explorationStarted,
        explorationImpressions,
      ),
      dwellP50Ms: median(dwell),
    },
    attribution: {
      recommendationEvents,
      recommendationIdPct: pct(
        recommendationIdEvents,
        recommendationEvents,
      ),
      recommendationSessionPct: pct(
        recommendationSessionEvents,
        recommendationEvents,
      ),
      algorithmVersionPct: pct(
        algorithmVersionEvents,
        recommendationEvents,
      ),
      rowIdPct: pct(rowIdEvents, recommendationEvents),
      positionPct: pct(positionEvents, recommendationEvents),
      explanationPct: pct(explanationEvents, recommendationEvents),
      diversityPct: pct(diversityEvents, recommendationEvents),
      tasteConfidencePct: pct(
        tasteConfidenceEvents,
        recommendationEvents,
      ),
      matchScorePct: pct(matchScoreEvents, recommendationEvents),
      completionScorePct: pct(
        completionScoreEvents,
        recommendationEvents,
      ),
      explorationClassPct: pct(
        explorationClassEvents,
        recommendationEvents,
      ),
      fullyAttributedPct: pct(
        fullyAttributedEvents,
        recommendationEvents,
      ),
    },
    versions: [...versions.entries()]
      .map(([algorithmVersion, funnel]) => ({
        algorithmVersion,
        ...funnelSlice(funnel),
      }))
      .sort(
        (left, right) =>
          right.impressions - left.impressions ||
          right.started - left.started,
      ),
    rows: [...new Set([
      ...rowFunnels.keys(),
      ...railHealth.keys(),
    ])]
      .map((key) => {
        const funnel = rowFunnels.get(key) ?? emptyFunnel();
        const health = railHealth.get(key) ?? {
          ...EMPTY_RAIL_HEALTH,
        };
        return {
          rowId: key,
          ...funnelSlice(funnel),
          dismissed: [...cohort].filter(
            (exposure) =>
              exposure.rowId === key && exposure.dismissed,
          ).length,
          dismissRatePct: pct(
            [...cohort].filter(
              (exposure) =>
                exposure.rowId === key && exposure.dismissed,
            ).length,
            funnel.impressions,
          ),
          ...health,
          loadFillPct: pct(
            health.loadRequests - health.loadEmpty,
            health.loadRequests,
          ),
        };
      })
      .sort(
        (left, right) =>
          right.impressions - left.impressions ||
          right.loadRequests - left.loadRequests,
      ),
    positions: positionOrder
      .filter((bucket) => positions.has(bucket))
      .map((bucket) => ({
        bucket,
        ...funnelSlice(positions.get(bucket) ?? emptyFunnel()),
      })),
    sources: [...sources.entries()]
      .map(([source, funnel]) => ({
        source,
        ...funnelSlice(funnel),
      }))
      .sort(
        (left, right) =>
          right.impressions - left.impressions ||
          right.started - left.started,
      ),
    explanations: [...explanations.entries()]
      .map(([explanationKey, funnel]) => ({
        explanationKey,
        ...funnelSlice(funnel),
      }))
      .sort(
        (left, right) =>
          right.impressions - left.impressions ||
          right.started - left.started,
      )
      .slice(0, 24),
    fatigue: fatigueOrder
      .filter((bucket) => fatigue.has(bucket))
      .map((bucket) => {
        const funnel = fatigue.get(bucket) ?? emptyFunnel();
        const bucketDismissed = fatigueDismissed.get(bucket) ?? 0;
        return {
          bucket,
          ...funnelSlice(funnel),
          dismissed: bucketDismissed,
          dismissRatePct: pct(bucketDismissed, funnel.impressions),
        };
      }),
    tasteConfidence: confidenceOrder
      .filter((bucket) => tasteConfidence.has(bucket))
      .map((bucket) => ({
        bucket,
        ...funnelSlice(
          tasteConfidence.get(bucket) ?? emptyFunnel(),
        ),
      })),
    exploration: explorationOrder
      .filter((className) => exploration.has(className))
      .map((className) => ({
        className,
        ...funnelSlice(
          exploration.get(className) ?? emptyFunnel(),
        ),
      })),
    matchScoreCalibration: matchOrder
      .filter((bucket) => matchCalibration.has(bucket))
      .map((bucket) => ({
        bucket,
        ...funnelSlice(
          matchCalibration.get(bucket) ?? emptyFunnel(),
        ),
      })),
    completionScoreCalibration: completionOrder
      .filter((bucket) => completionCalibration.has(bucket))
      .map((bucket) => ({
        bucket,
        ...funnelSlice(
          completionCalibration.get(bucket) ?? emptyFunnel(),
        ),
      })),
    diversity: {
      eligible: diversityEligible,
      moved: diversityMoved,
      movedPct: pct(diversityMoved, diversityEligible),
      promoted: diversityPromoted,
      demoted: diversityDemoted,
      unchanged: diversityUnchanged,
      relaxed: diversityRelaxed,
      relaxedPct: pct(diversityRelaxed, diversityEligible),
      avgAbsoluteMove:
        diversityEligible > 0
          ? rounded(
              diversityAbsoluteMoveTotal / diversityEligible,
              2,
            )
          : 0,
      slices: (
        [
          'promoted',
          'unchanged',
          'demoted',
          'relaxed',
        ] as const
      )
        .filter((bucket) => diversitySlices.has(bucket))
        .map((bucket) => ({
          bucket,
          ...funnelSlice(
            diversitySlices.get(bucket) ?? emptyFunnel(),
          ),
        })),
    },
    feedbackReasons: [...feedbackReasons.entries()]
      .map(([signal, count]) => ({
        signal,
        count,
        shareOfDismissalsPct: pct(count, dismissed),
      }))
      .sort((left, right) => right.count - left.count),
    daily: [...daily.values()].sort((left, right) =>
      left.date.localeCompare(right.date),
    ),
  };
}
