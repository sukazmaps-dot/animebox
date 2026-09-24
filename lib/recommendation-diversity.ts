import type { RankedRecommendation } from '@/lib/recommendations';

export const RECOMMENDATION_DIVERSITY_VERSION = '17.8-diversity-v1';

export const RECOMMENDATION_DIVERSITY_POLICY = {
  minExplorationRate: 0.08,
  maxExplorationRate: 0.2,
  defaultExplorationRate: 0.14,
  candidateWindowMultiplier: 4,
  minCandidateWindow: 48,
  genreOverlapPenalty: 0.14,
  genreConcentrationPenalty: 0.16,
  familyPenalty: 0.42,
  sourceRepeatPenalty: 0.025,
  explorationBoost: 0.18,
  forcedExplorationPenalty: 0.4,
  explorationMatchThreshold: 76,
  recentWindow: 6,
  maxFamilyPerFeed: 1,
} as const;

export type RecommendationDiversityOptions = {
  limit: number;
  explorationRate?: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeGenre(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleFamilyKey(item: RankedRecommendation) {
  const anime = item.anime;
  const title =
    anime.title?.russian?.trim() ||
    anime.russian?.trim() ||
    anime.title?.english?.trim() ||
    anime.title?.romaji?.trim() ||
    anime.title?.native?.trim() ||
    anime.name?.trim() ||
    '';

  return title
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/(?:season|сезон|part|часть)\s*\d+/giu, ' ')
    .replace(/\b(?:ii|iii|iv|v|2nd|3rd|second|third)\b/giu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 72);
}

function itemGenres(item: RankedRecommendation) {
  return new Set(
    (item.anime.genres ?? [])
      .map(normalizeGenre)
      .filter(Boolean),
  );
}

function genreOverlap(
  candidateGenres: Set<string>,
  selected: RankedRecommendation[],
) {
  let strongest = 0;

  for (const picked of selected.slice(-RECOMMENDATION_DIVERSITY_POLICY.recentWindow)) {
    const pickedGenres = itemGenres(picked);
    if (!candidateGenres.size || !pickedGenres.size) continue;

    let shared = 0;
    for (const genre of candidateGenres) {
      if (pickedGenres.has(genre)) shared += 1;
    }

    strongest = Math.max(
      strongest,
      shared / Math.max(1, Math.min(candidateGenres.size, pickedGenres.size)),
    );
  }

  return strongest;
}

function isExplorationCandidate(item: RankedRecommendation) {
  return (
    item.source === 'discovery' ||
    item.matchScore == null ||
    item.matchScore < RECOMMENDATION_DIVERSITY_POLICY.explorationMatchThreshold
  );
}

export function normalizeRecommendationExplorationRate(value?: number | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return RECOMMENDATION_DIVERSITY_POLICY.defaultExplorationRate;
  }

  return clamp(
    parsed,
    RECOMMENDATION_DIVERSITY_POLICY.minExplorationRate,
    RECOMMENDATION_DIVERSITY_POLICY.maxExplorationRate,
  );
}

export function diversifyRecommendations(
  items: RankedRecommendation[],
  options: RecommendationDiversityOptions,
): RankedRecommendation[] {
  const limit = Math.max(0, Math.floor(options.limit));
  if (!limit || !items.length) return [];

  const explorationRate = normalizeRecommendationExplorationRate(
    options.explorationRate,
  );
  const targetExploration = Math.min(
    Math.max(0, limit - 1),
    limit >= 5 ? Math.max(1, Math.round(limit * explorationRate)) : Math.round(limit * explorationRate),
  );
  const cadence = Math.max(4, Math.round(1 / explorationRate));
  const candidateWindow = items.slice(
    0,
    Math.max(
      RECOMMENDATION_DIVERSITY_POLICY.minCandidateWindow,
      limit * RECOMMENDATION_DIVERSITY_POLICY.candidateWindowMultiplier,
    ),
  );

  const remaining = [...candidateWindow];
  const selected: RankedRecommendation[] = [];
  const familyCounts = new Map<string, number>();
  const genreCounts = new Map<string, number>();
  const sourceCounts = new Map<RankedRecommendation['source'], number>();
  let explorationCount = 0;

  const chooseBest = (strictFamily: boolean) => {
    const slotsLeft = limit - selected.length;
    const explorationNeeded = Math.max(0, targetExploration - explorationCount);
    const forceExploration =
      explorationNeeded > 0 && slotsLeft <= explorationNeeded;
    const preferExploration =
      forceExploration ||
      (
        explorationNeeded > 0 &&
        selected.length > 0 &&
        (selected.length + 1) % cadence === 0
      );

    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const family = titleFamilyKey(candidate);
      const familyCount = family ? familyCounts.get(family) ?? 0 : 0;

      if (
        strictFamily &&
        family &&
        familyCount >= RECOMMENDATION_DIVERSITY_POLICY.maxFamilyPerFeed
      ) {
        continue;
      }

      const genres = itemGenres(candidate);
      const overlapPenalty =
        genreOverlap(genres, selected) *
        RECOMMENDATION_DIVERSITY_POLICY.genreOverlapPenalty;

      let concentration = 0;
      if (selected.length >= 3 && genres.size) {
        for (const genre of genres) {
          const share = (genreCounts.get(genre) ?? 0) / selected.length;
          concentration = Math.max(concentration, Math.max(0, share - 0.45));
        }
      }

      const concentrationPenalty =
        concentration *
        RECOMMENDATION_DIVERSITY_POLICY.genreConcentrationPenalty;
      const sourcePenalty =
        (sourceCounts.get(candidate.source) ?? 0) *
        RECOMMENDATION_DIVERSITY_POLICY.sourceRepeatPenalty;
      const repeatedFamilyPenalty =
        familyCount * RECOMMENDATION_DIVERSITY_POLICY.familyPenalty;

      const explorationCandidate = isExplorationCandidate(candidate);
      const explorationAdjustment = preferExploration
        ? explorationCandidate
          ? RECOMMENDATION_DIVERSITY_POLICY.explorationBoost
          : -RECOMMENDATION_DIVERSITY_POLICY.forcedExplorationPenalty
        : 0;

      const diversifiedScore =
        candidate.score -
        overlapPenalty -
        concentrationPenalty -
        sourcePenalty -
        repeatedFamilyPenalty +
        explorationAdjustment;

      if (diversifiedScore > bestScore) {
        bestScore = diversifiedScore;
        bestIndex = index;
      }
    }

    return bestIndex;
  };

  while (remaining.length && selected.length < limit) {
    let bestIndex = chooseBest(true);

    // Relevance is more important than leaving an empty slot. If the candidate
    // pool only contains sequels from an already selected family, relax the cap.
    if (bestIndex < 0) {
      bestIndex = chooseBest(false);
    }
    if (bestIndex < 0) break;

    const [picked] = remaining.splice(bestIndex, 1);
    selected.push(picked);

    const family = titleFamilyKey(picked);
    if (family) {
      familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
    }

    for (const genre of itemGenres(picked)) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }

    sourceCounts.set(
      picked.source,
      (sourceCounts.get(picked.source) ?? 0) + 1,
    );

    if (isExplorationCandidate(picked)) {
      explorationCount += 1;
    }
  }

  return selected;
}
