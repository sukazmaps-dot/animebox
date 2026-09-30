export const RECOMMENDATION_COMPLETION_VERSION = '22.0-completion-v1';

export type RecommendationCompletionSignals = {
  tastePositive: number;
  tasteNegative: number;
  completedAffinity: number;
  episodeLengthAffinity: number;
  communityQuality: number;
  completionRate: number;
  bingeScore: number;
  finished: boolean;
  episodeCount: number | null;
};

export type RecommendationCompletionScore = {
  version: typeof RECOMMENDATION_COMPLETION_VERSION;
  score: number;
  components: {
    completedAffinity: number;
    tasteFit: number;
    lengthFit: number;
    quality: number;
    userCompletion: number;
    bingeFit: number;
    finishedFit: number;
    negativePenalty: number;
  };
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

/**
 * A bounded, probability-like continuation score.
 *
 * This is deliberately NOT exposed to users as a literal probability until
 * real AnimeBox outcomes calibrate each score bucket. It exists as a ranking
 * objective and an analytics feature.
 */
export function scoreRecommendationCompletion(
  input: RecommendationCompletionSignals,
): RecommendationCompletionScore {
  const episodeCount =
    input.episodeCount != null && Number.isFinite(input.episodeCount)
      ? Math.max(1, input.episodeCount)
      : null;

  const longTitlePenalty =
    episodeCount == null
      ? 0
      : episodeCount <= 13
        ? 0
        : episodeCount <= 26
          ? 0.015
          : episodeCount <= 60
            ? 0.045
            : 0.085;

  const components = {
    completedAffinity: clamp(finite(input.completedAffinity)) * 0.28,
    tasteFit: clamp(finite(input.tastePositive)) * 0.18,
    lengthFit: clamp(finite(input.episodeLengthAffinity)) * 0.13,
    quality: clamp(finite(input.communityQuality)) * 0.08,
    userCompletion: clamp(finite(input.completionRate)) * 0.15,
    bingeFit: clamp(finite(input.bingeScore)) * 0.08,
    finishedFit: input.finished ? 0.08 : 0.035,
    negativePenalty:
      -clamp(finite(input.tasteNegative)) * 0.24 - longTitlePenalty,
  };

  const base = 0.08;
  const total =
    base +
    Object.values(components).reduce(
      (sum, component) => sum + component,
      0,
    );

  return {
    version: RECOMMENDATION_COMPLETION_VERSION,
    score: Math.round(clamp(total) * 1000) / 1000,
    components,
  };
}
