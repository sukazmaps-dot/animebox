import type { RankedRecommendation } from '@/lib/recommendations';
import {
  buildRecommendationExplorationPolicy,
  type RecommendationExplorationClass,
} from '@/lib/recommendation-exploration';

export const RECOMMENDATION_DIVERSITY_VERSION = '22.6-diversity-v3';

export type RecommendationDiversityDimension =
  | 'franchise'
  | 'genre_overlap'
  | 'genre_concentration'
  | 'studio'
  | 'format'
  | 'era'
  | 'source'
  | 'popularity'
  | 'class_mix';

export type RecommendationDiversityDiagnostics = {
  version: typeof RECOMMENDATION_DIVERSITY_VERSION;
  originalRank: number;
  rerankedRank: number;
  rawScore: number;
  diversifiedScore: number;
  relevanceFloor: number;
  totalPenalty: number;
  totalBoost: number;
  relaxedConstraints: boolean;
  className: RecommendationExplorationClass;
  penalties: Partial<Record<RecommendationDiversityDimension, number>>;
  boosts: Partial<Record<RecommendationDiversityDimension, number>>;
};

export const RECOMMENDATION_DIVERSITY_POLICY = {
  minExplorationRate: 0.05,
  maxExplorationRate: 0.2,
  defaultExplorationRate: 0.14,

  // Phase J reranks only a bounded head of the already relevance-sorted pool.
  candidateWindowMultiplier: 6,
  minCandidateWindow: 72,

  // Relevance guard: diversity can reorder near-equivalent candidates, but it
  // must not pull a materially weaker title above a strong personalized match.
  relevanceFloorMinDrop: 0.12,
  relevanceFloorMaxDrop: 0.3,
  relevanceFloorRelativeDrop: 0.22,
  relevanceFloorBias: 0.07,
  lockTopResult: true,

  recentWindow: 7,
  maxFamilyPerFeed: 1,
  hardConcentrationBuffer: 0.2,
  hardConcentrationMinSelected: 5,

  genreOverlapPenalty: 0.11,
  genreConcentrationPenalty: 0.34,
  familyPenalty: 0.5,

  studioRepeatPenalty: 0.075,
  studioConcentrationPenalty: 0.22,

  formatRepeatPenalty: 0.04,
  formatConcentrationPenalty: 0.12,

  eraRepeatPenalty: 0.034,
  eraConcentrationPenalty: 0.1,

  sourceRepeatPenalty: 0.035,
  sourceConcentrationPenalty: 0.12,

  popularityRepeatPenalty: 0.045,
  popularityConcentrationPenalty: 0.14,

  preferredClassBoost: 0.1,
  classOverTargetPenalty: 0.11,
} as const;

export type RecommendationDiversityOptions = {
  limit: number;
  explorationRate?: number | null;
  tasteConfidence?: number | null;
};

type DiversityShareTargets = {
  genre: number;
  studio: number;
  format: number;
  era: number;
  source: number;
  popularity: number;
};

type CandidateEvaluation = {
  index: number;
  diversifiedScore: number;
  relevanceFloor: number;
  totalPenalty: number;
  totalBoost: number;
  penalties: RecommendationDiversityDiagnostics['penalties'];
  boosts: RecommendationDiversityDiagnostics['boosts'];
  className: RecommendationExplorationClass;
  relaxedConstraints: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finite(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rounded(value: number) {
  return Math.round(value * 1000) / 1000;
}

function normalizeToken(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 72);
}

function normalizeGenre(value: string) {
  return normalizeToken(value);
}

function titleFamilyKey(item: RankedRecommendation) {
  const explicitFamily = item.franchiseFamilyKey?.trim();
  if (explicitFamily) return explicitFamily.slice(0, 72);

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

function itemStudios(item: RankedRecommendation) {
  const raw = item.anime.studios;
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
          if (typeof row.name === 'string') {
            return normalizeToken(row.name);
          }
          if (typeof row.node?.name === 'string') {
            return normalizeToken(row.node.name);
          }
        }
        return '';
      })
      .filter(Boolean),
  );
}

function formatKey(item: RankedRecommendation) {
  const key = String(item.anime.format ?? item.anime.kind ?? '')
    .trim()
    .toUpperCase()
    .slice(0, 24);
  return key || null;
}

function eraKey(item: RankedRecommendation) {
  const year = Number(item.anime.startDate?.year ?? 0);
  if (!Number.isSafeInteger(year) || year < 1940 || year > 2200) {
    return null;
  }

  // Decades are stable enough to diversify eras without treating adjacent
  // release years as unrelated content.
  return String(Math.floor(year / 10) * 10);
}

function sourceKey(item: RankedRecommendation) {
  const key = String(item.source ?? '').trim();
  return key || null;
}

function popularityKey(item: RankedRecommendation) {
  const key = String(item.popularityBand ?? '').trim();
  return key && key !== 'unknown' ? key : null;
}

function genreOverlap(
  candidateGenres: Set<string>,
  selected: RankedRecommendation[],
) {
  let strongest = 0;

  for (const picked of selected.slice(
    -RECOMMENDATION_DIVERSITY_POLICY.recentWindow,
  )) {
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

function recommendationExplorationClass(
  item: RankedRecommendation,
): RecommendationExplorationClass {
  if (item.franchiseContinuation) return 'safe';
  if (item.explorationClass) return item.explorationClass;

  return item.source === 'discovery' || item.matchScore == null || item.matchScore < 76
    ? 'explore'
    : 'safe';
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

export function recommendationDiversityShareTargets(
  tasteConfidence?: number | null,
): DiversityShareTargets {
  const confidence = clamp(finite(tasteConfidence), 0, 1);

  // Cold-start feeds need broader sampling. Once Taste Graph confidence is
  // high, a little more concentration is acceptable because repetition can be
  // a real preference instead of retrieval noise.
  return {
    genre: rounded(0.38 + confidence * 0.1),
    studio: rounded(0.3 + confidence * 0.1),
    format: rounded(0.55 + confidence * 0.08),
    era: rounded(0.5 + confidence * 0.1),
    source: rounded(0.5 + confidence * 0.12),
    popularity: rounded(0.5 + confidence * 0.1),
  };
}

function predictedShare(
  counts: Map<string, number>,
  key: string | null,
  selectedCount: number,
) {
  if (!key) return 0;
  return ((counts.get(key) ?? 0) + 1) / Math.max(1, selectedCount + 1);
}

function maxPredictedShare(
  counts: Map<string, number>,
  keys: Set<string>,
  selectedCount: number,
) {
  let strongest = 0;
  for (const key of keys) {
    strongest = Math.max(
      strongest,
      predictedShare(counts, key, selectedCount),
    );
  }
  return strongest;
}

function concentrationPenalty(
  predicted: number,
  target: number,
  weight: number,
) {
  return Math.max(0, predicted - target) * weight;
}

function relevanceFloor(anchorScore: number) {
  const absolute = Math.abs(anchorScore);
  const allowedDrop = clamp(
    absolute * RECOMMENDATION_DIVERSITY_POLICY.relevanceFloorRelativeDrop +
      RECOMMENDATION_DIVERSITY_POLICY.relevanceFloorBias,
    RECOMMENDATION_DIVERSITY_POLICY.relevanceFloorMinDrop,
    RECOMMENDATION_DIVERSITY_POLICY.relevanceFloorMaxDrop,
  );

  return anchorScore - allowedDrop;
}

function exceedsHardShare(predicted: number, target: number) {
  return (
    predicted >
    Math.min(
      0.92,
      target + RECOMMENDATION_DIVERSITY_POLICY.hardConcentrationBuffer,
    )
  );
}

export function diversifyRecommendations(
  items: RankedRecommendation[],
  options: RecommendationDiversityOptions,
): RankedRecommendation[] {
  const limit = Math.max(0, Math.floor(options.limit));
  if (!limit || !items.length) return [];

  const sorted = [...items].sort((left, right) => right.score - left.score);
  const originalRank = new Map(
    sorted.map((item, index) => [item.anime.id, index + 1] as const),
  );

  const explorationRate = normalizeRecommendationExplorationRate(
    options.explorationRate,
  );
  const mix = buildRecommendationExplorationPolicy({
    confidence: options.tasteConfidence,
    explorationRate,
  });
  const shareTargets = recommendationDiversityShareTargets(
    options.tasteConfidence,
  );

  const targetExplore = Math.min(
    Math.max(0, limit - 1),
    limit >= 5
      ? Math.max(1, Math.round(limit * mix.exploreShare))
      : Math.round(limit * mix.exploreShare),
  );
  const targetAdjacent = Math.min(
    Math.max(0, limit - targetExplore - 1),
    Math.round(limit * mix.adjacentShare),
  );
  const targetSafe = Math.max(0, limit - targetExplore - targetAdjacent);
  const classTargets: Record<RecommendationExplorationClass, number> = {
    safe: targetSafe,
    adjacent: targetAdjacent,
    explore: targetExplore,
  };

  const candidateWindow = sorted.slice(
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
  const studioCounts = new Map<string, number>();
  const formatCounts = new Map<string, number>();
  const eraCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  const popularityCounts = new Map<string, number>();
  const classCounts: Record<RecommendationExplorationClass, number> = {
    safe: 0,
    adjacent: 0,
    explore: 0,
  };

  const preferredClass = (): RecommendationExplorationClass => {
    if (selected.length === 0 && classTargets.safe > 0) return 'safe';

    const slot = selected.length + 1;
    const desired: Record<RecommendationExplorationClass, number> = {
      safe: Math.round(slot * mix.safeShare),
      adjacent: Math.round(slot * mix.adjacentShare),
      explore: Math.round(slot * mix.exploreShare),
    };
    const classes: RecommendationExplorationClass[] = [
      'safe',
      'adjacent',
      'explore',
    ];

    return classes
      .map((className) => ({
        className,
        deficit:
          Math.min(classTargets[className], desired[className]) -
          classCounts[className],
      }))
      .sort(
        (left, right) =>
          right.deficit - left.deficit ||
          classes.indexOf(left.className) - classes.indexOf(right.className),
      )[0]?.className ?? 'safe';
  };

  const evaluateCandidate = (
    index: number,
    options: {
      enforceRelevance: boolean;
      strictFamily: boolean;
      strictConcentration: boolean;
      relaxedConstraints: boolean;
    },
  ): CandidateEvaluation | null => {
    const candidate = remaining[index];
    if (!candidate) return null;

    const anchorScore = Math.max(...remaining.map((item) => item.score));
    const floor = relevanceFloor(anchorScore);

    if (options.enforceRelevance && candidate.score < floor) {
      return null;
    }

    const family = titleFamilyKey(candidate);
    const familyCount = family ? familyCounts.get(family) ?? 0 : 0;

    if (
      options.strictFamily &&
      family &&
      familyCount >= RECOMMENDATION_DIVERSITY_POLICY.maxFamilyPerFeed
    ) {
      return null;
    }

    const genres = itemGenres(candidate);
    const studios = itemStudios(candidate);
    const format = formatKey(candidate);
    const era = eraKey(candidate);
    const source = sourceKey(candidate);
    const popularity = popularityKey(candidate);

    const selectedCount = selected.length;
    const genreShare = maxPredictedShare(
      genreCounts,
      genres,
      selectedCount,
    );
    const studioShare = maxPredictedShare(
      studioCounts,
      studios,
      selectedCount,
    );
    const formatShare = predictedShare(
      formatCounts,
      format,
      selectedCount,
    );
    const eraShare = predictedShare(eraCounts, era, selectedCount);
    const sourceShare = predictedShare(
      sourceCounts,
      source,
      selectedCount,
    );
    const popularityShare = predictedShare(
      popularityCounts,
      popularity,
      selectedCount,
    );

    if (
      options.strictConcentration &&
      selectedCount >=
        RECOMMENDATION_DIVERSITY_POLICY.hardConcentrationMinSelected &&
      (
        (genres.size > 0 &&
          exceedsHardShare(genreShare, shareTargets.genre)) ||
        (studios.size > 0 &&
          exceedsHardShare(studioShare, shareTargets.studio)) ||
        (format &&
          exceedsHardShare(formatShare, shareTargets.format)) ||
        (era && exceedsHardShare(eraShare, shareTargets.era)) ||
        (source &&
          exceedsHardShare(sourceShare, shareTargets.source)) ||
        (popularity &&
          exceedsHardShare(popularityShare, shareTargets.popularity))
      )
    ) {
      return null;
    }

    const penalties: RecommendationDiversityDiagnostics['penalties'] = {};
    const boosts: RecommendationDiversityDiagnostics['boosts'] = {};

    const overlapPenalty =
      genreOverlap(genres, selected) *
      RECOMMENDATION_DIVERSITY_POLICY.genreOverlapPenalty;
    if (overlapPenalty > 0) {
      penalties.genre_overlap = overlapPenalty;
    }

    const genrePenalty = concentrationPenalty(
      genreShare,
      shareTargets.genre,
      RECOMMENDATION_DIVERSITY_POLICY.genreConcentrationPenalty,
    );
    if (genrePenalty > 0) {
      penalties.genre_concentration = genrePenalty;
    }

    if (familyCount > 0) {
      penalties.franchise =
        familyCount * RECOMMENDATION_DIVERSITY_POLICY.familyPenalty;
    }

    let studioRepeat = 0;
    for (const studio of studios) {
      studioRepeat = Math.max(studioRepeat, studioCounts.get(studio) ?? 0);
    }
    const studioPenalty =
      studioRepeat * RECOMMENDATION_DIVERSITY_POLICY.studioRepeatPenalty +
      concentrationPenalty(
        studioShare,
        shareTargets.studio,
        RECOMMENDATION_DIVERSITY_POLICY.studioConcentrationPenalty,
      );
    if (studioPenalty > 0) penalties.studio = studioPenalty;

    const formatPenalty =
      (format ? formatCounts.get(format) ?? 0 : 0) *
        RECOMMENDATION_DIVERSITY_POLICY.formatRepeatPenalty +
      concentrationPenalty(
        formatShare,
        shareTargets.format,
        RECOMMENDATION_DIVERSITY_POLICY.formatConcentrationPenalty,
      );
    if (formatPenalty > 0) penalties.format = formatPenalty;

    const eraPenalty =
      (era ? eraCounts.get(era) ?? 0 : 0) *
        RECOMMENDATION_DIVERSITY_POLICY.eraRepeatPenalty +
      concentrationPenalty(
        eraShare,
        shareTargets.era,
        RECOMMENDATION_DIVERSITY_POLICY.eraConcentrationPenalty,
      );
    if (eraPenalty > 0) penalties.era = eraPenalty;

    const sourcePenalty =
      (source ? sourceCounts.get(source) ?? 0 : 0) *
        RECOMMENDATION_DIVERSITY_POLICY.sourceRepeatPenalty +
      concentrationPenalty(
        sourceShare,
        shareTargets.source,
        RECOMMENDATION_DIVERSITY_POLICY.sourceConcentrationPenalty,
      );
    if (sourcePenalty > 0) penalties.source = sourcePenalty;

    const popularityPenalty =
      (popularity ? popularityCounts.get(popularity) ?? 0 : 0) *
        RECOMMENDATION_DIVERSITY_POLICY.popularityRepeatPenalty +
      concentrationPenalty(
        popularityShare,
        shareTargets.popularity,
        RECOMMENDATION_DIVERSITY_POLICY.popularityConcentrationPenalty,
      );
    if (popularityPenalty > 0) {
      penalties.popularity = popularityPenalty;
    }

    const candidateClass = recommendationExplorationClass(candidate);
    const preferred = preferredClass();
    if (candidateClass === preferred) {
      boosts.class_mix = RECOMMENDATION_DIVERSITY_POLICY.preferredClassBoost;
    } else if (
      classCounts[candidateClass] >= classTargets[candidateClass]
    ) {
      penalties.class_mix =
        RECOMMENDATION_DIVERSITY_POLICY.classOverTargetPenalty;
    }

    const totalPenalty = Object.values(penalties).reduce(
      (sum, value) => sum + finite(value),
      0,
    );
    const totalBoost = Object.values(boosts).reduce(
      (sum, value) => sum + finite(value),
      0,
    );

    return {
      index,
      diversifiedScore: candidate.score - totalPenalty + totalBoost,
      relevanceFloor: floor,
      totalPenalty,
      totalBoost,
      penalties,
      boosts,
      className: candidateClass,
      relaxedConstraints: options.relaxedConstraints,
    };
  };

  const chooseBest = (
    pass: Parameters<typeof evaluateCandidate>[1],
  ) => {
    let best: CandidateEvaluation | null = null;

    for (let index = 0; index < remaining.length; index += 1) {
      const evaluation = evaluateCandidate(index, pass);
      if (!evaluation) continue;

      if (
        !best ||
        evaluation.diversifiedScore > best.diversifiedScore ||
        (
          evaluation.diversifiedScore === best.diversifiedScore &&
          remaining[index].score > remaining[best.index].score
        )
      ) {
        best = evaluation;
      }
    }

    return best;
  };

  const registerPicked = (
    picked: RankedRecommendation,
    evaluation: CandidateEvaluation,
  ) => {
    const rerankedRank = selected.length + 1;
    const diagnostics: RecommendationDiversityDiagnostics = {
      version: RECOMMENDATION_DIVERSITY_VERSION,
      originalRank: originalRank.get(picked.anime.id) ?? rerankedRank,
      rerankedRank,
      rawScore: rounded(picked.score),
      diversifiedScore: rounded(evaluation.diversifiedScore),
      relevanceFloor: rounded(evaluation.relevanceFloor),
      totalPenalty: rounded(evaluation.totalPenalty),
      totalBoost: rounded(evaluation.totalBoost),
      relaxedConstraints: evaluation.relaxedConstraints,
      className: evaluation.className,
      penalties: Object.fromEntries(
        Object.entries(evaluation.penalties).map(([key, value]) => [
          key,
          rounded(finite(value)),
        ]),
      ),
      boosts: Object.fromEntries(
        Object.entries(evaluation.boosts).map(([key, value]) => [
          key,
          rounded(finite(value)),
        ]),
      ),
    };

    const next: RankedRecommendation = {
      ...picked,
      diversity: diagnostics,
    };
    selected.push(next);

    const family = titleFamilyKey(picked);
    if (family) {
      familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
    }

    for (const genre of itemGenres(picked)) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }

    for (const studio of itemStudios(picked)) {
      studioCounts.set(studio, (studioCounts.get(studio) ?? 0) + 1);
    }

    const format = formatKey(picked);
    if (format) {
      formatCounts.set(format, (formatCounts.get(format) ?? 0) + 1);
    }

    const era = eraKey(picked);
    if (era) eraCounts.set(era, (eraCounts.get(era) ?? 0) + 1);

    const source = sourceKey(picked);
    if (source) {
      sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
    }

    const popularity = popularityKey(picked);
    if (popularity) {
      popularityCounts.set(
        popularity,
        (popularityCounts.get(popularity) ?? 0) + 1,
      );
    }

    classCounts[evaluation.className] += 1;
  };

  while (remaining.length && selected.length < limit) {
    let evaluation: CandidateEvaluation | null = null;

    // The first result is the raw relevance winner. Diversity starts at slot 2
    // so a strong personalized top match cannot be displaced by a cosmetic mix.
    if (
      selected.length === 0 &&
      RECOMMENDATION_DIVERSITY_POLICY.lockTopResult
    ) {
      const anchorScore = remaining[0].score;
      evaluation = {
        index: 0,
        diversifiedScore: anchorScore,
        relevanceFloor: relevanceFloor(anchorScore),
        totalPenalty: 0,
        totalBoost: 0,
        penalties: {},
        boosts: {},
        className: recommendationExplorationClass(remaining[0]),
        relaxedConstraints: false,
      };
    } else {
      evaluation =
        chooseBest({
          enforceRelevance: true,
          strictFamily: true,
          strictConcentration: true,
          relaxedConstraints: false,
        }) ??
        chooseBest({
          enforceRelevance: true,
          strictFamily: true,
          strictConcentration: false,
          relaxedConstraints: true,
        }) ??
        chooseBest({
          enforceRelevance: true,
          strictFamily: false,
          strictConcentration: false,
          relaxedConstraints: true,
        }) ??
        chooseBest({
          enforceRelevance: false,
          strictFamily: false,
          strictConcentration: false,
          relaxedConstraints: true,
        });
    }

    if (!evaluation) break;

    const [picked] = remaining.splice(evaluation.index, 1);
    if (!picked) break;
    registerPicked(picked, evaluation);
  }

  return selected;
}
