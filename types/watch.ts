export type WatchTitleOverview = {
  animeId: number;
  title: string;
  slug: string | null;
  posterUrl: string | null;
  totalEpisodes: number | null;
  trackedEpisodes: number;
  completedEpisodes: number;
  activeMs: number;
  latestEpisode: number | null;
  resumeEpisode: number | null;
  resumePositionMs: number;
  durationMs: number | null;
  progressPercent: number | null;
  latestCompleted: boolean;
  fullyCompleted: boolean;
  lastWatchedAt: string | null;
};

export type RecentWatchResponse = {
  items: WatchTitleOverview[];
};
