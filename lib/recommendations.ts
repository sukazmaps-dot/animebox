import type { Anime } from '@/types/anime';
import {
  readAnimeFavorites,
  readAnimeList,
  readWatchHistory,
} from '@/lib/anime-storage';
import {
  readRecommendationEvents,
  readTasteProfile,
  type TasteMood,
} from '@/lib/personalization';
import {
  animeGenreAffinity,
  completedGenreAffinity,
  episodeLengthAffinity,
  readCachedTasteGraph,
  type TasteGraph,
} from '@/lib/taste-graph';
import {
  RECOMMENDATION_ENGAGEMENT_SIGNALS,
  recommendationMatchBasis,
  scoreRecommendation,
  type RecommendationScoreResult,
} from '@/lib/recommendation-ranking-config';
import { diversifyRecommendations } from '@/lib/recommendation-diversity';

export type RankedRecommendation = {
  anime: Anime;
  score: number;
  reason: string;
  reasons: string[];
  matchScore: number | null;
  source: 'watch_history' | 'taste_mood' | 'engagement' | 'taste_graph' | 'discovery';
  ranking: RecommendationScoreResult;
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

function studioNames(anime: Anime): string[] {
  const raw = anime.studios;
  const values: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { nodes?: unknown[] }).nodes)
      ? (raw as { nodes: unknown[] }).nodes
      : [];

  return values
    .map((value) => {
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object') {
        const row = value as { name?: unknown; node?: { name?: unknown } };
        if (typeof row.name === 'string') return row.name;
        if (typeof row.node?.name === 'string') return row.node.name;
      }
      return '';
    })
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
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
    const signalConfig = RECOMMENDATION_ENGAGEMENT_SIGNALS;
    const recency = Math.max(
      signalConfig.recencyFloor,
      1 - ageDays / signalConfig.recencyDays,
    );

    let signal = 0;
    if (event.type === 'open') signal = signalConfig.open;
    if (event.type === 'dwell') {
      const dwell = Math.min(30_000, Math.max(0, event.dwellMs ?? 0));
      signal =
        signalConfig.dwellBase +
        (dwell / 30_000) * signalConfig.dwellMaxBonus;
    }
    if (event.type === 'planned') signal = signalConfig.planned;
    if (event.type === 'liked') signal = signalConfig.liked;
    if (event.type === 'not_interested' || event.type === 'already_watched') {
      signal = signalConfig.explicitNegative;
    }

    if (signal === 0) continue;

    const next = (result.get(event.animeId) ?? 0) + signal * recency;
    result.set(
      event.animeId,
      Math.max(
        signalConfig.negativeCap,
        Math.min(signalConfig.positiveCap, next),
      ),
    );
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
    tasteGraph?: TasteGraph | null;
  },
): RankedRecommendation[] {
  if (typeof window === 'undefined') return [];

  const profile = readTasteProfile();
  const mood = options?.mood ?? profile.mood;
  const limit = Math.max(1, options?.limit ?? 20);
  const history = readWatchHistory();
  const saved = readAnimeList();
  const favorites = readAnimeFavorites();
  const engagementScores = buildDirectEngagementScores();
  const tasteGraph = options?.tasteGraph ?? readCachedTasteGraph();

  const hiddenIds = new Set(profile.hiddenAnimeIds);
  const explicitlyWatchedIds = new Set(profile.alreadyWatchedAnimeIds);
  const likedIds = new Set(profile.likedAnimeIds);
  const watchedIds = new Set(history.map((item) => item.id));
  const savedIds = new Set(saved.map((item) => item.id));
  const favoriteIds = new Set(favorites.map((item) => item.id));
  const serverExcludedIds = new Set(tasteGraph?.excludedAnimeIds ?? []);
  const hasHistory =
    history.length > 0 ||
    (tasteGraph?.sampleSize ?? 0) > 0;

  const genreWeight = new Map<string, number>();
  const studioWeight = new Map<string, number>();

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
    }

    for (const studio of studioNames(item)) {
      studioWeight.set(studio, (studioWeight.get(studio) ?? 0) + weight * 0.7);
    }
  });

  for (const item of saved) {
    for (const rawGenre of item.genres ?? []) {
      const genre = normalizeGenre(rawGenre);
      if (!genre) continue;
      genreWeight.set(genre, (genreWeight.get(genre) ?? 0) + 0.4);
    }
  }

  // Favorites are an explicit preference and deserve more weight than a plan.
  for (const item of favorites) {
    for (const rawGenre of item.genres ?? []) {
      const genre = normalizeGenre(rawGenre);
      if (!genre) continue;
      genreWeight.set(genre, (genreWeight.get(genre) ?? 0) + 1.05);
    }
    for (const studio of studioNames(item)) {
      studioWeight.set(studio, (studioWeight.get(studio) ?? 0) + 0.8);
    }
  }

  for (const item of candidates) {
    if (!likedIds.has(item.id)) continue;
    for (const rawGenre of item.genres ?? []) {
      const genre = normalizeGenre(rawGenre);
      if (!genre) continue;
      genreWeight.set(genre, (genreWeight.get(genre) ?? 0) + 1.55);
    }
    for (const studio of studioNames(item)) {
      studioWeight.set(studio, (studioWeight.get(studio) ?? 0) + 1.15);
    }
  }

  const preferredGenres = [...genreWeight.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const maxGenreWeight = preferredGenres[0]?.[1] ?? 1;
  const normalizedGenreWeight = new Map(
    preferredGenres.map(([genre, weight]) => [genre, weight / maxGenreWeight]),
  );

  const preferredStudios = [...studioWeight.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const maxStudioWeight = preferredStudios[0]?.[1] ?? 1;
  const normalizedStudioWeight = new Map(
    preferredStudios.map(([studio, weight]) => [studio, weight / maxStudioWeight]),
  );

  const recentTitles = new Set(
    history.slice(0, 12).map((item) => getAnimeTitle(item).toLowerCase()),
  );

  const scored = uniqueById(candidates)
    .filter((anime) => !hiddenIds.has(anime.id))
    .filter((anime) => !explicitlyWatchedIds.has(anime.id))
    .filter((anime) => !likedIds.has(anime.id))
    .filter((anime) => !watchedIds.has(anime.id))
    .filter((anime) => !serverExcludedIds.has(anime.id))
    .filter((anime) => !savedIds.has(anime.id))
    .filter((anime) => !favoriteIds.has(anime.id))
    .map((anime, index) => {
      const matchingGenres = (anime.genres ?? [])
        .map((genre) => ({ raw: genre, normalized: normalizeGenre(genre) }))
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
                (sum, { normalized }) => sum + (normalizedGenreWeight.get(normalized) ?? 0),
                0,
              ) / 2.1,
          )
        : 0;

      const graphAffinity = animeGenreAffinity(anime, tasteGraph);
      const completedAffinity = completedGenreAffinity(anime, tasteGraph);
      const candidateStudios = studioNames(anime);
      const studioScore = candidateStudios.length
        ? Math.min(
            1,
            candidateStudios.reduce(
              (sum, studio) => sum + (normalizedStudioWeight.get(studio) ?? 0),
              0,
            ) / 1.5,
          )
        : 0;
      const lengthAffinity = episodeLengthAffinity(anime, tasteGraph);
      const moodScore = moodAffinity(anime, mood);
      const ratingScore = normalizeRating(anime);
      const completionRate = tasteGraph?.completionRate ?? 0;
      const bingeScore = tasteGraph?.bingeScore ?? 0;
      const shortFinishedAffinity =
        isFinished(anime) && anime.episodes && anime.episodes <= 24
          ? completionRate * 0.06 + bingeScore * 0.05
          : 0;
      const engagementRaw = engagementScores.get(anime.id) ?? 0;
      const engagementScore = Math.max(0, engagementRaw);
      const negativeEngagement = Math.max(0, -engagementRaw);
      const ongoingBonus = ['RELEASING', 'Онгоинг', 'ongoing'].includes(anime.status ?? '') ? 0.035 : 0;
      const discoveryBonus = index < 14 ? 0.04 : Math.max(0, 0.025 - index * 0.0005);
      const title = getAnimeTitle(anime);
      const duplicateTitlePenalty = recentTitles.has(title.toLowerCase()) ? -0.45 : 0;

      const ranking = scoreRecommendation(
        {
          genre: genreScore,
          tasteGraphPositive: graphAffinity.positive,
          completedAffinity: completedAffinity.positive,
          studioAffinity: studioScore,
          tasteGraphNegative: graphAffinity.negative,
          episodeLength: lengthAffinity,
          mood: moodScore,
          communityQuality: ratingScore,
          shortFinished: shortFinishedAffinity,
          engagementPositive: engagementScore,
          engagementNegative: negativeEngagement,
          discovery: discoveryBonus,
          ongoing: ongoingBonus,
          duplicateTitle: duplicateTitlePenalty,
        },
        {
          hasHistory,
          moodActive: mood !== 'any',
          hasTasteConfidence: Boolean(tasteGraph?.confidence),
        },
      );
      const score = ranking.total;

      const primary = chooseReason({
        anime,
        mood,
        moodScore,
        matchingGenres: matchingGenres.map(({ raw }) => raw),
        engagementScore,
      });

      const reasons: string[] = [];
      if (completedAffinity.matches.length > 0) {
        reasons.push(
          `Похоже на то, что ты досматриваешь: ${completedAffinity.matches
            .slice(0, 2)
            .join(' · ')}`,
        );
      }
      const graphMatches = graphAffinity.matches;
      const localMatches = matchingGenres.map(({ raw }) => raw);
      const tasteMatches = [...new Set([...graphMatches, ...localMatches])].slice(0, 2);
      if (tasteMatches.length) reasons.push(`Совпадает со вкусом: ${tasteMatches.join(' · ')}`);
      if (mood !== 'any' && moodScore > 0) reasons.push(`Под настроение «${MOOD_CONFIG[mood].label}»`);
      if (studioScore >= 0.45 && candidateStudios.length && reasons.length < 2) {
        reasons.push(`Студия в твоём вкусе: ${candidateStudios[0]}`);
      }
      if (lengthAffinity >= 0.72 && tasteGraph?.preferredEpisodeCount) {
        reasons.push(`Похожая длина: около ${tasteGraph.preferredEpisodeCount} серий`);
      }
      if (
        isFinished(anime) &&
        anime.episodes &&
        anime.episodes <= 24 &&
        completionRate >= 0.65 &&
        reasons.length < 2
      ) {
        reasons.push('Ты часто досматриваешь завершённые тайтлы');
      }
      if (
        anime.episodes &&
        anime.episodes <= 13 &&
        bingeScore >= 0.45 &&
        reasons.length < 2
      ) {
        reasons.push('Подходит под твой темп просмотра');
      }
      if (engagementScore >= 0.055) reasons.push('Ты уже обращал внимание на этот тайтл');
      if (ratingScore >= 0.82 && reasons.length < 2) reasons.push('Высокая оценка сообщества');
      if (!reasons.length) reasons.push(primary.reason);

      const evidence = Math.max(
        history.length >= 2 ? 0.35 : 0,
        tasteGraph?.confidence ?? 0,
      );
      const matchBasis = recommendationMatchBasis({
        genre: genreScore,
        tasteGraphPositive: graphAffinity.positive,
        completedAffinity: completedAffinity.positive,
        studioAffinity: studioScore,
        tasteGraphNegative: graphAffinity.negative,
        episodeLength: lengthAffinity,
        mood: moodScore,
        communityQuality: ratingScore,
        shortFinished: shortFinishedAffinity,
      });
      const matchScore = evidence >= 0.18
        ? Math.max(58, Math.min(97, Math.round(58 + matchBasis * 39)))
        : null;

      const source = graphAffinity.positive >= Math.max(0.3, genreScore)
        ? 'taste_graph'
        : primary.source;

      return {
        anime,
        score,
        reason: reasons[0] ?? primary.reason,
        reasons: reasons.slice(0, 3),
        matchScore,
        source,
        ranking,
      } satisfies RankedRecommendation;
    })
    .sort((a, b) => b.score - a.score);

  return diversifyRecommendations(scored, {
    limit,
    explorationRate: tasteGraph?.explorationRate ?? 0.14,
  });
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
