import type { TasteMood } from '@/lib/personalization';
import {
  getRecommendationMoodDefinition,
  type RecommendationMoodDefinition,
} from '@/lib/recommendation-moods';
import type { Anime } from '@/types/anime';

export type MoodMatchTier =
  | 'strong'
  | 'good'
  | 'weak'
  | 'none';

export type MoodMatchResult = {
  score: number;
  confidence: number;
  tier: MoodMatchTier;
  matchedGenres: string[];
  matchedTags: string[];
  negativeGenres: string[];
  negativeTags: string[];
};

function clamp(value: number, min = 0, max = 1) {
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

function uniqueNormalized(values: string[]) {
  const map = new Map<string, string>();

  for (const raw of values) {
    const value = raw.trim();
    const key = normalizeToken(value);
    if (!key || map.has(key)) continue;
    map.set(key, value);
  }

  return map;
}

function animeTags(anime: Anime): string[] {
  if (!Array.isArray(anime.tags)) return [];

  return anime.tags
    .map((tag: unknown) => {
      if (typeof tag === 'string') return tag;

      if (
        tag &&
        typeof tag === 'object' &&
        'name' in tag &&
        typeof (tag as { name?: unknown }).name === 'string'
      ) {
        return (tag as { name: string }).name;
      }

      return '';
    })
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 40);
}

function collectMatches(
  source: Map<string, string>,
  expected: readonly string[],
) {
  const expectedSet = new Set(expected.map(normalizeToken));

  return [...source.entries()]
    .filter(([key]) => expectedSet.has(key))
    .map(([, label]) => label);
}

function scoreAgainstDefinition(
  anime: Anime,
  definition: RecommendationMoodDefinition,
): MoodMatchResult {
  const genres = uniqueNormalized(
    Array.isArray(anime.genres) ? anime.genres : [],
  );
  const tags = uniqueNormalized(animeTags(anime));

  const primaryGenres = collectMatches(
    genres,
    definition.primaryGenres,
  );
  const secondaryGenres = collectMatches(
    genres,
    definition.secondaryGenres,
  );
  const primaryTags = collectMatches(
    tags,
    definition.primaryTags,
  );
  const secondaryTags = collectMatches(
    tags,
    definition.secondaryTags,
  );
  const negativeGenres = collectMatches(
    genres,
    definition.negativeGenres,
  );
  const negativeTags = collectMatches(
    tags,
    definition.negativeTags,
  );

  const anchorCount =
    primaryGenres.length + primaryTags.length;
  const supportingCount =
    secondaryGenres.length + secondaryTags.length;

  let score =
    (anchorCount > 0 ? 0.18 : 0) +
    Math.min(0.54, primaryGenres.length * 0.36) +
    Math.min(0.54, primaryTags.length * 0.36) +
    Math.min(0.20, secondaryGenres.length * 0.10) +
    Math.min(0.24, secondaryTags.length * 0.12);

  if (primaryGenres.length > 0 && primaryTags.length > 0) {
    score += 0.10;
  } else if (anchorCount >= 2) {
    score += 0.08;
  }

  score -= Math.min(0.42, negativeGenres.length * 0.18);
  score -= Math.min(0.56, negativeTags.length * 0.28);

  // Broad genres such as Action/Romance/Comedy/Fantasy are supporting
  // evidence only. Without an anchor they can never become a strong match.
  if (anchorCount === 0) {
    score = Math.min(score, 0.44);
  }

  score = clamp(score);

  const metadataCoverage =
    (genres.size > 0 ? 0.34 : 0) +
    (tags.size > 0 ? 0.42 : 0);
  const evidenceConfidence =
    Math.min(0.22, anchorCount * 0.09 + supportingCount * 0.035);
  const conflictPenalty = Math.min(
    0.18,
    negativeGenres.length * 0.05 + negativeTags.length * 0.08,
  );
  const confidence = clamp(
    metadataCoverage + evidenceConfidence - conflictPenalty,
  );

  const tier: MoodMatchTier =
    score >= 0.72
      ? 'strong'
      : score >= definition.strictThreshold
        ? 'good'
        : score >= definition.relaxedThreshold
          ? 'weak'
          : 'none';

  return {
    score,
    confidence,
    tier,
    matchedGenres: [...primaryGenres, ...secondaryGenres],
    matchedTags: [...primaryTags, ...secondaryTags],
    negativeGenres,
    negativeTags,
  };
}

export function scoreRecommendationMood(
  anime: Anime,
  mood: TasteMood,
): MoodMatchResult {
  const definition = getRecommendationMoodDefinition(mood);

  if (!definition) {
    return {
      score: 0,
      confidence: 1,
      tier: 'none',
      matchedGenres: [],
      matchedTags: [],
      negativeGenres: [],
      negativeTags: [],
    };
  }

  return scoreAgainstDefinition(anime, definition);
}

export function isStrictMoodMatch(
  result: Pick<MoodMatchResult, 'tier'>,
) {
  return result.tier === 'strong' || result.tier === 'good';
}

export function isRelaxedMoodMatch(
  result: Pick<MoodMatchResult, 'tier'>,
) {
  return result.tier !== 'none';
}
