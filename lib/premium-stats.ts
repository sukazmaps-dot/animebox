export type PremiumStatsTopGenre = {
  genre: string;
  episodes: number;
};

export type PremiumStatsTopTitle = {
  animeId: number;
  slug: string | null;
  title: string;
  posterUrl: string | null;
  episodes: number;
  lastCompletedAt: string | null;
};

export type PremiumStatsMonth = {
  key: string;
  label: string;
  episodes: number;
};

export type PremiumStatsHistoryItem = {
  animeId: number;
  slug: string | null;
  title: string;
  posterUrl: string | null;
  episode: number;
  completedAt: string;
};

export type PremiumYearReview = {
  year: number;
  episodes: number;
  titles: number;
  activeDays: number;
  topGenre: PremiumStatsTopGenre | null;
  topTitle: PremiumStatsTopTitle | null;
  busiestMonth: PremiumStatsMonth | null;
  months: PremiumStatsMonth[];
};

export type PremiumStatsPayload = {
  generatedAt: string;
  yearReview: PremiumYearReview;
  overview: {
    episodes: number;
    titles: number;
    watchMinutes: number;
    activeMs: number;
    comments: number;
    longestStreak: number;
    activeDays30: number;
    episodes30: number;
    weeklyAverage30: number;
  };
  topGenres: PremiumStatsTopGenre[];
  topTitles: PremiumStatsTopTitle[];
  months: PremiumStatsMonth[];
  activityTimestamps: string[];
  recentHistory: PremiumStatsHistoryItem[];
};
