/** Optional real episode media; title poster must not be used as a thumbnail. */
export type EpisodePresentation = {
  episode: number;
  title?: string | null;
  thumbnailUrl?: string | null;
  description?: string | null;
  durationSeconds?: number | null;
};

export type EpisodeAvailabilityStatus = 'available' | 'unavailable' | 'unknown';

export type EpisodeAvailabilityProvider = {
  name: 'kodik' | 'aniliberty';
  status: EpisodeAvailabilityStatus;
  episodes: number[];
  reason: string;
  playerUrl?: string | null;
};

export type EpisodeAvailabilityResponse = {
  animeId: number;
  status: EpisodeAvailabilityStatus;
  episodes: number[];
  maxEpisode: number | null;
  providers: EpisodeAvailabilityProvider[];
  reason?: string;
  episodeDetails?: EpisodePresentation[];
};
