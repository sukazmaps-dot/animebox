export const RECOMMENDATION_EXPOSURE_VERSION = '22.0-exposure-v1';

export const RECOMMENDATION_EXPOSURE_POLICY = {
  windowDays: 30,
  recentWindowDays: 7,
  halfLifeDays: 6,
  firstImpressionAllowance: 1,
  openCredit: 1.55,
  dwellCredit: 0.55,
  positiveActionCredit: 2.4,
  unansweredScale: 3.4,
  sameDayRepeatBoost: 0.12,
  sameDayWindowMs: 24 * 60 * 60 * 1000,
} as const;

export type RecommendationExposureEvent = {
  type:
    | 'impression'
    | 'dwell'
    | 'open'
    | 'planned'
    | 'liked'
    | 'not_interested'
    | 'less_like_this'
    | 'already_watched'
    | 'too_long'
    | 'dislike_genre'
    | 'dislike_setting'
    | 'not_now'
    | 'mood_change';
  animeId?: number;
  dwellMs?: number;
  createdAt: number;
};

export type RecommendationExposureSignals = {
  impressions7d: number;
  impressions30d: number;
  weightedImpressions: number;
  weightedOpens: number;
  weightedDwell: number;
  weightedPositiveActions: number;
  lastImpressionAt: number | null;
  lastOpenAt: number | null;
  lastPositiveAt: number | null;
  fatigue: number;
};

type ExposureAccumulator = Omit<RecommendationExposureSignals, 'fatigue'>;

const EMPTY_SIGNALS: RecommendationExposureSignals = {
  impressions7d: 0,
  impressions30d: 0,
  weightedImpressions: 0,
  weightedOpens: 0,
  weightedDwell: 0,
  weightedPositiveActions: 0,
  lastImpressionAt: null,
  lastOpenAt: null,
  lastPositiveAt: null,
  fatigue: 0,
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function recencyWeight(ageDays: number) {
  const halfLife = RECOMMENDATION_EXPOSURE_POLICY.halfLifeDays;
  return Math.pow(0.5, Math.max(0, ageDays) / halfLife);
}

function emptyAccumulator(): ExposureAccumulator {
  return {
    impressions7d: 0,
    impressions30d: 0,
    weightedImpressions: 0,
    weightedOpens: 0,
    weightedDwell: 0,
    weightedPositiveActions: 0,
    lastImpressionAt: null,
    lastOpenAt: null,
    lastPositiveAt: null,
  };
}

function calculateFatigue(
  signals: ExposureAccumulator,
  nowMs: number,
) {
  const policy = RECOMMENDATION_EXPOSURE_POLICY;

  const unanswered = Math.max(
    0,
    signals.weightedImpressions -
      policy.firstImpressionAllowance -
      signals.weightedOpens * policy.openCredit -
      signals.weightedDwell * policy.dwellCredit -
      signals.weightedPositiveActions * policy.positiveActionCredit,
  );

  let fatigue = clamp(unanswered / policy.unansweredScale);

  const recentRepeatedExposure =
    signals.impressions7d >= 3 &&
    signals.lastImpressionAt != null &&
    nowMs - signals.lastImpressionAt <= policy.sameDayWindowMs &&
    (
      signals.lastOpenAt == null ||
      signals.lastOpenAt < signals.lastImpressionAt
    );

  if (recentRepeatedExposure) {
    fatigue = clamp(fatigue + policy.sameDayRepeatBoost);
  }

  if (
    signals.lastOpenAt != null &&
    signals.lastImpressionAt != null &&
    signals.lastOpenAt >= signals.lastImpressionAt
  ) {
    fatigue *= 0.25;
  }

  if (
    signals.lastPositiveAt != null &&
    signals.lastImpressionAt != null &&
    signals.lastPositiveAt >= signals.lastImpressionAt
  ) {
    fatigue = 0;
  }

  return Math.round(clamp(fatigue) * 1000) / 1000;
}

export function buildRecommendationExposureMap(
  events: readonly RecommendationExposureEvent[],
  nowMs = Date.now(),
): Map<number, RecommendationExposureSignals> {
  const result = new Map<number, ExposureAccumulator>();
  const maxAgeMs =
    RECOMMENDATION_EXPOSURE_POLICY.windowDays * 86_400_000;
  const recentAgeMs =
    RECOMMENDATION_EXPOSURE_POLICY.recentWindowDays * 86_400_000;

  for (const event of events) {
    const animeId = Number(event.animeId);
    const createdAt = Number(event.createdAt);

    if (
      !Number.isSafeInteger(animeId) ||
      animeId <= 0 ||
      !Number.isFinite(createdAt) ||
      createdAt <= 0
    ) {
      continue;
    }

    const ageMs = Math.max(0, nowMs - createdAt);
    if (ageMs > maxAgeMs) continue;

    const ageDays = ageMs / 86_400_000;
    const weight = recencyWeight(ageDays);
    const current = result.get(animeId) ?? emptyAccumulator();

    if (event.type === 'impression') {
      current.impressions30d += 1;
      if (ageMs <= recentAgeMs) current.impressions7d += 1;
      current.weightedImpressions += weight;
      current.lastImpressionAt = Math.max(
        current.lastImpressionAt ?? 0,
        createdAt,
      );
    } else if (event.type === 'open') {
      current.weightedOpens += weight;
      current.lastOpenAt = Math.max(current.lastOpenAt ?? 0, createdAt);
    } else if (event.type === 'dwell') {
      const dwellMs = Math.max(0, Math.min(30_000, Number(event.dwellMs) || 0));
      if (dwellMs >= 1_500) {
        current.weightedDwell += weight * (dwellMs / 30_000);
      }
    } else if (event.type === 'planned' || event.type === 'liked') {
      current.weightedPositiveActions += weight;
      current.lastPositiveAt = Math.max(
        current.lastPositiveAt ?? 0,
        createdAt,
      );
    }

    result.set(animeId, current);
  }

  return new Map(
    [...result.entries()].map(([animeId, signals]) => [
      animeId,
      {
        ...signals,
        weightedImpressions:
          Math.round(signals.weightedImpressions * 1000) / 1000,
        weightedOpens:
          Math.round(signals.weightedOpens * 1000) / 1000,
        weightedDwell:
          Math.round(signals.weightedDwell * 1000) / 1000,
        weightedPositiveActions:
          Math.round(signals.weightedPositiveActions * 1000) / 1000,
        fatigue: calculateFatigue(signals, nowMs),
      },
    ]),
  );
}

export function recommendationExposureSignals(
  exposureMap: ReadonlyMap<number, RecommendationExposureSignals>,
  animeId: number,
): RecommendationExposureSignals {
  return exposureMap.get(animeId) ?? EMPTY_SIGNALS;
}

export function recommendationFatigueBucket(
  fatigue: number,
): 'fresh' | 'light' | 'medium' | 'high' {
  const value = clamp(Number(fatigue) || 0);
  if (value < 0.12) return 'fresh';
  if (value < 0.35) return 'light';
  if (value < 0.65) return 'medium';
  return 'high';
}
