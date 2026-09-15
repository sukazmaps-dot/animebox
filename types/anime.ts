// src/types/anime.ts

export type AnimeImage = {
  extraLarge?: string | null;
  large?: string | null;
  medium?: string | null;
  color?: string | null;
  original?: string | null;
  preview?: string | null;
};

export type AnimeStudioNode = {
  id?: number;
  name?: string;
  [key: string]: any;
};

export type AnimeDate = {
  year?: number | null;
  month?: number | null;
  day?: number | null;
};

export type AnimeTitle = {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
  russian?: string | null;
};

export type Anime = {
  slug?: string;
  id: number;
  idMal?: number | null;
  mal_id?: number | null;
  title: AnimeTitle;
  name?: string | null;
  russian?: string | null;
  description?: string | null;
  score?: number | null;
  averageScore?: number | null;
  episodes?: number | null;
  episodesAired?: number | null;
  duration?: number | null;
  status?: string | null;
  format?: string | null;
  kind?: string | null;
  genres: string[];
  studios?: any;
  startDate?: AnimeDate | null;
  endDate?: AnimeDate | null;
  coverImage?: AnimeImage | null;
  image?: AnimeImage | null;
  bannerImage?: string | null;
  [key: string]: any;
};

export type AnimeListItem = Anime;