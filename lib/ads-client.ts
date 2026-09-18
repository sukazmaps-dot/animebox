'use client';

import type { AdPlacement, AdRuntimeConfig } from '@/lib/ads';

const CONFIG_TTL = 60_000;
const SESSION_KEY = 'animebox:ads:session:v1';

let cachedConfig: { value: AdRuntimeConfig; expiresAt: number } | null = null;
let configRequest: Promise<AdRuntimeConfig> | null = null;

type SessionState = {
  count: number;
  lastShownAt: number;
  byPlacement: Partial<Record<AdPlacement, number>>;
};

function emptySession(): SessionState {
  return { count: 0, lastShownAt: 0, byPlacement: {} };
}

function readSession(): SessionState {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return emptySession();
    const parsed = JSON.parse(raw) as Partial<SessionState>;
    return {
      count: Number.isFinite(parsed.count) ? Math.max(0, Number(parsed.count)) : 0,
      lastShownAt: Number.isFinite(parsed.lastShownAt) ? Math.max(0, Number(parsed.lastShownAt)) : 0,
      byPlacement:
        parsed.byPlacement && typeof parsed.byPlacement === 'object'
          ? parsed.byPlacement
          : {},
    };
  } catch {
    return emptySession();
  }
}

function saveSession(state: SessionState) {
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    // Private WebViews can deny sessionStorage. Ads still remain functional.
  }
}

export function reserveAdExposure(
  placement: AdPlacement,
  config: AdRuntimeConfig,
): boolean {
  if (!config.enabled || !config.placements[placement]) return false;

  const state = readSession();
  const now = Date.now();
  const cooldownMs = Math.max(0, config.minSecondsBetweenAds) * 1000;

  if (state.count >= config.maxAdsPerSession) return false;
  if (cooldownMs > 0 && state.lastShownAt > 0 && now - state.lastShownAt < cooldownMs) {
    return false;
  }

  state.count += 1;
  state.lastShownAt = now;
  state.byPlacement[placement] = now;
  saveSession(state);
  return true;
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
