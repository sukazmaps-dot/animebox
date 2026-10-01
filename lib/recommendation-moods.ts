import type { TasteMood } from '@/lib/personalization';

export type ActiveTasteMood = Exclude<TasteMood, 'any'>;

export type RecommendationMoodDefinition = {
  id: ActiveTasteMood;
  label: string;
  hint: string;
  icon: string;
  primaryGenres: readonly string[];
  secondaryGenres: readonly string[];
  primaryTags: readonly string[];
  secondaryTags: readonly string[];
  negativeGenres: readonly string[];
  negativeTags: readonly string[];
  retrievalGenres: readonly string[];
  retrievalTags: readonly string[];
  strictThreshold: number;
  relaxedThreshold: number;
};

export const RECOMMENDATION_MOOD_ENGINE_VERSION =
  '24.1-mood-intent-v1';

export const RECOMMENDATION_MOODS: Record<
  ActiveTasteMood,
  RecommendationMoodDefinition
> = {
  comfort: {
    id: 'comfort',
    label: 'Уют',
    hint: 'Спокойно и тепло',
    icon: '/brand/emojis/moods/mood-cozy-cup.webp',
    primaryGenres: [
      'Slice of Life',
      'Повседневность',
    ],
    secondaryGenres: [
      'Comedy',
      'Комедия',
      'Romance',
      'Романтика',
    ],
    primaryTags: [
      'Iyashikei',
      'Family Life',
      'Food',
      'Rural',
      'Cute Girls Doing Cute Things',
    ],
    secondaryTags: [
      'School',
      'Work',
      'Primarily Female Cast',
      'Primarily Male Cast',
    ],
    negativeGenres: [
      'Horror',
      'Ужасы',
      'Thriller',
      'Триллер',
    ],
    negativeTags: [
      'Gore',
      'Death Game',
      'Survival',
      'Tragedy',
    ],
    retrievalGenres: [
      'Slice of Life',
      'Comedy',
      'Romance',
    ],
    retrievalTags: [
      'Iyashikei',
      'Family Life',
      'Food',
      'Rural',
    ],
    strictThreshold: 0.54,
    relaxedThreshold: 0.36,
  },

  tension: {
    id: 'tension',
    label: 'Триллер',
    hint: 'Тайны, риск и напряжение',
    icon: '/brand/emojis/moods/mood-dark-kitsune.webp',
    primaryGenres: [
      'Thriller',
      'Триллер',
      'Mystery',
      'Детектив',
      'Psychological',
      'Психологическое',
      'Horror',
      'Ужасы',
    ],
    secondaryGenres: [
      'Action',
      'Экшен',
    ],
    primaryTags: [
      'Crime',
      'Detective',
      'Survival',
      'Death Game',
      'Conspiracy',
    ],
    secondaryTags: [
      'Police',
      'Espionage',
      'Revenge',
      'Terrorism',
    ],
    negativeGenres: [
      'Slice of Life',
      'Повседневность',
    ],
    negativeTags: [
      'Iyashikei',
      'Cute Girls Doing Cute Things',
    ],
    retrievalGenres: [
      'Thriller',
      'Mystery',
      'Psychological',
      'Horror',
    ],
    retrievalTags: [
      'Crime',
      'Detective',
      'Survival',
      'Death Game',
      'Conspiracy',
    ],
    strictThreshold: 0.56,
    relaxedThreshold: 0.38,
  },

  emotion: {
    id: 'emotion',
    label: 'Драма',
    hint: 'Истории, которые цепляют',
    icon: '/brand/emojis/moods/mood-cry.webp',
    primaryGenres: [
      'Drama',
      'Драма',
    ],
    secondaryGenres: [
      'Romance',
      'Романтика',
      'Psychological',
      'Психологическое',
      'Supernatural',
      'Сверхъестественное',
    ],
    primaryTags: [
      'Tragedy',
      'Coming of Age',
      'Family Life',
    ],
    secondaryTags: [
      'Rehabilitation',
      'Bullying',
      'Orphan',
      'Adoption',
    ],
    negativeGenres: [],
    negativeTags: [
      'Cute Girls Doing Cute Things',
    ],
    retrievalGenres: [
      'Drama',
      'Romance',
      'Psychological',
    ],
    retrievalTags: [
      'Tragedy',
      'Coming of Age',
      'Family Life',
    ],
    strictThreshold: 0.54,
    relaxedThreshold: 0.36,
  },

  adventure: {
    id: 'adventure',
    label: 'Другие миры',
    hint: 'Фэнтези и приключения',
    icon: '/brand/emojis/moods/mood-hype-fire.webp',
    primaryGenres: [
      'Adventure',
      'Приключения',
      'Fantasy',
      'Фэнтези',
    ],
    secondaryGenres: [
      'Action',
      'Экшен',
      'Sci-Fi',
      'Фантастика',
    ],
    primaryTags: [
      'Isekai',
      'Magic',
      'Travel',
      'Mythology',
      'Swordplay',
      'Space',
    ],
    secondaryTags: [
      'Dungeon',
      'Dragons',
      'Super Power',
      'Virtual World',
    ],
    negativeGenres: [],
    negativeTags: [],
    retrievalGenres: [
      'Adventure',
      'Fantasy',
      'Sci-Fi',
    ],
    retrievalTags: [
      'Isekai',
      'Magic',
      'Travel',
      'Mythology',
      'Swordplay',
    ],
    strictThreshold: 0.54,
    relaxedThreshold: 0.36,
  },
};

export const HOME_MOOD_OPTIONS: ReadonlyArray<{
  value: TasteMood;
  label: string;
  hint: string;
  icon: string;
}> = [
  {
    value: 'any',
    label: 'Мой вкус',
    hint: 'По истории',
    icon: '/brand/emojis/moods/mood-any-cat.webp',
  },
  ...(
    ['comfort', 'tension', 'emotion', 'adventure'] as const
  ).map((mood) => ({
    value: mood,
    label: RECOMMENDATION_MOODS[mood].label,
    hint: RECOMMENDATION_MOODS[mood].hint,
    icon: RECOMMENDATION_MOODS[mood].icon,
  })),
];

export function getRecommendationMoodDefinition(
  mood: TasteMood,
): RecommendationMoodDefinition | null {
  return mood === 'any' ? null : RECOMMENDATION_MOODS[mood];
}

export function getRecommendationMoodLabel(
  mood: TasteMood,
): string {
  return mood === 'any'
    ? 'Мой вкус'
    : RECOMMENDATION_MOODS[mood].label;
}

export function getMoodRetrievalTarget(
  mood: ActiveTasteMood,
  page: number,
  bucket: number,
): {
  genres?: string[];
  tags?: string[];
} {
  const definition = RECOMMENDATION_MOODS[mood];
  const safePage = Math.max(1, Math.trunc(page));
  const safeBucket = Math.max(0, Math.trunc(bucket));
  const useTag = (safePage + safeBucket) % 2 === 0;

  if (useTag && definition.retrievalTags.length > 0) {
    const index =
      (safePage * 3 + safeBucket) %
      definition.retrievalTags.length;

    return {
      tags: [definition.retrievalTags[index]!],
    };
  }

  const index =
    (safePage + safeBucket) %
    definition.retrievalGenres.length;

  return {
    genres: [definition.retrievalGenres[index]!],
  };
}
