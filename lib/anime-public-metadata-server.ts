import 'server-only';

import { after } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { getAnimesByIds } from '@/lib/anilist';
import { normalizedAnimeScore } from '@/lib/anime-score';
import { tryAcquireRuntimeRefreshLease, releaseRuntimeRefreshLease } from '@/lib/runtime-refresh-lease-server';
import type { Anime } from '@/types/anime';

const TABLE = 'anime_public_metadata_cache';
const READ_TIMEOUT_MS = 1200;
const REFRESH_TIMEOUT_MS = 3000;
const MAX_READ_IDS = 50;
const MAX_REFRESH_IDS = 24;
const BATCH_SIZE = 30;
const TTL_FINISHED_MS = 24 * 60 * 60 * 1000;
const TTL_RELEASING_MS = 30 * 60 * 1000;
const TTL_OTHER_MS = 6 * 60 * 60 * 1000;

export type AnimePublicMetadataSnapshot = {
  anime_id: number;
  score_10: number | null;
  episodes_total: number | null;
  episodes_aired: number | null;
  status: string | null;
  source: 'anilist';
  fetched_at: string;
  expires_at: string;
};

const knownId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const count = (value: unknown, allowZero: boolean): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) &&
  (allowZero ? value >= 0 : value > 0) ? value : null;

function uniqueIds(animes: readonly Anime[], limit: number): number[] {
  return [...new Set(animes.map((anime) => anime.id).filter(knownId))].slice(0, limit);
}

let lastCacheWarningAt = 0;
function warnCache(operation: string, error: unknown) {
  // A failing optional table must not turn every card into a noisy warning.
  const now = Date.now();
  if (now - lastCacheWarningAt < 60_000) return;
  lastCacheWarningAt = now;
  console.warn(`[Anime metadata] ${operation} unavailable (using existing source)`,
    error instanceof Error ? error.message : String(error));
}

function snapshotFromRow(value: unknown, now: number): AnimePublicMetadataSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (!knownId(row.anime_id) || row.source !== 'anilist') return null;
  const fetchedAt = Date.parse(String(row.fetched_at ?? ''));
  const expiresAt = Date.parse(String(row.expires_at ?? ''));
  if (!Number.isFinite(fetchedAt) || !Number.isFinite(expiresAt) ||
    fetchedAt > now + 5 * 60_000 || expiresAt <= now ||
    expiresAt <= fetchedAt) return null;

  const score = row.score_10 == null ? null : Number(row.score_10);
  if (score !== null && (!Number.isFinite(score) || score <= 0 || score > 10)) return null;
  const total = row.episodes_total == null ? null : Number(row.episodes_total);
  const aired = row.episodes_aired == null ? null : Number(row.episodes_aired);
  if (total !== null && count(total, false) == null) return null;
  if (aired !== null && count(aired, true) == null) return null;
  if (row.status != null && (typeof row.status !== 'string' || row.status.length > 64)) return null;
  return {
    anime_id: row.anime_id,
    score_10: score,
    episodes_total: total,
    episodes_aired: aired,
    status: (row.status as string | null) ?? null,
    source: 'anilist',
    fetched_at: String(row.fetched_at),
    expires_at: String(row.expires_at),
  };
}

/** One indexed batch read. DB timeouts/missing migrations are fail-open. */
export async function readFreshAnimeMetadata(
  ids: readonly number[],
): Promise<Map<number, AnimePublicMetadataSnapshot>> {
  const unique = [...new Set(ids.filter(knownId))].slice(0, MAX_READ_IDS);
  const found = new Map<number, AnimePublicMetadataSnapshot>();
  if (!unique.length) return found;

  try {
    const { data, error } = await createSupabaseAdmin().from(TABLE)
      .select('anime_id,score_10,episodes_total,episodes_aired,status,source,fetched_at,expires_at')
      .in('anime_id', unique)
      .gt('expires_at', new Date().toISOString())
      .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS));
    if (error) throw error;
    const allowed = new Set(unique);
    const now = Date.now();
    for (const row of data ?? []) {
      const snapshot = snapshotFromRow(row, now);
      if (snapshot && allowed.has(snapshot.anime_id)) found.set(snapshot.anime_id, snapshot);
    }
  } catch (error) {
    warnCache('read', error);
  }
  return found;
}

/**
 * Overlay authoritative AniList fields only; preserve selected order, IDs,
 * slugs, availability, posters and already-known localized titles.
 */
export function applyAnimeMetadataSnapshots(
  animes: readonly Anime[],
  snapshots: ReadonlyMap<number, AnimePublicMetadataSnapshot>,
): Anime[] {
  return animes.map((anime) => {
    const snapshot = snapshots.get(anime.id);
    if (!snapshot) return anime;
    return {
      ...anime,
      score: snapshot.score_10,
      averageScore: snapshot.score_10 == null ? null : snapshot.score_10 * 10,
      episodes: snapshot.episodes_total ?? anime.episodes,
      episodesAired: snapshot.episodes_aired ?? anime.episodesAired,
      status: snapshot.status || anime.status,
    };
  });
}

export async function enrichSavedAnimeMetadata(animes: Anime[]): Promise<Anime[]> {
  if (!animes.length) return animes;
  const snapshots = await readFreshAnimeMetadata(uniqueIds(animes, MAX_READ_IDS));
  return applyAnimeMetadataSnapshots(animes, snapshots);
}

function isReleasing(status: string | null | undefined) {
  return ['releasing', 'ongoing', 'онгоинг'].includes(status?.toLowerCase() ?? '');
}
function isFinished(status: string | null | undefined) {
  return ['finished', 'released', 'вышло', 'завершено'].includes(status?.toLowerCase() ?? '');
}

/** Only call with records successfully fetched from AniList, never fallback. */
export async function persistAniListMetadata(animes: readonly Anime[]): Promise<void> {
  const unique = new Map<number, Anime>();
  for (const anime of animes) if (knownId(anime?.id)) unique.set(anime.id, anime);
  if (!unique.size) return;

  const observedAt = Date.now();
  for (const batch of Array.from(unique.values()).reduce<Anime[][]>((groups, anime, index) => {
    if (index % BATCH_SIZE === 0) groups.push([]);
    groups[groups.length - 1].push(anime);
    return groups;
  }, [])) {
    const rows = batch.map((anime) => {
      const ttl = isReleasing(anime.status)
        ? TTL_RELEASING_MS
        : isFinished(anime.status) ? TTL_FINISHED_MS : TTL_OTHER_MS;
      return {
        anime_id: anime.id,
        score_10: normalizedAnimeScore(anime),
        episodes_total: count(anime.episodes, false),
        episodes_aired: count(anime.episodesAired, true),
        status: typeof anime.status === 'string' ? anime.status.slice(0, 64) : null,
        fetched_at: new Date(observedAt).toISOString(),
        expires_at: new Date(observedAt + ttl).toISOString(),
      };
    });
    try {
      const { error } = await createSupabaseAdmin()
        .rpc('merge_anilist_metadata_batch', { rows });
      if (error) throw error;
    } catch (error) {
      warnCache('write', error);
      return;
    }
  }
}

/** Store known AniList detail metadata after sending the page, never on the critical path. */
const lastDetailPersist = new Map<number, number>();
export function scheduleAniListMetadataPersist(anime: Anime) {
  if (!knownId(anime?.id)) return;
  const now = Date.now();
  if (now - (lastDetailPersist.get(anime.id) ?? 0) < 10 * 60_000) return;
  try {
    after(async () => {
      await persistAniListMetadata([anime]);
    });
    lastDetailPersist.delete(anime.id);
    lastDetailPersist.set(anime.id, now);
    if (lastDetailPersist.size > 1200) {
      const oldest = lastDetailPersist.keys().next().value;
      if (oldest != null) lastDetailPersist.delete(oldest);
    }
  } catch (error) {
    // SSG/outside-request execution can lack an after() context.
    warnCache('background schedule', error);
  }
}

/**
 * Called only during the cached home feed fill, not per-card render.
 * One batched AniList read for missing/expired IDs; no N+1.
 * Failures never remove cached cards or block their response.
 */
export function scheduleHomeMetadataRefresh(animes: readonly Anime[]) {
  const ids = uniqueIds(animes, MAX_REFRESH_IDS);
  if (!ids.length) return;
  try {
    after(async () => {
      const fresh = await readFreshAnimeMetadata(ids);
      const missing = ids.filter((id) => !fresh.has(id));
      if (!missing.length) return;

      // Reuse the existing cross-instance lease rather than inventing another
      // refresh coordination table. It expires automatically on worker death.
      const lease = await tryAcquireRuntimeRefreshLease(
        'anime_catalog_metadata', 'patch30.4:home-metadata', 20,
      );
      if (!lease.acquired) return;
      try {
        const fetched = await getAnimesByIds(missing, {
          signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
        });
        if (fetched.length) await persistAniListMetadata(fetched);
      } catch (error) {
        warnCache('AniList batch refresh', error);
      } finally {
        await releaseRuntimeRefreshLease(
          'anime_catalog_metadata', 'patch30.4:home-metadata', lease.ownerToken,
        );
      }
    });
  } catch (error) {
    warnCache('background schedule', error);
  }
}
