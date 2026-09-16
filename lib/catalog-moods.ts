import type { Anime } from '@/types/anime';

export const CATALOG_MOODS = [
  { id: 'any', label: 'Любое настроение', icon: '/brand/emojis/moods/mood-any-cat.webp' },
  { id: 'cry', label: 'Поплакать', icon: '/brand/emojis/moods/mood-cry.webp' },
  { id: 'chill', label: 'Чиловый вайб', icon: '/brand/emojis/moods/mood-cozy-cup.webp' },
  { id: 'dark', label: 'Мрачняк', icon: '/brand/emojis/moods/mood-dark-kitsune.webp' },
  { id: 'glass', label: 'Стекло', icon: '/brand/emojis/moods/mood-heartbreak.webp' },
  { id: 'fun', label: 'Под пиво', icon: '/brand/emojis/moods/mood-fun.webp' },
  { id: 'hype', label: 'Нужен хайп', icon: '/brand/emojis/moods/mood-hype-fire.webp' },
  { id: 'romantic', label: 'Романтика', icon: '/brand/emojis/moods/mood-romantic-hearts.webp' },
] as const;

export type CatalogMood = (typeof CATALOG_MOODS)[number]['id'];

type WeightedGenre = readonly [genre: string, weight: number];

type MoodRule = {
  genres: readonly WeightedGenre[];
  shortBonus?: number;
  finishedBonus?: number;
};

const MOOD_RULES: Record<Exclude<CatalogMood, 'any'>, MoodRule> = {
  cry: {
    genres: [
      ['drama', 1], ['драма', 1],
      ['romance', 0.75], ['романтика', 0.75],
      ['psychological', 0.55], ['психологическое', 0.55],
      ['supernatural', 0.3], ['сверхъестественное', 0.3],
    ],
    finishedBonus: 0.08,
  },
  chill: {
    genres: [
      ['slice of life', 1], ['повседневность', 1],
      ['comedy', 0.7], ['комедия', 0.7],
      ['romance', 0.45], ['романтика', 0.45],
      ['iyashikei', 1],
    ],
    shortBonus: 0.08,
  },
  dark: {
    genres: [
      ['horror', 1], ['ужасы', 1],
      ['thriller', 0.95], ['триллер', 0.95],
      ['psychological', 0.9], ['психологическое', 0.9],
      ['mystery', 0.65], ['тайна', 0.65], ['детектив', 0.65],
      ['supernatural', 0.42], ['сверхъестественное', 0.42],
    ],
  },
  glass: {
    genres: [
      ['drama', 1], ['драма', 1],
      ['romance', 0.9], ['романтика', 0.9],
      ['psychological', 0.5], ['психологическое', 0.5],
    ],
    finishedBonus: 0.1,
  },
  fun: {
    genres: [
      ['comedy', 1], ['комедия', 1],
      ['action', 0.55], ['экшен', 0.55],
      ['adventure', 0.5], ['приключения', 0.5],
      ['sports', 0.4], ['спорт', 0.4],
    ],
    shortBonus: 0.06,
  },
  hype: {
    genres: [
      ['action', 1], ['экшен', 1],
      ['adventure', 0.7], ['приключения', 0.7],
      ['sports', 0.62], ['спорт', 0.62],
      ['fantasy', 0.48], ['фэнтези', 0.48],
      ['sci-fi', 0.45], ['фантастика', 0.45],
    ],
  },
  romantic: {
    genres: [
      ['romance', 1], ['романтика', 1],
      ['drama', 0.56], ['драма', 0.56],
      ['slice of life', 0.5], ['повседневность', 0.5],
      ['comedy', 0.34], ['комедия', 0.34],
    ],
  },
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeRating(anime: Anime): number {
  const raw = Number(anime.score ?? anime.averageScore ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw > 10 ? Math.min(1, raw / 100) : Math.min(1, raw / 10);
}

function isFinished(anime: Anime): boolean {
  const status = anime.status?.trim().toLowerCase() ?? '';
  return ['finished', 'released', 'вышло', 'завершено', 'finished_airing'].includes(status);
}

export function isCatalogMood(value: unknown): value is CatalogMood {
  return CATALOG_MOODS.some((mood) => mood.id === value);
}

export function getCatalogMoodScore(anime: Anime, mood: CatalogMood): number {
  if (mood === 'any') return 0;

  const rule = MOOD_RULES[mood];
  const weights = new Map(rule.genres.map(([genre, weight]) => [genre, weight]));
  const genres = (anime.genres ?? []).map(normalize);

  let score = 0;
  let matches = 0;

  for (const genre of genres) {
    const weight = weights.get(genre);
    if (!weight) continue;
    score += weight;
    matches += 1;
  }

  if (matches > 1) score += 0.12 * Math.min(3, matches - 1);
  if (rule.shortBonus && anime.episodes && anime.episodes <= 13) score += rule.shortBonus;
  if (rule.finishedBonus && isFinished(anime)) score += rule.finishedBonus;

  // Rating is deliberately a weak tie-breaker, not the mood definition itself.
  score += normalizeRating(anime) * 0.08;

  return score;
}

export function rankAnimeByCatalogMood(
  items: Anime[],
  mood: CatalogMood,
): Anime[] {
  if (mood === 'any') return items;

  return items
    .map((anime, index) => ({
      anime,
      index,
      moodScore: getCatalogMoodScore(anime, mood),
    }))
    .sort((a, b) => {
      if (b.moodScore !== a.moodScore) return b.moodScore - a.moodScore;
      return a.index - b.index;
    })
    .map(({ anime }) => anime);
}
