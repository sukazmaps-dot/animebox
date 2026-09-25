import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';

export type RuntimeRefreshLeaseScope =
  | 'catalog_availability'
  | 'anime_catalog_metadata';

export type RuntimeRefreshLease = {
  acquired: boolean;
  ownerToken: string | null;
  degraded: boolean;
};

const DEFAULT_LEASE_TTL_SECONDS = 15;
const MIN_LEASE_TTL_SECONDS = 5;
const MAX_LEASE_TTL_SECONDS = 60;

function normalizedLeaseTtl(ttlSeconds: number) {
  if (!Number.isFinite(ttlSeconds)) return DEFAULT_LEASE_TTL_SECONDS;
  return Math.max(
    MIN_LEASE_TTL_SECONDS,
    Math.min(MAX_LEASE_TTL_SECONDS, Math.round(ttlSeconds)),
  );
}

function normalizedLeaseKey(value: string) {
  return value.trim().slice(0, 160);
}

export async function tryAcquireRuntimeRefreshLease(
  scope: RuntimeRefreshLeaseScope,
  cacheKey: string,
  ttlSeconds = DEFAULT_LEASE_TTL_SECONDS,
): Promise<RuntimeRefreshLease> {
  const normalizedKey = normalizedLeaseKey(cacheKey);

  // A malformed internal key must never turn a cache refresh into a user-facing
  // outage. Fail open and let the existing local in-flight shield do its job.
  if (!normalizedKey) {
    return { acquired: true, ownerToken: null, degraded: true };
  }

  const ownerToken = crypto.randomUUID();

  try {
    const { data, error } = await createSupabaseAdmin().rpc(
      'try_acquire_runtime_refresh_lease',
      {
        p_scope: scope,
        p_cache_key: normalizedKey,
        p_owner_token: ownerToken,
        p_ttl_seconds: normalizedLeaseTtl(ttlSeconds),
      },
    );

    if (error) throw error;

    const acquired = data === true;
    return {
      acquired,
      ownerToken: acquired ? ownerToken : null,
      degraded: false,
    };
  } catch (error) {
    // Distributed coordination is a resilience optimization, never a hard
    // dependency. If Supabase RPC is degraded, preserve availability and fall
    // back to per-instance in-flight deduplication.
    console.warn('[Runtime refresh lease] acquire unavailable', {
      scope,
      cacheKey: normalizedKey,
      error,
    });

    return { acquired: true, ownerToken: null, degraded: true };
  }
}

export async function releaseRuntimeRefreshLease(
  scope: RuntimeRefreshLeaseScope,
  cacheKey: string,
  ownerToken: string | null,
) {
  if (!ownerToken) return;

  const normalizedKey = normalizedLeaseKey(cacheKey);
  if (!normalizedKey) return;

  try {
    const { error } = await createSupabaseAdmin().rpc(
      'release_runtime_refresh_lease',
      {
        p_scope: scope,
        p_cache_key: normalizedKey,
        p_owner_token: ownerToken,
      },
    );

    if (error) throw error;
  } catch (error) {
    // A leaked lease self-heals on TTL expiry. Never fail the request because
    // cleanup itself had a transient failure.
    console.warn('[Runtime refresh lease] release unavailable', {
      scope,
      cacheKey: normalizedKey,
      error,
    });
  }
}
