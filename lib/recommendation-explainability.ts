import type {
  RecommendationScoreComponents,
  RecommendationScoreResult,
} from '@/lib/recommendation-ranking-config';
import type { RecommendationExplorationClass } from '@/lib/recommendation-exploration';
import type { RecommendationSeasonRelation } from '@/lib/recommendation-seasonality';

export const RECOMMENDATION_EXPLAINABILITY_VERSION = '22.5-explain-v1';

export type RecommendationExplanationKey =
  | 'liked_reference'
  | 'franchise_continuation'
  | 'completed_taste'
  | 'taste_genres'
  | 'mood_match'
  | 'session_intent'
  | 'studio_affinity'
  | 'format_affinity'
  | 'era_affinity'
  | 'episode_length'
  | 'completion_pattern'
  | 'binge_pace'
  | 'seasonal_match'
  | 'hidden_gem'
  | 'exploration_bridge'
  | 'engagement'
  | 'community_quality'
  | 'short_finished'
  | 'ongoing'
  | 'discovery';

export type RecommendationExplanationComponent =
  keyof RecommendationScoreComponents;

export type RecommendationExplanation = {
  key: RecommendationExplanationKey;
  text: string;
  components: RecommendationExplanationComponent[];
  contribution: number;
  contributionShare: number;
};

export type RecommendationExplanationSource =
  | 'watch_history'
  | 'taste_mood'
  | 'engagement'
  | 'taste_graph'
  | 'franchise'
  | 'discovery';

export type RecommendationExplainabilityResult = {
  version: typeof RECOMMENDATION_EXPLAINABILITY_VERSION;
  primary: RecommendationExplanation;
  items: RecommendationExplanation[];
  source: RecommendationExplanationSource;
};

type ExplainabilityInput = {
  ranking: RecommendationScoreResult;
  tasteMatches: string[];
  completedMatches: string[];
  likedReferenceTitle?: string | null;
  moodLabel?: string | null;
  studio?: string | null;
  format?: string | null;
  eraBucket?: string | null;
  preferredEpisodeCount?: number | null;
  completionRate: number;
  bingeScore: number;
  finished: boolean;
  episodeCount?: number | null;
  sessionIntentScore: number;
  sessionIntentConfidence: number;
  franchiseContinuation: boolean;
  explorationClass: RecommendationExplorationClass;
  hiddenGemScore: number;
  popularityBand: 'unknown' | 'niche' | 'mid' | 'mainstream' | 'blockbuster';
  seasonRelation: RecommendationSeasonRelation;
  seasonalScore: number;
  engagementScore: number;
  communityQuality: number;
};

type CandidateExplanation = Omit<
  RecommendationExplanation,
  'contributionShare'
> & {
  tiePriority: number;
};

const MIN_CONTRIBUTION = 0.012;
const STRONG_CONTRIBUTION = 0.025;

function finite(value: number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function positiveComponent(
  ranking: RecommendationScoreResult,
  component: RecommendationExplanationComponent,
) {
  return Math.max(0, finite(ranking.components[component]));
}

function contribution(
  ranking: RecommendationScoreResult,
  components: RecommendationExplanationComponent[],
) {
  return components.reduce(
    (sum, component) => sum + positiveComponent(ranking, component),
    0,
  );
}

function safeLabels(values: string[], limit = 2) {
  return [...new Set(
    values
      .map((value) => value.trim())
      .filter(Boolean),
  )].slice(0, limit);
}

function safeTitle(value: string | null | undefined) {
  const title = value?.trim().replace(/\s+/g, ' ') ?? '';
  return title ? title.slice(0, 80) : null;
}

function rounded(value: number) {
  return Math.round(value * 1000) / 1000;
}

function sourceForExplanation(
  key: RecommendationExplanationKey,
): RecommendationExplanationSource {
  if (key === 'franchise_continuation') return 'franchise';
  if (key === 'mood_match') return 'taste_mood';
  if (key === 'engagement') return 'engagement';
  if (
    key === 'completed_taste' ||
    key === 'session_intent' ||
    key === 'completion_pattern' ||
    key === 'binge_pace'
  ) {
    return 'watch_history';
  }
  if (
    key === 'liked_reference' ||
    key === 'taste_genres' ||
    key === 'studio_affinity' ||
    key === 'format_affinity' ||
    key === 'era_affinity' ||
    key === 'episode_length'
  ) {
    return 'taste_graph';
  }
  return 'discovery';
}

export function buildRecommendationExplanations(
  input: ExplainabilityInput,
): RecommendationExplainabilityResult {
  const candidates: CandidateExplanation[] = [];
  const seen = new Set<RecommendationExplanationKey>();

  const add = (
    key: RecommendationExplanationKey,
    text: string,
    components: RecommendationExplanationComponent[],
    options: {
      minContribution?: number;
      tiePriority?: number;
      explicitContribution?: number;
    } = {},
  ) => {
    if (seen.has(key)) return;

    const score =
      options.explicitContribution ??
      contribution(input.ranking, components);
    const minimum = options.minContribution ?? MIN_CONTRIBUTION;

    if (!Number.isFinite(score) || score < minimum) return;

    const cleanText = text.trim().replace(/\s+/g, ' ');
    if (!cleanText) return;

    seen.add(key);
    candidates.push({
      key,
      text: cleanText.slice(0, 180),
      components,
      contribution: rounded(score),
      tiePriority: options.tiePriority ?? 0,
    });
  };

  const likedReference = safeTitle(input.likedReferenceTitle);
  const tasteMatches = safeLabels(input.tasteMatches);
  const completedMatches = safeLabels(input.completedMatches);
  const studio = safeTitle(input.studio);
  const format = safeTitle(input.format);
  const eraBucket = safeTitle(input.eraBucket);
  const preferredEpisodes = Math.round(
    Math.max(0, finite(input.preferredEpisodeCount)),
  );
  const episodeCount = Math.round(
    Math.max(0, finite(input.episodeCount)),
  );

  const tasteContribution = Math.max(
    positiveComponent(input.ranking, 'tasteGraphPositive'),
    positiveComponent(input.ranking, 'genre'),
  );

  if (likedReference && tasteContribution >= STRONG_CONTRIBUTION) {
    add(
      'liked_reference',
      `Похоже на «${likedReference}», который тебе понравился`,
      tasteContribution === positiveComponent(input.ranking, 'tasteGraphPositive')
        ? ['tasteGraphPositive']
        : ['genre'],
      {
        minContribution: STRONG_CONTRIBUTION,
        tiePriority: 10,
        explicitContribution: tasteContribution,
      },
    );
  }

  if (input.franchiseContinuation) {
    add(
      'franchise_continuation',
      'Продолжение истории, которую ты уже смотрел',
      ['franchiseContinuation'],
      { minContribution: STRONG_CONTRIBUTION, tiePriority: 12 },
    );
  }

  if (completedMatches.length > 0) {
    add(
      'completed_taste',
      `Ты чаще досматриваешь: ${completedMatches.join(' · ')}`,
      ['completedAffinity'],
      { minContribution: STRONG_CONTRIBUTION, tiePriority: 8 },
    );
  }

  if (tasteMatches.length > 0) {
    const tasteComponent =
      positiveComponent(input.ranking, 'tasteGraphPositive') >=
      positiveComponent(input.ranking, 'genre')
        ? 'tasteGraphPositive'
        : 'genre';

    add(
      'taste_genres',
      `Совпадает со вкусом: ${tasteMatches.join(' · ')}`,
      [tasteComponent],
      { minContribution: STRONG_CONTRIBUTION, tiePriority: 7 },
    );
  }

  if (input.moodLabel) {
    add(
      'mood_match',
      `Под настроение «${input.moodLabel}»`,
      ['mood'],
      { minContribution: STRONG_CONTRIBUTION, tiePriority: 9 },
    );
  }

  if (
    input.sessionIntentScore >= 0.5 &&
    input.sessionIntentConfidence >= 0.28
  ) {
    add(
      'session_intent',
      'Похоже на то, что ты смотришь сейчас',
      ['sessionIntent'],
      { minContribution: STRONG_CONTRIBUTION, tiePriority: 8 },
    );
  }

  if (studio) {
    add(
      'studio_affinity',
      `Студия в твоём вкусе: ${studio}`,
      ['studioAffinity'],
      { minContribution: 0.02, tiePriority: 5 },
    );
  }

  if (format) {
    add(
      'format_affinity',
      `Ты часто выбираешь формат ${format}`,
      ['formatAffinity'],
      { minContribution: 0.018, tiePriority: 4 },
    );
  }

  if (eraBucket) {
    add(
      'era_affinity',
      `Тебе часто заходят аниме ${eraBucket}`,
      ['eraAffinity'],
      { minContribution: 0.016, tiePriority: 3 },
    );
  }

  if (preferredEpisodes > 0) {
    add(
      'episode_length',
      `Похожая длина — около ${preferredEpisodes} серий`,
      ['episodeLength'],
      { minContribution: 0.02, tiePriority: 7 },
    );
  }

  if (
    input.completionRate >= 0.62 &&
    input.finished &&
    completedMatches.length > 0
  ) {
    add(
      'completion_pattern',
      'По твоей истории ты чаще досматриваешь такие завершённые тайтлы',
      ['completionLikelihood'],
      { minContribution: 0.07, tiePriority: 7 },
    );
  }

  if (
    input.bingeScore >= 0.45 &&
    episodeCount > 0 &&
    episodeCount <= 13
  ) {
    add(
      'binge_pace',
      'Подходит под твой привычный темп просмотра',
      ['shortFinished', 'completionLikelihood'],
      { minContribution: 0.035, tiePriority: 6 },
    );
  }

  if (
    input.seasonRelation === 'current' &&
    input.seasonalScore >= 0.24
  ) {
    add(
      'seasonal_match',
      'Из текущего сезона — и совпадает с твоим вкусом',
      ['seasonalFreshness'],
      { minContribution: 0.02, tiePriority: 6 },
    );
  }

  if (
    input.hiddenGemScore >= 0.58 &&
    input.popularityBand !== 'unknown' &&
    input.popularityBand !== 'blockbuster'
  ) {
    add(
      'hidden_gem',
      'Скрытая находка: сильный матч при меньшей популярности',
      ['hiddenGem'],
      { minContribution: 0.025, tiePriority: 7 },
    );
  }

  if (input.explorationClass === 'explore') {
    const hasLengthBridge =
      positiveComponent(input.ranking, 'episodeLength') >= 0.02;
    const hasTasteBridge = tasteContribution >= STRONG_CONTRIBUTION;

    add(
      'exploration_bridge',
      hasLengthBridge
        ? 'За пределами привычного — но с твоей знакомой длиной'
        : hasTasteBridge
          ? 'За пределами привычного — но с знакомыми чертами вкуса'
          : 'За пределами привычного: осознанный эксперимент',
      hasLengthBridge
        ? ['novelty', 'episodeLength']
        : hasTasteBridge
          ? ['novelty',
              positiveComponent(input.ranking, 'tasteGraphPositive') >=
              positiveComponent(input.ranking, 'genre')
                ? 'tasteGraphPositive'
                : 'genre']
          : ['novelty'],
      { minContribution: 0.025, tiePriority: 5 },
    );
  }

  if (input.engagementScore >= 0.055) {
    add(
      'engagement',
      'Ты уже обращал внимание на этот тайтл',
      ['engagementPositive'],
      { minContribution: 0.025, tiePriority: 4 },
    );
  }

  if (input.communityQuality >= 0.82) {
    add(
      'community_quality',
      'Высокая оценка сообщества',
      ['communityQuality'],
      { minContribution: 0.045, tiePriority: 2 },
    );
  }

  if (
    input.finished &&
    episodeCount > 0 &&
    episodeCount <= 13
  ) {
    add(
      'short_finished',
      'Короткий завершённый тайтл',
      ['shortFinished'],
      { minContribution: MIN_CONTRIBUTION, tiePriority: 1 },
    );
  }

  add(
    'ongoing',
    'Можно смотреть по мере выхода',
    ['ongoing'],
    { minContribution: MIN_CONTRIBUTION, tiePriority: 1 },
  );

  add(
    'discovery',
    'Вариант для исследования твоего вкуса',
    ['discovery'],
    { minContribution: MIN_CONTRIBUTION, tiePriority: 0 },
  );

  candidates.sort(
    (left, right) =>
      right.contribution - left.contribution ||
      right.tiePriority - left.tiePriority ||
      left.key.localeCompare(right.key),
  );

  const fallback: CandidateExplanation = {
    key: 'discovery',
    text: 'Вариант для исследования твоего вкуса',
    components: ['discovery'],
    contribution: rounded(
      Math.max(
        MIN_CONTRIBUTION,
        positiveComponent(input.ranking, 'discovery'),
      ),
    ),
    tiePriority: 0,
  };

  const selected = (candidates.length ? candidates : [fallback]).slice(0, 3);
  const positiveTotal = Math.max(
    MIN_CONTRIBUTION,
    Object.values(input.ranking.components).reduce(
      (sum, value) => sum + Math.max(0, finite(value)),
      0,
    ),
  );

  const items: RecommendationExplanation[] = selected.map(
    ({ tiePriority: _tiePriority, ...item }) => ({
      ...item,
      contributionShare: rounded(
        clamp(item.contribution / positiveTotal),
      ),
    }),
  );

  return {
    version: RECOMMENDATION_EXPLAINABILITY_VERSION,
    primary: items[0],
    items,
    source: sourceForExplanation(items[0].key),
  };
}
