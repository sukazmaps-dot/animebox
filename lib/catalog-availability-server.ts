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

const inFlight = new Map<number, Promise<CatalogAvailabilityRow | null>>();
let activeProbes = 0;
const probeWaiters: Array<() => void> = [];

function schemaMissing(message: string) {
  return /anime_availability|relation .* does not exist|schema cache/i.test(message);
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

async function readRows(ids: number[]) {
  const unique = [...new Set(ids)].filter((id) => Number.isSafeInteger(id) && id > 0);
  const rows = new Map<number, CatalogAvailabilityRow>();
  if (!unique.length) return rows;

  try {
    const { data, error } = await createSupabaseAdmin()
      .from('anime_availability')
      .select(
        'anime_id,mal_id,availability_status,kodik_status,aniliberty_status,direct_status,max_episode,consecutive_misses,last_checked_at,next_check_at,last_success_at,last_failure_at,last_reason,updated_at',
      )
      .in('anime_id', unique);

    if (error) throw error;
    for (const row of (data ?? []) as CatalogAvailabilityRow[]) {
      rows.set(Number(row.anime_id), row);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!schemaMissing(message)) {
      console.warn('[Catalog Availability] registry read failed:', error);
    }
  }

  return rows;
}

export async function filterAnimeByAvailability(
  anime: Anime[],
  policy: 'catalog' | 'recommendations',
): Promise<{
  items: Anime[];
  refreshTargets: Anime[];
}> {
  if (!anime.length) return { items: [], refreshTargets: [] };

  const rows = await readRows(anime.map((item) => item.id));
  const now = Date.now();
  const playable: Anime[] = [];
  const unknown: Anime[] = [];
  const refreshTargets: Anime[] = [];

  for (const item of anime) {
    const row = rows.get(item.id);
    const fresh = rowIsFresh(row, now);

    if (!row || !fresh) {
      refreshTargets.push(item);
    }

    if (row?.availability_status === 'unavailable' && fresh) {
      continue;
    }

    if (row?.availability_status === 'playable') {
      playable.push(item);
    } else {
      unknown.push(item);
    }
  }

  if (policy === 'catalog') {
    const allowed = new Set([...playable, ...unknown].map((item) => item.id));
    return {
      items: anime.filter((item) => allowed.has(item.id)),
      refreshTargets,
    };
  }

  // Cold-start safety: recommendations prefer verified playable titles, but
  // an empty registry must never blank the feed. UNKNOWN remains a bounded
  // fallback until enough candidates have been verified.
  const strictTarget = Math.min(8, Math.max(4, Math.ceil(anime.length * 0.4)));
  return {
    items: playable.length >= strictTarget
      ? playable
      : [...playable, ...unknown],
    refreshTargets,
  };
}

export async function filterAnimeIdsByAvailability(ids: number[]) {
  const rows = await readRows(ids);
  const now = Date.now();

  return ids.filter((id) => {
    const row = rows.get(id);
    return !(
      row?.availability_status === 'unavailable' &&
      rowIsFresh(row, now)
    );
  });
}

async function refreshOne(
  anime: Anime,
  previous?: CatalogAvailabilityRow,
  signal?: AbortSignal,
): Promise<CatalogAvailabilityRow | null> {
  return withProbeSlot(async () => {
    const [kodik, aniliberty, direct] = await Promise.all([
      probeKodik(anime, signal),
      probeAniLiberty(anime, signal),
      probeDirect(anime, signal),
    ]);

    const statuses = [kodik.status, aniliberty.status, direct.status];
    const anyAvailable = statuses.includes('available');
    const anyUnknown = statuses.includes('unknown');

    let consecutiveMisses = previous?.consecutive_misses ?? 0;
    let availabilityStatus: CatalogAvailabilityStatus;

    if (anyAvailable) {
      consecutiveMisses = 0;
      availabilityStatus = 'playable';
    } else if (anyUnknown) {
      availabilityStatus = 'unknown';
    } else {
      consecutiveMisses += 1;
      availabilityStatus =
        consecutiveMisses >= CONFIRMED_MISS_THRESHOLD
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
      return data as CatalogAvailabilityRow;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!schemaMissing(message)) {
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
  const previous = existing.get(anime.id);

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

  return Promise.allSettled(
    unique.map((item) =>
      refreshCatalogAvailability(item, { force: options.force }),
    ),
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
    if (schemaMissing(message)) return { checked: 0, refreshed: 0 };
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
    if (schemaMissing(message)) {
      return {
        generatedAt: now,
        counts: { total: 0, playable: 0, unknown: 0, unavailable: 0, stale: 0 },
        recentUnavailable: [],
      };
    }
    throw error;
  }
}
