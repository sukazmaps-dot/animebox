export type MonetizationDashboardRange = 7 | 30;

export type MonetizationDashboard = {
  rangeDays: MonetizationDashboardRange;
  generatedAt: string;
  kpis: {
    activePremium: number;
    newPremium7d: number;
    newPremium30d: number;
    starsRevenue: number;
    boostyVerifiedUsers: number;
    donatePayRevenueByCurrency: Record<string, number>;
    sponsorRevenueStars: number;
    expirations: number;
    cancellations: number;
    expiringNext7d: number;
  };
  sourceBreakdown: {
    telegram_stars: number;
    boosty_telegram: number;
    admin: number;
    other: number;
  };
  funnel: {
    views: number;
    checkoutStarted: number;
    paymentSuccess: number;
    activated: number;
    viewToCheckoutPct: number;
    checkoutToActivatedPct: number;
    viewToActivatedPct: number;
  };
  ads: {
    requested: number;
    filled: number;
    impressions: number;
    noFill: number;
    clicks: number;
    houseFills: number;
    houseImpressions: number;
    fillRatePct: number;
    viewabilityPct: number;
    noFillRatePct: number;
    ctrPct: number | null;
    ctrScope: 'house_only' | 'unavailable';
  };
  timeSeries: Array<{
    date: string;
    premiumActivations: number;
    premiumViews: number;
    checkouts: number;
    starsRevenue: number;
    sponsorRevenueStars: number;
    donatePayRevenueRub: number;
    adRequests: number;
    adFills: number;
    adImpressions: number;
    adNoFill: number;
  }>;
  recentPayments: Array<{
    id: string;
    userId: string | null;
    username: string | null;
    provider: string;
    productCode: string;
    status: string;
    amount: number;
    currency: string;
    paidAt: string | null;
    createdAt: string;
  }>;
};
