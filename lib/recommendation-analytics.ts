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
    dismissed: number;
    dismissRatePct: number;
    started: number;
    clickToPlayPct: number;
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
    completed: number;
  }>;
  daily: Array<{
    date: string;
    impressions: number;
    clicks: number;
    started: number;
    completed: number;
    dismissed: number;
  }>;
};
