import type { Anime } from '@/types/anime';
import { trackProductClientEvent } from '@/lib/product-events-client';

export const TASTE_PROFILE_STORAGE_KEY = 'animebox_taste_profile_v1';
export const RECOMMENDATION_EVENTS_STORAGE_KEY = 'animebox_recommendation_events_v1';
export const RECOMMENDATION_MODEL_VERSION = 'taste-v2-smart-discovery';
export const RECOMMENDATION_ATTRIBUTION_PREFIX = 'animebox:recommendation-attribution:v1:';

export type TasteMood = 'any' | 'comfort' | 'tension' | 'emotion' | 'adventure';

export type TasteProfile = {
  mood: TasteMood;
  hiddenAnimeIds: number[];
  updatedAt: number;
};

export type RecommendationEventType =
  | 'impression'
  | 'dwell'
  | 'open'
  | 'planned'
  | 'not_interested'
  | 'mood_change';

export type RecommendationEvent = {
  id: string;
  type: RecommendationEventType;
  animeId?: number;
  impressionId?: string;
  position?: number;
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

export function createImpressionId(animeId: number, position: number): string {
  return `${animeId}:${position}:${makeEventId()}`;
}

export function readTasteProfile(): TasteProfile {
  if (typeof window === 'undefined') return DEFAULT_PROFILE;

  const raw = safeJsonParse<Partial<TasteProfile>>(
    localStorage.getItem(TASTE_PROFILE_STORAGE_KEY),
    DEFAULT_PROFILE,
  );

  const hiddenAnimeIds = Array.isArray(raw.hiddenAnimeIds)
    ? raw.hiddenAnimeIds
        .map(Number)
        .filter((id) => Number.isSafeInteger(id) && id > 0)
        .slice(0, 300)
    : [];

  return {
    mood: isMood(raw.mood) ? raw.mood : 'any',
    hiddenAnimeIds: [...new Set(hiddenAnimeIds)],
    updatedAt: Number.isFinite(raw.updatedAt) ? Number(raw.updatedAt) : 0,
  };
}

export function writeTasteProfile(profile: TasteProfile): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem(
    TASTE_PROFILE_STORAGE_KEY,
    JSON.stringify({
      ...profile,
      hiddenAnimeIds: [...new Set(profile.hiddenAnimeIds)].slice(0, 300),
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

export function hideRecommendation(anime: Pick<Anime, 'id'>): TasteProfile {
  const current = readTasteProfile();
  const hiddenAnimeIds = [anime.id, ...current.hiddenAnimeIds].filter(
    (id, index, items) => items.indexOf(id) === index,
  );

  const next = {
    ...current,
    hiddenAnimeIds: hiddenAnimeIds.slice(0, 300),
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

  // Keep a bounded local queue. This is intentionally local-first for now:
  // the UI can start collecting clean impression/click signals before the
  // server analytics table is rolled out.
  const next = [...existing.slice(-249), nextEvent];

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
          impressionId: event.impressionId ?? null,
          recommendationSessionId: event.recommendationSessionId ?? null,
          source: event.source,
          matchScore: event.matchScore ?? null,
          reason: event.reason ?? null,
          openedAt: Date.now(),
          startedSent: false,
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
    not_interested: 'recommendation_dismiss',
    mood_change: 'recommendation_mood_change',
  } as const;

  // Dwell is intentionally sampled by duration to avoid turning a hover into
  // noisy telemetry. Product analytics remains best-effort and never blocks UI.
  if (event.type !== 'dwell' || (event.dwellMs ?? 0) >= 1_500) {
    trackProductClientEvent(serverEvent[event.type], {
      source: event.source,
      entityType: event.animeId ? 'anime_id' : 'recommendation_context',
      entityId: event.animeId ? String(event.animeId) : event.mood ?? 'feed',
      metadata: {
        impression_id: event.impressionId ?? null,
        position: event.position ?? null,
        mood: event.mood ?? null,
        recommendation_session_id: event.recommendationSessionId ?? null,
        dwell_ms: event.dwellMs ?? null,
        match_score: event.matchScore ?? null,
        reason: event.reason?.slice(0, 180) ?? null,
        model_version: event.modelVersion ?? RECOMMENDATION_MODEL_VERSION,
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
