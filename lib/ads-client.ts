'use client';

import type { AdPlacement, AdRuntimeConfig } from '@/lib/ads';

const CONFIG_TTL = 60_000;
const SESSION_KEY = 'animebox:ads:session:v1';
const PENDING_TTL_MS = 20_000;

let cachedConfig: { value: AdRuntimeConfig; expiresAt: number } | null = null;
let configRequest: Promise<AdRuntimeConfig> | null = null;

let memorySession: SessionState = emptySession();

type PendingExposure = {
  placement: AdPlacement;
  startedAt: number;
};

type SessionState = {
  count: number;
  lastShownAt: number;
  byPlacement: Partial<Record<AdPlacement, number>>;
  pending?: PendingExposure;
};

function emptySession(): SessionState {
  return { count: 0, lastShownAt: 0, byPlacement: {} };
}

function normalizeSession(value: Partial<SessionState> | null | undefined): SessionState {
  const pending = value?.pending;

  return {
    count: Number.isFinite(value?.count) ? Math.max(0, Number(value?.count)) : 0,
    lastShownAt: Number.isFinite(value?.lastShownAt)
      ? Math.max(0, Number(value?.lastShownAt))
      : 0,
    byPlacement:
      value?.byPlacement && typeof value.byPlacement === 'object'
        ? value.byPlacement
        : {},
    pending:
      pending &&
      typeof pending === 'object' &&
      typeof pending.placement === 'string' &&
      Number.isFinite(pending.startedAt)
        ? pending
        : undefined,
  };
}

function readSession(): SessionState {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return memorySession;
    const parsed = normalizeSession(JSON.parse(raw) as Partial<SessionState>);
    memorySession = parsed;
    return parsed;
  } catch {
    return memorySession;
  }
}

function saveSession(state: SessionState) {
  memorySession = state;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    // Some private browsers / WebViews deny sessionStorage. The in-memory
    // fallback still keeps the cap and cooldown correct for the current page.
  }
}

function clearStalePending(state: SessionState, now: number) {
  if (state.pending && now - state.pending.startedAt > PENDING_TTL_MS) {
    delete state.pending;
  }
}

/**
 * Reserve a provider request without counting it as an impression yet.
 * The real impression is committed only after the provider injects visible ad
 * content. This prevents no-fill / ad-block failures from consuming the user's
 * session quota or starting the cooldown.
 */
export function beginAdExposure(
  placement: AdPlacement,
  config: AdRuntimeConfig,
): boolean {
  if (!config.enabled || !config.placements[placement]) return false;

  const state = readSession();
  const now = Date.now();
  const cooldownMs = Math.max(0, config.minSecondsBetweenAds) * 1000;

  clearStalePending(state, now);

  if (state.count >= config.maxAdsPerSession) {
    saveSession(state);
    return false;
  }

  // Do not show the same placement twice in one browser session. This keeps
  // navigation back/forward from feeling like the same ad follows the user.
  if (state.byPlacement[placement]) {
    saveSession(state);
    return false;
  }

  if (cooldownMs > 0 && state.lastShownAt > 0 && now - state.lastShownAt < cooldownMs) {
    saveSession(state);
    return false;
  }

  // Only one third-party ad request can be pending at a time. It avoids several
  // slots racing each other during fast client-side navigation.
  if (state.pending) {
    saveSession(state);
    return false;
  }

  state.pending = { placement, startedAt: now };
  saveSession(state);
  return true;
}

export function commitAdExposure(placement: AdPlacement) {
  const state = readSession();
  const now = Date.now();

  clearStalePending(state, now);
  if (state.pending?.placement !== placement) return;

  state.count += 1;
  state.lastShownAt = now;
  state.byPlacement[placement] = now;
  delete state.pending;
  saveSession(state);
}

export function releaseAdExposure(placement: AdPlacement) {
  const state = readSession();
  if (state.pending?.placement !== placement) return;
  delete state.pending;
  saveSession(state);
}

export function getAdSessionSnapshot() {
  const state = readSession();
  clearStalePending(state, Date.now());
  saveSession(state);
  return state;
}

export async function getAdRuntimeConfig(options: { force?: boolean } = {}) {
  const now = Date.now();
  if (!options.force && cachedConfig && cachedConfig.expiresAt > now) {
    return cachedConfig.value;
  }
  if (!options.force && configRequest) return configRequest;

  const request = fetch('/api/ads/config', {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Ad config HTTP ${response.status}`);
      const config = (await response.json()) as AdRuntimeConfig;
      cachedConfig = { value: config, expiresAt: Date.now() + CONFIG_TTL };
      return config;
    })
    .finally(() => {
      configRequest = null;
    });

  configRequest = request;
  return request;
}

export function clearAdConfigCache() {
  cachedConfig = null;
}
