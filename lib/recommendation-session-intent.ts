import type { AnimeHistoryEntry } from '@/lib/anime-storage';
import type { Anime } from '@/types/anime';

export const RECOMMENDATION_SESSION_INTENT_VERSION = '22.0-session-v1';

export const RECOMMENDATION_SESSION_INTENT_POLICY = {
  windowHours: 72,
  halfLifeHours: 18,
  maxRecentTitles: 8,
  maxGenres: 10,
  minConfidenceSample: 1,
  fullConfidenceSample: 5,
} as const;

export type RecommendationSessionIntent = {
  version: typeof RECOMMENDATION_SESSION_INTENT_VERSION;
  confidence: number;
  sampleSize: number;
  genreWeights: Record<string, number>;
  preferredEpisodeCount: number | null;
  ongoingPreference: number | null;
  generatedAt: number;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function normalizeToken(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^p{L}p{N}]+/gu, ' ')
    .replace(/s+/g, ' ')
    .trim()
    .slice(0, 48);
}

function isOngoing(status: string | null | undefined) {
  const normalized = String(status ?? '').trim().toLocaleLowerCase('ru-RU');
  return ['releasing', 'ongoing', 'онгоинг', 'airing', 'currently_airing'].includes(
    normalized,
  );
}

export function buildRecommendationSessionIntent(
  history: readonly AnimeHistoryEntry[],
  nowMs = Date.now(),
): RecommendationSessionIntent {
  const policy = RECOMMENDATION_SESSION_INTENT_POLICY;
  const maxAgeMs = policy.windowHours * 60 * 60 * 1000;
  const recent = history
    .filter((item) => {
      const viewedAt = Number(item.lastViewedAt);
      return Number.isFinite(viewedAt) && viewedAt > 0 && nowMs - viewedAt <= maxAgeMs;
    })
    .sort((a, b) => Number(b.lastViewedAt) - Number(a.lastViewedAt))
    .slice(0, policy.maxRecentTitles);

  const genreWeights = new Map<string, number>();
  let totalWeight = 0;
  let episodeWeight = 0;
  let episodeWeightedTotal = 0;
  let statusWeight = 0;
  let ongoingWeight = 0;

  for (const item of recent) {
    const ageHours = Math.max(
      0,
      (nowMs - Number(item.lastViewedAt)) / (60 * 60 * 1000),
    );
    const recency = Math.pow(0.5, ageHours / policy.halfLifeHours);
    const repeatBoost = Math.min(
      1.35,
      0.85 + Math.log2(Math.max(1, Number(item.viewCount) || 1) + 1) * 0.18,
    );
    const weight = recency * repeatBoost;
    totalWeight += weight;

    for (const rawGenre of item.genres ?? []) {
      const genre = normalizeToken(rawGenre);
      if (!genre) continue;
      genreWeights.set(genre, (genreWeights.get(genre) ?? 0) + weight);
    }

    const episodes = Number(item.episodes ?? 0);
    if (Number.isFinite(episodes) && episodes > 0 && episodes <= 2000) {
      episodeWeightedTotal += episodes * weight;
      episodeWeight += weight;
    }

    statusWeight += weight;
    if (isOngoing(item.status)) ongoingWeight += weight;
  }

  const strongestGenre = Math.max(1, ...genreWeights.values());
  const normalizedGenres = Object.fromEntries(
    [...genreWeights.entries()]
      .map(([genre, weight]) => [genre, clamp(weight / strongestGenre)] as const)
      .sort((left, right) => right[1] - left[1])
      .slice(0, policy.maxGenres),
  );

  const sampleConfidence =
    recent.length < policy.minConfidenceSample
      ? 0
      : clamp(
          recent.length / policy.fullConfidenceSample,
          0,
          1,
        );
  const weightConfidence = clamp(totalWeight / 3.2);
  const confidence = Math.round(
    clamp(sampleConfidence * 0.55 + weightConfidence * 0.45) * 1000,
  ) / 1000;

  return {
    version: RECOMMENDATION_SESSION_INTENT_VERSION,
    confidence,
    sampleSize: recent.length,
    genreWeights: normalizedGenres,
    preferredEpisodeCount:
      episodeWeight > 0
        ? Math.max(
            1,
            Math.min(
              2000,
              Math.round(episodeWeightedTotal / episodeWeight),
            ),
          )
        : null,
    ongoingPreference:
      statusWeight > 0
        ? Math.round(clamp(ongoingWeight / statusWeight) * 1000) / 1000
        : null,
    generatedAt: nowMs,
  };
}

export function recommendationSessionIntentAffinity(
  anime: Pick<Anime, 'genres' | 'episodes' | 'status'>,
  intent: RecommendationSessionIntent,
) {
  if (intent.confidence <= 0) return 0;

  const genreHits = (anime.genres ?? [])
    .map((genre) => intent.genreWeights[normalizeToken(genre)] ?? 0)
    .filter((weight) => weight > 0)
    .sort((left, right) => right - left);

  const genreAffinity = clamp(
    (genreHits[0] ?? 0) + (genreHits[1] ?? 0) * 0.35,
  );

  const preferredEpisodes = intent.preferredEpisodeCount;
  const episodes = Number(anime.episodes ?? 0);
  let lengthAffinity = 0;
  if (
    preferredEpisodes &&
    Number.isFinite(episodes) &&
    episodes > 0
  ) {
    const ratio =
      Math.max(preferredEpisodes, episodes) /
      Math.max(1, Math.min(preferredEpisodes, episodes));
    lengthAffinity =
      ratio <= 1.2
        ? 1
        : ratio <= 1.75
          ? 0.7
          : ratio <= 2.5
            ? 0.35
            : 0;
  }

  let statusAffinity = 0;
  if (intent.ongoingPreference != null) {
    const candidateOngoing = isOngoing(anime.status);
    statusAffinity = candidateOngoing
      ? intent.ongoingPreference
      : 1 - intent.ongoingPreference;
  }

  const raw =
    genreAffinity * 0.7 +
    lengthAffinity * 0.2 +
    statusAffinity * 0.1;

  return Math.round(clamp(raw * intent.confidence) * 1000) / 1000;
}
