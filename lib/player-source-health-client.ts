'use client';

import {
  mediaTypeToDeliveryMode,
  normalizeProviderId,
  type PlayerSourceMode,
} from '@/lib/player-platform';

export type LocalSourceHealth = {
  ready: number;
  errors: number;
  timeouts: number;
  startupTotalMs: number;
  lastReadyAt: number | null;
  lastFailureAt: number | null;
};

export type RankablePlayerSource = {
  name: string;
  type?: 'hls' | 'iframe' | 'video' | 'kodik';
  translations?: Array<{ type?: 'hls' | 'iframe' | 'video' | 'kodik' }>;
};

const HEALTH_KEY = 'animebox:player-source-health:v1';
const SOURCE_MODE_KEY = 'animebox:player-source-mode:v1';
const MANUAL_PROVIDER_KEY = 'animebox:player-source-manual-provider:v1';
const MAX_PROVIDER_ENTRIES = 20;

function blankHealth(): LocalSourceHealth {
  return {
    ready: 0,
    errors: 0,
    timeouts: 0,
    startupTotalMs: 0,
    lastReadyAt: null,
    lastFailureAt: null,
  };
}

function readStore(): Record<string, LocalSourceHealth> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(HEALTH_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<LocalSourceHealth>>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).slice(0, MAX_PROVIDER_ENTRIES).map(([key, value]) => [
        key,
        {
          ready: Math.max(0, Number(value.ready) || 0),
          errors: Math.max(0, Number(value.errors) || 0),
          timeouts: Math.max(0, Number(value.timeouts) || 0),
          startupTotalMs: Math.max(0, Number(value.startupTotalMs) || 0),
          lastReadyAt: Number.isFinite(Number(value.lastReadyAt)) ? Number(value.lastReadyAt) : null,
          lastFailureAt: Number.isFinite(Number(value.lastFailureAt)) ? Number(value.lastFailureAt) : null,
        },
      ]),
    );
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, LocalSourceHealth>) {
  if (typeof window === 'undefined') return;
  try {
    const entries = Object.entries(store)
      .sort(([, a], [, b]) => Math.max(b.lastReadyAt || 0, b.lastFailureAt || 0) - Math.max(a.lastReadyAt || 0, a.lastFailureAt || 0))
      .slice(0, MAX_PROVIDER_ENTRIES);
    window.localStorage.setItem(HEALTH_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Storage can be unavailable in strict/private browser modes.
  }
}

function providerKey(name: string, type?: RankablePlayerSource['type']) {
  const delivery = mediaTypeToDeliveryMode(type);
  return `${normalizeProviderId(name)}:${delivery}`;
}

export function readPlayerSourceMode(): PlayerSourceMode {
  if (typeof window === 'undefined') return 'auto';
  try {
    return window.localStorage.getItem(SOURCE_MODE_KEY) === 'manual' ? 'manual' : 'auto';
  } catch {
    return 'auto';
  }
}

export function writePlayerSourceMode(mode: PlayerSourceMode) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SOURCE_MODE_KEY, mode);
  } catch {
    // Ignore unavailable storage.
  }
}

export function readManualProviderPreference() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(MANUAL_PROVIDER_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function writeManualProviderPreference(provider: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (provider?.trim()) window.localStorage.setItem(MANUAL_PROVIDER_KEY, provider.trim());
    else window.localStorage.removeItem(MANUAL_PROVIDER_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

export function recordSourceReady(name: string, type: RankablePlayerSource['type'], startupMs: number) {
  const store = readStore();
  const key = providerKey(name, type);
  const health = store[key] || blankHealth();

  health.ready += 1;
  health.startupTotalMs += Math.max(0, Math.min(60_000, Math.round(startupMs || 0)));
  health.lastReadyAt = Date.now();
  store[key] = health;
  writeStore(store);
}

export function recordSourceFailure(
  name: string,
  type: RankablePlayerSource['type'],
  kind: 'error' | 'timeout',
) {
  const store = readStore();
  const key = providerKey(name, type);
  const health = store[key] || blankHealth();

  if (kind === 'timeout') health.timeouts += 1;
  else health.errors += 1;

  health.lastFailureAt = Date.now();
  store[key] = health;
  writeStore(store);
}

export function getSourceHealthScore(source: RankablePlayerSource, index: number) {
  const type = source.type || source.translations?.[0]?.type;
  const health = readStore()[providerKey(source.name, type)];
  const baseScore = 100 - Math.min(20, index * 4);

  if (!health) return baseScore;

  const failures = health.errors + health.timeouts;
  const samples = health.ready + failures;
  if (samples <= 0) return baseScore;

  const successRate = health.ready / samples;
  const averageStartup = health.ready > 0 ? health.startupTotalMs / health.ready : 14_000;
  const startupScore = 1 - Math.min(1, averageStartup / 14_000);
  const observedScore = successRate * 70 + startupScore * 30;
  const confidence = Math.min(0.86, samples / 8);

  let score = baseScore * (1 - confidence) + observedScore * confidence;

  if (health.lastFailureAt && Date.now() - health.lastFailureAt < 10 * 60_000) {
    score -= 14;
  }

  if (health.lastReadyAt && Date.now() - health.lastReadyAt < 10 * 60_000) {
    score += 3;
  }

  return score;
}

export function rankPlayerSources<T extends RankablePlayerSource>(sources: T[]) {
  return sources
    .map((source, index) => ({ source, index, score: getSourceHealthScore(source, index) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
}
