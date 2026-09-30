export const RECOMMENDATION_ANALYTICS_VERSION = '22.7-analytics-v3';

export type RecommendationAnalyticsRange = 7 | 30;

export type RecommendationFunnelSlice = {
  impressions: number;
  clicks: number;
  ctrEligible: number;
  ctrPct: number;
  started: number;
  clickToPlayEligible: number;
  clickToPlayPct: number;
  watch15m: number;
  clickTo15mEligible: number;
  clickTo15mPct: number;
  startedTo15mEligible: number;
  startedTo15mPct: number;
  watch30m: number;
  startedTo30mEligible: number;
  startedTo30mPct: number;
  multiEpisode: number;
  startedToMultiEpisodeEligible: number;
  startedToMultiEpisodePct: number;
  completed: number;
  startedToCompletedEligible: number;
  startedToCompletedPct: number;
};

export type RecommendationCalibrationSlice = RecommendationFunnelSlice & {
  bucket: string;
};

export type RecommendationAnalyticsDashboard = {
  analyticsVersion: typeof RECOMMENDATION_ANALYTICS_VERSION;
  rangeDays: RecommendationAnalyticsRange;
  generatedAt: string;
  sampledEvents: number;
  attributedExposures: number;
  truncated: boolean;
  funnelMode: 'unique_recommendation_id';
  maturity: {
    ctrMinutes: number;
    clickToPlayMinutes: number;
    clickTo15mMinutes: number;
    startedTo15mMinutes: number;
    startedTo30mMinutes: number;
    startedToMultiEpisodeMinutes: number;
    startedToCompletedMinutes: number;
  };
  sampleWindow: {
    oldestEventAt: string | null;
    newestEventAt: string | null;
    effectiveHours: number;
  };
  dataQuality: {
    orphanRecommendationExposures: number;
    startedWithoutClick: number;
    watch15WithoutStarted: number;
    watch30Without15m: number;
    multiEpisodeWithoutStarted: number;
    completedWithoutStarted: number;
    invalidTimestampEvents: number;
    futureTimestampEvents: number;
  };
  kpis: {
    impressions: number;
    clicks: number;
    ctrEligible: number;
    ctrPct: number;
    planned: number;
    liked: number;
    dismissed: number;
    alreadyWatched: number;
    dismissRatePct: number;
    started: number;
    clickToPlayEligible: number;
    clickToPlayPct: number;
    watch15m: number;
    watch30m: number;
    clickTo15mEligible: number;
    clickTo15mPct: number;
    startedTo15mEligible: number;
    startedTo15mPct: number;
    startedTo30mEligible: number;
    startedTo30mPct: number;
    watch15To30Pct: number;
    completed: number;
    startedToCompletedEligible: number;
    startedToCompletedPct: number;
    multiEpisode: number;
    startedToMultiEpisodeEligible: number;
    startedToMultiEpisodePct: number;
    repeatedImpressions: number;
    repeatedImpressionRatePct: number;
    hiddenGemImpressions: number;
    hiddenGemStarted: number;
    hiddenGemStartRatePct: number;
    explorationImpressions: number;
    explorationStarted: number;
    explorationStartRatePct: number;
    dwellP50Ms: number | null;
  };
  attribution: {
    recommendationEvents: number;
    recommendationIdPct: number;
    recommendationSessionPct: number;
    algorithmVersionPct: number;
    rowIdPct: number;
    positionPct: number;
    explanationPct: number;
    diversityPct: number;
    tasteConfidencePct: number;
    matchScorePct: number;
    completionScorePct: number;
    explorationClassPct: number;
    fullyAttributedPct: number;
  };
  versions: Array<RecommendationFunnelSlice & {
    algorithmVersion: string;
  }>;
  rows: Array<RecommendationFunnelSlice & {
    rowId: string;
    dismissed: number;
    dismissRatePct: number;
    endReached: number;
    loadRequests: number;
    loadAdded: number;
    loadEmpty: number;
    loadErrors: number;
    loadFillPct: number;
    maxRailItems: number;
    maxRenderedItems: number;
    virtualizedLoads: number;
    pagesScanned: number;
  }>;
  positions: Array<RecommendationFunnelSlice & {
    bucket: '1–3' | '4–7' | '8+' | 'unknown';
  }>;
  sources: Array<RecommendationFunnelSlice & {
    source: string;
  }>;
  explanations: Array<RecommendationFunnelSlice & {
    explanationKey: string;
  }>;
  fatigue: Array<RecommendationFunnelSlice & {
    bucket: 'fresh' | 'light' | 'medium' | 'high' | 'unknown';
    dismissed: number;
    dismissRatePct: number;
  }>;
  tasteConfidence: Array<RecommendationFunnelSlice & {
    bucket: 'cold' | 'learning' | 'confident' | 'high' | 'unknown';
  }>;
  exploration: Array<RecommendationFunnelSlice & {
    className: 'safe' | 'adjacent' | 'explore' | 'unknown';
  }>;
  matchScoreCalibration: RecommendationCalibrationSlice[];
  completionScoreCalibration: RecommendationCalibrationSlice[];
  diversity: {
    eligible: number;
    moved: number;
    movedPct: number;
    promoted: number;
    demoted: number;
    unchanged: number;
    relaxed: number;
    relaxedPct: number;
    avgAbsoluteMove: number;
    slices: Array<RecommendationFunnelSlice & {
      bucket: 'promoted' | 'unchanged' | 'demoted' | 'relaxed';
    }>;
  };
  feedbackReasons: Array<{
    signal: string;
    count: number;
    shareOfDismissalsPct: number;
  }>;
  daily: Array<{
    date: string;
    impressions: number;
    clicks: number;
    started: number;
    watch15m: number;
    watch30m: number;
    multiEpisode: number;
    completed: number;
    dismissed: number;
  }>;
};
