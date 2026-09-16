import type { Anime } from '@/types/anime';
import {
  readAnimeList,
  readWatchHistory,
} from '@/lib/anime-storage';
import {
  readRecommendationEvents,
  readTasteProfile,
  type TasteMood,
} from '@/lib/personalization';

export type RankedRecommendation = {
  anime: Anime;
  score: number;
  reason: string;
  source: 'watch_history' | 'taste_mood' | 'engagement' | 'discovery';
};

type MoodConfig = {
  label: string;
  genres: string[];
};

export const MOOD_CONFIG: Record<Exclude<TasteMood, 'any'>, MoodConfig> = {
  comfort: {
    label: 'Уют',
    genres: ['slice of life', 'повседневность', 'comedy', 'комедия', 'romance', 'романтика'],
  },
  tension: {
    label: 'Напряжение',
    genres: ['thriller', 'триллер', 'horror', 'ужасы', 'mystery', 'детектив', 'action', 'экшен', 'psychological', 'психологическое'],
  },
  emotion: {
    label: 'Сильные эмоции',
    genres: ['drama', 'драма', 'romance', 'романтика', 'psychological', 'психологическое', 'supernatural', 'сверхъестественное'],
  },
  adventure: {
    label: 'Приключение',
    genres: ['adventure', 'приключения', 'fantasy', 'фэнтези', 'action', 'экшен', 'sci-fi', 'фантастика'],
  },
};

function uniqueById(items: Anime[]): Anime[] {
  const seen = new Set<number>();

  return items.filter((anime) => {
    if (!anime || !Number.isSafeInteger(anime.id) || anime.id <= 0) return false;
    if (seen.has(anime.id)) return false;

    seen.add(anime.id);
    return true;
  });
}

function getAnimeTitle(anime: Anime): string {
  return (
    anime.title?.russian?.trim() ||
    anime.russian?.trim() ||
    anime.title?.english?.trim() ||
    anime.title?.romaji?.trim() ||
    anime.title?.native?.trim() ||
    anime.name?.trim() ||
    'Без названия'
  );
}

function normalizeGenre(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeRating(anime: Anime): number {
  const raw = Number(anime.score ?? anime.averageScore ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw > 10 ? Math.min(1, raw / 100) : Math.min(1, raw / 10);
}

function isFinished(anime: Anime): boolean {
  const status = anime.status?.trim().toLowerCase();
  return ['finished', 'released', 'вышло', 'завершено', 'finished_airing'].includes(status ?? '');
}

function moodAffinity(anime: Anime, mood: TasteMood): number {
  if (mood === 'any') return 0;

  const expected = new Set(MOOD_CONFIG[mood].genres.map(normalizeGenre));
  const genres = (anime.genres ?? []).map(normalizeGenre);
  const matches = genres.filter((genre) => expected.has(genre)).length;

  if (matches <= 0) return 0;
  return Math.min(1, 0.56 + matches * 0.22);
}

function chooseReason(input: {
  anime: Anime;
  mood: TasteMood;
  moodScore: number;
  matchingGenres: string[];
  engagementScore: number;
}): Pick<RankedRecommendation, 'reason' | 'source'> {
  const { anime, mood, moodScore, matchingGenres, engagementScore } = input;

  if (mood !== 'any' && moodScore > 0) {
    return {
      reason: `Подходит под настроение «${MOOD_CONFIG[mood].label}»`,
      source: 'taste_mood',
    };
  }

  if (matchingGenres.length > 0) {
    return {
      reason: `В твоём вкусе: ${matchingGenres.slice(0, 2).join(' · ')}`,
      source: 'watch_history',
    };
  }

  if (engagementScore >= 0.055) {
    return {
      reason: 'Ты уже присматривался к этому тайтлу',
      source: 'engagement',
    };
  }

  if (isFinished(anime) && anime.episodes && anime.episodes <= 13) {
    return {
      reason: 'Короткий завершённый тайтл',
      source: 'discovery',
    };
  }

  const status = anime.status?.trim().toLowerCase();
  if (['releasing', 'ongoing', 'онгоинг'].includes(status ?? '')) {
    return {
      reason: 'Можно смотреть по мере выхода',
      source: 'discovery',
    };
  }

  return {
    reason: 'Популярный вариант для исследования вкуса',
    source: 'discovery',
  };
}

function buildDirectEngagementScores(): Map<number, number> {
  const result = new Map<number, number>();
  const now = Date.now();
  const events = readRecommendationEvents().slice(-250);

  for (const event of events) {
    if (!event.animeId) continue;

    const ageDays = Math.max(0, (now - event.createdAt) / 86_400_000);
    const recency = Math.max(0.25, 1 - ageDays / 45);

    let signal = 0;
    if (event.type === 'open') signal = 0.055;
    if (event.type === 'dwell') {
      const dwell = Math.min(30_000, Math.max(0, event.dwellMs ?? 0));
      signal = 0.015 + (dwell / 30_000) * 0.035;
    }
    if (event.type === 'planned') signal = 0.075;
    if (event.type === 'not_interested') signal = -1;

    if (signal === 0) continue;

    const next = (result.get(event.animeId) ?? 0) + signal * recency;
    result.set(event.animeId, Math.max(-1, Math.min(0.14, next)));
  }

  return result;
}

/**
 * Explainable hybrid layer used by Smart Feed.
 * It combines viewing history, saved titles, current mood, direct interaction
 * with previous recommendations, quality and a small discovery term.
 */
export function getPersonalizedRecommendations(
  candidates: Anime[],
  options?: {
    mood?: TasteMood;
    limit?: number;
  },
): RankedRecommendation[] {
  if (typeof window === 'undefined') return [];

  const profile = readTasteProfile();
  const mood = options?.mood ?? profile.mood;
  const limit = Math.max(1, options?.limit ?? 20);
  const history = readWatchHistory();
  const saved = readAnimeList();
  const engagementScores = buildDirectEngagementScores();

  const hiddenIds = new Set(profile.hiddenAnimeIds);
  const watchedIds = new Set(history.map((item) => item.id));
  const savedIds = new Set(saved.map((item) => item.id));

  const genreWeight = new Map<string, number>();
  const genreLabel = new Map<string, string>();

  history.forEach((item, index) => {
    const ageDays = Math.max(0, (Date.now() - item.lastViewedAt) / 86_400_000);
    const recencyWeight = Math.max(0.45, 1 - ageDays / 120);
    const positionWeight = Math.max(0.62, 1 - index * 0.035);
    const viewsWeight = Math.min(3.2, 0.85 + Math.log2(Math.max(1, item.viewCount) + 1));
    const weight = recencyWeight * positionWeight * viewsWeight;

    for (const rawGenre of item.genres ?? []) {
      const genre = normalizeGenre(rawGenre);
      if (!genre) continue;
      genreWeight.set(genre, (genreWeight.get(genre) ?? 0) + weight);
      if (!genreLabel.has(genre)) genreLabel.set(genre, rawGenre);
    }
  });

  // Saving a title is explicit positive feedback, but weaker than actual viewing.
  for (const item of saved) {
    for (const rawGenre of item.genres ?? []) {
      const genre = normalizeGenre(rawGenre);
      if (!genre) continue;
      genreWeight.set(genre, (genreWeight.get(genre) ?? 0) + 0.4);
      if (!genreLabel.has(genre)) genreLabel.set(genre, rawGenre);
    }
  }

  const preferredGenres = [...genreWeight.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const maxGenreWeight = preferredGenres[0]?.[1] ?? 1;
  const normalizedGenreWeight = new Map(
    preferredGenres.map(([genre, weight]) => [genre, weight / maxGenreWeight]),
  );

  const recentTitles = new Set(
    history.slice(0, 12).map((item) => getAnimeTitle(item).toLowerCase()),
  );

  return uniqueById(candidates)
    .filter((anime) => !hiddenIds.has(anime.id))
    .filter((anime) => !watchedIds.has(anime.id))
    .map((anime, index) => {
      const matchingGenres = (anime.genres ?? [])
        .map((genre) => ({
          raw: genre,
          normalized: normalizeGenre(genre),
        }))
        .filter(({ normalized }) => (normalizedGenreWeight.get(normalized) ?? 0) > 0)
        .sort(
          (a, b) =>
            (normalizedGenreWeight.get(b.normalized) ?? 0) -
            (normalizedGenreWeight.get(a.normalized) ?? 0),
        );

      const genreScore = matchingGenres.length
        ? Math.min(
            1,
            matchingGenres
              .slice(0, 3)
              .reduce(
                (sum, { normalized }) =>
                  sum + (normalizedGenreWeight.get(normalized) ?? 0),
                0,
              ) / 2.1,
          )
        : 0;

      const moodScore = moodAffinity(anime, mood);
      const ratingScore = normalizeRating(anime);
      const engagementScore = Math.max(0, engagementScores.get(anime.id) ?? 0);
      const ongoingBonus = ['RELEASING', 'Онгоинг', 'ongoing'].includes(anime.status ?? '')
        ? 0.035
        : 0;
      const discoveryBonus = index < 14 ? 0.04 : Math.max(0, 0.025 - index * 0.0005);
      const savedBonus = savedIds.has(anime.id) ? 0.035 : 0;
      const title = getAnimeTitle(anime);
      const duplicateTitlePenalty = recentTitles.has(title.toLowerCase()) ? -0.45 : 0;

      const hasHistory = history.length > 0;
      const score =
        genreScore * (hasHistory ? 0.5 : 0.12) +
        moodScore * (mood === 'any' ? 0 : hasHistory ? 0.25 : 0.46) +
        ratingScore * (hasHistory ? 0.15 : 0.32) +
        engagementScore +
        discoveryBonus +
        ongoingBonus +
        savedBonus +
        duplicateTitlePenalty;

      const reason = chooseReason({
        anime,
        mood,
        moodScore,
        matchingGenres: matchingGenres.map(({ raw }) => raw),
        engagementScore,
      });

      return {
        anime,
        score,
        ...reason,
      } satisfies RankedRecommendation;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function getRecommendedAnime(candidates: Anime[], limit = 8): Anime[] {
  if (typeof window === 'undefined') return [];

  const history = readWatchHistory();

  if (history.length === 0) return [];

  return getPersonalizedRecommendations(candidates, {
    mood: 'any',
    limit,
  }).map(({ anime }) => anime);
}

export function getRecommendationFallback(
  popular: Anime[],
  ongoing: Anime[],
  limit = 8,
): Anime[] {
  return uniqueById([...ongoing, ...popular]).slice(0, limit);
}
