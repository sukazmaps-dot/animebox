import 'server-only';

import { after } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { AnimeFranchise, FranchiseCategory } from '@/lib/anime-franchise';

const TABLE = 'anime_franchise_cache';
const FRESH_TTL_MS = 3 * 60 * 60 * 1000;
const PARTIAL_TTL_MS = 60 * 1000;
const STALE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_LEASE_MS = 90 * 1000;
const CATEGORIES: FranchiseCategory[] = [
  'series', 'movies', 'ova', 'specials', 'spinOffs', 'other',
];

type CacheRow = {
  payload: unknown;
  expires_at: string;
  stale_until: string;
};
type FranchiseLoader = (signal?: AbortSignal) => Promise<AnimeFranchise | null>;

let missingStoreLogged = false;

function warnStore(error: unknown) {
  // Missing migration / credentials must never break the public anime page.
  if (!missingStoreLogged) {
    missingStoreLogged = true;
    console.warn('[Franchise Cache] persistent store unavailable; using AniList fallback', error);
  }
}

function isFranchise(value: unknown, id: number): value is AnimeFranchise {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<AnimeFranchise>;
  if (data.currentId !== id || !Array.isArray(data.items) ||
      data.items.length === 0 || data.items.length > 100 ||
      !Array.isArray(data.links) ||
      !Array.isArray(data.failedIds) ||
      !Array.isArray(data.unexpandedIds) ||
      typeof data.partial !== 'boolean' ||
      !data.groups || typeof data.groups !== 'object') return false;

  if (!data.items.every((item) =>
    item && Number.isSafeInteger(item.id) && item.id > 0 &&
    typeof item.title === 'object' && item.title !== null &&
    CATEGORIES.includes(item.category))) return false;
  return CATEGORIES.every((category) => Array.isArray(data.groups?.[category]));
}

function validCachedRow(row: unknown, id: number, now: number) {
  if (!row || typeof row !== 'object') return null;
  const value = row as CacheRow;
  const expiresAt = Date.parse(value.expires_at);
  const staleUntil = Date.parse(value.stale_until);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(staleUntil) ||
      staleUntil <= now || !isFranchise(value.payload, id)) return null;
  return {
    franchise: value.payload,
    fresh: expiresAt > now,
  };
}

function schedule(work: () => Promise<void>) {
  try {
    after(async () => {
      try { await work(); }
      catch (error) { warnStore(error); }
    });
  } catch (error) {
    // An unsupported background context must not turn a cache hit into 500.
    warnStore(error);
  }
}

async function persist(
  db: ReturnType<typeof createSupabaseAdmin>,
  id: number,
  data: AnimeFranchise,
) {
  // Don't let a short partial response erase an established full snapshot.
  if (!isFranchise(data, id)) return;
  const now = Date.now();
  const ttl = data.partial ? PARTIAL_TTL_MS : FRESH_TTL_MS;
  const { error } = await db.from(TABLE).upsert({
    anime_id: id,
    payload: data,
    expires_at: new Date(now + ttl).toISOString(),
    stale_until: new Date(now + ttl + STALE_GRACE_MS).toISOString(),
    updated_at: new Date(now).toISOString(),
  }, { onConflict: 'anime_id' });
  if (error) warnStore(error.message);
}

async function refreshInBackground(
  db: ReturnType<typeof createSupabaseAdmin>,
  id: number,
  stale: AnimeFranchise,
  loader: FranchiseLoader,
) {
  const now = Date.now();
  const leaseEnd = new Date(now + REFRESH_LEASE_MS).toISOString();
  // Atomic compare-and-set limits duplicate AniList crawls across workers.
  const { data: acquired, error } = await db.from(TABLE)
    .update({ refresh_lease_until: leaseEnd })
    .eq('anime_id', id)
    .lt('refresh_lease_until', new Date(now).toISOString())
    .select('anime_id')
    .maybeSingle();

  if (error) { warnStore(error.message); return; }
  if (!acquired) return;

  try {
    // A second callback may have been queued before the first one completed.
    // Re-check freshness after taking the lease to avoid redundant upstream I/O.
    const { data: current, error: checkError } = await db.from(TABLE)
      .select('expires_at')
      .eq('anime_id', id)
      .maybeSingle();
    if (checkError) { warnStore(checkError.message); return; }
    if (current && Date.parse(current.expires_at) > Date.now()) return;

    const refreshed = await loader();
    if (!refreshed || !isFranchise(refreshed, id)) return;
    // Existing cached parts survive upstream partial responses.
    if (refreshed.partial && stale.items.length > refreshed.items.length) return;
    await persist(db, id, refreshed);
  } finally {
    // Avoid releasing another worker's lease if ours already expired.
    const { error: releaseError } = await db.from(TABLE)
      .update({ refresh_lease_until: new Date(0).toISOString() })
      .eq('anime_id', id)
      .eq('refresh_lease_until', leaseEnd);
    if (releaseError) warnStore(releaseError.message);
  }
}

/**
 * Shared cache for both the title page and /api/anime/[slug]/seasons.
 * Cache outages and unapplied migrations gracefully use the existing loader.
 * Stale snapshots return immediately; one lease holder refreshes after response.
 */
export async function getCachedAnimeFranchise(
  id: number | string,
  loader: FranchiseLoader,
  signal?: AbortSignal,
): Promise<AnimeFranchise | null> {
  const animeId = Number(id);
  if (!Number.isSafeInteger(animeId) || animeId <= 0) return null;
  signal?.throwIfAborted();

  let db: ReturnType<typeof createSupabaseAdmin> | null = null;
  try {
    db = createSupabaseAdmin();
    const { data, error } = await db.from(TABLE)
      .select('payload,expires_at,stale_until')
      .eq('anime_id', animeId)
      .maybeSingle();

    signal?.throwIfAborted();
    if (error) {
      warnStore(error.message);
    } else {
      const cached = validCachedRow(data, animeId, Date.now());
      if (cached) {
        if (cached.fresh) return cached.franchise;
        // A stale response is explicitly marked partial in the UI.
        schedule(() => refreshInBackground(db!, animeId, cached.franchise, loader));
        return { ...cached.franchise, partial: true };
      }
    }
  } catch (error) {
    signal?.throwIfAborted();
    warnStore(error);
    db = null;
  }

  signal?.throwIfAborted();
  const result = await loader(signal);
  signal?.throwIfAborted();
  if (result && db && isFranchise(result, animeId)) {
    const persistent = db;
    schedule(() => persist(persistent, animeId, result));
  }
  return result;
}
