import type { Anime } from '@/types/anime';

export const TASTE_GRAPH_VERSION = 'taste-v6';
export const TASTE_GRAPH_CACHE_KEY = 'animebox:taste-graph:v6';
export const TASTE_GRAPH_CACHE_TTL_MS = 30 * 60 * 1000;

export type TasteMoodWeightKey =
  | 'comfort'
  | 'tension'
  | 'emotion'
  | 'adventure';

export type TasteSignalBreakdown = {
  library: number;
  completedTitles: number;
  completedEpisodes: number;
  recommendationEvents: number;
  explicitFeedback: number;
  ratings: number;
};

export type TasteGraph = {
  version: typeof TASTE_GRAPH_VERSION;
  generatedAt: string;
  confidence: number;
  sampleSize: number;
  completedEpisodes: number;
  completionRate: number;
  bingeScore: number;
  preferredEpisodeCount: number | null;
  averageRating: number | null;
  ratingsCount: number;
  explorationRate: number;
  moodWeights: Partial<Record<TasteMoodWeightKey, number>>;
  signalBreakdown: TasteSignalBreakdown;
  genreWeights: Record<string, number>;
  negativeGenreWeights: Record<string, number>;
  completedGenreWeights: Record<string, number>;
  excludedAnimeIds: number[];
  completedAnimeIds: number[];
  droppedAnimeIds: number[];
  likedAnimeIds: number[];
  ratedAnimeIds: number[];
  highRatedAnimeIds: number[];
  lowRatedAnimeIds: number[];
  explicitFeedbackCount: number;
  topGenres: string[];
};

type CachedTasteGraph = {
  expiresAt: number;
  graph: TasteGraph;
};

export function normalizeTasteToken(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function finite(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function sanitizeTasteGraph(value: unknown): TasteGraph | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== TASTE_GRAPH_VERSION) return null;

  const toWeights = (candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {};
    const entries = Object.entries(candidate as Record<string, unknown>)
      .map(([key, weight]) => [normalizeTasteToken(key), clamp(finite(weight), 0, 1)] as const)
      .filter(([key, weight]) => Boolean(key) && weight > 0)
      .slice(0, 40);
    return Object.fromEntries(entries);
  };

  const topGenres = Array.isArray(raw.topGenres)
    ? raw.topGenres
        .filter((item): item is string => typeof item === 'string')
        .map(normalizeTasteToken)
        .filter(Boolean)
        .slice(0, 8)
    : [];

  const preferredEpisodeCount = raw.preferredEpisodeCount == null
    ? null
    : Math.max(1, Math.min(2000, Math.round(finite(raw.preferredEpisodeCount))));

  const averageRating = raw.averageRating == null
    ? null
    : clamp(finite(raw.averageRating), 1, 10);

  const moodWeightsRaw =
    raw.moodWeights && typeof raw.moodWeights === 'object' && !Array.isArray(raw.moodWeights)
      ? (raw.moodWeights as Record<string, unknown>)
      : {};
  const moodWeights = Object.fromEntries(
    (['comfort', 'tension', 'emotion', 'adventure'] as TasteMoodWeightKey[])
      .map((key) => [key, clamp(finite(moodWeightsRaw[key]))] as const)
      .filter(([, weight]) => weight > 0),
  ) as Partial<Record<TasteMoodWeightKey, number>>;

  const signalBreakdownRaw =
    raw.signalBreakdown &&
    typeof raw.signalBreakdown === 'object' &&
    !Array.isArray(raw.signalBreakdown)
      ? (raw.signalBreakdown as Record<string, unknown>)
      : {};

  const signalBreakdown: TasteSignalBreakdown = {
    library: Math.max(0, Math.round(finite(signalBreakdownRaw.library))),
    completedTitles: Math.max(
      0,
      Math.round(finite(signalBreakdownRaw.completedTitles)),
    ),
    completedEpisodes: Math.max(
      0,
      Math.round(finite(signalBreakdownRaw.completedEpisodes)),
    ),
    recommendationEvents: Math.max(
      0,
      Math.round(finite(signalBreakdownRaw.recommendationEvents)),
    ),
    explicitFeedback: Math.max(
      0,
      Math.round(finite(signalBreakdownRaw.explicitFeedback)),
    ),
    ratings: Math.max(0, Math.round(finite(signalBreakdownRaw.ratings))),
  };

  const toIds = (candidate: unknown) => {
    if (!Array.isArray(candidate)) return [];
    return [...new Set(
      candidate
        .map((item) => Math.round(finite(item)))
        .filter((item) => Number.isSafeInteger(item) && item > 0),
    )].slice(0, 2000);
  };

  return {
    version: TASTE_GRAPH_VERSION,
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : new Date().toISOString(),
    confidence: clamp(finite(raw.confidence)),
    sampleSize: Math.max(0, Math.round(finite(raw.sampleSize))),
    completedEpisodes: Math.max(0, Math.round(finite(raw.completedEpisodes))),
    completionRate: clamp(finite(raw.completionRate)),
    bingeScore: clamp(finite(raw.bingeScore)),
    preferredEpisodeCount,
    averageRating,
    ratingsCount: Math.max(0, Math.round(finite(raw.ratingsCount))),
    explorationRate: clamp(finite(raw.explorationRate, 0.14), 0.08, 0.2),
    moodWeights,
    signalBreakdown,
    genreWeights: toWeights(raw.genreWeights),
    negativeGenreWeights: toWeights(raw.negativeGenreWeights),
    completedGenreWeights: toWeights(raw.completedGenreWeights),
    excludedAnimeIds: toIds(raw.excludedAnimeIds),
    completedAnimeIds: toIds(raw.completedAnimeIds),
    droppedAnimeIds: toIds(raw.droppedAnimeIds),
    likedAnimeIds: toIds(raw.likedAnimeIds),
    ratedAnimeIds: toIds(raw.ratedAnimeIds),
    highRatedAnimeIds: toIds(raw.highRatedAnimeIds),
    lowRatedAnimeIds: toIds(raw.lowRatedAnimeIds),
    explicitFeedbackCount: Math.max(0, Math.round(finite(raw.explicitFeedbackCount))),
    topGenres,
  };
}

export function readCachedTasteGraph(): TasteGraph | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TASTE_GRAPH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedTasteGraph;
    if (!parsed || parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(TASTE_GRAPH_CACHE_KEY);
      return null;
    }
    return sanitizeTasteGraph(parsed.graph);
  } catch {
    return null;
  }
}

export function writeCachedTasteGraph(graph: TasteGraph): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: CachedTasteGraph = {
      expiresAt: Date.now() + TASTE_GRAPH_CACHE_TTL_MS,
      graph,
    };
    window.localStorage.setItem(TASTE_GRAPH_CACHE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('animebox-taste-graph-updated', { detail: graph }));
  } catch {
    // Storage is only an optimization; recommendations still work local-first.
  }
}

export async function fetchTasteGraph(signal?: AbortSignal): Promise<TasteGraph | null> {
  const response = await fetch('/api/recommendations/taste', {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Taste graph HTTP ${response.status}`);
  const body = (await response.json()) as { graph?: unknown };
  const graph = sanitizeTasteGraph(body.graph);
  if (graph) writeCachedTasteGraph(graph);
  return graph;
}

export function animeGenreAffinity(anime: Pick<Anime, 'genres'>, graph: TasteGraph | null | undefined) {
  if (!graph) return { positive: 0, negative: 0, matches: [] as string[] };

  const matches: string[] = [];
  let positive = 0;
  let negative = 0;

  for (const rawGenre of anime.genres ?? []) {
    const genre = normalizeTasteToken(rawGenre);
    const positiveWeight = graph.genreWeights[genre] ?? 0;
    const negativeWeight = graph.negativeGenreWeights[genre] ?? 0;
    positive += positiveWeight;
    negative += negativeWeight;
    if (positiveWeight >= 0.25) matches.push(rawGenre);
  }

  return {
    positive: clamp(positive / 2.2),
    negative: clamp(negative / 1.8),
    matches: matches.slice(0, 3),
  };
}

export function completedGenreAffinity(
  anime: Pick<Anime, 'genres'>,
  graph: TasteGraph | null | undefined,
) {
  if (!graph) return { positive: 0, matches: [] as string[] };

  const matches: string[] = [];
  let positive = 0;

  for (const rawGenre of anime.genres ?? []) {
    const genre = normalizeTasteToken(rawGenre);
    const weight = graph.completedGenreWeights[genre] ?? 0;
    positive += weight;
    if (weight >= 0.28) matches.push(rawGenre);
  }

  return {
    positive: clamp(positive / 2),
    matches: matches.slice(0, 3),
  };
}

export function episodeLengthAffinity(anime: Pick<Anime, 'episodes'>, graph: TasteGraph | null | undefined) {
  const preferred = graph?.preferredEpisodeCount;
  const episodes = anime.episodes ?? null;
  if (!preferred || !episodes || episodes <= 0) return 0;

  const ratio = Math.max(episodes, preferred) / Math.max(1, Math.min(episodes, preferred));
  if (ratio <= 1.2) return 1;
  if (ratio <= 1.75) return 0.72;
  if (ratio <= 2.5) return 0.42;
  return 0.12;
}
