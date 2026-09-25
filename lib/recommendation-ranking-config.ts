export const RECOMMENDATION_RANKING_VERSION = '18.3-v1';

export const RECOMMENDATION_RANKING_WEIGHTS = {
  genre: {
    personalized: 0.34,
    coldStart: 0.08,
  },
  tasteGraphPositive: 0.25,
  completedAffinity: 0.13,
  studioAffinity: 0.08,
  tasteGraphNegative: 0.32,
  sessionNegativeAffinity: 0.26,
  episodeLength: 0.07,
  mood: {
    personalized: 0.18,
    coldStart: 0.38,
  },
  communityQuality: {
    personalized: 0.11,
    coldStart: 0.28,
  },
  negativeEngagement: 0.9,
} as const;

export const RECOMMENDATION_ENGAGEMENT_SIGNALS = {
  open: 0.055,
  dwellBase: 0.015,
  dwellMaxBonus: 0.035,
  planned: 0.075,
  liked: 0.12,
  explicitNegative: -1,
  recencyDays: 45,
  recencyFloor: 0.25,
  positiveCap: 0.14,
  negativeCap: -1,
} as const;

export const RECOMMENDATION_MATCH_WEIGHTS = {
  genre: 0.3,
  tasteGraphPositive: 0.26,
  completedAffinity: 0.14,
  studioAffinity: 0.08,
  mood: 0.16,
  episodeLength: 0.08,
  communityQuality: 0.12,
  shortFinished: 0.7,
  tasteGraphNegative: 0.24,
  sessionNegativeAffinity: 0.16,
} as const;

export type RecommendationScoreSignals = {
  genre: number;
  tasteGraphPositive: number;
  completedAffinity: number;
  studioAffinity: number;
  tasteGraphNegative: number;
  sessionNegativeAffinity: number;
  episodeLength: number;
  mood: number;
  communityQuality: number;
  shortFinished: number;
  engagementPositive: number;
  engagementNegative: number;
  discovery: number;
  ongoing: number;
  duplicateTitle: number;
};

export type RecommendationScoreComponents = {
  genre: number;
  tasteGraphPositive: number;
  completedAffinity: number;
  studioAffinity: number;
  tasteGraphNegative: number;
  sessionNegativeAffinity: number;
  episodeLength: number;
  mood: number;
  communityQuality: number;
  shortFinished: number;
  engagementPositive: number;
  engagementNegative: number;
  discovery: number;
  ongoing: number;
  duplicateTitle: number;
};

export type RecommendationScoreResult = {
  version: typeof RECOMMENDATION_RANKING_VERSION;
  total: number;
  components: RecommendationScoreComponents;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

export function scoreRecommendation(
  signals: RecommendationScoreSignals,
  context: {
    hasHistory: boolean;
    moodActive: boolean;
    hasTasteConfidence: boolean;
  },
): RecommendationScoreResult {
  const weights = RECOMMENDATION_RANKING_WEIGHTS;

  const components: RecommendationScoreComponents = {
    genre:
      finite(signals.genre) *
      (context.hasHistory ? weights.genre.personalized : weights.genre.coldStart),
    tasteGraphPositive:
      finite(signals.tasteGraphPositive) * weights.tasteGraphPositive,
    completedAffinity:
      finite(signals.completedAffinity) * weights.completedAffinity,
    studioAffinity:
      finite(signals.studioAffinity) * weights.studioAffinity,
    tasteGraphNegative:
      -finite(signals.tasteGraphNegative) * weights.tasteGraphNegative,
    sessionNegativeAffinity:
      -finite(signals.sessionNegativeAffinity) * weights.sessionNegativeAffinity,
    episodeLength:
      finite(signals.episodeLength) *
      (context.hasTasteConfidence ? weights.episodeLength : 0),
    mood:
      finite(signals.mood) *
      (context.moodActive
        ? context.hasHistory
          ? weights.mood.personalized
          : weights.mood.coldStart
        : 0),
    communityQuality:
      finite(signals.communityQuality) *
      (context.hasHistory
        ? weights.communityQuality.personalized
        : weights.communityQuality.coldStart),
    shortFinished: finite(signals.shortFinished),
    engagementPositive: finite(signals.engagementPositive),
    engagementNegative:
      -finite(signals.engagementNegative) * weights.negativeEngagement,
    discovery: finite(signals.discovery),
    ongoing: finite(signals.ongoing),
    duplicateTitle: finite(signals.duplicateTitle),
  };

  const total = Object.values(components).reduce(
    (sum, component) => sum + component,
    0,
  );

  return {
    version: RECOMMENDATION_RANKING_VERSION,
    total,
    components,
  };
}

export function recommendationMatchBasis(
  signals: Pick<
    RecommendationScoreSignals,
    | 'genre'
    | 'tasteGraphPositive'
    | 'completedAffinity'
    | 'studioAffinity'
    | 'tasteGraphNegative'
    | 'sessionNegativeAffinity'
    | 'episodeLength'
    | 'mood'
    | 'communityQuality'
    | 'shortFinished'
  >,
) {
  const weights = RECOMMENDATION_MATCH_WEIGHTS;

  return clamp(
    finite(signals.genre) * weights.genre +
      finite(signals.tasteGraphPositive) * weights.tasteGraphPositive +
      finite(signals.completedAffinity) * weights.completedAffinity +
      finite(signals.studioAffinity) * weights.studioAffinity +
      finite(signals.mood) * weights.mood +
      finite(signals.episodeLength) * weights.episodeLength +
      finite(signals.communityQuality) * weights.communityQuality +
      finite(signals.shortFinished) * weights.shortFinished -
      finite(signals.tasteGraphNegative) * weights.tasteGraphNegative -
      finite(signals.sessionNegativeAffinity) *
        weights.sessionNegativeAffinity,
  );
}
