export const RECOMMENDATION_RANKING_VERSION = '22.2-v1';

export const RECOMMENDATION_RANKING_WEIGHTS = {
  genre: {
    personalized: 0.34,
    coldStart: 0.08,
  },
  tasteGraphPositive: 0.25,
  completedAffinity: 0.13,
  studioAffinity: 0.08,
  formatAffinity: 0.055,
  eraAffinity: 0.045,
  statusAffinity: 0.05,
  tasteGraphNegative: 0.32,
  metadataNegativeAffinity: 0.16,
  sessionNegativeAffinity: 0.26,
  sessionIntent: 0.16,
  completionLikelihood: 0.18,
  franchiseContinuation: 0.24,
  novelty: 0.08,
  hiddenGem: 0.11,
  popularityBias: 0.07,
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
  exposureFatigue: 0.38,
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
  formatAffinity: 0.05,
  eraAffinity: 0.04,
  statusAffinity: 0.04,
  mood: 0.16,
  episodeLength: 0.08,
  communityQuality: 0.12,
  shortFinished: 0.7,
  tasteGraphNegative: 0.24,
  metadataNegativeAffinity: 0.12,
  sessionNegativeAffinity: 0.16,
} as const;

export type RecommendationScoreSignals = {
  genre: number;
  tasteGraphPositive: number;
  completedAffinity: number;
  studioAffinity: number;
  formatAffinity: number;
  eraAffinity: number;
  statusAffinity: number;
  tasteGraphNegative: number;
  metadataNegativeAffinity: number;
  sessionNegativeAffinity: number;
  sessionIntent: number;
  completionLikelihood: number;
  franchiseContinuation: number;
  novelty: number;
  hiddenGem: number;
  popularityBias: number;
  episodeLength: number;
  mood: number;
  communityQuality: number;
  shortFinished: number;
  engagementPositive: number;
  engagementNegative: number;
  exposureFatigue: number;
  discovery: number;
  ongoing: number;
  duplicateTitle: number;
};

export type RecommendationScoreComponents = {
  genre: number;
  tasteGraphPositive: number;
  completedAffinity: number;
  studioAffinity: number;
  formatAffinity: number;
  eraAffinity: number;
  statusAffinity: number;
  tasteGraphNegative: number;
  metadataNegativeAffinity: number;
  sessionNegativeAffinity: number;
  sessionIntent: number;
  completionLikelihood: number;
  franchiseContinuation: number;
  novelty: number;
  hiddenGem: number;
  popularityBias: number;
  episodeLength: number;
  mood: number;
  communityQuality: number;
  shortFinished: number;
  engagementPositive: number;
  engagementNegative: number;
  exposureFatigue: number;
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
    formatAffinity:
      finite(signals.formatAffinity) * weights.formatAffinity,
    eraAffinity:
      finite(signals.eraAffinity) * weights.eraAffinity,
    statusAffinity:
      finite(signals.statusAffinity) * weights.statusAffinity,
    tasteGraphNegative:
      -finite(signals.tasteGraphNegative) * weights.tasteGraphNegative,
    metadataNegativeAffinity:
      -finite(signals.metadataNegativeAffinity) * weights.metadataNegativeAffinity,
    sessionNegativeAffinity:
      -finite(signals.sessionNegativeAffinity) * weights.sessionNegativeAffinity,
    sessionIntent:
      finite(signals.sessionIntent) * weights.sessionIntent,
    completionLikelihood:
      finite(signals.completionLikelihood) * weights.completionLikelihood,
    franchiseContinuation:
      finite(signals.franchiseContinuation) * weights.franchiseContinuation,
    novelty: finite(signals.novelty) * weights.novelty,
    hiddenGem: finite(signals.hiddenGem) * weights.hiddenGem,
    popularityBias: -finite(signals.popularityBias) * weights.popularityBias,
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
    exposureFatigue:
      -finite(signals.exposureFatigue) * weights.exposureFatigue,
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
    | 'formatAffinity'
    | 'eraAffinity'
    | 'statusAffinity'
    | 'tasteGraphNegative'
    | 'metadataNegativeAffinity'
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
      finite(signals.formatAffinity) * weights.formatAffinity +
      finite(signals.eraAffinity) * weights.eraAffinity +
      finite(signals.statusAffinity) * weights.statusAffinity +
      finite(signals.mood) * weights.mood +
      finite(signals.episodeLength) * weights.episodeLength +
      finite(signals.communityQuality) * weights.communityQuality +
      finite(signals.shortFinished) * weights.shortFinished -
      finite(signals.tasteGraphNegative) * weights.tasteGraphNegative -
      finite(signals.metadataNegativeAffinity) *
        weights.metadataNegativeAffinity -
      finite(signals.sessionNegativeAffinity) *
        weights.sessionNegativeAffinity,
  );
}
