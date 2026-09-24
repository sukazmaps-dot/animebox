import type { TasteMood } from '@/lib/personalization';
import type { RankedRecommendation } from '@/lib/recommendations';

export type RecommendationRailId =
  | 'mood_lane'
  | 'top_match'
  | 'taste_lane'
  | 'quick_watch'
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

function normalizeGenre(value: string) {
  return value.trim().toLocaleLowerCase('ru-RU');
}

function isShortWatch(item: RankedRecommendation) {
  const episodes = Number(item.anime.episodes ?? 0);
  const duration = Number(item.anime.duration ?? 0);
  const format = String(item.anime.format ?? '').toUpperCase();

  if (format === 'MOVIE' || format === 'ФИЛЬМ') return true;
  if (episodes > 0 && episodes <= 13) return true;
  return episodes > 0 && episodes <= 24 && duration > 0 && duration <= 30;
}

const MOOD_RAIL_LABELS: Record<Exclude<TasteMood, 'any'>, string> = {
  comfort: 'Уют',
  tension: 'Напряжение',
  emotion: 'Сильные эмоции',
  adventure: 'Приключение',
};

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
  if (rail.id === 'mood_lane') return item.ranking.components.mood > 0;
  if (rail.id === 'quick_watch') return isShortWatch(item);
  if (rail.id === 'explore') {
    return (
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

  if (rail.id === 'explore') {
    return item.matchScore == null || item.matchScore < 88;
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
  },
): RecommendationRailLayout {
  if (!recommendations.length) {
    return { rails: [], ownership: new Map() };
  }

  // Data may keep growing during a long session, but the DOM stays bounded by
  // per-rail limits. No duplicated title is rendered in multiple rails.
  const pool = recommendations;
  const availableIds = new Set(pool.map((item) => item.anime.id));
  const ownership = new Map<number, RecommendationRailId>();

  for (const [animeId, railId] of options.ownership ?? []) {
    if (availableIds.has(animeId)) ownership.set(animeId, railId);
  }

  const used = new Set<number>();

  const take = (
    id: RecommendationRailId,
    predicate: (item: RankedRecommendation) => boolean,
  ) => {
    const limit = railLimit(options.limits, id);
    const selected: RankedRecommendation[] = [];

    // Keep previously rendered cards sticky in their original rail. This is
    // what prevents a newly fetched page from teleporting visible cards.
    for (const item of pool) {
      if (selected.length >= limit) break;
      if (used.has(item.anime.id) || ownership.get(item.anime.id) !== id) {
        continue;
      }
      used.add(item.anime.id);
      selected.push(item);
    }

    // Only unowned candidates may fill new slots.
    for (const item of pool) {
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

  if (options.mood !== 'any') {
    const moodLabel = MOOD_RAIL_LABELS[options.mood];
    const moodLane = take(
      'mood_lane',
      (item) => item.ranking.components.mood > 0,
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
        'Продолжай листать — AnimeBox догружает новые кандидаты и пересобирает выдачу под твой вкус.',
      source: 'smart_feed_endless',
      badge: 'ДЛЯ ТЕБЯ',
      items: endlessItems,
    });
  }

  return { rails, ownership };
}

export function buildRecommendationRails(
  recommendations: RankedRecommendation[],
  options: {
    mood: TasteMood;
    hasWatchHistory: boolean;
    hasMore: boolean;
    limits?: RecommendationRailLimits;
    ownership?: ReadonlyMap<number, RecommendationRailId>;
  },
): RecommendationRail[] {
  return buildRecommendationRailLayout(recommendations, options).rails;
}
