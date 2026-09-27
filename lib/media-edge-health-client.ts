'use client';

import {
  getPrimaryMediaOrigin,
  getRuMediaOrigin,
} from '@/lib/media-delivery';

const FAILURE_WINDOW_MS = 8_000;
const DISTINCT_SOURCE_THRESHOLD = 4;
const MEDIA_EDGE_COOLDOWN_MS = 60_000;
const STORAGE_PREFIX = 'animebox:media-edge-blocked:';

type MediaEdgeCircuitState = {
  windowStartedAt: number;
  failedSources: Set<string>;
  blockedUntil: number;
};

const circuits = new Map<string, MediaEdgeCircuitState>();
const listeners = new Set<() => void>();
let revision = 0;

function emitChange() {
  revision += 1;
  for (const listener of listeners) listener();
}

function knownMediaOrigins() {
  return Array.from(
    new Set(
      [getPrimaryMediaOrigin(), getRuMediaOrigin()].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  );
}

function mediaOriginForRequest(value: string): string | null {
  try {
    const url = new URL(value, window.location.origin);
    const origin = url.origin;
    return knownMediaOrigins().includes(origin) ? origin : null;
  } catch {
    return null;
  }
}

function sourceKeyForRequest(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    return url.searchParams.get('url') || url.pathname;
  } catch {
    return value;
  }
}

function storageKey(origin: string) {
  return `${STORAGE_PREFIX}${origin}`;
}

function readPersistedBlockedUntil(origin: string) {
  if (typeof window === 'undefined') return 0;

  try {
    const raw = window.sessionStorage.getItem(storageKey(origin));
    const value = Number(raw || '0');
    return Number.isFinite(value) && value > Date.now() ? value : 0;
  } catch {
    return 0;
  }
}

function persistBlockedUntil(origin: string, blockedUntil: number) {
  if (typeof window === 'undefined') return;

  try {
    if (blockedUntil > Date.now()) {
      window.sessionStorage.setItem(
        storageKey(origin),
        String(blockedUntil),
      );
    } else {
      window.sessionStorage.removeItem(storageKey(origin));
    }
  } catch {
    // sessionStorage can be unavailable in restricted/private contexts.
  }
}

function stateForOrigin(origin: string) {
  const existing = circuits.get(origin);
  if (existing) return existing;

  const state: MediaEdgeCircuitState = {
    windowStartedAt: 0,
    failedSources: new Set(),
    blockedUntil: readPersistedBlockedUntil(origin),
  };

  circuits.set(origin, state);
  return state;
}

export function isAnimeBoxMediaRequest(value: string) {
  if (typeof window === 'undefined') return false;
  return mediaOriginForRequest(value) != null;
}

export function isMediaEdgeBlocked(value: string) {
  if (typeof window === 'undefined') return false;

  const origin = mediaOriginForRequest(value);
  if (!origin) return false;

  const state = stateForOrigin(origin);
  if (state.blockedUntil <= Date.now()) {
    if (state.blockedUntil !== 0) {
      state.blockedUntil = 0;
      state.failedSources.clear();
      state.windowStartedAt = 0;
      persistBlockedUntil(origin, 0);
    }
    return false;
  }

  return true;
}

export function reportMediaEdgeFailure(value: string) {
  if (typeof window === 'undefined') return false;

  const origin = mediaOriginForRequest(value);
  if (!origin) return false;

  const now = Date.now();
  const state = stateForOrigin(origin);

  if (state.blockedUntil > now) {
    return true;
  }

  if (
    state.windowStartedAt === 0 ||
    now - state.windowStartedAt > FAILURE_WINDOW_MS
  ) {
    state.windowStartedAt = now;
    state.failedSources.clear();
  }

  state.failedSources.add(sourceKeyForRequest(value));

  if (state.failedSources.size < DISTINCT_SOURCE_THRESHOLD) {
    return false;
  }

  state.blockedUntil = now + MEDIA_EDGE_COOLDOWN_MS;
  persistBlockedUntil(origin, state.blockedUntil);
  emitChange();

  return true;
}

export function reportMediaEdgeSuccess(value: string) {
  if (typeof window === 'undefined') return;

  const origin = mediaOriginForRequest(value);
  if (!origin) return;

  const state = stateForOrigin(origin);

  // Do not let late cache hits immediately close a circuit that was opened by
  // several distinct failing posters. The cooldown is intentionally global.
  if (state.blockedUntil > Date.now()) return;

  if (
    state.failedSources.size === 0 &&
    state.windowStartedAt === 0
  ) {
    return;
  }

  state.failedSources.clear();
  state.windowStartedAt = 0;
}

export function subscribeMediaEdgeHealth(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMediaEdgeHealthRevision() {
  return revision;
}

export function getMediaEdgeHealthServerRevision() {
  return 0;
}

export const MEDIA_EDGE_FAILURE_WINDOW_MS = FAILURE_WINDOW_MS;
export const MEDIA_EDGE_DISTINCT_SOURCE_THRESHOLD =
  DISTINCT_SOURCE_THRESHOLD;
export const MEDIA_EDGE_COOLDOWN_DURATION_MS =
  MEDIA_EDGE_COOLDOWN_MS;
