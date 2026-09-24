export const PROFILE_WIDGET_KEYS = [
  'favorites',
  'watching',
  'ratings',
  'genres',
  'activity',
] as const;

export type ProfileWidgetKey = (typeof PROFILE_WIDGET_KEYS)[number];

export const DEFAULT_PROFILE_WIDGET_LAYOUT: Array<{
  key: ProfileWidgetKey;
  position: number;
  visible: boolean;
}> = [
  { key: 'favorites', position: 0, visible: true },
  { key: 'watching', position: 1, visible: true },
  { key: 'ratings', position: 2, visible: true },
  { key: 'genres', position: 3, visible: true },
  { key: 'activity', position: 4, visible: true },
];

export type ProfileWidgetLayoutItem = {
  key: ProfileWidgetKey;
  position: number;
  visible: boolean;
};

export type ProfileAnimeWidgetItem = {
  animeId: number;
  title: string;
  slug: string | null;
  posterUrl: string | null;
  genres: string[];
  totalEpisodes: number | null;
};

export type ProfileFavoriteAnimeItem = ProfileAnimeWidgetItem & {
  position: number;
};

export type ProfileWatchingItem = ProfileAnimeWidgetItem & {
  status: 'watching';
  updatedAt: string;
};

export type ProfileRatingItem = ProfileAnimeWidgetItem & {
  score: number;
  updatedAt: string;
};

export type ProfileGenreItem = {
  name: string;
  weight: number;
  share: number;
};

export type ProfileActivityItem = {
  id: string;
  kind: 'rating' | 'library';
  animeId: number;
  title: string;
  slug: string | null;
  posterUrl: string | null;
  label: string;
  value: string | null;
  occurredAt: string;
};

export type ProfileWidgetsData = {
  layout: ProfileWidgetLayoutItem[];
  favorites: ProfileFavoriteAnimeItem[];
  watching: ProfileWatchingItem[];
  ratings: ProfileRatingItem[];
  genres: ProfileGenreItem[];
  activity: ProfileActivityItem[];
  ratingSummary: {
    count: number;
    average: number | null;
  };
};
