import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export type RuntimeControlKey =
  | 'platform_mode'
  | 'recommendations'
  | 'smart_discovery'
  | 'watch_together'
  | 'community_writes'
  | 'background_jobs';

export type RuntimeFeatureKey = Exclude<RuntimeControlKey, 'platform_mode'>;
export type PlatformRuntimeMode = 'normal' | 'brownout';
export type RuntimeFeatureState = 'enabled' | 'disabled';

export type RuntimeControlRow = {
  controlKey: RuntimeControlKey;
  state: PlatformRuntimeMode | RuntimeFeatureState;
  reason: string | null;
  updatedBy: string | null;
  updatedAt: string;
};

export type RuntimeControlSnapshot = {
  mode: PlatformRuntimeMode;
  features: Record<RuntimeFeatureKey, boolean>;
  controls: RuntimeControlRow[];
  degraded: boolean;
  loadedAt: string;
};

type DbRow = {
  control_key: string;
  state: string;
  reason: string | null;
  updated_by: string | null;
  updated_at: string;
};

const FEATURE_KEYS: RuntimeFeatureKey[] = [
  'recommendations',
  'smart_discovery',
  'watch_together',
  'community_writes',
  'background_jobs',
];

const DEFAULT_FEATURES: Record<RuntimeFeatureKey, boolean> = {
  recommendations: true,
  smart_discovery: true,
  watch_together: true,
  community_writes: true,
  background_jobs: true,
};

const CACHE_TTL_MS = 5_000;

let cached:
  | {
      expiresAt: number;
      snapshot: RuntimeControlSnapshot;
    }
  | null = null;

function isRuntimeControlKey(value: string): value is RuntimeControlKey {
  return value === 'platform_mode' || FEATURE_KEYS.includes(value as RuntimeFeatureKey);
}

function normalizeReason(value: unknown) {
  if (typeof value !== 'string') return null;
  const reason = value.trim().slice(0, 500);
  return reason || null;
}

function defaultSnapshot(degraded = false): RuntimeControlSnapshot {
  const loadedAt = new Date().toISOString();
  return {
    mode: 'normal',
    features: { ...DEFAULT_FEATURES },
    controls: [
      {
        controlKey: 'platform_mode',
        state: 'normal',
        reason: null,
        updatedBy: null,
        updatedAt: loadedAt,
      },
      ...FEATURE_KEYS.map((controlKey) => ({
        controlKey,
        state: 'enabled' as const,
        reason: null,
        updatedBy: null,
        updatedAt: loadedAt,
      })),
    ],
    degraded,
    loadedAt,
  };
}

function snapshotFromRows(rows: DbRow[]): RuntimeControlSnapshot {
  const fallback = defaultSnapshot(false);
  const byKey = new Map<RuntimeControlKey, DbRow>();

  for (const row of rows) {
    if (isRuntimeControlKey(row.control_key)) {
      byKey.set(row.control_key, row);
    }
  }

  const modeRow = byKey.get('platform_mode');
  const mode: PlatformRuntimeMode =
    modeRow?.state === 'brownout' ? 'brownout' : 'normal';

  const features = { ...DEFAULT_FEATURES };
  for (const key of FEATURE_KEYS) {
    features[key] = byKey.get(key)?.state !== 'disabled';
  }

  const controls: RuntimeControlRow[] = [
    {
      controlKey: 'platform_mode',
      state: mode,
      reason: normalizeReason(modeRow?.reason),
      updatedBy: modeRow?.updated_by ?? null,
      updatedAt: modeRow?.updated_at ?? fallback.loadedAt,
    },
    ...FEATURE_KEYS.map((key) => {
      const row = byKey.get(key);
      return {
        controlKey: key,
        state: features[key] ? 'enabled' : 'disabled',
        reason: normalizeReason(row?.reason),
        updatedBy: row?.updated_by ?? null,
        updatedAt: row?.updated_at ?? fallback.loadedAt,
      } satisfies RuntimeControlRow;
    }),
  ];

  return {
    mode,
    features,
    controls,
    degraded: false,
    loadedAt: new Date().toISOString(),
  };
}

export function invalidateRuntimeControlCache() {
  cached = null;
}

export async function getRuntimeControlSnapshot(): Promise<RuntimeControlSnapshot> {
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.snapshot;
  }

  try {
    const { data, error } = await createSupabaseAdmin()
      .from('system_runtime_controls')
      .select('control_key,state,reason,updated_by,updated_at')
      .order('control_key', { ascending: true });

    if (error) throw error;

    const snapshot = snapshotFromRows((data ?? []) as DbRow[]);
    cached = {
      expiresAt: now + CACHE_TTL_MS,
      snapshot,
    };
    return snapshot;
  } catch (error) {
    // Runtime controls are an operational optimization. A control-plane
    // outage must not turn into a full platform outage, so fail open.
    console.warn('[Runtime controls] registry unavailable', error);
    const snapshot = defaultSnapshot(true);
    cached = {
      expiresAt: now + 2_000,
      snapshot,
    };
    return snapshot;
  }
}

export async function setRuntimeControl(input: {
  controlKey: RuntimeControlKey;
  state: PlatformRuntimeMode | RuntimeFeatureState;
  reason?: string | null;
  actorId?: string | null;
}) {
  const key = input.controlKey;
  const state = input.state;

  if (
    (key === 'platform_mode' && state !== 'normal' && state !== 'brownout') ||
    (key !== 'platform_mode' && state !== 'enabled' && state !== 'disabled')
  ) {
    throw new Error('invalid_runtime_control_state');
  }

  const now = new Date().toISOString();
  const { data, error } = await createSupabaseAdmin()
    .from('system_runtime_controls')
    .upsert(
      {
        control_key: key,
        state,
        reason: normalizeReason(input.reason),
        updated_by: input.actorId ?? null,
        updated_at: now,
      },
      { onConflict: 'control_key' },
    )
    .select('control_key,state,reason,updated_by,updated_at')
    .single();

  if (error) throw error;

  invalidateRuntimeControlCache();

  const row = data as DbRow;
  return {
    controlKey: row.control_key as RuntimeControlKey,
    state: row.state as PlatformRuntimeMode | RuntimeFeatureState,
    reason: row.reason,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  } satisfies RuntimeControlRow;
}

export async function runtimeFeatureDecision(
  feature: RuntimeFeatureKey,
  options: {
    disableInBrownout?: boolean;
  } = {},
) {
  const snapshot = await getRuntimeControlSnapshot();
  const configuredEnabled = snapshot.features[feature] !== false;
  const brownoutBlocked =
    options.disableInBrownout === true && snapshot.mode === 'brownout';

  return {
    allowed: configuredEnabled && !brownoutBlocked,
    configuredEnabled,
    brownout: snapshot.mode === 'brownout',
    degraded: snapshot.degraded,
    reason: !configuredEnabled
      ? 'admin_disabled'
      : brownoutBlocked
        ? 'brownout'
        : null,
    snapshot,
  };
}

export function runtimeFeatureUnavailableResponse(input: {
  feature: RuntimeFeatureKey;
  reason: 'admin_disabled' | 'brownout' | string;
  retryAfterSeconds?: number;
}) {
  return Response.json(
    {
      ok: false,
      error: 'feature_temporarily_unavailable',
      feature: input.feature,
      reason: input.reason,
    },
    {
      status: 503,
      headers: {
        'Cache-Control': 'private, no-store',
        'Retry-After': String(
          Math.max(1, Math.min(300, Math.round(input.retryAfterSeconds ?? 30))),
        ),
        'X-AnimeBox-Degraded': input.reason,
      },
    },
  );
}
