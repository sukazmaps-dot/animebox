import type { Anime } from '@/types/anime';
import {
  readAnimeList,
  readWatchHistory,
} from '@/lib/anime-storage';

function uniqueById(items: Anime[]): Anime[] {
  const seen = new Set<number>();

  return items.filter((anime) => {
    if (seen.has(anime.id)) return false;

    seen.add(anime.id);
    return true;
  });
}

function getAnimeTitle(anime: Anime): string {
  return (
    anime.title.russian?.trim() ||
    anime.title.english?.trim() ||
    anime.title.romaji?.trim() ||
    anime.title.native?.trim() ||
    'Без названия'
  );
}

export function getRecommendedAnime(
  candidates: Anime[],
  limit = 8,
): Anime[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const history = readWatchHistory();

  // Пока пользователь ничего не смотрел — персонального профиля ещё нет.
  if (history.length === 0) {
    return [];
  }

  const saved = readAnimeList();
  const watchedIds = new Set(history.map((item) => item.id));
  const savedIds = new Set(saved.map((item) => item.id));

  /*
   * Жанры считаем с весом: повторные и недавние просмотры
   * влияют сильнее единичного старого просмотра.
   */
  const genreWeight = new Map<string, number>();

  history.forEach((item, index) => {
    const recencyWeight = Math.max(0.55, 1 - index * 0.05);
    const viewsWeight = Math.min(4, Math.max(1, item.viewCount));
    const weight = recencyWeight * viewsWeight;

    for (const genre of item.genres ?? []) {
      genreWeight.set(
        genre,
        (genreWeight.get(genre) ?? 0) + weight,
      );
    }
  });

  const preferredGenres = [...genreWeight.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const maxGenreWeight = preferredGenres[0]?.[1] ?? 1;
  const normalizedGenreWeight = new Map(
    preferredGenres.map(([genre, weight]) => [
      genre,
      weight / maxGenreWeight,
    ]),
  );

  const recentTitles = new Set(
    history
      .slice(0, 10)
      .map((item) => getAnimeTitle(item).toLowerCase()),
  );

  return uniqueById(candidates)
    // Уже просмотренное не советуем повторно.
    .filter((anime) => !watchedIds.has(anime.id))
    .map((anime, index) => {
      const genreValues = (anime.genres ?? [])
        .map((genre) => normalizedGenreWeight.get(genre) ?? 0)
        .filter((value) => value > 0);

      const genreScore = genreValues.length
        ? Math.min(
            1,
            genreValues.reduce((sum, value) => sum + value, 0) /
              Math.max(1, Math.min(3, genreValues.length)),
          )
        : 0;

      const ratingScore = Math.min(1, (anime.score ?? 0) / 10);

      const ongoingBonus = ['RELEASING', 'Онгоинг', 'ongoing'].includes(
        anime.status ?? '',
      )
        ? 0.07
        : 0;

      const freshnessBonus = index < 8 ? 0.05 : 0;
      const savedPenalty = savedIds.has(anime.id) ? -0.06 : 0;

      const title = getAnimeTitle(anime);
      const duplicateTitlePenalty = recentTitles.has(title.toLowerCase())
        ? -0.5
        : 0;

      const score =
        genreScore * 0.66 +
        ratingScore * 0.24 +
        ongoingBonus +
        freshnessBonus +
        savedPenalty +
        duplicateTitlePenalty;

      return { anime, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ anime }) => anime)
    .slice(0, limit);
}

export function getRecommendationFallback(
  popular: Anime[],
  ongoing: Anime[],
  limit = 8,
): Anime[] {
  return uniqueById([...ongoing, ...popular]).slice(0, limit);
}
