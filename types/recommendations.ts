import type { Anime } from '@/types/anime';

export type RecommendationCandidateSource =
  | 'ranked'
  | 'popularity'
  | 'ongoing'
  | 'preferred_genre'
  | 'mood';

/**
 * Public candidate page for the Smart Feed.
 * Personal ranking still happens in the browser. Candidate retrieval only
 * receives finite public taste buckets so the response remains CDN-cacheable.
 */
export type RecommendationPage = {
  items: Anime[];
  page: number;
  nextPage: number | null;
  nextCursor: string | null;
  hasMore: boolean;
  bucket: number;
  candidateSource?: RecommendationCandidateSource;
  fallbackFrom?: RecommendationCandidateSource | null;
  tasteGenre?: string | null;
  mood?: 'any' | 'comfort' | 'tension' | 'emotion' | 'adventure';
};
