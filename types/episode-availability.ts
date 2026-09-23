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
};
