export type RecommendationAnalyticsRange = 7 | 30;

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
  sources: Array<{
    source: string;
    impressions: number;
    clicks: number;
    ctrPct: number;
    started: number;
    watch15m: number;
    watch30m: number;
    completed: number;
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
