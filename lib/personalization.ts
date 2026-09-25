import type { Anime } from '@/types/anime';
import { trackProductClientEvent } from '@/lib/product-events-client';

export const TASTE_PROFILE_STORAGE_KEY = 'animebox_taste_profile_v1';
export const RECOMMENDATION_EVENTS_STORAGE_KEY = 'animebox_recommendation_events_v1';
export const RECOMMENDATION_ALGORITHM_VERSION = '18.3-v1';
export const RECOMMENDATION_MODEL_VERSION = RECOMMENDATION_ALGORITHM_VERSION;
export const RECOMMENDATION_ATTRIBUTION_PREFIX = 'animebox:recommendation-attribution:v1:';

export type TasteMood = 'any' | 'comfort' | 'tension' | 'emotion' | 'adventure';

export type TasteProfile = {
  mood: TasteMood;
  hiddenAnimeIds: number[];
  likedAnimeIds: number[];
  alreadyWatchedAnimeIds: number[];
  negativeGenreWeights: Record<string, number>;
  updatedAt: number;
};

export type RecommendationEventType =
  | 'impression'
  | 'dwell'
  | 'open'
  | 'planned'
  | 'liked'
  | 'not_interested'
  | 'already_watched'
  | 'mood_change';

export type RecommendationEvent = {
  id: string;
  type: RecommendationEventType;
  animeId?: number;
  recommendationId?: string;
  impressionId?: string;
  position?: number;
  rowId?: string;
  source: string;
  modelVersion: string;
  mood?: TasteMood;
  recommendationSessionId?: string;
  dwellMs?: number;
  matchScore?: number;
  reason?: string;
  createdAt: number;
};

const DEFAULT_PROFILE: TasteProfile = {
  mood: 'any',
  hiddenAnimeIds: [],
  likedAnimeIds: [],
  alreadyWatchedAnimeIds: [],
  negativeGenreWeights: {},
  updatedAt: 0,
};

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function sanitizeIds(value: unknown, limit = 300) {
  return Array.isArray(value)
    ? [...new Set(
        value
          .map(Number)
          .filter((id) => Number.isSafeInteger(id) && id > 0),
      )].slice(0, limit)
    : [];
}

function normalizeGenreToken(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
}

function sanitizeGenreWeights(value: unknown, limit = 24): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([rawKey, rawWeight]) => {
        const key = normalizeGenreToken(rawKey);
        const weight = Number(rawWeight);
        return [
          key,
          Number.isFinite(weight)
            ? Math.min(1, Math.max(0, weight))
            : 0,
        ] as const;
      })
      .filter(([key, weight]) => Boolean(key) && weight >= 0.04)
      .sort((left, right) => right[1] - left[1])
      .slice(0, limit),
  );
}

function updateNegativeGenreWeights(
  current: Record<string, number>,
  genres: string[] | undefined,
  direction: 'negative' | 'positive',
) {
  const next = Object.fromEntries(
    Object.entries(current)
      .map(([genre, weight]) => [genre, weight * 0.92] as const)
      .filter(([, weight]) => weight >= 0.04),
  );

  for (const rawGenre of genres?.slice(0, 8) ?? []) {
    const genre = normalizeGenreToken(rawGenre);
    if (!genre) continue;

    const previous = next[genre] ?? 0;
    next[genre] =
      direction === 'negative'
        ? Math.min(1, previous + 0.34)
        : Math.max(0, previous * 0.45);
  }

  return sanitizeGenreWeights(next);
}

function isMood(value: unknown): value is TasteMood {
  return ['any', 'comfort', 'tension', 'emotion', 'adventure'].includes(
    String(value),
  );
}

function makeEventId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createRecommendationId(animeId: number, source = 'feed'): string {
  const safeSource = source
    .replace(/[^A-Za-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'feed';

  return `rec:${animeId}:${safeSource}:${makeEventId()}`;
}

export function createImpressionId(animeId: number, position: number): string {
  return `${animeId}:${position}:${makeEventId()}`;
}

export function readTasteProfile(): TasteProfile {
  if (typeof window === 'undefined') return DEFAULT_PROFILE;

  const raw = safeJsonParse<Partial<TasteProfile>>(
    localStorage.getItem(TASTE_PROFILE_STORAGE_KEY),
    DEFAULT_PROFILE,
  );

  return {
    mood: isMood(raw.mood) ? raw.mood : 'any',
    hiddenAnimeIds: sanitizeIds(raw.hiddenAnimeIds),
    likedAnimeIds: sanitizeIds(raw.likedAnimeIds),
    alreadyWatchedAnimeIds: sanitizeIds(raw.alreadyWatchedAnimeIds),
    negativeGenreWeights: sanitizeGenreWeights(raw.negativeGenreWeights),
    updatedAt: Number.isFinite(raw.updatedAt) ? Number(raw.updatedAt) : 0,
  };
}

export function writeTasteProfile(profile: TasteProfile): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem(
    TASTE_PROFILE_STORAGE_KEY,
    JSON.stringify({
      ...profile,
      hiddenAnimeIds: sanitizeIds(profile.hiddenAnimeIds),
      likedAnimeIds: sanitizeIds(profile.likedAnimeIds),
      alreadyWatchedAnimeIds: sanitizeIds(profile.alreadyWatchedAnimeIds),
      negativeGenreWeights: sanitizeGenreWeights(profile.negativeGenreWeights),
      updatedAt: Date.now(),
    }),
  );

  window.dispatchEvent(new Event('animebox-taste-changed'));
}

export function setTasteMood(mood: TasteMood): TasteProfile {
  const current = readTasteProfile();
  const next = { ...current, mood, updatedAt: Date.now() };
  writeTasteProfile(next);

  trackRecommendationEvent({
    type: 'mood_change',
    source: 'home_mood_picker',
    mood,
  });

  return next;
}

export function likeRecommendation(anime: Pick<Anime, 'id' | 'genres'>): TasteProfile {
  const current = readTasteProfile();
  const next = {
    ...current,
    likedAnimeIds: sanitizeIds([anime.id, ...current.likedAnimeIds]),
    hiddenAnimeIds: current.hiddenAnimeIds.filter((id) => id !== anime.id),
    alreadyWatchedAnimeIds: current.alreadyWatchedAnimeIds.filter(
      (id) => id !== anime.id,
    ),
    negativeGenreWeights: updateNegativeGenreWeights(
      current.negativeGenreWeights,
      anime.genres,
      'positive',
    ),
    updatedAt: Date.now(),
  };

  writeTasteProfile(next);
  return next;
}

export function hideRecommendation(anime: Pick<Anime, 'id' | 'genres'>): TasteProfile {
  const current = readTasteProfile();
  const next = {
    ...current,
    hiddenAnimeIds: sanitizeIds([anime.id, ...current.hiddenAnimeIds]),
    likedAnimeIds: current.likedAnimeIds.filter((id) => id !== anime.id),
    negativeGenreWeights: updateNegativeGenreWeights(
      current.negativeGenreWeights,
      anime.genres,
      'negative',
    ),
    updatedAt: Date.now(),
  };

  writeTasteProfile(next);
  return next;
}

export function markRecommendationWatched(
  anime: Pick<Anime, 'id'>,
): TasteProfile {
  const current = readTasteProfile();
  const next = {
    ...current,
    alreadyWatchedAnimeIds: sanitizeIds([
      anime.id,
      ...current.alreadyWatchedAnimeIds,
    ]),
    hiddenAnimeIds: current.hiddenAnimeIds.filter((id) => id !== anime.id),
    likedAnimeIds: current.likedAnimeIds.filter((id) => id !== anime.id),
    updatedAt: Date.now(),
  };

  writeTasteProfile(next);
  return next;
}

export function restoreRecommendation(animeId: number): TasteProfile {
  const current = readTasteProfile();
  const next = {
    ...current,
    hiddenAnimeIds: current.hiddenAnimeIds.filter((id) => id !== animeId),
    alreadyWatchedAnimeIds: current.alreadyWatchedAnimeIds.filter(
      (id) => id !== animeId,
    ),
    updatedAt: Date.now(),
  };

  writeTasteProfile(next);
  return next;
}

export function trackRecommendationEvent(
  event: Omit<RecommendationEvent, 'id' | 'createdAt' | 'modelVersion'> & {
    modelVersion?: string;
  },
): void {
  if (typeof window === 'undefined') return;

  const existing = safeJsonParse<RecommendationEvent[]>(
    localStorage.getItem(RECOMMENDATION_EVENTS_STORAGE_KEY),
    [],
  );

  const nextEvent: RecommendationEvent = {
    ...event,
    id: makeEventId(),
    modelVersion: event.modelVersion ?? RECOMMENDATION_MODEL_VERSION,
    createdAt: Date.now(),
  };

  const next = [...existing.slice(-349), nextEvent];

  localStorage.setItem(
    RECOMMENDATION_EVENTS_STORAGE_KEY,
    JSON.stringify(next),
  );

  if (event.type === 'open' && event.animeId) {
    try {
      window.sessionStorage.setItem(
        `${RECOMMENDATION_ATTRIBUTION_PREFIX}${event.animeId}`,
        JSON.stringify({
          animeId: event.animeId,
          recommendationId: event.recommendationId ?? null,
          impressionId: event.impressionId ?? null,
          recommendationSessionId: event.recommendationSessionId ?? null,
          algorithmVersion: event.modelVersion ?? RECOMMENDATION_ALGORITHM_VERSION,
          rowId: event.rowId ?? null,
          position: event.position ?? null,
          mood: event.mood ?? null,
          source: event.source,
          matchScore: event.matchScore ?? null,
          reason: event.reason ?? null,
          openedAt: Date.now(),
          startedSent: false,
          watch15mSent: false,
          watch30mSent: false,
          completedSent: false,
          watchedMs: 0,
          lastEpisode: null,
          lastEpisodeActiveMs: 0,
        }),
      );
    } catch {
      // Attribution is best-effort; navigation must never depend on storage.
    }
  }

  const serverEvent = {
    impression: 'recommendation_impression',
    dwell: 'recommendation_dwell',
    open: 'recommendation_click',
    planned: 'recommendation_planned',
    liked: 'recommendation_like',
    not_interested: 'recommendation_dismiss',
    already_watched: 'recommendation_already_watched',
    mood_change: 'recommendation_mood_change',
  } as const;

  if (event.type !== 'dwell' || (event.dwellMs ?? 0) >= 1_500) {
    const algorithmVersion =
      event.modelVersion ?? RECOMMENDATION_ALGORITHM_VERSION;

    trackProductClientEvent(serverEvent[event.type], {
      source: event.source,
      entityType: event.animeId ? 'anime_id' : 'recommendation_context',
      entityId: event.animeId ? String(event.animeId) : event.mood ?? 'feed',
      recommendationId: event.recommendationId,
      recommendationSessionId: event.recommendationSessionId,
      algorithmVersion,
      metadata: {
        recommendation_id: event.recommendationId ?? null,
        impression_id: event.impressionId ?? null,
        position: event.position ?? null,
        row_id: event.rowId ?? null,
        mood: event.mood ?? null,
        recommendation_session_id: event.recommendationSessionId ?? null,
        dwell_ms: event.dwellMs ?? null,
        match_score: event.matchScore ?? null,
        reason: event.reason?.slice(0, 180) ?? null,
        model_version: algorithmVersion,
        algorithm_version: algorithmVersion,
      },
    });
  }
}

export function readRecommendationEvents(): RecommendationEvent[] {
  if (typeof window === 'undefined') return [];

  return safeJsonParse<RecommendationEvent[]>(
    localStorage.getItem(RECOMMENDATION_EVENTS_STORAGE_KEY),
    [],
  );
}
