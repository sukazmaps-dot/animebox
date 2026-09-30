export const RECOMMENDATION_FEEDBACK_POLICY_VERSION = '22.4-feedback-v2';

export const RECOMMENDATION_FEEDBACK_SIGNALS = [
  'like_more',
  'not_interested',
  'already_watched',
  'less_like_this',
  'too_long',
  'dislike_genre',
  'dislike_setting',
  'not_now',
  'hidden',
] as const;

export type RecommendationFeedbackSignal =
  (typeof RECOMMENDATION_FEEDBACK_SIGNALS)[number];

export type RecommendationFeedbackPolarity =
  | 'positive'
  | 'negative'
  | 'neutral';

export type RecommendationFeedbackPolicy = {
  polarity: RecommendationFeedbackPolarity;
  label: string;
  description: string;
  halfLifeDays: number;
  floor: number;
  exclusionDays: number | null;
  genreWeight: number;
  studioWeight: number;
  formatWeight: number;
  eraWeight: number;
  statusWeight: number;
  lengthWeight: number;
  localGenreDelta: number;
  engagementScore: number;
  menu: boolean;
};

const POLICIES: Record<
  RecommendationFeedbackSignal,
  RecommendationFeedbackPolicy
> = {
  like_more: {
    polarity: 'positive',
    label: 'Больше такого',
    description: 'Усилить похожие жанры и метаданные.',
    halfLifeDays: 240,
    floor: 0.35,
    exclusionDays: null,
    genreWeight: 2.8,
    studioWeight: 2.2,
    formatWeight: 1.1,
    eraWeight: 0.7,
    statusWeight: 0.5,
    lengthWeight: 0,
    localGenreDelta: 0,
    engagementScore: 0.12,
    menu: false,
  },
  not_interested: {
    polarity: 'negative',
    label: 'Не интересно',
    description: 'Скрыть тайтл и немного уменьшить похожие.',
    halfLifeDays: 150,
    floor: 0.22,
    exclusionDays: null,
    genreWeight: 1.2,
    studioWeight: 0.45,
    formatWeight: 0.25,
    eraWeight: 0.12,
    statusWeight: 0.12,
    lengthWeight: 0,
    localGenreDelta: 0.24,
    engagementScore: -0.62,
    menu: true,
  },
  less_like_this: {
    polarity: 'negative',
    label: 'Меньше такого',
    description: 'Ослабить похожие тайтлы без жёсткого запрета жанров.',
    halfLifeDays: 120,
    floor: 0.18,
    exclusionDays: null,
    genreWeight: 0.85,
    studioWeight: 0.55,
    formatWeight: 0.22,
    eraWeight: 0.1,
    statusWeight: 0.08,
    lengthWeight: 0,
    localGenreDelta: 0.16,
    engagementScore: -0.42,
    menu: true,
  },
  already_watched: {
    polarity: 'neutral',
    label: 'Уже смотрел',
    description: 'Убрать сам тайтл, не ухудшая похожие рекомендации.',
    halfLifeDays: 3650,
    floor: 1,
    exclusionDays: null,
    genreWeight: 0,
    studioWeight: 0,
    formatWeight: 0,
    eraWeight: 0,
    statusWeight: 0,
    lengthWeight: 0,
    localGenreDelta: 0,
    engagementScore: 0,
    menu: false,
  },
  too_long: {
    polarity: 'negative',
    label: 'Слишком длинное',
    description: 'Учесть нежелательную длину, не наказывая жанры.',
    halfLifeDays: 210,
    floor: 0.28,
    exclusionDays: null,
    genreWeight: 0,
    studioWeight: 0,
    formatWeight: 0,
    eraWeight: 0,
    statusWeight: 0,
    lengthWeight: 2.2,
    localGenreDelta: 0,
    engagementScore: -0.48,
    menu: true,
  },
  dislike_genre: {
    polarity: 'negative',
    label: 'Не люблю эти жанры',
    description: 'Сильный долгосрочный отрицательный жанровый сигнал.',
    halfLifeDays: 240,
    floor: 0.35,
    exclusionDays: null,
    genreWeight: 2.8,
    studioWeight: 0,
    formatWeight: 0,
    eraWeight: 0,
    statusWeight: 0,
    lengthWeight: 0,
    localGenreDelta: 0.44,
    engagementScore: -0.82,
    menu: true,
  },
  dislike_setting: {
    polarity: 'negative',
    label: 'Не нравится стиль / сеттинг',
    description: 'Ослабить студию, формат и эпоху без сильного жанрового штрафа.',
    halfLifeDays: 210,
    floor: 0.3,
    exclusionDays: null,
    genreWeight: 0,
    studioWeight: 1.8,
    formatWeight: 1.0,
    eraWeight: 0.75,
    statusWeight: 0.3,
    lengthWeight: 0,
    localGenreDelta: 0,
    engagementScore: -0.68,
    menu: true,
  },
  not_now: {
    polarity: 'neutral',
    label: 'Не сейчас',
    description: 'Скрыть временно без долгосрочного изменения вкуса.',
    halfLifeDays: 7,
    floor: 0,
    exclusionDays: 14,
    genreWeight: 0,
    studioWeight: 0,
    formatWeight: 0,
    eraWeight: 0,
    statusWeight: 0,
    lengthWeight: 0,
    localGenreDelta: 0,
    engagementScore: -0.12,
    menu: true,
  },
  hidden: {
    polarity: 'negative',
    label: 'Скрыто',
    description: 'Legacy-сигнал сильного скрытия.',
    halfLifeDays: 240,
    floor: 0.35,
    exclusionDays: null,
    genreWeight: 3.1,
    studioWeight: 2.4,
    formatWeight: 1.2,
    eraWeight: 0.8,
    statusWeight: 0.6,
    lengthWeight: 0,
    localGenreDelta: 0.5,
    engagementScore: -0.9,
    menu: false,
  },
};

export function isRecommendationFeedbackSignal(
  value: unknown,
): value is RecommendationFeedbackSignal {
  return RECOMMENDATION_FEEDBACK_SIGNALS.includes(
    String(value) as RecommendationFeedbackSignal,
  );
}

export function recommendationFeedbackPolicy(
  signal: RecommendationFeedbackSignal,
): RecommendationFeedbackPolicy {
  return POLICIES[signal];
}

export function recommendationFeedbackMenuItems() {
  return RECOMMENDATION_FEEDBACK_SIGNALS
    .filter((signal) => POLICIES[signal].menu)
    .map((signal) => ({
      signal,
      label: POLICIES[signal].label,
      description: POLICIES[signal].description,
    }));
}

export function recommendationFeedbackExclusionActive(
  signal: RecommendationFeedbackSignal,
  updatedAt: string | number | Date | null | undefined,
  now = Date.now(),
): boolean {
  const policy = POLICIES[signal];
  if (policy.exclusionDays == null) {
    return signal !== 'like_more';
  }

  const timestamp =
    updatedAt instanceof Date
      ? updatedAt.getTime()
      : typeof updatedAt === 'number'
        ? updatedAt
        : typeof updatedAt === 'string'
          ? Date.parse(updatedAt)
          : Number.NaN;

  if (!Number.isFinite(timestamp)) return false;

  return now - timestamp <= policy.exclusionDays * 86_400_000;
}
