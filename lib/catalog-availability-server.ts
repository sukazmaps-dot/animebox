import 'server-only';

import type { Anime } from '@/types/anime';
import type {
  CatalogAvailabilityRow,
  CatalogAvailabilityStatus,
  CatalogHealthSnapshot,
  CatalogProviderAvailabilityStatus,
} from '@/lib/catalog-availability';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getAnimesByIdsWithShikimori } from '@/lib/combined-anime';
import { searchKodikByShikimoriId } from '@/lib/kodik-episode-availability';
import { checkAnimeCatalogAvailability } from '@/lib/source-availability';
import { resolveDirectPlayerStreams } from '@/lib/direct-player-server';

const CONFIRMED_MISS_THRESHOLD = 3;
const PROBE_CONCURRENCY = 4;
const UNKNOWN_TTL_MS = 30 * 60 * 1000;
const UNAVAILABLE_TTL_MS = 24 * 60 * 60 * 1000;
const PLAYABLE_ONGOING_TTL_MS = 12 * 60 * 60 * 1000;
const PLAYABLE_FINISHED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEGRADED_ONGOING_GRACE_MS = 6 * 60 * 60 * 1000;
const DEGRADED_FINISHED_GRACE_MS = 24 * 60 * 60 * 1000;
const REGISTRY_READ_TTL_MS = 60_000;
const REGISTRY_MISSING_TTL_MS = 20_000;
const REGISTRY_READ_CACHE_LIMIT = 4_000;

type RegistryReadCacheEntry = {
  row: CatalogAvailabilityRow | null;
  expiresAt: number;
};

const registryReadCache = new Map<number, RegistryReadCacheEntry>();
const registryReadInFlight = new Map<
  string,
  Promise<{
    rows: Map<number, CatalogAvailabilityRow>;
    healthy: boolean;
  }>
>();

const verifiedSnapshot = new Map<number, CatalogAvailabilityRow>();
const VERIFIED_SNAPSHOT_LIMIT = 2_000;
const inFlight = new Map<number, Promise<CatalogAvailabilityRow | null>>();
let activeProbes = 0;
const probeWaiters: Array<() => void> = [];

function registryUnavailable(message: string) {
  return (
    /anime_availability|relation .* does not exist|schema cache/i.test(message) ||
    /SUPABASE_SERVICE_ROLE_KEY is not configured/i.test(message)
  );
}

async function withProbeSlot<T>(work: () => Promise<T>): Promise<T> {
  if (activeProbes >= PROBE_CONCURRENCY) {
    await new Promise<void>((resolve) => probeWaiters.push(resolve));
  }

  activeProbes += 1;
  try {
    return await work();
  } finally {
    activeProbes = Math.max(0, activeProbes - 1);
    probeWaiters.shift()?.();
  }
}

function positiveInteger(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function isOngoing(anime: Anime) {
  const status = String(anime.status ?? '').toLowerCase();
  return (
    status === 'releasing' ||
    status === 'ongoing' ||
    status === 'airing' ||
    status.includes('онгоинг')
  );
}

function nextCheckAt(status: CatalogAvailabilityStatus, anime: Anime) {
  const ttl =
    status === 'unknown'
      ? UNKNOWN_TTL_MS
      : status === 'unavailable'
        ? UNAVAILABLE_TTL_MS
        : isOngoing(anime)
          ? PLAYABLE_ONGOING_TTL_MS
          : PLAYABLE_FINISHED_TTL_MS;

  return new Date(Date.now() + ttl).toISOString();
}

function rowIsFresh(row: CatalogAvailabilityRow | undefined, now = Date.now()) {
  if (!row?.next_check_at) return false;
  const next = Date.parse(row.next_check_at);
  return Number.isFinite(next) && next > now;
}

function rememberVerifiedRow(row: CatalogAvailabilityRow) {
  if (row.availability_status !== 'playable' && !row.last_success_at) return;

  verifiedSnapshot.delete(row.anime_id);
  verifiedSnapshot.set(row.anime_id, row);

  while (verifiedSnapshot.size > VERIFIED_SNAPSHOT_LIMIT) {
    const oldest = verifiedSnapshot.keys().next().value as number | undefined;
    if (oldest == null) break;
    verifiedSnapshot.delete(oldest);
  }
}

function rememberRegistryRead(
  animeId: number,
  row: CatalogAvailabilityRow | null,
  ttlMs = row ? REGISTRY_READ_TTL_MS : REGISTRY_MISSING_TTL_MS,
) {
  registryReadCache.delete(animeId);
  registryReadCache.set(animeId, {
    row,
    expiresAt: Date.now() + ttlMs,
  });

  while (registryReadCache.size > REGISTRY_READ_CACHE_LIMIT) {
    const oldest = registryReadCache.keys().next().value as number | undefined;
    if (oldest == null) break;
    registryReadCache.delete(oldest);
  }
}

function cachedRegistryRead(
  animeId: number,
  now: number,
): RegistryReadCacheEntry | null {
  const cached = registryReadCache.get(animeId);
  if (!cached) return null;

  if (cached.expiresAt <= now) {
    registryReadCache.delete(animeId);
    return null;
  }

  // Refresh insertion order to keep frequently requested popular titles warm.
  registryReadCache.delete(animeId);
  registryReadCache.set(animeId, cached);
  return cached;
}

function lastSuccessWithinGrace(
  row: CatalogAvailabilityRow | undefined,
  anime: Anime,
  now = Date.now(),
) {
  if (!row?.last_success_at) return false;

  const lastSuccess = Date.parse(row.last_success_at);
  if (!Number.isFinite(lastSuccess)) return false;

  const grace = isOngoing(anime)
    ? DEGRADED_ONGOING_GRACE_MS
    : DEGRADED_FINISHED_GRACE_MS;

  return now - lastSuccess <= grace;
}

type ExposureState = 'playable' | 'degraded' | 'pending' | 'unavailable';

function exposureState(
  row: CatalogAvailabilityRow | undefined,
  anime: Anime,
  now = Date.now(),
): ExposureState {
  if (!row) return 'pending';
  if (row.availability_status === 'playable') return 'playable';
  if (row.availability_status === 'unavailable') return 'unavailable';
  if (lastSuccessWithinGrace(row, anime, now)) return 'degraded';
  return 'pending';
}

function providerReason(name: string, status: CatalogProviderAvailabilityStatus, reason?: string | null) {
  return `${name}:${status}${reason ? `(${reason.slice(0, 120)})` : ''}`;
}

async function probeKodik(
  anime: Anime,
  signal?: AbortSignal,
): Promise<{
  status: CatalogProviderAvailabilityStatus;
  maxEpisode: number | null;
  reason: string;
}> {
  const malId = positiveInteger(anime.idMal ?? anime.mal_id);
  if (!malId) {
    return { status: 'unavailable', maxEpisode: null, reason: 'no_mal_id' };
  }

  try {
    const timeout = AbortSignal.timeout(5_500);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const results = await searchKodikByShikimoriId(malId, {
      signal: combined,
    });

    if (!results.length) {
      return { status: 'unavailable', maxEpisode: null, reason: 'release_not_found' };
    }

    const knownEpisodes = results
      .map((item) => positiveInteger(item.last_episode))
      .filter((value): value is number => value != null);

    return {
      status: 'available',
      maxEpisode: knownEpisodes.length ? Math.max(...knownEpisodes) : null,
      reason: 'ok',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/KODIK_TOKEN is not configured/i.test(message)) {
      return { status: 'unavailable', maxEpisode: null, reason: 'provider_not_configured' };
    }

    return {
      status: 'unknown',
      maxEpisode: null,
      reason: error instanceof Error && error.name === 'AbortError'
        ? 'timeout'
        : message.slice(0, 120) || 'provider_error',
    };
  }
}

async function probeAniLiberty(
  anime: Anime,
  signal?: AbortSignal,
): Promise<{
  status: CatalogProviderAvailabilityStatus;
  reason: string;
}> {
  try {
    const result = await checkAnimeCatalogAvailability(anime, { signal });
    return {
      status: result.status,
      reason: result.reason || (result.status === 'available' ? 'ok' : 'release_not_found'),
    };
  } catch (error) {
    return {
      status: 'unknown',
      reason:
        error instanceof Error && error.name === 'AbortError'
          ? 'timeout'
          : error instanceof Error
            ? error.message.slice(0, 120)
            : 'provider_error',
    };
  }
}

async function probeDirect(
  anime: Anime,
  signal?: AbortSignal,
): Promise<{
  status: CatalogProviderAvailabilityStatus;
  reason: string;
}> {
  const malId = positiveInteger(anime.idMal ?? anime.mal_id);
  if (!malId) {
    return { status: 'unavailable', reason: 'no_mal_id' };
  }

  try {
    const result = await resolveDirectPlayerStreams({
      shikimoriId: malId,
      episode: 1,
      signal,
    });

    if (result.streams.length > 0) {
      return { status: 'available', reason: 'ok' };
    }

    if (
      result.reason === 'provider_unavailable' ||
      result.reason === 'invalid_provider_endpoint' ||
      result.reason?.startsWith('provider_http_')
    ) {
      return { status: 'unknown', reason: result.reason };
    }

    return {
      status: 'unavailable',
      reason: result.reason || 'stream_not_found',
    };
  } catch (error) {
    return {
      status: 'unknown',
      reason:
        error instanceof Error && error.name === 'AbortError'
          ? 'timeout'
          : error instanceof Error
            ? error.message.slice(0, 120)
            : 'provider_error',
    };
  }
}

async function readRowsFromRegistry(
  unique: number[],
): Promise<{
  rows: Map<number, CatalogAvailabilityRow>;
  healthy: boolean;
}> {
  const rows = new Map<number, CatalogAvailabilityRow>();

  try {
    const { data, error } = await createSupabaseAdmin()
      .from('anime_availability')
      .select(
        'anime_id,mal_id,availability_status,kodik_status,aniliberty_status,direct_status,max_episode,consecutive_misses,last_checked_at,next_check_at,last_success_at,last_failure_at,last_reason,updated_at',
      )
      .in('anime_id', unique);

    if (error) throw error;

    for (const row of (data ?? []) as CatalogAvailabilityRow[]) {
      const animeId = Number(row.anime_id);
      rows.set(animeId, row);
      rememberVerifiedRow(row);
      rememberRegistryRead(animeId, row);
    }

    // A missing row is meaningful under verified-first policy. Cache the miss
    // only briefly so a burst of identical requests does not repeat the same
    // PostgREST lookup while a background verifier is about to fill it.
    for (const animeId of unique) {
      if (!rows.has(animeId)) {
        rememberRegistryRead(animeId, null);
      }
    }

    return { rows, healthy: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[Catalog Availability] registry read failed:', message);

    // Integrity-first fallback: reuse only rows that were previously proven
    // playable in this server process. Never cache registry outage misses as
    // real missing rows.
    for (const id of unique) {
      const snapshot = verifiedSnapshot.get(id);
      if (snapshot) rows.set(id, snapshot);
    }

    return { rows, healthy: false };
  }
}

async function readRows(ids: number[]): Promise<{
  rows: Map<number, CatalogAvailabilityRow>;
  healthy: boolean;
}> {
  const unique = [...new Set(ids)].filter(
    (id) => Number.isSafeInteger(id) && id > 0,
  );
  const rows = new Map<number, CatalogAvailabilityRow>();
  if (!unique.length) return { rows, healthy: true };

  const now = Date.now();
  const misses: number[] = [];

  for (const animeId of unique) {
    const cached = cachedRegistryRead(animeId, now);
    if (!cached) {
      misses.push(animeId);
      continue;
    }
    if (cached.row) rows.set(animeId, cached.row);
  }

  if (!misses.length) {
    return { rows, healthy: true };
  }

  misses.sort((a, b) => a - b);
  const batchKey = misses.join(',');
  let pending = registryReadInFlight.get(batchKey);

  if (!pending) {
    pending = readRowsFromRegistry(misses).finally(() => {
      registryReadInFlight.delete(batchKey);
    });
    registryReadInFlight.set(batchKey, pending);
  }

  const fetched = await pending;
  for (const [animeId, row] of fetched.rows) {
    rows.set(animeId, row);
  }

  return {
    rows,
    healthy: fetched.healthy,
  };
}

export async function filterAnimeByAvailability(
  anime: Anime[],
  policy: 'catalog' | 'recommendations',
): Promise<{
  items: Anime[];
  refreshTargets: Anime[];
  registryHealthy: boolean;
}> {
  if (!anime.length) {
    return { items: [], refreshTargets: [], registryHealthy: true };
  }

  const registry = await readRows(anime.map((item) => item.id));
  const now = Date.now();
  const allowed = new Set<number>();
  const refreshTargets: Anime[] = [];

  for (const item of anime) {
    const row = registry.rows.get(item.id);

    if (!row || !rowIsFresh(row, now)) {
      refreshTargets.push(item);
    }

    const state = exposureState(row, item, now);

    // Both public catalogue and recommendations are verified-first.
    // "pending" means the title has never had a successful playback probe.
    // "degraded" is allowed only for a short grace window after a previous
    // successful verification, protecting users from brief provider outages.
    if (state === 'playable' || state === 'degraded') {
      allowed.add(item.id);
    }
  }

  return {
    items: anime.filter((item) => allowed.has(item.id)),
    refreshTargets,
    registryHealthy: registry.healthy,
  };
}

export async function filterAnimeIdsByAvailability(ids: number[]) {
  const registry = await readRows(ids);
  const now = Date.now();

  return ids.filter((id) => {
    const row = registry.rows.get(id);
    if (!row) return false;
    if (row.availability_status === 'playable') return true;
    if (row.availability_status === 'unavailable') return false;
    if (!row.last_success_at) return false;

    const success = Date.parse(row.last_success_at);
    return Number.isFinite(success) && now - success <= DEGRADED_FINISHED_GRACE_MS;
  });
}

async function refreshOne(
  anime: Anime,
  previous?: CatalogAvailabilityRow,
  signal?: AbortSignal,
): Promise<CatalogAvailabilityRow | null> {
  return withProbeSlot(async () => {
    const kodik = await probeKodik(anime, signal);

    // Kodik is the primary AnimeBox playback source. A confirmed Kodik hit is
    // already enough to prove PLAYABLE, so avoid spending extra provider
    // requests on the common hot path. Secondary providers are probed only
    // when Kodik cannot prove availability.
    const [aniliberty, direct] =
      kodik.status === 'available'
        ? [
            {
              status: previous?.aniliberty_status ?? 'unknown',
              reason: 'skipped_after_primary_hit',
            },
            {
              status: previous?.direct_status ?? 'unknown',
              reason: 'skipped_after_primary_hit',
            },
          ] satisfies Array<{
            status: CatalogProviderAvailabilityStatus;
            reason: string;
          }>
        : await Promise.all([
            probeAniLiberty(anime, signal),
            probeDirect(anime, signal),
          ]);

    const statuses = [kodik.status, aniliberty.status, direct.status];
    const anyAvailable = statuses.includes('available');
    const anyUnknown = statuses.includes('unknown');

    let consecutiveMisses = previous?.consecutive_misses ?? 0;
    let availabilityStatus: CatalogAvailabilityStatus;
    const wasEverPlayable = Boolean(
      previous?.last_success_at ||
      previous?.availability_status === 'playable',
    );

    if (anyAvailable) {
      consecutiveMisses = 0;
      availabilityStatus = 'playable';
    } else if (anyUnknown) {
      // A timeout/429/provider outage is not proof of absence. Never-verified
      // titles stay pending and remain hidden; previously playable titles can
      // use the bounded degraded grace window in exposureState().
      availabilityStatus = 'unknown';
    } else {
      consecutiveMisses += 1;

      // A brand-new candidate with three confirmed provider misses does not
      // need three user-facing probe cycles: there is no evidence it has ever
      // been playable on AnimeBox. Previously playable titles retain the
      // multi-miss shield to avoid disappearing on one provider-side change.
      availabilityStatus =
        !wasEverPlayable || consecutiveMisses >= CONFIRMED_MISS_THRESHOLD
          ? 'unavailable'
          : 'unknown';
    }

    const now = new Date().toISOString();
    const reasons = [
      providerReason('kodik', kodik.status, kodik.reason),
      providerReason('aniliberty', aniliberty.status, aniliberty.reason),
      providerReason('direct', direct.status, direct.reason),
    ].join(' | ');

    const payload: CatalogAvailabilityRow = {
      anime_id: anime.id,
      mal_id: positiveInteger(anime.idMal ?? anime.mal_id),
      availability_status: availabilityStatus,
      kodik_status: kodik.status,
      aniliberty_status: aniliberty.status,
      direct_status: direct.status,
      max_episode: kodik.maxEpisode,
      consecutive_misses: consecutiveMisses,
      last_checked_at: now,
      next_check_at: nextCheckAt(availabilityStatus, anime),
      last_success_at:
        availabilityStatus === 'playable'
          ? now
          : previous?.last_success_at ?? null,
      last_failure_at:
        !anyAvailable && !anyUnknown
          ? now
          : previous?.last_failure_at ?? null,
      last_reason: reasons.slice(0, 900),
      updated_at: now,
    };

    try {
      const { data, error } = await createSupabaseAdmin()
        .from('anime_availability')
        .upsert(payload)
        .select(
          'anime_id,mal_id,availability_status,kodik_status,aniliberty_status,direct_status,max_episode,consecutive_misses,last_checked_at,next_check_at,last_success_at,last_failure_at,last_reason,updated_at',
        )
        .single();

      if (error) throw error;
      const saved = data as CatalogAvailabilityRow;
      rememberVerifiedRow(saved);
      rememberRegistryRead(saved.anime_id, saved);
      return saved;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!registryUnavailable(message)) {
        console.warn('[Catalog Availability] registry write failed:', error);
      }
      return null;
    }
  });
}

export async function refreshCatalogAvailability(
  anime: Anime,
  options: { force?: boolean; signal?: AbortSignal } = {},
) {
  const existing = await readRows([anime.id]);
  const previous = existing.rows.get(anime.id);

  if (!options.force && rowIsFresh(previous)) {
    return previous ?? null;
  }

  const pending = inFlight.get(anime.id);
  if (pending) return pending;

  const request = refreshOne(anime, previous, options.signal).finally(() => {
    inFlight.delete(anime.id);
  });

  inFlight.set(anime.id, request);
  return request;
}

export async function refreshCatalogAvailabilityBatch(
  anime: Anime[],
  options: { limit?: number; force?: boolean } = {},
) {
  const unique = [...new Map(anime.map((item) => [item.id, item])).values()]
    .slice(0, Math.max(1, options.limit ?? 8));

  if (!unique.length) return [];

  const previousRows = await readRows(unique.map((item) => item.id));

  return Promise.allSettled(
    unique.map((item) => {
      const previous = previousRows.rows.get(item.id);

      if (!options.force && rowIsFresh(previous)) {
        return Promise.resolve(previous ?? null);
      }

      const pending = inFlight.get(item.id);
      if (pending) return pending;

      const request = refreshOne(item, previous).finally(() => {
        inFlight.delete(item.id);
      });

      inFlight.set(item.id, request);
      return request;
    }),
  );
}

export async function refreshStaleCatalogAvailability(limit = 24) {
  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();

  try {
    const { data, error } = await admin
      .from('anime_availability')
      .select('anime_id')
      .or(`next_check_at.is.null,next_check_at.lte.${now}`)
      .order('next_check_at', { ascending: true, nullsFirst: true })
      .limit(Math.min(60, Math.max(1, limit)));

    if (error) throw error;

    const ids = (data ?? [])
      .map((row) => positiveInteger((row as { anime_id?: unknown }).anime_id))
      .filter((id): id is number => id != null);

    if (!ids.length) return { checked: 0, refreshed: 0 };

    const anime = await getAnimesByIdsWithShikimori(ids);
    const results = await refreshCatalogAvailabilityBatch(anime, {
      limit: ids.length,
      force: true,
    });

    return {
      checked: ids.length,
      refreshed: results.filter((item) => item.status === 'fulfilled').length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (registryUnavailable(message)) return { checked: 0, refreshed: 0 };
    throw error;
  }
}

export async function getCatalogHealthSnapshot(): Promise<CatalogHealthSnapshot> {
  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();

  const count = async (status?: CatalogAvailabilityStatus) => {
    let query = admin
      .from('anime_availability')
      .select('anime_id', { count: 'exact', head: true });

    if (status) query = query.eq('availability_status', status);
    const { count: value, error } = await query;
    if (error) throw error;
    return value ?? 0;
  };

  try {
    const [
      total,
      playable,
      unknown,
      unavailable,
      staleResult,
      unavailableResult,
    ] = await Promise.all([
      count(),
      count('playable'),
      count('unknown'),
      count('unavailable'),
      admin
        .from('anime_availability')
        .select('anime_id', { count: 'exact', head: true })
        .or(`next_check_at.is.null,next_check_at.lte.${now}`),
      admin
        .from('anime_availability')
        .select(
          'anime_id,mal_id,consecutive_misses,last_checked_at,next_check_at,last_reason',
        )
        .eq('availability_status', 'unavailable')
        .order('last_checked_at', { ascending: false })
        .limit(12),
    ]);

    if (staleResult.error) throw staleResult.error;
    if (unavailableResult.error) throw unavailableResult.error;

    return {
      generatedAt: now,
      counts: {
        total,
        playable,
        unknown,
        unavailable,
        stale: staleResult.count ?? 0,
      },
      recentUnavailable: (unavailableResult.data ?? []).map((row) => ({
        animeId: Number(row.anime_id),
        malId: row.mal_id == null ? null : Number(row.mal_id),
        consecutiveMisses: Number(row.consecutive_misses ?? 0),
        lastCheckedAt: row.last_checked_at ?? null,
        nextCheckAt: row.next_check_at ?? null,
        reason: row.last_reason ?? null,
      })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (registryUnavailable(message)) {
      return {
        generatedAt: now,
        counts: { total: 0, playable: 0, unknown: 0, unavailable: 0, stale: 0 },
        recentUnavailable: [],
      };
    }
    throw error;
  }
}
