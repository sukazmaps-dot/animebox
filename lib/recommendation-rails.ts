import type { TasteMood } from '@/lib/personalization';
import type { RankedRecommendation } from '@/lib/recommendations';
import type { TasteGraph } from '@/lib/taste-graph';
import { getRecommendationMoodLabel } from '@/lib/recommendation-moods';

export type RecommendationRailId =
  | 'mood_lane'
  | 'session_intent'
  | 'top_match'
  | 'story_continues'
  | 'taste_lane'
  | 'quick_watch'
  | 'hidden_gems'
  | 'seasonal'
  | 'explore'
  | 'endless';

export type RecommendationRail = {
  id: RecommendationRailId;
  title: string;
  subtitle: string;
  source: string;
  badge: string;
  items: RankedRecommendation[];
  genre?: string | null;
};

export type RecommendationRailLimits = Partial<
  Record<RecommendationRailId, number>
>;

export type RecommendationRailLayout = {
  rails: RecommendationRail[];
  ownership: Map<number, RecommendationRailId>;
};

export const DEFAULT_RECOMMENDATION_RAIL_LIMIT = 7;
export const RECOMMENDATION_RAIL_BATCH_SIZE = 6;
export const HOME_COMPOSITION_VERSION = '22.8-home-v1';

export const SESSION_STABLE_RAIL_ORDER: readonly RecommendationRailId[] = [
  'mood_lane',
  'top_match',
  'session_intent',
  'story_continues',
  'hidden_gems',
  'explore',
  'seasonal',
  'taste_lane',
  'quick_watch',
  'endless',
];

type RailOrderTaste = Pick<
  TasteGraph,
  'confidence' | 'explorationRate' | 'preferredEpisodeCount'
>;

export function orderRecommendationRails(
  rails: RecommendationRail[],
  options: {
    mood: TasteMood;
    hasWatchHistory: boolean;
    tasteGraph?: RailOrderTaste | null;
  },
): RecommendationRail[] {
  const baseIndex = new Map(
    rails.map((rail, index) => [rail.id, index] as const),
  );
  const graph = options.tasteGraph;
  const confidentTaste =
    options.hasWatchHistory && Number(graph?.confidence ?? 0) >= 0.35;
  const explorationRate = Number(graph?.explorationRate ?? 0.14);
  const shortPreference =
    Number(graph?.preferredEpisodeCount ?? 0) > 0 &&
    Number(graph?.preferredEpisodeCount ?? 0) <= 16;

  const weight = (rail: RecommendationRail) => {
    if (rail.id === 'mood_lane') {
      return options.mood === 'any' ? 60 : 0;
    }
    if (rail.id === 'top_match') {
      return options.mood === 'any' ? 0 : 10;
    }
    if (rail.id === 'session_intent') {
      return options.hasWatchHistory ? 18 : 70;
    }
    if (rail.id === 'story_continues') return options.hasWatchHistory ? 20 : 90;
    if (rail.id === 'hidden_gems') {
      return options.hasWatchHistory
        ? explorationRate >= 0.12 ? 30 : 36
        : 30;
    }
    if (rail.id === 'seasonal') return options.hasWatchHistory ? 44 : 34;
    if (rail.id === 'endless') return 100;

    if (!options.hasWatchHistory) {
      if (rail.id === 'explore') return 24;
      if (rail.id === 'quick_watch') return 40;
      if (rail.id === 'taste_lane') return 46;
      return 50;
    }

    if (rail.id === 'taste_lane') {
      return confidentTaste ? 48 : 56;
    }

    if (rail.id === 'quick_watch') {
      return shortPreference ? 50 : explorationRate >= 0.15 ? 54 : 52;
    }

    if (rail.id === 'explore') {
      return explorationRate >= 0.15 ? 34 : 40;
    }

    return 50;
  };

  return rails
    .map((rail) => ({
      rail,
      order: weight(rail),
      base: baseIndex.get(rail.id) ?? 999,
    }))
    .sort((left, right) => left.order - right.order || left.base - right.base)
    .map(({ rail }) => rail);
}

function normalizeGenre(value: string) {
  return value.trim().toLocaleLowerCase('ru-RU');
}

function isStrictMoodRecommendation(item: RankedRecommendation) {
  return item.moodTier === 'strong' || item.moodTier === 'good';
}

function isRelaxedMoodRecommendation(item: RankedRecommendation) {
  return item.moodTier !== 'none';
}

function isShortWatch(item: RankedRecommendation) {
  const episodes = Number(item.anime.episodes ?? 0);
  const duration = Number(item.anime.duration ?? 0);
  const format = String(item.anime.format ?? '').toUpperCase();

  if (format === 'MOVIE' || format === 'ФИЛЬМ') return true;
  if (episodes > 0 && episodes <= 13) return true;
  return episodes > 0 && episodes <= 24 && duration > 0 && duration <= 30;
}

function dominantGenre(items: RankedRecommendation[]) {
  const weights = new Map<string, { label: string; weight: number }>();

  items.slice(0, 18).forEach((item, index) => {
    for (const rawGenre of item.anime.genres ?? []) {
      const key = normalizeGenre(rawGenre);
      if (!key) continue;

      const previous = weights.get(key);
      const weight = Math.max(0.2, 1 - index * 0.045);
      weights.set(key, {
        label: previous?.label ?? rawGenre,
        weight: (previous?.weight ?? 0) + weight,
      });
    }
  });

  return [...weights.values()].sort((a, b) => b.weight - a.weight)[0]?.label ?? null;
}

export function recommendationMatchesRail(
  item: RankedRecommendation,
  rail: Pick<RecommendationRail, 'id' | 'genre'>,
): boolean {
  if (rail.id === 'top_match' || rail.id === 'endless') return true;
  if (rail.id === 'session_intent') {
    return (
      item.sessionIntentConfidence >= 0.16 &&
      item.sessionIntentScore >= 0.14
    );
  }
  if (rail.id === 'story_continues') return item.franchiseContinuation;
  if (rail.id === 'hidden_gems') return item.hiddenGemScore >= 0.58;
  if (rail.id === 'seasonal') {
    return item.seasonRelation === 'current' && item.seasonalScore >= 0.24;
  }
  if (rail.id === 'mood_lane') return isStrictMoodRecommendation(item);
  if (rail.id === 'quick_watch') return isShortWatch(item);
  if (rail.id === 'explore') {
    return (
      item.explorationClass === 'explore' ||
      item.source === 'discovery' ||
      item.matchScore == null ||
      item.matchScore < 76
    );
  }

  if (rail.id === 'taste_lane' && rail.genre) {
    const key = normalizeGenre(rail.genre);
    return (item.anime.genres ?? []).some(
      (value) => normalizeGenre(value) === key,
    );
  }

  return false;
}

export function recommendationMatchesRailRelaxed(
  item: RankedRecommendation,
  rail: Pick<RecommendationRail, 'id' | 'genre'>,
): boolean {
  if (recommendationMatchesRail(item, rail)) return true;

  if (rail.id === 'mood_lane') {
    return isRelaxedMoodRecommendation(item);
  }

  if (rail.id === 'session_intent') {
    return (
      item.sessionIntentConfidence >= 0.12 &&
      item.sessionIntentScore >= 0.08
    );
  }

  if (rail.id === 'hidden_gems') {
    return item.hiddenGemScore >= 0.48;
  }

  if (rail.id === 'seasonal') {
    return item.seasonRelation === 'current' && item.seasonalScore >= 0.18;
  }

  if (rail.id === 'explore') {
    return (
      item.explorationClass !== 'safe' ||
      item.matchScore == null ||
      item.matchScore < 88
    );
  }

  if (rail.id === 'quick_watch') {
    const episodes = Number(item.anime.episodes ?? 0);
    const format = String(item.anime.format ?? '').toUpperCase();

    return (
      format === 'MOVIE' ||
      format === 'ФИЛЬМ' ||
      (episodes > 0 && episodes <= 24)
    );
  }

  return false;
}

function railLimit(
  limits: RecommendationRailLimits | undefined,
  id: RecommendationRailId,
) {
  const value = Number(limits?.[id] ?? DEFAULT_RECOMMENDATION_RAIL_LIMIT);
  return Number.isFinite(value)
    ? Math.max(DEFAULT_RECOMMENDATION_RAIL_LIMIT, Math.trunc(value))
    : DEFAULT_RECOMMENDATION_RAIL_LIMIT;
}

export function buildRecommendationRailLayout(
  recommendations: RankedRecommendation[],
  options: {
    mood: TasteMood;
    hasWatchHistory: boolean;
    hasMore: boolean;
    limits?: RecommendationRailLimits;
    ownership?: ReadonlyMap<number, RecommendationRailId>;
    tasteGraph?: RailOrderTaste | null;
  },
): RecommendationRailLayout {
  if (!recommendations.length) {
    return { rails: [], ownership: new Map() };
  }

  // Data may keep growing during a long session, but the DOM stays bounded by
  // per-rail limits. No duplicated title is rendered in multiple rails.
  const pool = recommendations;
  const itemsById = new Map(pool.map((item) => [item.anime.id, item]));
  const availableIds = new Set(pool.map((item) => item.anime.id));
  const ownership = new Map<number, RecommendationRailId>();

  for (const [animeId, railId] of options.ownership ?? []) {
    if (availableIds.has(animeId)) ownership.set(animeId, railId);
  }

  const used = new Set<number>();

  const take = (
    id: RecommendationRailId,
    predicate: (item: RankedRecommendation) => boolean,
    candidates: RankedRecommendation[] = pool,
  ) => {
    const limit = railLimit(options.limits, id);
    const selected: RankedRecommendation[] = [];

    // Keep previously rendered cards sticky in their original rail. This is
    // what prevents a newly fetched page from teleporting visible cards.
    for (const [animeId, owner] of ownership) {
      if (selected.length >= limit) break;
      const item = itemsById.get(animeId);
      if (!item || used.has(animeId) || owner !== id) {
        continue;
      }
      used.add(item.anime.id);
      selected.push(item);
    }

    // Only unowned candidates may fill new slots.
    for (const item of candidates) {
      if (selected.length >= limit) break;
      if (used.has(item.anime.id) || ownership.has(item.anime.id)) continue;
      if (!predicate(item)) continue;

      ownership.set(item.anime.id, id);
      used.add(item.anime.id);
      selected.push(item);
    }

    return selected;
  };

  const rails: RecommendationRail[] = [];

  const storyContinues = take(
    'story_continues',
    (item) =>
      item.franchiseContinuation &&
      (options.mood === 'any' || !isStrictMoodRecommendation(item)),
  );

  if (storyContinues.length > 0) {
    rails.push({
      id: 'story_continues',
      title: 'История продолжается',
      subtitle:
        'Следующие сезоны и части тайтлов, к которым ты уже дошёл — без случайных спойлерных сиквелов.',
      source: 'smart_feed_story_continues',
      badge: 'ПРОДОЛЖЕНИЕ',
      items: storyContinues,
    });
  }

  if (options.mood !== 'any') {
    const moodLabel = getRecommendationMoodLabel(options.mood);
    const moodPool = [...pool].sort((left, right) => {
      const leftMoodScore = left.moodScore * 0.6 + left.score * 0.4;
      const rightMoodScore = right.moodScore * 0.6 + right.score * 0.4;

      return rightMoodScore - leftMoodScore;
    });
    const moodLane = take(
      'mood_lane',
      (item) => isStrictMoodRecommendation(item),
      moodPool,
    );

    if (moodLane.length > 0 && (moodLane.length >= 3 || options.hasMore)) {
      rails.push({
        id: 'mood_lane',
        title: `Под настроение «${moodLabel}»`,
        subtitle: options.hasWatchHistory
          ? 'Сейчас выше те тайтлы, которые совпадают и с настроением, и с твоим Taste Graph.'
          : 'Стартовая подборка под выбранное настроение, пока AnimeBox набирает сигналы вкуса.',
        source: 'smart_feed_mood_lane',
        badge: 'НАСТРОЕНИЕ',
        items: moodLane,
      });
    }
  }

  const sessionIntentCandidates = pool.filter(
    (item) =>
      item.sessionIntentConfidence >= 0.16 &&
      item.sessionIntentScore >= 0.14,
  );

  if (
    sessionIntentCandidates.length >= 3 ||
    (sessionIntentCandidates.length > 0 && options.hasMore)
  ) {
    const sessionIntent = take(
      'session_intent',
      (item) =>
        item.sessionIntentConfidence >= 0.16 &&
        item.sessionIntentScore >= 0.14,
    );

    if (sessionIntent.length > 0) {
      rails.push({
        id: 'session_intent',
        title: 'Под твой текущий ритм',
        subtitle:
          'Недавние просмотры влияют только на эту сессию и не переписывают твой долгосрочный Taste Graph.',
        source: 'smart_feed_session_intent',
        badge: 'СЕЙЧАС',
        items: sessionIntent,
      });
    }
  }

  const seasonalCandidates = pool.filter(
    (item) =>
      item.seasonRelation === 'current' &&
      item.seasonalScore >= 0.24,
  );

  if (seasonalCandidates.length >= 3 || (seasonalCandidates.length > 0 && options.hasMore)) {
    const seasonal = take(
      'seasonal',
      (item) =>
        item.seasonRelation === 'current' &&
        item.seasonalScore >= 0.24,
    );

    if (seasonal.length > 0) {
      rails.push({
        id: 'seasonal',
        title: 'Из этого сезона для тебя',
        subtitle:
          'Свежие тайтлы текущего сезона, которые проходят порог совпадения с твоим вкусом.',
        source: 'smart_feed_seasonal',
        badge: 'СЕЗОН',
        items: seasonal,
      });
    }
  }

  const hiddenGemCandidates = pool.filter(
    (item) =>
      !item.franchiseContinuation &&
      item.hiddenGemScore >= 0.58,
  );

  if (hiddenGemCandidates.length >= 3 || (hiddenGemCandidates.length > 0 && options.hasMore)) {
    const hiddenGems = take(
      'hidden_gems',
      (item) =>
        !item.franchiseContinuation &&
        item.hiddenGemScore >= 0.58,
    );

    if (hiddenGems.length > 0) {
      rails.push({
        id: 'hidden_gems',
        title: 'Скрытые находки',
        subtitle:
          'Менее очевидные тайтлы с сильным совпадением по вкусу и достаточным качеством.',
        source: 'smart_feed_hidden_gems',
        badge: 'НАХОДКИ',
        items: hiddenGems,
      });
    }
  }

  const top = take('top_match', () => true);
  if (top.length) {
    rails.push({
      id: 'top_match',
      title: options.hasWatchHistory
        ? 'Точно в твоём вкусе'
        : 'Стартовый микс AnimeBox',
      subtitle: options.hasWatchHistory
        ? 'Самые сильные совпадения по Taste Graph и истории просмотра.'
        : 'Разные сильные варианты, пока Taste Graph набирает первые устойчивые сигналы.',
      source: 'smart_feed_top_match',
      badge: options.hasWatchHistory ? 'ВКУС' : 'СТАРТ',
      items: top,
    });
  }

  const genre = dominantGenre(pool);
  if (genre) {
    const key = normalizeGenre(genre);
    const tasteLane = take(
      'taste_lane',
      (item) =>
        (item.anime.genres ?? []).some(
          (value) => normalizeGenre(value) === key,
        ),
    );

    if (tasteLane.length > 0 && (tasteLane.length >= 3 || options.hasMore)) {
      rails.push({
        id: 'taste_lane',
        title: options.hasWatchHistory
          ? `Потому что тебе нравится «${genre}»`
          : `Попробуй жанр «${genre}»`,
        subtitle: 'Тот же вкусовой вектор, но без повторения первой полки.',
        source: 'smart_feed_taste_lane',
        badge: 'ЖАНР',
        genre,
        items: tasteLane,
      });
    }
  }

  const quick = take('quick_watch', isShortWatch);
  if (quick.length > 0 && (quick.length >= 3 || options.hasMore)) {
    rails.push({
      id: 'quick_watch',
      title: 'Короткое на вечер',
      subtitle: 'Фильмы и компактные тайтлы, которые проще начать прямо сейчас.',
      source: 'smart_feed_quick_watch',
      badge: 'БЫСТРО',
      items: quick,
    });
  }

  const explore = take(
    'explore',
    (item) =>
      item.explorationClass === 'explore' ||
      item.source === 'discovery' ||
      item.matchScore == null ||
      item.matchScore < 76,
  );
  if (explore.length > 0 && (explore.length >= 3 || options.hasMore)) {
    rails.push({
      id: 'explore',
      title: 'За пределами привычного',
      subtitle: 'Контролируемое исследование, чтобы рекомендации не замыкались в одном жанре.',
      source: 'smart_feed_explore',
      badge: 'ИССЛЕДОВАНИЕ',
      items: explore,
    });
  }

  const endlessItems = take('endless', () => true);

  if (endlessItems.length > 0 || options.hasMore) {
    rails.push({
      id: 'endless',
      title: 'Ещё для тебя',
      subtitle:
        'Продолжай листать — AnimeBox заранее готовит новые варианты и добавляет их справа, не переставляя уже показанные карточки.',
      source: 'smart_feed_endless',
      badge: 'ДЛЯ ТЕБЯ',
      items: endlessItems,
    });
  }

  return {
    rails: orderRecommendationRails(rails, {
      mood: options.mood,
      hasWatchHistory: options.hasWatchHistory,
      tasteGraph: options.tasteGraph,
    }),
    ownership,
  };
}

export function getHomeScheduleInsertionIndex(
  rails: ReadonlyArray<Pick<RecommendationRail, 'id'>>,
): number {
  if (!rails.length) return -1;

  const topMatchIndex = rails.findIndex((rail) => rail.id === 'top_match');
  if (topMatchIndex < 0) return 0;

  let insertionIndex = topMatchIndex;

  for (let index = topMatchIndex + 1; index < rails.length; index += 1) {
    const id = rails[index]?.id;
    if (id === 'session_intent' || id === 'mood_lane') {
      insertionIndex = index;
      continue;
    }
    break;
  }

  return insertionIndex;
}

export function buildRecommendationRails(
  recommendations: RankedRecommendation[],
  options: {
    mood: TasteMood;
    hasWatchHistory: boolean;
    hasMore: boolean;
    limits?: RecommendationRailLimits;
    ownership?: ReadonlyMap<number, RecommendationRailId>;
    tasteGraph?: RailOrderTaste | null;
  },
): RecommendationRail[] {
  return buildRecommendationRailLayout(recommendations, options).rails;
}
