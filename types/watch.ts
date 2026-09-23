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
  resumeMode: 'resume' | 'next' | null;
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


export type EpisodeWatchListItem = {
  episode: number;
  positionMs: number;
  durationMs: number | null;
  coverageMs: number;
  eligibleDurationMs: number | null;
  percent: number | null;
  completed: boolean;
  watchedAt: string | null;
};

export type EpisodeWatchListResponse = {
  episodes: number[];
  progress: EpisodeWatchListItem[];
};
