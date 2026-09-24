'use client';

import type { ProductClientEventName } from '@/lib/product-event-names';

export type { ProductClientEventName } from '@/lib/product-event-names';

type ClientEvent = {
  eventName: ProductClientEventName;
  eventId: string;
  sessionId: string;
  anonymousId?: string;
  source?: string;
  path?: string;
  entityType?: string;
  entityId?: string;
  recommendationId?: string;
  recommendationSessionId?: string;
  algorithmVersion?: string;
  metadata?: Record<string, unknown>;
};

type TrackOptions = Omit<ClientEvent, 'eventName' | 'eventId' | 'sessionId'> & {
  flush?: boolean;
};

const SESSION_KEY = 'animebox:product-session:v1';
const ANONYMOUS_KEY = 'animebox:anonymous-id:v1';
const MAX_QUEUE = 50;
const MAX_BATCH = 20;
const FLUSH_DELAY_MS = 5_000;
const RECOMMENDATION_ATTRIBUTION_PREFIX = 'animebox:recommendation-attribution:v1:';
const RECOMMENDATION_ATTRIBUTION_TTL_MS = 48 * 60 * 60 * 1000;
const CONTINUE_ATTRIBUTION_PREFIX = 'animebox:continue-attribution:v2:';
const CONTINUE_ATTRIBUTION_TTL_MS = 12 * 60 * 60 * 1000;

let queue: ClientEvent[] = [];
let timer: number | null = null;
let flushing: Promise<void> | null = null;
let listenersInstalled = false;

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

export function getProductAnalyticsSessionId() {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY)?.trim();
    if (existing) return existing.slice(0, 100);
    const created = randomId();
    window.sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return randomId();
  }
}

export function getProductAnalyticsAnonymousId() {
  try {
    const existing = window.localStorage.getItem(ANONYMOUS_KEY)?.trim();
    if (existing) return existing.slice(0, 100);
    const created = `anon:${randomId()}`;
    window.localStorage.setItem(ANONYMOUS_KEY, created);
    return created;
  } catch {
    return `anon:${randomId()}`;
  }
}

function serialize(events: ClientEvent[]) {
  return JSON.stringify({ events });
}

function beacon(events: ClientEvent[]) {
  if (!events.length || typeof navigator.sendBeacon !== 'function') return false;
  try {
    return navigator.sendBeacon(
      '/api/analytics/product',
      new Blob([serialize(events)], { type: 'application/json' }),
    );
  } catch {
    return false;
  }
}

async function flushQueue(useBeacon = false) {
  if (timer != null) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (!queue.length) return;

  const events = queue.splice(0, MAX_BATCH);
  if (useBeacon && beacon(events)) {
    if (queue.length) void flushQueue(true);
    return;
  }

  try {
    await fetch('/api/analytics/product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: serialize(events),
      keepalive: true,
      cache: 'no-store',
    });
  } catch {
    queue = [...events, ...queue].slice(0, MAX_QUEUE);
  }

  if (queue.length && !useBeacon) scheduleFlush();
}

function scheduleFlush() {
  if (timer != null) return;
  timer = window.setTimeout(() => {
    timer = null;
    if (!flushing) {
      flushing = flushQueue().finally(() => {
        flushing = null;
      });
    }
  }, FLUSH_DELAY_MS);
}

function installLifecycleListeners() {
  if (listenersInstalled) return;
  listenersInstalled = true;

  window.addEventListener('pagehide', () => {
    void flushQueue(true);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushQueue(true);
  });
}

export function rememberContinueWatchingAttribution(input: {
  animeId: number;
  episode: number;
  mode: 'resume' | 'next';
}) {
  if (typeof window === 'undefined') return;
  if (!Number.isSafeInteger(input.animeId) || input.animeId <= 0) return;
  if (!Number.isSafeInteger(input.episode) || input.episode <= 0) return;

  try {
    window.sessionStorage.setItem(
      `${CONTINUE_ATTRIBUTION_PREFIX}${input.animeId}`,
      JSON.stringify({
        openedAt: Date.now(),
        episode: input.episode,
        mode: input.mode,
        startedSent: false,
      }),
    );
  } catch {
    // Attribution is analytics-only; playback must never depend on storage.
  }
}

function continueWatchingStartedEvent(options: TrackOptions): ClientEvent | null {
  const rawEntity = options.entityId?.trim() ?? '';
  const [animePart, episodePart] = rawEntity.split(':');
  const animeId = Number.parseInt(animePart ?? '', 10);
  const playerEpisode = Number.parseInt(episodePart ?? '', 10);

  if (!Number.isSafeInteger(animeId) || animeId <= 0) return null;

  try {
    const key = `${CONTINUE_ATTRIBUTION_PREFIX}${animeId}`;
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      openedAt?: number;
      episode?: number;
      mode?: 'resume' | 'next';
      startedSent?: boolean;
    };

    const openedAt = Number(parsed.openedAt ?? 0);
    if (!openedAt || Date.now() - openedAt > CONTINUE_ATTRIBUTION_TTL_MS) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    if (parsed.startedSent) return null;

    const expectedEpisode = Number(parsed.episode ?? 0);
    if (
      Number.isSafeInteger(playerEpisode) &&
      playerEpisode > 0 &&
      Number.isSafeInteger(expectedEpisode) &&
      expectedEpisode > 0 &&
      playerEpisode !== expectedEpisode
    ) {
      return null;
    }

    window.sessionStorage.setItem(
      key,
      JSON.stringify({ ...parsed, startedSent: true }),
    );

    return {
      eventName: 'continue_watching_started',
      eventId: randomId(),
      sessionId: getProductAnalyticsSessionId(),
      anonymousId: getProductAnalyticsAnonymousId(),
      source: 'home_continue',
      path: options.path,
      entityType: 'episode',
      entityId: rawEntity || String(animeId),
      metadata: {
        anime_id: animeId,
        episode: expectedEpisode || playerEpisode || null,
        mode: parsed.mode ?? 'resume',
        player_source: options.source ?? null,
      },
    };
  } catch {
    return null;
  }
}

function recommendationStartedEvent(options: TrackOptions): ClientEvent | null {
  const rawEntity = options.entityId?.trim() ?? '';
  const animeId = Number.parseInt(rawEntity.split(':')[0] ?? '', 10);
  if (!Number.isSafeInteger(animeId) || animeId <= 0) return null;

  try {
    const key = `${RECOMMENDATION_ATTRIBUTION_PREFIX}${animeId}`;
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      openedAt?: number;
      startedSent?: boolean;
      recommendationId?: string | null;
      impressionId?: string | null;
      recommendationSessionId?: string | null;
      algorithmVersion?: string | null;
      rowId?: string | null;
      position?: number | null;
      mood?: string | null;
      source?: string | null;
      matchScore?: number | null;
      reason?: string | null;
    };
    const openedAt = Number(parsed.openedAt ?? 0);
    if (!openedAt || Date.now() - openedAt > RECOMMENDATION_ATTRIBUTION_TTL_MS) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    if (parsed.startedSent) return null;

    window.sessionStorage.setItem(key, JSON.stringify({ ...parsed, startedSent: true }));
    return {
      eventName: 'recommendation_started',
      eventId: randomId(),
      sessionId: getProductAnalyticsSessionId(),
      anonymousId: getProductAnalyticsAnonymousId(),
      source: parsed.source || 'recommendation',
      path: options.path,
      entityType: 'anime_id',
      entityId: String(animeId),
      recommendationId: parsed.recommendationId ?? undefined,
      recommendationSessionId: parsed.recommendationSessionId ?? undefined,
      algorithmVersion: parsed.algorithmVersion ?? undefined,
      metadata: {
        recommendation_id: parsed.recommendationId ?? null,
        impression_id: parsed.impressionId ?? null,
        recommendation_session_id: parsed.recommendationSessionId ?? null,
        algorithm_version: parsed.algorithmVersion ?? null,
        row_id: parsed.rowId ?? null,
        position: parsed.position ?? null,
        mood: parsed.mood ?? null,
        match_score: parsed.matchScore ?? null,
        reason: parsed.reason?.slice(0, 180) ?? null,
        player_source: options.source ?? null,
      },
    };
  } catch {
    return null;
  }
}


type RecommendationAttributionState = {
  animeId?: number;
  openedAt?: number;
  startedSent?: boolean;
  watch15mSent?: boolean;
  watch30mSent?: boolean;
  completedSent?: boolean;
  watchedMs?: number;
  lastEpisode?: number | null;
  lastEpisodeActiveMs?: number;
  recommendationId?: string | null;
  impressionId?: string | null;
  recommendationSessionId?: string | null;
  algorithmVersion?: string | null;
  rowId?: string | null;
  position?: number | null;
  mood?: string | null;
  source?: string | null;
  matchScore?: number | null;
  reason?: string | null;
};

export function trackRecommendationWatchProgress(input: {
  animeId: number;
  episode: number;
  activeMs: number;
  completed: boolean;
}) {
  if (typeof window === 'undefined') return;
  if (!Number.isSafeInteger(input.animeId) || input.animeId <= 0) return;
  if (!Number.isSafeInteger(input.episode) || input.episode <= 0) return;

  try {
    const key = `${RECOMMENDATION_ATTRIBUTION_PREFIX}${input.animeId}`;
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return;

    const parsed = JSON.parse(raw) as RecommendationAttributionState;
    const openedAt = Number(parsed.openedAt ?? 0);
    if (
      !openedAt ||
      Date.now() - openedAt > RECOMMENDATION_ATTRIBUTION_TTL_MS
    ) {
      window.sessionStorage.removeItem(key);
      return;
    }

    const currentActiveMs = Math.max(0, Math.round(Number(input.activeMs) || 0));
    const previousEpisode = Number(parsed.lastEpisode ?? 0);
    const previousEpisodeActiveMs = Math.max(
      0,
      Math.round(Number(parsed.lastEpisodeActiveMs) || 0),
    );
    const delta =
      previousEpisode === input.episode
        ? Math.max(0, currentActiveMs - previousEpisodeActiveMs)
        : currentActiveMs;
    const watchedMs = Math.min(
      24 * 60 * 60 * 1000,
      Math.max(0, Math.round(Number(parsed.watchedMs) || 0)) + delta,
    );

    const next: RecommendationAttributionState = {
      ...parsed,
      animeId: input.animeId,
      watchedMs,
      lastEpisode: input.episode,
      lastEpisodeActiveMs: currentActiveMs,
    };

    const common = {
      source: parsed.source || 'recommendation',
      entityType: 'anime_id',
      entityId: String(input.animeId),
      recommendationId: parsed.recommendationId ?? undefined,
      recommendationSessionId: parsed.recommendationSessionId ?? undefined,
      algorithmVersion: parsed.algorithmVersion ?? undefined,
      metadata: {
        episode: input.episode,
        watched_ms: watchedMs,
        recommendation_id: parsed.recommendationId ?? null,
        impression_id: parsed.impressionId ?? null,
        recommendation_session_id: parsed.recommendationSessionId ?? null,
        algorithm_version: parsed.algorithmVersion ?? null,
        row_id: parsed.rowId ?? null,
        position: parsed.position ?? null,
        mood: parsed.mood ?? null,
        match_score: parsed.matchScore ?? null,
        reason: parsed.reason?.slice(0, 180) ?? null,
      },
    } as const;

    if (watchedMs >= 15 * 60 * 1000 && !parsed.watch15mSent) {
      next.watch15mSent = true;
      trackProductClientEvent('recommendation_watch_15m', common);
    }

    if (watchedMs >= 30 * 60 * 1000 && !parsed.watch30mSent) {
      next.watch30mSent = true;
      trackProductClientEvent('recommendation_watch_30m', common);
    }

    if (input.completed && watchedMs > 0 && !parsed.completedSent) {
      next.completedSent = true;
      trackProductClientEvent('recommendation_completed', {
        ...common,
        metadata: {
          ...common.metadata,
          completion_scope: 'episode',
        },
      });
    }

    window.sessionStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Recommendation depth analytics must never affect playback.
  }
}

export function trackProductClientEvent(
  eventName: ProductClientEventName,
  options: TrackOptions = {},
) {
  if (typeof window === 'undefined') return;
  installLifecycleListeners();

  const { flush = false, ...rest } = options;
  queue.push({
    eventName,
    eventId: randomId(),
    sessionId: getProductAnalyticsSessionId(),
    ...rest,
    anonymousId: getProductAnalyticsAnonymousId(),
  });

  if (eventName === 'player_started') {
    const recommendationAttribution = recommendationStartedEvent(rest);
    if (recommendationAttribution) queue.push(recommendationAttribution);

    const continueAttribution = continueWatchingStartedEvent(rest);
    if (continueAttribution) queue.push(continueAttribution);
  }

  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);

  if (flush || queue.length >= 8) {
    if (!flushing) {
      flushing = flushQueue().finally(() => {
        flushing = null;
      });
    }
    return;
  }

  scheduleFlush();
}
