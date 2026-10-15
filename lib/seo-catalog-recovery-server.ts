import 'server-only';

import { createHash } from 'node:crypto';

import { animeSeoQualityScore, shouldIndexAnime } from '@/lib/anime-seo';
import { ANIME_SITEMAP_SHARDS } from '@/lib/seo-config';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { Anime } from '@/types/anime';

export const SEO_CATALOG_RECOVERY_PAGE_SIZE = 120;
export const SEO_CATALOG_RECOVERY_MAX_PAGE = 9999;

type CatalogRow = {
  id: number | string;
  slug: string | null;
  title: string | null;
  poster_url: string | null;
  genres: string[] | null;
  total_episodes: number | null;
  finished: boolean | null;
  start_year: number | null;
  format: string | null;
};

type CatalogCandidate = { anime: Anime; slug: string; title: string; poster: string | null };

type RecoveryResult = {
  page: number;
  scanned: number;
  eligible: number;
  alreadyInRegistry: number;
  rejected: number;
  attempted: number;
  inserted: number;
  dryRun: boolean;
  insertedSlugs: string[];
};

const safeId = (value: unknown): number | null => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

function safePoster(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const uri = new URL(value.trim());
    return uri.protocol === 'https:' && uri.hostname ? uri.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Local catalogue evidence is less rich than AniList.
 * Strictly validate source identity before admitting a title to sitemap repair.
 */
export function parseSeoCatalogRecoveryRow(row: CatalogRow): CatalogCandidate | null {
  const id = safeId(row.id);
  const slug = typeof row.slug === 'string' ? row.slug.trim() : '';
  const title = typeof row.title === 'string' ? row.title.replace(/\s+/g, ' ').trim() : '';
  if (!id || !/^[a-z0-9](?:[a-z0-9-]{0,158}[a-z0-9])?$/.test(slug) ||
      !title || title.length > 240 ||
      /^(?:anime|аниме|без названия|unknown|untitled)(?:\s*\d+)?$/i.test(title)) return null;

  const poster = safePoster(row.poster_url);
  const genres = Array.isArray(row.genres)
    ? row.genres.filter((genre): genre is string =>
      typeof genre === 'string' && genre.trim().length > 0).slice(0, 12)
    : [];
  const episodes = Number.isSafeInteger(row.total_episodes) &&
      Number(row.total_episodes) > 0 && Number(row.total_episodes) <= 10_000
    ? row.total_episodes : null;
  const year = Number.isSafeInteger(row.start_year) && Number(row.start_year) >= 1900 &&
      Number(row.start_year) <= new Date().getUTCFullYear() + 5
    ? row.start_year : null;

  // A bare title+ID is not sufficient evidence for repairing a sitemap.
  if (!poster && !year && !episodes && !genres.length) return null;
  const anime: Anime = {
    id,
    slug,
    title: { russian: title },
    catalogEligible: true,
    genres,
    episodes,
    startDate: year ? { year } : undefined,
    coverImage: poster ? { large: poster } : null,
    format: typeof row.format === 'string' ? row.format.slice(0, 40) : null,
    status: row.finished === true ? 'FINISHED' : null,
  };
  if (!shouldIndexAnime(anime)) return null;
  return { anime, slug, title, poster };
}

export async function getSeoCatalogRepairPageCount(): Promise<number> {
  const { count, error } = await createSupabaseAdmin().from('anime_catalog')
    .select('id', { count: 'exact', head: true });
  if (error) throw error;
  const total = Math.max(0, Number(count ?? 0));
  return Math.max(1, Math.ceil(total / SEO_CATALOG_RECOVERY_PAGE_SIZE));
}

export function scheduledSeoCatalogRepairPage(
  pageCount: number, now = Date.now(),
): number {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) return 0;
  const day = Math.floor(now / 86_400_000);
  return day % pageCount;
}

/**
 * Invoked ONLY from the authenticated operational SEO cron.
 * Exactly one catalog page, one batched index lookup and at most one
 * insert-if-absent. Sitemap reads and user-facing page requests never write.
 */
export async function repairSeoCatalogPage(options: {
  page: number;
  dryRun?: boolean;
}): Promise<RecoveryResult> {
  const { page, dryRun = false } = options;
  if (!Number.isSafeInteger(page) || page < 0 ||
      page > SEO_CATALOG_RECOVERY_MAX_PAGE) {
    throw new Error('invalid SEO catalog repair page');
  }
  const admin = createSupabaseAdmin();
  const from = page * SEO_CATALOG_RECOVERY_PAGE_SIZE;
  const { data, error } = await admin.from('anime_catalog')
    .select('id,slug,title,poster_url,genres,total_episodes,finished,start_year,format')
    .order('id', { ascending: true })
    .range(from, from + SEO_CATALOG_RECOVERY_PAGE_SIZE - 1);
  if (error) throw error;

  const records = (data ?? []) as CatalogRow[];
  const candidates = records.flatMap(row => {
    const candidate = parseSeoCatalogRecoveryRow(row);
    return candidate ? [candidate] : [];
  });
  const idList = [...new Set(candidates.map(candidate => candidate.anime.id))];
  const result: RecoveryResult = {
    page, scanned: records.length, eligible: candidates.length,
    alreadyInRegistry: 0, rejected: records.length - candidates.length,
    attempted: 0, inserted: 0, dryRun, insertedSlugs: [],
  };
  if (!idList.length) return result;

  const existing = await admin.from('seo_anime_index')
    .select('anime_id').in('anime_id', idList);
  if (existing.error) throw existing.error;
  const known = new Set((existing.data ?? []).map(row => Number(row.anime_id)));
  const missing = candidates.filter(candidate => !known.has(candidate.anime.id));
  result.alreadyInRegistry = candidates.length - missing.length;
  result.attempted = missing.length;
  if (dryRun || !missing.length) return result;

  const now = new Date().toISOString();
  const rows = missing.map(({ anime, slug, title, poster }) => {
    const fingerprint = createHash('sha256').update(
      JSON.stringify({ id: anime.id, slug, title, poster,
        genres: anime.genres ?? [], episodes: anime.episodes ?? null,
        year: anime.startDate?.year ?? null }),
    ).digest('hex');
    return {
      anime_id: anime.id,
      slug,
      title,
      image_url: poster,
      status: anime.status ?? null,
      source_shard: -1,
      sitemap_shard: anime.id % ANIME_SITEMAP_SHARDS,
      quality_score: animeSeoQualityScore(anime),
      indexable: true,
      content_fingerprint: fingerprint,
      last_content_change_at: now,
      last_verified_at: now,
      updated_at: now,
    };
  });
  // A concurrently refreshed AniList record is never overwritten.
  const inserted = await admin.from('seo_anime_index')
    .upsert(rows, { onConflict: 'anime_id', ignoreDuplicates: true })
    .select('anime_id,slug');
  if (inserted.error) throw inserted.error;
  const created = inserted.data ?? [];
  result.inserted = created.length;
  result.insertedSlugs = created.flatMap(row =>
    typeof row.slug === 'string' ? [row.slug] : [],
  );
  return result;
}
