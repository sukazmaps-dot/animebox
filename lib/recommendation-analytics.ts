export type RecommendationAnalyticsRange = 7 | 30;

export type RecommendationFunnelSlice = {
  impressions: number;
  clicks: number;
  ctrPct: number;
  started: number;
  watch15m: number;
  watch30m: number;
  completed: number;
};

export type RecommendationAnalyticsDashboard = {
  rangeDays: RecommendationAnalyticsRange;
  generatedAt: string;
  sampledEvents: number;
  truncated: boolean;
  kpis: {
    impressions: number;
    clicks: number;
    ctrPct: number;
    planned: number;
    liked: number;
    dismissed: number;
    alreadyWatched: number;
    dismissRatePct: number;
    started: number;
    clickToPlayPct: number;
    watch15m: number;
    watch30m: number;
    clickTo15mPct: number;
    startedTo15mPct: number;
    watch15To30Pct: number;
    completed: number;
    startedToCompletedPct: number;
    dwellP50Ms: number | null;
  };
  attribution: {
    recommendationEvents: number;
    recommendationIdPct: number;
    recommendationSessionPct: number;
    algorithmVersionPct: number;
    rowIdPct: number;
    positionPct: number;
    fullyAttributedPct: number;
  };
  versions: Array<RecommendationFunnelSlice & {
    algorithmVersion: string;
    clickTo15mPct: number;
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
  positions: Array<{
    bucket: '1–3' | '4–7' | '8+' | 'unknown';
    impressions: number;
    clicks: number;
    ctrPct: number;
  }>;
  sources: Array<RecommendationFunnelSlice & {
    source: string;
  }>;
  daily: Array<{
    date: string;
    impressions: number;
    clicks: number;
    started: number;
    watch15m: number;
    watch30m: number;
    completed: number;
    dismissed: number;
  }>;
};
