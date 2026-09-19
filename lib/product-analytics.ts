export type ProductAnalyticsRange = 7 | 30;

export type FunnelMetric = {
  entered: number;
  converted: number;
  conversionPct: number;
};

export type RetentionMetric = {
  eligible: number;
  returned: number;
  retentionPct: number;
};

export type ProductAnalyticsDashboard = {
  rangeDays: ProductAnalyticsRange;
  generatedAt: string;
  dataSince: string | null;
  kpis: {
    dau: number;
    wau: number;
    mau: number;
    activeUsersRange: number;
    anonymousSessionsRange: number;
    registrations7d: number;
    registrations30d: number;
    animeOpens: number;
    playStarts: number;
    episodesWatched: number;
    trackerAdds: number;
    comments: number;
    chatOpens: number;
    chatMessages: number;
  };
  funnels: {
    animeToPlay: FunnelMetric;
    playToWatched: FunnelMetric;
    chatToRegistration: FunnelMetric;
    premium: {
      views: number;
      checkoutStarted: number;
      activated: number;
      viewToCheckoutPct: number;
      checkoutToActivatedPct: number;
      viewToActivatedPct: number;
    };
  };
  retention: {
    d1: RetentionMetric;
    d7: RetentionMetric;
    d30: RetentionMetric;
  };
  timeSeries: Array<{
    date: string;
    activeUsers: number;
    registrations: number;
    animeOpens: number;
    playStarts: number;
    episodesWatched: number;
    trackerAdds: number;
    comments: number;
    chatOpens: number;
    chatMessages: number;
  }>;
  eventBreakdown: Array<{
    eventName: string;
    count: number;
  }>;
};
