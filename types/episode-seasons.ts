export type EpisodeSeasonTab = {
  id: number;
  slug: string;
  label: string;
  title: string;
  seasonNumber: number;
  partNumber: number | null;
  episodes: number[];
  year: number | null;
  isCurrent: boolean;
};

export type EpisodeExtraItem = {
  id: number;
  slug: string;
  title: string;
  format: string | null;
  year: number | null;
};

export type EpisodeSeasonsResponse = {
  seasons: EpisodeSeasonTab[];
  extras: EpisodeExtraItem[];
  partial: boolean;
};
