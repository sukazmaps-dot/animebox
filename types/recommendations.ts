import type { Anime } from '@/types/anime';

/**
 * Public candidate page for the Smart Feed.
 * Personal ranking still happens in the browser because AnimeBox currently
 * keeps taste/history signals local-first in localStorage.
 */
export type RecommendationPage = {
  items: Anime[];
  page: number;
  nextPage: number | null;
  hasMore: boolean;
  bucket: number;
};
