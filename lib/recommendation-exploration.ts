import type { Anime } from '@/types/anime';

export type RecommendationExplorationClass =
  | 'safe'
  | 'adjacent'
  | 'explore';

export type RecommendationExplorationPolicy = {
  confidence: number;
  safeShare: number;
  adjacentShare: number;
  exploreShare: number;
};

export type RecommendationExplorationSignal = {
  className: RecommendationExplorationClass;
  noveltyScore: number;
  hiddenGemScore: number;
  popularityBias: number;
  popularityBand: 'unknown' | 'niche' | 'mid' | 'mainstream' | 'blockbuster';
};

const MIN_EXPLORATION_SHARE = 0.05;
const MAX_EXPLORATION_SHARE = 0.2;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function finite(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCommunityQuality(anime: Anime) {
  const raw = finite(anime.score ?? anime.averageScore, 0);
  if (raw <= 0) return 0;
  return clamp(raw > 10 ? raw / 100 : raw / 10);
}

function popularityValue(anime: Anime) {
  const value = finite(anime.popularity, 0);
  return value > 0 ? Math.round(value) : null;
}

export function recommendationPopularityBand(
  anime: Anime,
): RecommendationExplorationSignal['popularityBand'] {
  const popularity = popularityValue(anime);
  if (!popularity) return 'unknown';
  if (popularity < 8_000) return 'niche';
  if (popularity < 35_000) return 'mid';
  if (popularity < 120_000) return 'mainstream';
  return 'blockbuster';
}

export function recommendationPopularityBias(anime: Anime): number {
  const popularity = popularityValue(anime);
  if (!popularity) return 0;

  // AniList popularity has a very long tail. Log scaling stops mega-hits from
  // dominating merely because their raw audience count is orders of magnitude
  // larger than a niche but high-quality title.
  return clamp((Math.log10(Math.max(100, popularity)) - 4.3) / 1.5);
}

export function buildRecommendationExplorationPolicy(input?: {
  confidence?: number | null;
  explorationRate?: number | null;
}): RecommendationExplorationPolicy {
  const confidence = clamp(finite(input?.confidence, 0));
  const confidenceDriven =
    MAX_EXPLORATION_SHARE -
    confidence * (MAX_EXPLORATION_SHARE - MIN_EXPLORATION_SHARE);
  const graphRate = clamp(
    finite(input?.explorationRate, confidenceDriven),
    MIN_EXPLORATION_SHARE,
    MAX_EXPLORATION_SHARE,
  );

  // Taste Graph rate carries explicit behavior depth, while confidence keeps
  // the slot mix stable for older cached graphs and cold-start users.
  const exploreShare = clamp(
    graphRate * 0.65 + confidenceDriven * 0.35,
    MIN_EXPLORATION_SHARE,
    MAX_EXPLORATION_SHARE,
  );
  const adjacentShare = clamp(0.3 - confidence * 0.1, 0.2, 0.3);
  const safeShare = clamp(1 - adjacentShare - exploreShare, 0.5, 0.75);

  return {
    confidence,
    safeShare,
    adjacentShare,
    exploreShare,
  };
}

export function scoreRecommendationExploration(input: {
  anime: Anime;
  tasteAffinity: number;
  completedAffinity: number;
  studioAffinity: number;
  formatAffinity: number;
  eraAffinity: number;
  negativeAffinity: number;
  fatigueScore: number;
  franchiseContinuation: boolean;
}): RecommendationExplorationSignal {
  if (input.franchiseContinuation) {
    return {
      className: 'safe',
      noveltyScore: 0,
      hiddenGemScore: 0,
      popularityBias: recommendationPopularityBias(input.anime),
      popularityBand: recommendationPopularityBand(input.anime),
    };
  }

  const quality = normalizeCommunityQuality(input.anime);
  const popularityBias = recommendationPopularityBias(input.anime);
  const popularityBand = recommendationPopularityBand(input.anime);
  const strongestTaste = Math.max(
    clamp(input.tasteAffinity),
    clamp(input.completedAffinity),
    clamp(input.studioAffinity),
    clamp(input.formatAffinity),
    clamp(input.eraAffinity),
  );
  const negative = clamp(input.negativeAffinity);
  const fatigue = clamp(input.fatigueScore);

  // Adjacent discovery keeps at least one familiar vector while opening a new
  // genre/studio/era axis. Fully random candidates do not receive this boost.
  const adjacency =
    strongestTaste * 0.68 +
    quality * 0.22 +
    (1 - negative) * 0.1;

  const noveltyScore = clamp(
    (1 - strongestTaste) * 0.58 +
      quality * 0.2 +
      (1 - fatigue) * 0.12 +
      (1 - negative) * 0.1,
  );

  const hiddenGemScore =
    quality >= 0.72 &&
    strongestTaste >= 0.28 &&
    negative <= 0.35 &&
    fatigue <= 0.65 &&
    popularityBand !== 'unknown' &&
    popularityBand !== 'blockbuster'
      ? clamp(
          quality * 0.36 +
            strongestTaste * 0.34 +
            (1 - popularityBias) * 0.22 +
            (1 - fatigue) * 0.08,
        )
      : 0;

  let className: RecommendationExplorationClass = 'safe';

  if (
    strongestTaste >= 0.28 &&
    adjacency >= 0.42 &&
    strongestTaste < 0.7 &&
    negative <= 0.42
  ) {
    className = 'adjacent';
  } else if (
    strongestTaste < 0.38 &&
    quality >= 0.68 &&
    negative <= 0.34
  ) {
    className = 'explore';
  }

  return {
    className,
    noveltyScore,
    hiddenGemScore,
    popularityBias,
    popularityBand,
  };
}
