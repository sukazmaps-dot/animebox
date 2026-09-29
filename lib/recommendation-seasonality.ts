import type { Anime } from '@/types/anime';
import {
  getCurrentAnimeSeason,
  monthToCatalogSeason,
  type CatalogSeason,
} from '@/lib/catalog-season';

export type RecommendationSeasonRelation =
  | 'current'
  | 'previous'
  | 'recent'
  | 'older'
  | 'unknown';

export type RecommendationSeasonalitySignal = {
  relation: RecommendationSeasonRelation;
  season: CatalogSeason | null;
  seasonYear: number | null;
  ageDays: number | null;
  freshnessScore: number;
  tasteCompatibility: number;
  seasonalScore: number;
};

const DAY_MS = 86_400_000;
const MIN_TASTE_COMPATIBILITY = 0.18;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function finite(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function animeSeason(anime: Pick<Anime, 'startDate'>) {
  const year = Number(anime.startDate?.year ?? 0);
  const month = Number(anime.startDate?.month ?? 0);
  const season = monthToCatalogSeason(month);

  if (
    !season ||
    !Number.isSafeInteger(year) ||
    year < 1940 ||
    year > 2200
  ) {
    return null;
  }

  return { season, year };
}

function previousSeason(input: {
  season: CatalogSeason;
  year: number;
}): { season: CatalogSeason; year: number } {
  if (input.season === 'WINTER') {
    return { season: 'FALL', year: input.year - 1 };
  }
  if (input.season === 'SPRING') {
    return { season: 'WINTER', year: input.year };
  }
  if (input.season === 'SUMMER') {
    return { season: 'SPRING', year: input.year };
  }
  return { season: 'SUMMER', year: input.year };
}

function animeStartTimestamp(anime: Pick<Anime, 'startDate'>) {
  const year = Number(anime.startDate?.year ?? 0);
  const month = Number(anime.startDate?.month ?? 0);
  const day = Number(anime.startDate?.day ?? 1);

  if (
    !Number.isSafeInteger(year) ||
    year < 1940 ||
    year > 2200 ||
    !Number.isSafeInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }

  const safeDay =
    Number.isSafeInteger(day) && day >= 1 && day <= 31
      ? day
      : 1;

  const timestamp = Date.UTC(year, month - 1, safeDay);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function scoreRecommendationSeasonality(input: {
  anime: Anime;
  tasteCompatibility: number;
  negativeAffinity: number;
  fatigueScore: number;
  now?: Date;
}): RecommendationSeasonalitySignal {
  const now = input.now ?? new Date();
  const current = getCurrentAnimeSeason(now);
  const candidate = animeSeason(input.anime);
  const startTimestamp = animeStartTimestamp(input.anime);

  if (!candidate) {
    return {
      relation: 'unknown',
      season: null,
      seasonYear: null,
      ageDays: null,
      freshnessScore: 0,
      tasteCompatibility: clamp(finite(input.tasteCompatibility)),
      seasonalScore: 0,
    };
  }

  const previous = previousSeason(current);
  const ageDays =
    startTimestamp == null
      ? null
      : Math.max(-45, (now.getTime() - startTimestamp) / DAY_MS);

  let relation: RecommendationSeasonRelation = 'older';

  if (
    candidate.season === current.season &&
    candidate.year === current.year
  ) {
    relation = 'current';
  } else if (
    candidate.season === previous.season &&
    candidate.year === previous.year
  ) {
    relation = 'previous';
  } else if (ageDays != null && ageDays >= 0 && ageDays <= 240) {
    relation = 'recent';
  }

  let freshnessScore = 0;

  if (relation === 'current') {
    const age = Math.max(0, ageDays ?? 45);
    freshnessScore = clamp(0.65 + 0.35 * Math.exp(-age / 60));
  } else if (relation === 'previous') {
    const age = Math.max(0, ageDays ?? 120);
    freshnessScore = clamp(0.32 * Math.exp(-Math.max(0, age - 60) / 120));
  } else if (relation === 'recent') {
    const age = Math.max(0, ageDays ?? 180);
    freshnessScore = clamp(0.16 * Math.exp(-age / 180));
  }

  const tasteCompatibility = clamp(finite(input.tasteCompatibility));

  // Freshness is never a standalone reason to rank a title higher. It only
  // contributes after a minimum taste match and is then reduced by explicit
  // negative affinity and repeated-exposure fatigue.
  const normalizedTaste =
    tasteCompatibility <= MIN_TASTE_COMPATIBILITY
      ? 0
      : clamp(
          (tasteCompatibility - MIN_TASTE_COMPATIBILITY) /
            (1 - MIN_TASTE_COMPATIBILITY),
        );

  const negativeMultiplier =
    1 - clamp(finite(input.negativeAffinity)) * 0.72;
  const fatigueMultiplier =
    1 - clamp(finite(input.fatigueScore)) * 0.45;

  const seasonalScore = clamp(
    freshnessScore *
      normalizedTaste *
      Math.max(0.18, negativeMultiplier) *
      Math.max(0.25, fatigueMultiplier),
  );

  return {
    relation,
    season: candidate.season,
    seasonYear: candidate.year,
    ageDays,
    freshnessScore,
    tasteCompatibility,
    seasonalScore,
  };
}
