import 'server-only';

import { adminClient } from '@/lib/community-server';
import { getPlaybackRestriction } from '@/lib/copyright-server';
import type {
  PlayerProviderKey,
  PlayerProviderPolicy,
  PlayerProviderRuntimeState,
  PlayerSourcePolicyResponse,
} from '@/types/player-source-policy';

type ProviderSettingRow = {
  provider_key: PlayerProviderKey;
  display_name: string;
  enabled: boolean;
  priority: number;
  failure_threshold: number;
  cooldown_seconds: number;
  notes: string | null;
  updated_at: string;
};

type ProviderRuntimeRow = {
  provider_key: PlayerProviderKey;
  state: PlayerProviderRuntimeState;
  consecutive_failures: number;
  consecutive_successes: number;
  last_latency_ms: number | null;
  last_error: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  cooldown_until: string | null;
  updated_at: string;
};

export type PlayerProviderControlRow = {
  key: PlayerProviderKey;
  name: string;
  enabled: boolean;
  environmentReady: boolean;
  priority: number;
  failureThreshold: number;
  cooldownSeconds: number;
  notes: string | null;
  state: PlayerProviderRuntimeState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastLatencyMs: number | null;
  lastError: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  cooldownUntil: string | null;
  updatedAt: string;
};

const DEFAULT_SETTINGS: ProviderSettingRow[] = [
  {
    provider_key: 'direct',
    display_name: 'AnimeBox Direct',
    enabled: true,
    priority: 10,
    failure_threshold: 3,
    cooldown_seconds: 180,
    notes: null,
    updated_at: new Date(0).toISOString(),
  },
  {
    provider_key: 'kodik',
    display_name: 'Kodik',
    enabled: true,
    priority: 20,
    failure_threshold: 3,
    cooldown_seconds: 180,
    notes: null,
    updated_at: new Date(0).toISOString(),
  },
  {
    provider_key: 'aniliberty',
    display_name: 'AniLiberty',
    enabled: true,
    priority: 30,
    failure_threshold: 3,
    cooldown_seconds: 180,
    notes: null,
    updated_at: new Date(0).toISOString(),
  },
];

const DEFAULT_RUNTIME = new Map<PlayerProviderKey, ProviderRuntimeRow>(
  DEFAULT_SETTINGS.map((setting) => [
    setting.provider_key,
    {
      provider_key: setting.provider_key,
      state: 'unknown',
      consecutive_failures: 0,
      consecutive_successes: 0,
      last_latency_ms: null,
      last_error: null,
      last_success_at: null,
      last_failure_at: null,
      cooldown_until: null,
      updated_at: new Date(0).toISOString(),
    },
  ]),
);

const CACHE_TTL_MS = 15_000;
let cachedControl:
  | {
      expiresAt: number;
      settings: ProviderSettingRow[];
      runtime: ProviderRuntimeRow[];
    }
  | null = null;

function schemaMissing(message: string) {
  return /player_provider_(settings|runtime)|schema cache|relation/i.test(message);
}

function envFlag(name: string) {
  return /^(1|true|yes|on)$/i.test(process.env[name]?.trim() || '');
}

export function providerEnvironmentReady(provider: PlayerProviderKey) {
  if (provider === 'direct') {
    return (
      (envFlag('DIRECT_PLAYER_ENABLED') ||
        envFlag('NEXT_PUBLIC_DIRECT_PLAYER_ENABLED')) &&
      Boolean(process.env.ALLOHA_API_TOKEN?.trim())
    );
  }

  if (provider === 'kodik') {
    return Boolean(process.env.KODIK_TOKEN?.trim());
  }

  return true;
}

export function providerDisplayName(provider: PlayerProviderKey) {
  return (
    DEFAULT_SETTINGS.find((item) => item.provider_key === provider)
      ?.display_name || provider
  );
}

export function invalidateProviderControlCache() {
  cachedControl = null;
}

async function loadControlRows() {
  if (cachedControl && cachedControl.expiresAt > Date.now()) {
    return cachedControl;
  }

  try {
    const admin = adminClient();
    const [settingsResult, runtimeResult] = await Promise.all([
      admin
        .from('player_provider_settings')
        .select(
          'provider_key,display_name,enabled,priority,failure_threshold,cooldown_seconds,notes,updated_at',
        )
        .order('priority', { ascending: true }),
      admin
        .from('player_provider_runtime')
        .select(
          'provider_key,state,consecutive_failures,consecutive_successes,last_latency_ms,last_error,last_success_at,last_failure_at,cooldown_until,updated_at',
        ),
    ]);

    if (settingsResult.error) throw settingsResult.error;
    if (runtimeResult.error) throw runtimeResult.error;

    const settings =
      (settingsResult.data as ProviderSettingRow[] | null) ?? DEFAULT_SETTINGS;
    const runtime =
      (runtimeResult.data as ProviderRuntimeRow[] | null) ??
      [...DEFAULT_RUNTIME.values()];

    cachedControl = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      settings: settings.length ? settings : DEFAULT_SETTINGS,
      runtime,
    };

    return cachedControl;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!schemaMissing(message)) {
      console.warn('[Player Source Control] registry unavailable:', error);
    }

    return {
      expiresAt: Date.now() + 2_000,
      settings: DEFAULT_SETTINGS,
      runtime: [...DEFAULT_RUNTIME.values()],
    };
  }
}

function runtimeFor(
  provider: PlayerProviderKey,
  rows: ProviderRuntimeRow[],
) {
  return rows.find((item) => item.provider_key === provider) ??
    DEFAULT_RUNTIME.get(provider)!;
}

function normalizeRuntimeState(
  runtime: ProviderRuntimeRow,
): PlayerProviderRuntimeState {
  if (
    runtime.state === 'unavailable' &&
    runtime.cooldown_until &&
    Date.parse(runtime.cooldown_until) <= Date.now()
  ) {
    return 'degraded';
  }

  return runtime.state;
}

export async function getProviderDecision(
  provider: PlayerProviderKey,
  input: {
    animeId: number;
    season?: number | null;
    episode: number;
  },
): Promise<PlayerProviderPolicy> {
  const control = await loadControlRows();
  const setting =
    control.settings.find((item) => item.provider_key === provider) ??
    DEFAULT_SETTINGS.find((item) => item.provider_key === provider)!;
  const runtime = runtimeFor(provider, control.runtime);
  const environmentReady = providerEnvironmentReady(provider);
  const cooldownActive = Boolean(
    runtime.cooldown_until &&
      Date.parse(runtime.cooldown_until) > Date.now(),
  );

  let reason: PlayerProviderPolicy['reason'] = '';

  if (!setting.enabled) {
    reason = 'admin_disabled';
  } else if (!environmentReady) {
    reason = 'environment_disabled';
  } else if (cooldownActive) {
    reason = 'cooldown';
  } else {
    const restriction = await getPlaybackRestriction({
      animeId: input.animeId,
      season: input.season ?? null,
      episode: input.episode,
      provider: setting.display_name,
    });

    if (restriction) reason = 'copyright_restricted';
  }

  return {
    key: provider,
    name: setting.display_name,
    enabled: reason === '',
    configuredEnabled: setting.enabled,
    environmentReady,
    priority: setting.priority,
    state: normalizeRuntimeState(runtime),
    reason,
    failureThreshold: setting.failure_threshold,
    cooldownSeconds: setting.cooldown_seconds,
    cooldownUntil: runtime.cooldown_until,
    lastLatencyMs: runtime.last_latency_ms,
    lastSuccessAt: runtime.last_success_at,
    lastFailureAt: runtime.last_failure_at,
  };
}

export async function getPlayerSourcePolicy(input: {
  animeId: number;
  season?: number | null;
  episode: number;
}): Promise<PlayerSourcePolicyResponse> {
  const providers: PlayerProviderKey[] = [
    'direct',
    'kodik',
    'aniliberty',
  ];

  const resolved = await Promise.all(
    providers.map((provider) => getProviderDecision(provider, input)),
  );

  return {
    ok: true,
    animeId: input.animeId,
    season: input.season ?? null,
    episode: input.episode,
    providers: resolved.sort(
      (a, b) => a.priority - b.priority || a.name.localeCompare(b.name),
    ),
  };
}

export async function getProviderControlSnapshot(): Promise<
  PlayerProviderControlRow[]
> {
  const control = await loadControlRows();

  return control.settings
    .map((setting) => {
      const runtime = runtimeFor(setting.provider_key, control.runtime);

      return {
        key: setting.provider_key,
        name: setting.display_name,
        enabled: setting.enabled,
        environmentReady: providerEnvironmentReady(setting.provider_key),
        priority: setting.priority,
        failureThreshold: setting.failure_threshold,
        cooldownSeconds: setting.cooldown_seconds,
        notes: setting.notes,
        state: normalizeRuntimeState(runtime),
        consecutiveFailures: runtime.consecutive_failures,
        consecutiveSuccesses: runtime.consecutive_successes,
        lastLatencyMs: runtime.last_latency_ms,
        lastError: runtime.last_error,
        lastSuccessAt: runtime.last_success_at,
        lastFailureAt: runtime.last_failure_at,
        cooldownUntil: runtime.cooldown_until,
        updatedAt:
          runtime.updated_at > setting.updated_at
            ? runtime.updated_at
            : setting.updated_at,
      };
    })
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

export async function recordProviderResult(
  provider: PlayerProviderKey,
  result: {
    ok: boolean;
    latencyMs?: number | null;
    reason?: string | null;
  },
) {
  try {
    const control = await loadControlRows();
    const setting =
      control.settings.find((item) => item.provider_key === provider) ??
      DEFAULT_SETTINGS.find((item) => item.provider_key === provider)!;
    const current = runtimeFor(provider, control.runtime);
    const now = new Date();
    const latencyMs =
      result.latencyMs != null && Number.isFinite(result.latencyMs)
        ? Math.max(0, Math.min(120_000, Math.round(result.latencyMs)))
        : null;

    if (result.ok) {
      const consecutiveSuccesses = current.consecutive_successes + 1;
      const state: PlayerProviderRuntimeState =
        current.state === 'healthy' || consecutiveSuccesses >= 2
          ? 'healthy'
          : 'degraded';

      const { error } = await adminClient()
        .from('player_provider_runtime')
        .upsert({
          provider_key: provider,
          state,
          consecutive_failures: 0,
          consecutive_successes: consecutiveSuccesses,
          last_latency_ms: latencyMs,
          last_error: null,
          last_success_at: now.toISOString(),
          cooldown_until: null,
          updated_at: now.toISOString(),
        });

      if (error) throw error;
    } else {
      const consecutiveFailures = current.consecutive_failures + 1;
      const unavailable =
        consecutiveFailures >= setting.failure_threshold;
      const cooldownUntil = unavailable
        ? new Date(
            now.getTime() + setting.cooldown_seconds * 1_000,
          ).toISOString()
        : null;

      const { error } = await adminClient()
        .from('player_provider_runtime')
        .upsert({
          provider_key: provider,
          state: unavailable ? 'unavailable' : 'degraded',
          consecutive_failures: consecutiveFailures,
          consecutive_successes: 0,
          last_latency_ms: latencyMs,
          last_error: result.reason?.trim().slice(0, 500) || 'provider_failure',
          last_failure_at: now.toISOString(),
          cooldown_until: cooldownUntil,
          updated_at: now.toISOString(),
        });

      if (error) throw error;
    }

    invalidateProviderControlCache();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!schemaMissing(message)) {
      console.warn('[Player Source Control] health update failed:', error);
    }
  }
}

export async function resetProviderRuntime(provider: PlayerProviderKey) {
  const now = new Date().toISOString();
  const { error } = await adminClient()
    .from('player_provider_runtime')
    .upsert({
      provider_key: provider,
      state: 'unknown',
      consecutive_failures: 0,
      consecutive_successes: 0,
      last_latency_ms: null,
      last_error: null,
      cooldown_until: null,
      updated_at: now,
    });

  if (error) throw error;
  invalidateProviderControlCache();
}
