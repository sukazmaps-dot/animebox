import type { Anime } from '@/types/anime';

export const RECOMMENDATION_DIVERSITY_VERSION = '17.8-v1';

export const RECOMMENDATION_DIVERSITY_CONFIG = {
  recentWindow: 5,
  maxGenreShare: 0.4,
  overlapPenalty: 0.14,
  genreSaturationPenalty: 0.72,
  sameFamilyPenalty: 0.42,
  familyOverflowPenalty: 0.82,
  consecutiveStudioPenalty: 0.09,
  explorationBoost: 0.14,
  noveltyBoost: 0.035,
  scanLimit: 28,
  explorationMin: 0.08,
  explorationMax: 0.2,
} as const;

type DiversifiableRecommendation = {
  anime: Anime;
  score: number;
  source: string;
  matchScore?: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeToken(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleOf(anime: Anime) {
  return (
    anime.title?.russian?.trim() ||
    anime.russian?.trim() ||
    anime.title?.english?.trim() ||
    anime.title?.romaji?.trim() ||
    anime.title?.native?.trim() ||
    anime.name?.trim() ||
    ''
  );
}

export function recommendationFamilyKey(anime: Anime) {
  return normalizeToken(titleOf(anime))
    .replace(/(?:season|сезон|part|часть)\s*\d+/giu, ' ')
    .replace(/\b(?:ii|iii|iv|v|2nd|3rd|second|third)\b/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 72);
}

function animeStudios(anime: Anime) {
  const raw = anime.studios;
  const values: unknown[] = Array.isArray(raw)
    ? raw
    : raw &&
        typeof raw === 'object' &&
        Array.isArray((raw as { nodes?: unknown[] }).nodes)
      ? (raw as { nodes: unknown[] }).nodes
      : [];

  return new Set(
    values
      .map((value) => {
        if (typeof value === 'string') return normalizeToken(value);
        if (value && typeof value === 'object') {
          const row = value as {
            name?: unknown;
            node?: { name?: unknown };
          };
          if (typeof row.name === 'string') return normalizeToken(row.name);
          if (typeof row.node?.name === 'string') {
            return normalizeToken(row.node.name);
          }
        }
        return '';
      })
      .filter(Boolean),
  );
}

function animeGenres(anime: Anime) {
  return new Set((anime.genres ?? []).map(normalizeToken).filter(Boolean));
}

function overlapRatio(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) {
    if (right.has(token)) shared += 1;
  }
  return shared / Math.max(1, left.size);
}

function isExplorationCandidate(item: DiversifiableRecommendation) {
  return (
    item.source === 'discovery' ||
    item.matchScore == null ||
    item.matchScore < 76
  );
}

function explorationCadence(rate: number) {
  const bounded = clamp(
    rate,
    RECOMMENDATION_DIVERSITY_CONFIG.explorationMin,
    RECOMMENDATION_DIVERSITY_CONFIG.explorationMax,
  );
  return Math.max(5, Math.round(1 / bounded));
}

function genreSaturation(
  candidateGenres: Set<string>,
  selected: DiversifiableRecommendation[],
) {
  if (selected.length < 4 || candidateGenres.size === 0) return 0;

  const nextLength = selected.length + 1;
  let maxExcess = 0;

  for (const genre of candidateGenres) {
    let count = 1;
    for (const item of selected) {
      if (animeGenres(item.anime).has(genre)) count += 1;
    }

    const share = count / nextLength;
    maxExcess = Math.max(
      maxExcess,
      share - RECOMMENDATION_DIVERSITY_CONFIG.maxGenreShare,
    );
  }

  return Math.max(0, maxExcess);
}

export function diversifyRecommendations<
  T extends DiversifiableRecommendation,
>(
  ranked: T[],
  options: {
    limit: number;
    explorationRate?: number | null;
  },
): T[] {
  const limit = Math.max(1, options.limit);
  const rate = clamp(
    options.explorationRate ?? 0.14,
    RECOMMENDATION_DIVERSITY_CONFIG.explorationMin,
    RECOMMENDATION_DIVERSITY_CONFIG.explorationMax,
  );
  const cadence = explorationCadence(rate);
  const remaining = ranked.slice(0, Math.max(limit * 4, 48));
  const selected: T[] = [];

  while (remaining.length && selected.length < limit) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (
      let index = 0;
      index < Math.min(
        remaining.length,
        RECOMMENDATION_DIVERSITY_CONFIG.scanLimit,
      );
      index += 1
    ) {
      const candidate = remaining[index];
      const candidateGenres = animeGenres(candidate.anime);
      const candidateFamily = recommendationFamilyKey(candidate.anime);
      const candidateStudios = animeStudios(candidate.anime);

      let recentOverlap = 0;
      for (const picked of selected.slice(
        -RECOMMENDATION_DIVERSITY_CONFIG.recentWindow,
      )) {
        recentOverlap = Math.max(
          recentOverlap,
          overlapRatio(candidateGenres, animeGenres(picked.anime)),
        );
      }

      const familyCount = candidateFamily
        ? selected.filter(
            (picked) =>
              recommendationFamilyKey(picked.anime) === candidateFamily,
          ).length
        : 0;

      const previousStudios = selected.length
        ? animeStudios(selected[selected.length - 1].anime)
        : new Set<string>();
      const repeatsStudio =
        candidateStudios.size > 0 &&
        [...candidateStudios].some((studio) => previousStudios.has(studio));

      const saturation = genreSaturation(candidateGenres, selected);
      const explorationSlot =
        selected.length > 0 && (selected.length + 1) % cadence === 0;
      const exploration =
        explorationSlot && isExplorationCandidate(candidate)
          ? RECOMMENDATION_DIVERSITY_CONFIG.explorationBoost
          : 0;

      const novelty =
        candidateGenres.size > 0 && recentOverlap <= 0.34
          ? RECOMMENDATION_DIVERSITY_CONFIG.noveltyBoost
          : 0;

      const familyPenalty =
        familyCount >= 2
          ? RECOMMENDATION_DIVERSITY_CONFIG.familyOverflowPenalty
          : familyCount === 1
            ? RECOMMENDATION_DIVERSITY_CONFIG.sameFamilyPenalty
            : 0;

      const diversifiedScore =
        candidate.score -
        recentOverlap * RECOMMENDATION_DIVERSITY_CONFIG.overlapPenalty -
        saturation *
          RECOMMENDATION_DIVERSITY_CONFIG.genreSaturationPenalty -
        familyPenalty -
        (repeatsStudio
          ? RECOMMENDATION_DIVERSITY_CONFIG.consecutiveStudioPenalty
          : 0) +
        exploration +
        novelty;

      if (diversifiedScore > bestScore) {
        bestScore = diversifiedScore;
        bestIndex = index;
      }
    }

    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return selected;
}
