import type { TasteMood } from '@/lib/personalization';
import type { RankedRecommendation } from '@/lib/recommendations';

export type RecommendationRail = {
  id: 'mood_lane' | 'top_match' | 'taste_lane' | 'quick_watch' | 'explore' | 'endless';
  title: string;
  subtitle: string;
  source: string;
  badge: string;
  items: RankedRecommendation[];
};

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

export function buildRecommendationRails(
  recommendations: RankedRecommendation[],
  options: {
    mood: TasteMood;
    hasWatchHistory: boolean;
    hasMore: boolean;
  },
): RecommendationRail[] {
  if (!recommendations.length) return [];

  const pool = recommendations.slice(0, 64);
  const used = new Set<number>();

  const take = (
    predicate: (item: RankedRecommendation) => boolean,
    limit: number,
  ) => {
    const selected: RankedRecommendation[] = [];

    for (const item of pool) {
      if (selected.length >= limit) break;
      if (used.has(item.anime.id) || !predicate(item)) continue;
      used.add(item.anime.id);
      selected.push(item);
    }

    return selected;
  };

  const rails: RecommendationRail[] = [];

  if (options.mood !== 'any') {
    const moodLabel = MOOD_RAIL_LABELS[options.mood];
    const moodLane = take(
      (item) => item.ranking.components.mood > 0,
      7,
    );

    if (moodLane.length >= 3) {
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

  const top = take(() => true, 7);
  if (top.length) {
    rails.push({
      id: 'top_match',
      title: options.hasWatchHistory ? 'Точно в твоём вкусе' : 'Стартовый микс AnimeBox',
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
      (item) =>
        (item.anime.genres ?? []).some((value) => normalizeGenre(value) === key),
      7,
    );

    if (tasteLane.length >= 3) {
      rails.push({
        id: 'taste_lane',
        title: options.hasWatchHistory
          ? `Потому что тебе нравится «${genre}»`
          : `Попробуй жанр «${genre}»`,
        subtitle: 'Тот же вкусовой вектор, но без повторения первой полки.',
        source: 'smart_feed_taste_lane',
        badge: 'ЖАНР',
        items: tasteLane,
      });
    }
  }

  const quick = take(isShortWatch, 7);
  if (quick.length >= 3) {
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
    (item) =>
      item.source === 'discovery' ||
      item.matchScore == null ||
      item.matchScore < 76,
    7,
  );
  if (explore.length >= 3) {
    rails.push({
      id: 'explore',
      title: 'За пределами привычного',
      subtitle: 'Контролируемое исследование, чтобы рекомендации не замыкались в одном жанре.',
      source: 'smart_feed_explore',
      badge: 'ИССЛЕДОВАНИЕ',
      items: explore,
    });
  }

  const endlessItems = recommendations.filter(
    (item) => !used.has(item.anime.id),
  );

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

  return rails;
}
